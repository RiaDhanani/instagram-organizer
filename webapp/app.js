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
  pauseBtn: $('pause-btn'),
  webSearchToggle: $('web-search-toggle'),
  ageWarning: $('age-warning'),
  folderTree: $('folder-tree'),
  postGrid: $('post-grid'),
  gridHeader: $('grid-header'),
  searchInput: $('search-input'),
  postCount: $('post-count'),
  settingsBtn: $('settings-btn'),
  settingsModal: $('settings-modal'),
  closeSettingsBtn: $('close-settings-btn'),
  clearDataBtn: $('clear-data-btn'),
  downloadJsonBtn: $('download-json-btn'),
  creditsPopup: $('credits-popup'),
  creditsPopupClose: $('credits-popup-close'),
  creditsPopupSave: $('credits-popup-save'),
  creditsKeyInput: $('credits-key-input'),
  creditsPopupStatus: $('credits-popup-status'),
  errorPopup: $('error-popup'),
  errorPopupTitle: $('error-popup-title'),
  errorPopupBody: $('error-popup-body'),
  errorPopupClose: $('error-popup-close'),
};

// ─── Error Popup ──────────────────────────────────────────────────────────────

function showErrorPopup(title, body) {
  dom.errorPopupTitle.textContent = title;
  dom.errorPopupBody.textContent = body;
  dom.errorPopup.classList.remove('hidden');
}

dom.errorPopupClose.addEventListener('click', () => dom.errorPopup.classList.add('hidden'));
dom.errorPopup.addEventListener('click', (e) => {
  if (e.target === dom.errorPopup) dom.errorPopup.classList.add('hidden');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

const BRIDGE_KEY = 'ig_pending_posts_bridge';

function handleBridgeData(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data.posts || !Array.isArray(data.posts)) return false;
    // Merge with existing posts (deduplicate by post_url)
    const existing = Storage.loadPosts();
    const existingUrls = new Set((existing?.posts || []).map((p) => p.post_url));
    const merged = {
      exported_at: data.exported_at,
      source_url: data.source_url,
      posts: [...(existing?.posts || []), ...data.posts.filter((p) => !existingUrls.has(p.post_url))],
    };
    merged.total_count = merged.posts.length;
    state.rawData = merged;
    state.posts = merged.posts;
    Storage.savePosts(merged);
    return true;
  } catch { return false; }
}

function init() {
  // Check for data injected by the extension content script (vercel-bridge.js)
  const bridgeRaw = localStorage.getItem(BRIDGE_KEY);
  if (bridgeRaw) {
    localStorage.removeItem(BRIDGE_KEY);
    if (handleBridgeData(bridgeRaw)) {
      enterLoadedOrCategorizedMode();
      setupEventListeners();
      return;
    }
  }

  // Listen for late bridge data (content script ran after DOMContentLoaded)
  window.addEventListener('ig:pending-posts', () => {
    const raw = localStorage.getItem(BRIDGE_KEY);
    if (!raw) return;
    localStorage.removeItem(BRIDGE_KEY);
    if (handleBridgeData(raw)) enterLoadedOrCategorizedMode();
  });

  // Normal load path — check existing localStorage
  const saved = Storage.loadPosts();
  if (saved) {
    state.rawData = saved;
    state.posts = saved.posts;
    enterLoadedOrCategorizedMode();
  }

  setupEventListeners();
}

function enterLoadedOrCategorizedMode() {
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
  dom.pauseBtn.addEventListener('click', () => {
    if (!categorizationController) return;
    categorizationController.paused = !categorizationController.paused;
    dom.pauseBtn.textContent = categorizationController.paused ? 'Resume' : 'Pause';
    dom.pauseBtn.classList.toggle('paused', categorizationController.paused);
  });
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
    dom.webSearchToggle.checked = Storage.loadWebSearch();
    dom.settingsModal.classList.remove('hidden');
  });
  dom.webSearchToggle.addEventListener('change', () => {
    Storage.saveWebSearch(dom.webSearchToggle.checked);
  });
  dom.closeSettingsBtn.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));
  dom.settingsModal.addEventListener('click', (e) => {
    if (e.target === dom.settingsModal) dom.settingsModal.classList.add('hidden');
  });

  dom.creditsPopupSave.addEventListener('click', () => {
    const key = dom.creditsKeyInput.value.trim();
    if (!key) {
      dom.creditsPopupStatus.textContent = 'Please enter a key.';
      dom.creditsPopupStatus.classList.remove('hidden');
      return;
    }
    Storage.saveApiKey(key);
    dom.creditsPopup.classList.add('hidden');
    startCategorization();
  });
  dom.creditsPopupClose.addEventListener('click', () => {
    dom.creditsPopup.classList.add('hidden');
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
  setTimeout(showGuide, 80);
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

let categorizationController = null;

async function startCategorization() {
  const userApiKey = Storage.loadApiKey() || null;
  categorizationController = { paused: false };

  dom.categorizeBtn.disabled = true;
  dom.categorizeBtn.textContent = 'Categorizing…';
  dom.categorizeProgress.classList.remove('hidden');
  dom.pauseBtn.textContent = 'Pause';
  dom.pauseBtn.classList.remove('paused', 'hidden');

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
    dom.pauseBtn.classList.add('hidden');
    categorizationController = null;
    enterCategorizedMode();
    return;
  }

  // Accumulate results as they arrive so we can show a live tree
  const partialResults = [];
  const TREE_REFRESH_EVERY = 5;

  function refreshLiveTree() {
    const categorized = [...alreadyDone, ...partialResults].filter(
      (p) => p.categorization && p.categorization.category !== 'Uncategorized'
    );
    if (categorized.length === 0) return;
    // Show main layout if it's still hidden (first result)
    if (dom.mainLayout.classList.contains('hidden')) {
      dom.uploadSection.classList.add('hidden');
      dom.mainLayout.classList.remove('hidden');
    }
    state.tree = Renderer.buildTree(categorized);
    Renderer.renderTree(state.tree, dom.folderTree, onFolderSelect);
  }

  try {
    const { results, errorCount, errorLog } = await Categorizer.categorizeAll(
      toProcess,
      (current, total, errors, lastError, lastResult) => {
        const pct = Math.round((current / total) * 100);
        dom.categorizeProgressFill.style.width = pct + '%';
        const errNote = errors > 0 ? ` · ${errors} failed` : '';
        const errDetail = lastError ? ` [${lastError.slice(0, 60)}]` : '';
        const pausedNote = categorizationController?.paused ? ' · paused' : '';
        dom.categorizeProgressText.textContent = `${current} / ${total}${errNote}${errDetail}${pausedNote}`;
        if (lastResult) {
          partialResults.push(lastResult);
          if (partialResults.length % TREE_REFRESH_EVERY === 0) refreshLiveTree();
        }
      },
      skipImages,
      categorizationController,
      Storage.loadWebSearch(),
      { userApiKey }
    );

    dom.pauseBtn.classList.add('hidden');
    categorizationController = null;

    // Merge newly categorized with already-done posts
    state.posts = [...alreadyDone, ...results];
    state.rawData = { ...state.rawData, posts: state.posts };
    Storage.savePosts(state.rawData);

    enterCategorizedMode();

    if (errorCount > 0) {
      const uniqueErrors = [...new Set(errorLog)];
      const errorLines = uniqueErrors.length
        ? uniqueErrors.join('\n')
        : 'No additional detail available.';
      showErrorPopup(
        `${errorCount} post${errorCount > 1 ? 's' : ''} failed to categorize`,
        `These posts are shown as Uncategorized.\n\nErrors:\n${errorLines}`
      );
    }
  } catch (err) {
    dom.pauseBtn.classList.add('hidden');
    categorizationController = null;
    dom.categorizeBtn.disabled = false;
    dom.categorizeBtn.textContent = 'Auto Categorize';
    dom.categorizeProgress.classList.add('hidden');

    if (err.outOfCredits || err.modelRateLimited) {
      dom.creditsKeyInput.value = '';
      dom.creditsPopupStatus.classList.add('hidden');
      dom.creditsPopup.classList.remove('hidden');
    } else {
      showErrorPopup('Categorization failed', err.message);
    }
  }
}

// ─── Guide ────────────────────────────────────────────────────────────────────

function showGuide() {
  if (localStorage.getItem('ig_organizer_guide_seen')) return;

  const step1 = document.getElementById('guide-step-1');
  const step2 = document.getElementById('guide-step-2');
  const arrow1 = document.getElementById('guide-arrow-1');
  const arrow2 = document.getElementById('guide-arrow-2');
  if (!step1 || !step2) return;

  const CALLOUT_WIDTH = 250;

  function positionStep1() {
    const rect = dom.settingsBtn.getBoundingClientRect();
    const left = Math.max(8, rect.right - CALLOUT_WIDTH);
    step1.style.top = (rect.bottom + 8) + 'px';
    step1.style.left = left + 'px';
    const arrowLeft = (rect.left + rect.width / 2) - left - 9;
    arrow1.style.marginLeft = Math.max(9, Math.min(CALLOUT_WIDTH - 27, arrowLeft)) + 'px';
  }

  function positionStep2() {
    const rect = dom.categorizeBtn.getBoundingClientRect();
    step2.style.top = (rect.bottom + 8) + 'px';
    step2.style.left = rect.left + 'px';
    arrow2.style.marginLeft = Math.max(9, rect.width / 2 - 9) + 'px';
  }

  function dismissGuide() {
    step1.classList.add('hidden');
    step2.classList.add('hidden');
    localStorage.setItem('ig_organizer_guide_seen', '1');
  }

  positionStep1();
  step1.classList.remove('hidden');

  document.getElementById('guide-skip').addEventListener('click', dismissGuide);
  document.getElementById('guide-next').addEventListener('click', () => {
    step1.classList.add('hidden');
    positionStep2();
    step2.classList.remove('hidden');
  });
  document.getElementById('guide-done').addEventListener('click', dismissGuide);

  // Dismiss if user clicks the actual buttons
  dom.settingsBtn.addEventListener('click', dismissGuide, { once: true });
  dom.categorizeBtn.addEventListener('click', dismissGuide, { once: true });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
