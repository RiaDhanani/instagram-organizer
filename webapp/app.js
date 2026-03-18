// app.js — main application logic
const { Storage, Categorizer, Renderer } = window.IG;

// ─── App State ───────────────────────────────────────────────────────────────

const state = {
  rawData: null,
  posts: null,
  tree: null,
  selectedPosts: null,
  selectedPath: '',
  searchQuery: '',
};

// ─── DOM References ───────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const dom = {
  uploadZone: $('upload-zone'),
  fileInput: $('file-input'),
  uploadSection: $('upload-section'),
  mainLayout: $('main-layout'),
  categorizeBar: $('categorize-bar'),
  categorizeBtn: $('categorize-btn'),
  recategorizeBtn: $('recategorize-btn'),
  categorizeProgress: $('categorize-progress'),
  categorizeProgressFill: $('categorize-progress-fill'),
  categorizeProgressText: $('categorize-progress-text'),
  ageWarning: $('age-warning'),
  folderTree: $('folder-tree'),
  postGrid: $('post-grid'),
  gridHeader: $('grid-header'),
  searchInput: $('search-input'),
  postCount: $('post-count'),
  settingsBtn: $('settings-btn'),
  settingsModal: $('settings-modal'),
  apiKeyInput: $('api-key-input'),
  apiKeyStatus: $('api-key-status'),
  saveApiKeyBtn: $('save-api-key-btn'),
  closeSettingsBtn: $('close-settings-btn'),
  clearDataBtn: $('clear-data-btn'),
  downloadJsonBtn: $('download-json-btn'),
};

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  dom.apiKeyInput.value = Storage.loadApiKey();

  const saved = Storage.loadPosts();
  if (saved) {
    state.rawData = saved;
    state.posts = saved.posts;
    const hasCategorized = state.posts.some(
      (p) => p.categorization && p.categorization.category !== 'Uncategorized'
    );
    const hasUncategorized = state.posts.some(
      (p) => !p.categorization || p.categorization.category === 'Uncategorized'
    );
    if (hasCategorized && hasUncategorized) {
      enterMixedMode();
    } else if (hasCategorized) {
      enterCategorizedMode();
    } else {
      enterLoadedMode();
    }
  }

  setupEventListeners();
}

// ─── API Key Validation ───────────────────────────────────────────────────────

async function validateApiKey(key) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    if (res.status === 401) return { valid: false, error: 'Invalid API key — check your key and try again.' };
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error?.message || '';
      if (/quota|billing|credit/i.test(msg)) return { valid: true, warning: 'Key is valid but your account has no credits. Add credits at platform.openai.com.' };
      return { valid: true, warning: 'Key is valid (currently rate-limited — will work soon).' };
    }
    if (!res.ok) return { valid: false, error: `OpenAI returned ${res.status} — check your key.` };
    return { valid: true };
  } catch {
    return { valid: false, error: 'Could not reach OpenAI. Check your internet connection.' };
  }
}

function setupEventListeners() {
  dom.uploadZone.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  dom.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.uploadZone.classList.add('drag-over');
  });
  dom.uploadZone.addEventListener('dragleave', () => dom.uploadZone.classList.remove('drag-over'));
  dom.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.uploadZone.classList.remove('drag-over');
    handleFileSelect(e.dataTransfer.files[0]);
  });

  dom.categorizeBtn.addEventListener('click', startCategorization);
  dom.recategorizeBtn?.addEventListener('click', () => {
    // Strip old categorization and re-run
    state.posts = state.posts.map(({ categorization, ...rest }) => rest);
    state.rawData = { ...state.rawData, posts: state.posts };
    Storage.savePosts(state.rawData);
    enterLoadedMode();
    startCategorization();
  });

  dom.searchInput.addEventListener('input', () => {
    state.searchQuery = dom.searchInput.value.trim().toLowerCase();
    applySearch();
  });

  dom.settingsBtn.addEventListener('click', () => {
    dom.apiKeyInput.value = Storage.loadApiKey();
    dom.apiKeyStatus.textContent = '';
    dom.apiKeyStatus.className = 'api-key-status';
    dom.settingsModal.classList.remove('hidden');
  });
  dom.closeSettingsBtn.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));
  dom.settingsModal.addEventListener('click', (e) => {
    if (e.target === dom.settingsModal) dom.settingsModal.classList.add('hidden');
  });
  dom.saveApiKeyBtn.addEventListener('click', async () => {
    const key = dom.apiKeyInput.value.trim();
    if (!key) {
      Storage.saveApiKey('');
      dom.settingsModal.classList.add('hidden');
      return;
    }
    dom.saveApiKeyBtn.disabled = true;
    dom.saveApiKeyBtn.textContent = 'Validating…';
    dom.apiKeyStatus.textContent = '';
    dom.apiKeyStatus.className = 'api-key-status';
    const result = await validateApiKey(key);
    dom.saveApiKeyBtn.disabled = false;
    dom.saveApiKeyBtn.textContent = 'Save';
    if (result.valid) {
      Storage.saveApiKey(key);
      if (result.warning) {
        dom.apiKeyStatus.textContent = result.warning;
        dom.apiKeyStatus.className = 'api-key-status warning';
        setTimeout(() => dom.settingsModal.classList.add('hidden'), 2500);
      } else {
        dom.settingsModal.classList.add('hidden');
      }
    } else {
      dom.apiKeyStatus.textContent = result.error;
      dom.apiKeyStatus.className = 'api-key-status error';
    }
  });

  dom.clearDataBtn.addEventListener('click', () => {
    if (confirm('Clear all saved data and start over?')) {
      Storage.clearPosts();
      location.reload();
    }
  });

  dom.downloadJsonBtn.addEventListener('click', () => {
    const data = Storage.loadPosts();
    if (!data) { alert('No data to download — export from the extension first.'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'saved_posts.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ─── File Upload ──────────────────────────────────────────────────────────────

function handleFileSelect(file) {
  if (!file || !file.name.endsWith('.json')) {
    showUploadError('Please upload a saved_posts.json file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.posts || !Array.isArray(data.posts)) throw new Error('Invalid format');
      state.rawData = data;
      state.posts = data.posts;
      Storage.savePosts(data);
      enterLoadedMode();
    } catch {
      showUploadError('Invalid file. Make sure you upload saved_posts.json from the extension.');
    }
  };
  reader.readAsText(file);
}

function showUploadError(msg) {
  const err = dom.uploadZone.querySelector('.upload-error') || document.createElement('p');
  err.className = 'upload-error';
  err.textContent = msg;
  dom.uploadZone.appendChild(err);
  setTimeout(() => err.remove(), 4000);
}

// ─── Mode Transitions ─────────────────────────────────────────────────────────

function enterLoadedMode() {
  dom.uploadSection.classList.add('hidden');
  dom.mainLayout.classList.remove('hidden');
  dom.categorizeBar.classList.remove('hidden');
  dom.recategorizeBtn?.classList.add('hidden');
  dom.postCount.textContent = `${state.posts.length} posts`;

  checkAgeWarning();

  state.selectedPosts = state.posts;
  dom.gridHeader.textContent = `All Posts — ${state.posts.length} (uncategorized)`;
  Renderer.renderGrid(state.posts, dom.postGrid);
}

function enterCategorizedMode() {
  dom.uploadSection.classList.add('hidden');
  dom.categorizeBar.classList.add('hidden');
  dom.mainLayout.classList.remove('hidden');

  // Show re-categorize button in header
  if (dom.recategorizeBtn) dom.recategorizeBtn.classList.remove('hidden');

  const categorized = state.posts.filter((p) => p.categorization);
  dom.postCount.textContent = `${categorized.length} posts`;

  checkAgeWarning();

  state.tree = Renderer.buildTree(categorized);
  Renderer.renderTree(state.tree, dom.folderTree, onFolderSelect);

  state.selectedPosts = categorized;
  dom.gridHeader.textContent = `All Posts — ${categorized.length}`;
  Renderer.renderGrid(categorized, dom.postGrid);
}

function enterMixedMode() {
  // Some posts categorized, some not — show tree for categorized, keep categorize bar for new
  dom.uploadSection.classList.add('hidden');
  dom.mainLayout.classList.remove('hidden');
  dom.categorizeBar.classList.remove('hidden');
  dom.recategorizeBtn?.classList.add('hidden');

  const categorized = state.posts.filter((p) => p.categorization && p.categorization.category !== 'Uncategorized');
  const uncategorized = state.posts.filter((p) => !p.categorization || p.categorization.category === 'Uncategorized');
  dom.postCount.textContent = `${state.posts.length} posts`;

  checkAgeWarning();

  if (categorized.length > 0) {
    state.tree = Renderer.buildTree(categorized);
    Renderer.renderTree(state.tree, dom.folderTree, onFolderSelect);
  }

  state.selectedPosts = state.posts;
  dom.gridHeader.textContent = `All Posts — ${categorized.length} categorized, ${uncategorized.length} new`;
  Renderer.renderGrid(categorized, dom.postGrid);
}

function checkAgeWarning() {
  if (!state.rawData?.exported_at) return;
  const ageHours = (Date.now() - new Date(state.rawData.exported_at).getTime()) / 3600000;
  if (ageHours > 20) {
    dom.ageWarning.textContent = `Export is ${Math.round(ageHours)}h old — thumbnail URLs have expired. Categorization will use text descriptions only (still works well).`;
    dom.ageWarning.classList.remove('hidden');
  }
}

function exportAgeHours() {
  if (!state.rawData?.exported_at) return 0;
  return (Date.now() - new Date(state.rawData.exported_at).getTime()) / 3600000;
}

// ─── Folder Selection ─────────────────────────────────────────────────────────

function onFolderSelect(posts, pathLabel) {
  state.selectedPosts = posts;
  state.selectedPath = pathLabel;
  state.searchQuery = '';
  dom.searchInput.value = '';
  dom.gridHeader.textContent = `${pathLabel} — ${posts.length}`;
  Renderer.renderGrid(posts, dom.postGrid);
}

// ─── Search ───────────────────────────────────────────────────────────────────

function applySearch() {
  const q = state.searchQuery;
  if (!q) {
    const source = state.selectedPosts || state.posts;
    dom.gridHeader.textContent = state.selectedPath
      ? `${state.selectedPath} — ${source.length}`
      : `All Posts — ${source.length}`;
    Renderer.renderGrid(source, dom.postGrid);
    return;
  }

  // Word-boundary regex for structured fields; substring match for tags (already concise)
  const wordRe = new RegExp(`(?<![a-z])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i');

  const filtered = (state.posts || []).filter((post) => {
    const c = post.categorization;
    if (!c) return false;
    // Check structured fields with word-boundary match
    if ([c.category, c.subcategory, c.tertiary].some((f) => f && wordRe.test(f))) return true;
    // Check tags with substring match (tags are short, intentional keywords)
    if ((c.tags || []).some((t) => t && t.toLowerCase().includes(q))) return true;
    return false;
  });

  dom.gridHeader.textContent = `"${q}" — ${filtered.length} result${filtered.length !== 1 ? 's' : ''}`;
  Renderer.renderGrid(filtered, dom.postGrid);
}

// ─── Categorization ───────────────────────────────────────────────────────────

async function startCategorization() {
  const apiKey = Storage.loadApiKey();
  if (!apiKey) {
    dom.settingsModal.classList.remove('hidden');
    dom.apiKeyInput.focus();
    return;
  }

  dom.categorizeBtn.disabled = true;
  dom.categorizeProgress.classList.remove('hidden');

  // Skip images if export is older than 20 hours (CDN URLs will be expired)
  const skipImages = exportAgeHours() > 20;
  if (skipImages) {
    dom.categorizeProgressText.textContent = 'Using text-only mode (export is old)…';
  }

  // Only categorize posts that haven't been categorized yet
  const alreadyDone = state.posts.filter(
    (p) => p.categorization && p.categorization.category !== 'Uncategorized'
  );
  const toProcess = state.posts.filter(
    (p) => !p.categorization || p.categorization.category === 'Uncategorized'
  );

  if (toProcess.length === 0) {
    enterCategorizedMode();
    return;
  }

  try {
    const { results, errorCount } = await Categorizer.categorizeAll(
      toProcess,
      apiKey,
      (current, total, errors, lastError) => {
        const pct = Math.round((current / total) * 100);
        dom.categorizeProgressFill.style.width = pct + '%';
        const errNote = errors > 0 ? ` · ${errors} failed` : '';
        const errDetail = lastError ? ` [${lastError.slice(0, 60)}]` : '';
        dom.categorizeProgressText.textContent = `${current} / ${total}${errNote}${errDetail}`;
      },
      skipImages
    );

    // Merge newly categorized with already-done posts
    state.posts = [...alreadyDone, ...results];
    state.rawData = { ...state.rawData, posts: state.posts };
    Storage.savePosts(state.rawData);

    if (errorCount > 0) {
      const ok = results.length - errorCount;
      dom.categorizeProgressText.textContent = `Done — ${ok} categorized, ${errorCount} failed (shown as Uncategorized)`;
      await new Promise((r) => setTimeout(r, 2500));
    }

    enterCategorizedMode();
  } catch (err) {
    dom.categorizeBtn.disabled = false;
    dom.categorizeProgress.classList.add('hidden');
    alert('Categorization error: ' + err.message);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
