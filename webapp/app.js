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
  sortOrder: 'newest',
  filterNotes: false,
  filterFavorites: false,
  selectedPostUrls: new Set(),  // URLs of checked posts
  movingPostUrls: null,         // Set of URLs currently being moved
  contextTargetUrl: null,       // URL of right-clicked post
  noteEditUrl: null,            // URL of post whose note is being edited
  noteEditIndex: -1,            // Index in state.posts of the post being edited
  noteEditTags: [],             // Scratch copy of custom tags while modal is open
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
  allPostsTab: $('all-posts-tab'),
  allPostsCount: $('all-posts-count'),
  addCatBtn: $('add-cat-btn'),
  folderTree: $('folder-tree'),
  // Create-category popover
  createCatPopover: $('create-cat-popover'),
  createCatLabel: $('create-cat-label'),
  createCatInput: $('create-cat-input'),
  createCatCancel: $('create-cat-cancel'),
  createCatConfirm: $('create-cat-confirm'),
  // Context menu
  postContextMenu: $('post-context-menu'),
  ctxToggleSelect: $('ctx-toggle-select'),
  ctxMoveSelected: $('ctx-move-selected'),
  ctxMoveThis: $('ctx-move-this'),
  ctxEditNote: $('ctx-edit-note'),
  ctxClearSep: $('ctx-clear-sep'),
  ctxClearSel: $('ctx-clear-sel'),
  // Note modal
  noteModal: $('note-modal'),
  noteTextarea: $('note-textarea'),
  noteTagsPills: $('note-tags-pills'),
  noteTagInput: $('note-tag-input'),
  noteModalClose: $('note-modal-close'),
  noteModalCancel: $('note-modal-cancel'),
  noteModalSave: $('note-modal-save'),
  // Move modal
  moveModal: $('move-modal'),
  moveModalTitle: $('move-modal-title'),
  moveModalClose: $('move-modal-close'),
  moveCatList: $('move-cat-list'),
  moveNewCat: $('move-new-cat'),
  moveNewSub: $('move-new-sub'),
  moveNewBtn: $('move-new-btn'),
  postGrid: $('post-grid'),
  gridHeader: $('grid-header'),
  gridHeaderText: $('grid-header-text'),
  sortFilterBtn: $('sort-filter-btn'),
  sortFilterPanel: $('sort-filter-panel'),
  filterNotesCheck: $('filter-notes-check'),
  filterFavsCheck: $('filter-favs-check'),
  searchInput: $('search-input'),
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
  themeBtn: $('theme-btn'),
  themeIconDark: $('theme-icon-dark'),
  themeIconLight: $('theme-icon-light'),
};

// ─── Theme ────────────────────────────────────────────────────────────────────

(function initTheme() {
  if (localStorage.getItem('ig_theme') === 'light') {
    document.documentElement.classList.add('light');
    dom.themeIconDark.classList.add('hidden');
    dom.themeIconLight.classList.remove('hidden');
  }
})();

dom.themeBtn.addEventListener('click', () => {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('ig_theme', isLight ? 'light' : 'dark');
  dom.themeIconDark.classList.toggle('hidden', isLight);
  dom.themeIconLight.classList.toggle('hidden', !isLight);
});

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

// Deduplicates a posts array by post_url, keeping first occurrence of each URL.
function deduplicateByUrl(posts) {
  const seen = new Set();
  return posts.filter((p) => {
    if (!p.post_url || seen.has(p.post_url)) return false;
    seen.add(p.post_url);
    return true;
  });
}

function handleBridgeData(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data.posts || !Array.isArray(data.posts)) return false;
    // Merge with existing posts (deduplicate within new batch AND against existing)
    const existing = Storage.loadPosts();
    const existingUrls = new Set((existing?.posts || []).map((p) => p.post_url));
    const newUnique = deduplicateByUrl(data.posts).filter((p) => !existingUrls.has(p.post_url));
    const merged = {
      exported_at: data.exported_at,
      source_url: data.source_url,
      posts: [...(existing?.posts || []), ...newUnique],
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
    // Deduplicate in case a previous export introduced duplicate post_urls
    const posts = deduplicateByUrl(saved.posts || []);
    state.rawData = posts.length !== (saved.posts || []).length
      ? { ...saved, posts }
      : saved;
    state.posts = posts;
    if (state.rawData !== saved) Storage.savePosts(state.rawData);
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

  // ── Sidebar "+" → new top-level category ──────────────────────────────────
  dom.addCatBtn.addEventListener('click', () => {
    showCreatePopover('category', null, dom.addCatBtn);
  });

  // Popover controls
  dom.createCatConfirm.addEventListener('click', confirmCreateCat);
  dom.createCatCancel.addEventListener('click', hideCreatePopover);
  dom.createCatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmCreateCat();
    if (e.key === 'Escape') hideCreatePopover();
  });
  // Close popover on outside click
  document.addEventListener('click', (e) => {
    if (!dom.createCatPopover.classList.contains('hidden') &&
        !dom.createCatPopover.contains(e.target) &&
        e.target !== dom.addCatBtn && !dom.addCatBtn.contains(e.target)) {
      hideCreatePopover();
    }
  }, true); // capture phase so it fires before stopPropagation in category "+" buttons

  dom.allPostsTab.addEventListener('click', () => {
    const posts = (state.posts || []).filter((p) => p.categorization);
    state.selectedPosts = posts.length > 0 ? posts : state.posts;
    state.selectedPath = '';
    state.searchQuery = '';
    dom.searchInput.value = '';
    document.querySelectorAll('.folder-header.active').forEach((el) => el.classList.remove('active'));
    dom.allPostsTab.classList.add('active');
    const label = posts.length > 0
      ? `All Posts — ${posts.length}`
      : `All Posts — ${(state.posts || []).length} (uncategorized)`;
    setGridHeader(label);
    renderGrid(state.selectedPosts);
  });

  // ── Sort & Filter panel ───────────────────────────────────────────────────
  dom.sortFilterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dom.sortFilterPanel.classList.contains('hidden');
    dom.sortFilterPanel.classList.toggle('hidden', isOpen);
    dom.sortFilterBtn.classList.toggle('active', !isOpen);
  });

  // Close panel on outside click
  document.addEventListener('click', (e) => {
    if (!dom.sortFilterPanel.classList.contains('hidden') &&
        !dom.sortFilterPanel.contains(e.target) &&
        e.target !== dom.sortFilterBtn && !dom.sortFilterBtn.contains(e.target)) {
      dom.sortFilterPanel.classList.add('hidden');
      dom.sortFilterBtn.classList.remove('active');
    }
  });

  document.querySelectorAll('input[name="sfp-sort"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.sortOrder = radio.value;
      applyFiltersAndSort();
    });
  });

  dom.filterNotesCheck.addEventListener('change', () => {
    state.filterNotes = dom.filterNotesCheck.checked;
    applyFiltersAndSort();
  });

  dom.filterFavsCheck.addEventListener('change', () => {
    state.filterFavorites = dom.filterFavsCheck.checked;
    applyFiltersAndSort();
  });

  dom.searchInput.addEventListener('input', () => {
    state.searchQuery = dom.searchInput.value.trim().toLowerCase();
    applySearch();
  });

  // ── Card click handlers (select checkbox + heart + note indicator) ───────
  dom.postGrid.addEventListener('click', (e) => {
    // Select/deselect via hover checkbox
    const checkEl = e.target.closest('.post-select-check');
    if (checkEl) {
      e.preventDefault();
      e.stopPropagation();
      const card = checkEl.closest('.post-card');
      if (!card?.dataset.url) return;
      const url = card.dataset.url;
      if (state.selectedPostUrls.has(url)) {
        state.selectedPostUrls.delete(url);
      } else {
        state.selectedPostUrls.add(url);
      }
      applySelectionStyles();
      return;
    }
    // Heart button → toggle favorite
    const heartEl = e.target.closest('.post-heart-btn');
    if (heartEl) {
      e.preventDefault();
      e.stopPropagation();
      const card = heartEl.closest('.post-card');
      if (card?.dataset.url) toggleFavorite(card.dataset.url, heartEl);
      return;
    }
    // Note indicator → open note modal
    const indicator = e.target.closest('.post-note-indicator');
    if (!indicator) return;
    e.preventDefault();
    e.stopPropagation();
    const card = indicator.closest('.post-card');
    if (card?.dataset.url) openNoteModal(card.dataset.url);
  });

  // ── Context menu ──────────────────────────────────────────────────────────
  dom.postGrid.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.post-card');
    if (!card || !card.dataset.url) return;
    e.preventDefault();
    state.contextTargetUrl = card.dataset.url;
    showContextMenu(e.clientX, e.clientY, card.dataset.url);
  });

  // Close context menu when clicking outside it
  document.addEventListener('click', (e) => {
    if (!dom.postContextMenu.contains(e.target)) hideContextMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
      dom.moveModal.classList.add('hidden');
      dom.noteModal.classList.add('hidden');
    }
  });

  // Scroll also closes it
  window.addEventListener('scroll', hideContextMenu, { passive: true });

  dom.ctxToggleSelect.addEventListener('click', () => {
    const url = state.contextTargetUrl;
    if (!url) return;
    if (state.selectedPostUrls.has(url)) {
      state.selectedPostUrls.delete(url);
    } else {
      state.selectedPostUrls.add(url);
    }
    hideContextMenu();
    applySelectionStyles();
  });

  dom.ctxMoveSelected.addEventListener('click', () => {
    hideContextMenu();
    openMoveModal([...state.selectedPostUrls]);
  });

  dom.ctxMoveThis.addEventListener('click', () => {
    hideContextMenu();
    openMoveModal([state.contextTargetUrl]);
  });

  dom.ctxClearSel.addEventListener('click', () => {
    state.selectedPostUrls.clear();
    hideContextMenu();
    applySelectionStyles();
  });

  dom.ctxEditNote.addEventListener('click', () => {
    hideContextMenu();
    openNoteModal(state.contextTargetUrl);
  });

  // ── Note modal ────────────────────────────────────────────────────────────
  dom.noteModalClose.addEventListener('click',   () => dom.noteModal.classList.add('hidden'));
  dom.noteModalCancel.addEventListener('click',  () => dom.noteModal.classList.add('hidden'));
  dom.noteModalSave.addEventListener('click',    saveNote);
  dom.noteModal.addEventListener('click', (e) => {
    if (e.target === dom.noteModal) dom.noteModal.classList.add('hidden');
  });

  dom.noteTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addNoteTag(); }
    if (e.key === 'Escape') dom.noteModal.classList.add('hidden');
  });

  dom.noteTagsPills.addEventListener('click', (e) => {
    const btn = e.target.closest('.note-tag-remove');
    if (!btn) return;
    state.noteEditTags = state.noteEditTags.filter((t) => t !== btn.dataset.tag);
    renderNotePills();
  });

  dom.noteTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dom.noteModal.classList.add('hidden');
  });

  // ── Move modal ────────────────────────────────────────────────────────────
  dom.moveModalClose.addEventListener('click', () => dom.moveModal.classList.add('hidden'));
  dom.moveModal.addEventListener('click', (e) => {
    if (e.target === dom.moveModal) dom.moveModal.classList.add('hidden');
  });

  dom.moveNewBtn.addEventListener('click', () => {
    const cat = dom.moveNewCat.value.trim();
    if (!cat) { dom.moveNewCat.focus(); return; }
    const sub = dom.moveNewSub.value.trim() || 'General';
    executeMoveToPath([cat, sub]);
  });

  [dom.moveNewCat, dom.moveNewSub].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dom.moveNewBtn.click();
    });
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
      Storage.clearCustomCats();
      // Signal content script to clear chrome.storage (no reload needed)
      window.dispatchEvent(new CustomEvent('ig:wants-clear'));
      // Reset in-memory state
      state.rawData = null;
      state.posts = null;
      state.tree = null;
      state.selectedPosts = null;
      state.selectedPath = '';
      state.searchQuery = '';
      // Stop any running categorization
      if (categorizationController) {
        categorizationController.paused = true;
        categorizationController = null;
      }
      // Return to initial upload screen
      dom.settingsModal.classList.add('hidden');
      dom.mainLayout.classList.add('hidden');
      dom.categorizeBar.classList.add('hidden');
      dom.recategorizeBtn?.classList.add('hidden');
      dom.categorizeProgress.classList.add('hidden');
      dom.uploadSection.classList.remove('hidden');
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
      const posts = deduplicateByUrl(data.posts);
      state.rawData = { ...data, posts };
      state.posts = posts;
      Storage.savePosts(state.rawData);
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



  state.selectedPosts = state.posts;
  dom.allPostsTab.classList.add('active');
  dom.allPostsCount.textContent = state.posts.length;
  setGridHeader(`All Posts — ${state.posts.length} (uncategorized)`);
  renderGrid(state.posts);
  setTimeout(showGuide, 80);
}

function enterCategorizedMode() {
  dom.uploadSection.classList.add('hidden');
  dom.categorizeBar.classList.add('hidden');
  dom.mainLayout.classList.remove('hidden');

  // Show re-categorize button in header
  if (dom.recategorizeBtn) dom.recategorizeBtn.classList.remove('hidden');

  const categorized = state.posts.filter((p) => p.categorization);



  renderSidebar(categorized);

  state.selectedPosts = categorized;
  dom.allPostsTab.classList.add('active');
  dom.allPostsCount.textContent = categorized.length;
  setGridHeader(`All Posts — ${categorized.length}`);
  renderGrid(categorized);
}

function enterMixedMode() {
  // Some posts categorized, some not — show tree for categorized, keep categorize bar for new
  dom.uploadSection.classList.add('hidden');
  dom.mainLayout.classList.remove('hidden');
  dom.categorizeBar.classList.remove('hidden');
  dom.recategorizeBtn?.classList.add('hidden');

  const categorized = state.posts.filter((p) => p.categorization && p.categorization.category !== 'Uncategorized');
  const uncategorized = state.posts.filter((p) => !p.categorization || p.categorization.category === 'Uncategorized');



  if (categorized.length > 0) {
    renderSidebar(categorized);
  }

  state.selectedPosts = state.posts;
  dom.allPostsTab.classList.add('active');
  dom.allPostsCount.textContent = state.posts.length;
  setGridHeader(`All Posts — ${categorized.length} categorized, ${uncategorized.length} new`);
  renderGrid(categorized);
}


// ─── Sidebar / Tree helpers ───────────────────────────────────────────────────

// Merges user-created empty categories into the built tree so they always show
function getDisplayTree(categorized) {
  const tree = Renderer.buildTree(categorized);
  for (const { cat, sub } of Storage.loadCustomCats()) {
    if (!tree[cat]) tree[cat] = { __posts: [], __count: 0 };
    if (sub && !tree[cat][sub]) tree[cat][sub] = { __posts: [], __count: 0 };
  }
  return tree;
}

// Adds a small "+" button to every top-level category header for subcategory creation
function addSubcategoryButtons() {
  const topItems = dom.folderTree.querySelectorAll('.folder-tree > .folder-item');
  topItems.forEach((item) => {
    const header = item.querySelector(':scope > .folder-header');
    if (!header) return;
    const catName = header.querySelector('.folder-name')?.textContent;
    if (!catName) return;

    const btn = document.createElement('button');
    btn.className = 'add-sub-btn';
    btn.title = 'Add subcategory';
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCreatePopover('subcategory', catName, btn);
    });
    header.appendChild(btn);
  });
}

// Single helper that builds + renders the sidebar tree
function renderSidebar(categorized) {
  state.tree = getDisplayTree(categorized);
  Renderer.renderTree(state.tree, dom.folderTree, onFolderSelect);
  addSubcategoryButtons();
}

// ─── Sort & Render helpers ────────────────────────────────────────────────────

function sortPosts(posts) {
  if (!posts || !state.posts) return posts;
  let result = posts;
  if (state.filterFavorites) {
    result = result.filter((p) => p.user_favorited);
  }
  if (state.filterNotes) {
    result = result.filter((p) => p.user_notes || (p.user_tags && p.user_tags.length > 0));
  }
  if (state.sortOrder === 'newest') return result;
  const indexMap = new Map(state.posts.map((p, i) => [p.post_url, i]));
  return [...result].sort((a, b) => {
    const ia = indexMap.get(a.post_url) ?? 0;
    const ib = indexMap.get(b.post_url) ?? 0;
    return state.sortOrder === 'oldest' ? ib - ia : ia - ib;
  });
}

function renderGrid(posts) {
  Renderer.renderGrid(sortPosts(posts), dom.postGrid);
  applySelectionStyles();
}

// After any mutation to state.posts, call this so state.selectedPosts
// reflects the updated objects (same URLs, new references with new fields).
function syncSelectedPosts() {
  if (!state.selectedPosts) return;
  const map = new Map(state.posts.map((p) => [p.post_url, p]));
  state.selectedPosts = state.selectedPosts.map((p) => map.get(p.post_url) || p);
}

function setGridHeader(text) {
  dom.gridHeaderText.textContent = text;
}

// Re-stamps the count in the header after sort/filter changes without a full navigation
function updateGridHeaderCount(source) {
  const count = sortPosts(source).length;
  const base = state.selectedPath || 'All Posts';
  setGridHeader(`${base} — ${count}`);
}

// Central handler: re-render grid and header when sort/filter state changes
function applyFiltersAndSort() {
  if (state.searchQuery) {
    applySearch();
  } else {
    const source = state.selectedPosts || state.posts || [];
    renderGrid(source);
    updateGridHeaderCount(source);
  }
}

// Show/hide badge dot on the Sort & Filter button when non-default state is active
// Toggle favorite on a post; updates state, persists, updates the button in-place
function toggleFavorite(url, heartEl) {
  state.posts = state.posts.map((post) => {
    if (post.post_url !== url) return post;
    const updated = { ...post };
    if (updated.user_favorited) delete updated.user_favorited;
    else updated.user_favorited = true;
    return updated;
  });
  state.rawData = { ...state.rawData, posts: state.posts };
  Storage.savePosts(state.rawData);
  syncSelectedPosts();

  // Update the button in-place (no full re-render needed)
  const post = state.posts.find((p) => p.post_url === url);
  if (heartEl) {
    heartEl.classList.toggle('favorited', !!post?.user_favorited);
    heartEl.title = post?.user_favorited ? 'Unfavorite' : 'Favorite';
  }

  // If the favorites filter is active, re-render so this post disappears if unfavorited
  if (state.filterFavorites) applyFiltersAndSort();
}

// ─── Create Category Popover ──────────────────────────────────────────────────

let createPopoverCtx = null; // { type: 'category' | 'subcategory', parentCat?: string }

function showCreatePopover(type, parentCat, anchorEl) {
  createPopoverCtx = { type, parentCat };

  dom.createCatLabel.textContent = type === 'category' ? 'New category' : `New subcategory in ${parentCat}`;
  dom.createCatInput.placeholder = type === 'category' ? 'Category name' : 'Subcategory name';
  dom.createCatInput.value = '';

  // Position below/beside the anchor element
  const rect = anchorEl.getBoundingClientRect();
  const popW = 240;
  const left = Math.min(rect.left, window.innerWidth - popW - 8);
  const top  = rect.bottom + 5;

  dom.createCatPopover.style.left = left + 'px';
  dom.createCatPopover.style.top  = top  + 'px';
  dom.createCatPopover.classList.remove('hidden');
  setTimeout(() => dom.createCatInput.focus(), 30);
}

function hideCreatePopover() {
  dom.createCatPopover.classList.add('hidden');
  createPopoverCtx = null;
}

function confirmCreateCat() {
  const name = dom.createCatInput.value.trim();
  if (!name) { dom.createCatInput.focus(); return; }

  const cats = Storage.loadCustomCats();
  const { type, parentCat } = createPopoverCtx;

  if (type === 'category') {
    if (!cats.some((c) => c.cat === name && !c.sub)) {
      cats.push({ cat: name });
    }
  } else {
    if (!cats.some((c) => c.cat === parentCat && c.sub === name)) {
      cats.push({ cat: parentCat, sub: name });
    }
  }

  Storage.saveCustomCats(cats);
  hideCreatePopover();

  // Re-render sidebar to show the new empty folder
  if (state.posts) {
    const categorized = state.posts.filter(
      (p) => p.categorization && p.categorization.category !== 'Uncategorized'
    );
    renderSidebar(categorized);
  }
}

// ─── Notes & Tags Modal ───────────────────────────────────────────────────────

function renderNotePills() {
  dom.noteTagsPills.innerHTML = '';
  for (const tag of state.noteEditTags) {
    const pill = document.createElement('span');
    pill.className = 'note-tag-pill';
    const label = document.createTextNode(tag);
    const btn = document.createElement('button');
    btn.className = 'note-tag-remove';
    btn.textContent = '×';
    btn.dataset.tag = tag;
    pill.appendChild(label);
    pill.appendChild(btn);
    dom.noteTagsPills.appendChild(pill);
  }
}

function openNoteModal(url) {
  const idx = state.posts.findIndex((p) => p.post_url === url);
  state.noteEditUrl = url;
  state.noteEditIndex = idx;
  const post = idx !== -1 ? state.posts[idx] : null;
  dom.noteTextarea.value = post?.user_notes || '';
  state.noteEditTags = [...(post?.user_tags || [])];
  renderNotePills();
  dom.noteTagInput.value = '';
  dom.noteModal.classList.remove('hidden');
  setTimeout(() => dom.noteTextarea.focus(), 30);
}

function saveNote() {
  const idx = state.noteEditIndex;
  if (idx < 0 || idx >= state.posts.length) return;

  const note = dom.noteTextarea.value.trim();
  const tags = [...state.noteEditTags];

  // Update exactly the one post at the stored index — never touches other posts
  const updated = { ...state.posts[idx] };
  if (note) updated.user_notes = note; else delete updated.user_notes;
  if (tags.length > 0) updated.user_tags = tags; else delete updated.user_tags;

  state.posts = [...state.posts.slice(0, idx), updated, ...state.posts.slice(idx + 1)];
  state.rawData = { ...state.rawData, posts: state.posts };
  Storage.savePosts(state.rawData);
  syncSelectedPosts();
  dom.noteModal.classList.add('hidden');
  state.noteEditUrl = null;
  state.noteEditIndex = -1;
  state.noteEditTags = [];

  // Re-render so note indicator and user tags update on the card
  renderGrid(state.selectedPosts || state.posts);
}

function addNoteTag() {
  const val = dom.noteTagInput.value.trim().replace(/,+$/, '');
  if (!val || state.noteEditTags.includes(val)) { dom.noteTagInput.value = ''; return; }
  state.noteEditTags.push(val);
  renderNotePills();
  dom.noteTagInput.value = '';
}

// ─── Selection ────────────────────────────────────────────────────────────────

function applySelectionStyles() {
  const hasSelection = state.selectedPostUrls.size > 0;
  dom.postGrid.classList.toggle('has-selection', hasSelection);
  dom.postGrid.querySelectorAll('.post-card').forEach((card) => {
    card.classList.toggle('selected', state.selectedPostUrls.has(card.dataset.url));
  });
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function showContextMenu(x, y, url) {
  const isSelected = state.selectedPostUrls.has(url);
  const selCount = state.selectedPostUrls.size;

  dom.ctxToggleSelect.textContent = isSelected ? '✓ Deselect' : 'Select';

  // "Move N selected posts" — visible when there's a selection
  if (selCount > 0) {
    const label = `Move ${selCount} selected post${selCount !== 1 ? 's' : ''} to…`;
    dom.ctxMoveSelected.textContent = label;
    dom.ctxMoveSelected.classList.remove('hidden');
  } else {
    dom.ctxMoveSelected.classList.add('hidden');
  }

  // "Move this post" — hidden when this post is already in the selection
  // (avoids redundancy since "Move N selected" already covers it)
  if (isSelected && selCount > 0) {
    dom.ctxMoveThis.classList.add('hidden');
  } else {
    dom.ctxMoveThis.textContent = selCount > 0 ? 'Move this post to…' : 'Move to…';
    dom.ctxMoveThis.classList.remove('hidden');
  }

  // Clear row
  if (selCount > 0) {
    dom.ctxClearSep.classList.remove('hidden');
    dom.ctxClearSel.textContent = `Clear selection (${selCount})`;
    dom.ctxClearSel.classList.remove('hidden');
  } else {
    dom.ctxClearSep.classList.add('hidden');
    dom.ctxClearSel.classList.add('hidden');
  }

  // Position — keep within viewport using fixed estimates
  const CTX_W = 220, CTX_H = 170;
  dom.postContextMenu.style.left = Math.min(x, window.innerWidth  - CTX_W - 8) + 'px';
  dom.postContextMenu.style.top  = Math.min(y, window.innerHeight - CTX_H - 8) + 'px';
  dom.postContextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  dom.postContextMenu.classList.add('hidden');
}

// ─── Move Modal ───────────────────────────────────────────────────────────────

function flattenTreePaths(tree) {
  const paths = [];
  const cats = Object.keys(tree).filter((k) => !k.startsWith('__')).sort();
  for (const cat of cats) {
    const catNode = tree[cat];
    const subs = Object.keys(catNode).filter((k) => !k.startsWith('__')).sort();
    if (subs.length === 0) {
      paths.push({ path: [cat], count: catNode.__count });
    } else {
      for (const sub of subs) {
        const subNode = catNode[sub];
        const ters = Object.keys(subNode).filter((k) => !k.startsWith('__')).sort();
        paths.push({ path: [cat, sub], count: subNode.__count });
        for (const ter of ters) {
          paths.push({ path: [cat, sub, ter], count: subNode[ter].__count });
        }
      }
    }
  }
  return paths;
}

function openMoveModal(postUrls) {
  state.movingPostUrls = new Set(postUrls);
  const n = postUrls.length;
  dom.moveModalTitle.textContent = n === 1 ? 'Move 1 post to…' : `Move ${n} posts to…`;

  dom.moveCatList.innerHTML = '';

  const paths = state.tree ? flattenTreePaths(state.tree) : [];

  if (paths.length === 0) {
    dom.moveCatList.innerHTML = '<div class="move-cat-empty">No categories yet — use the form below.</div>';
  } else {
    for (const { path, count } of paths) {
      const depth = path.length - 1;
      const item = document.createElement('div');
      item.className = `move-cat-item depth-${depth}`;
      item.style.paddingLeft = (12 + depth * 18) + 'px';

      const nameEl = document.createElement('span');
      nameEl.className = 'move-cat-name';
      nameEl.textContent = path[path.length - 1];
      item.appendChild(nameEl);

      const countEl = document.createElement('span');
      countEl.className = 'move-cat-count';
      countEl.textContent = count;
      item.appendChild(countEl);

      item.addEventListener('click', () => executeMoveToPath(path));
      dom.moveCatList.appendChild(item);
    }
  }

  dom.moveNewCat.value = '';
  dom.moveNewSub.value = '';
  dom.moveModal.classList.remove('hidden');
}

function executeMoveToPath(path) {
  if (!state.movingPostUrls || state.movingPostUrls.size === 0) return;

  const [cat, sub, ter] = path;

  state.posts = state.posts.map((post) => {
    if (!state.movingPostUrls.has(post.post_url)) return post;
    return {
      ...post,
      categorization: {
        ...(post.categorization || {}),
        category: cat,
        subcategory: sub || 'Other',
        tertiary: ter || null,
        quaternary: null,
      },
    };
  });

  state.rawData = { ...state.rawData, posts: state.posts };
  Storage.savePosts(state.rawData);

  // Clear selection state
  state.selectedPostUrls.clear();
  state.movingPostUrls = null;

  dom.moveModal.classList.add('hidden');

  // Rebuild tree and reset to All Posts view
  const categorized = state.posts.filter(
    (p) => p.categorization && p.categorization.category !== 'Uncategorized'
  );
  renderSidebar(categorized);

  state.selectedPosts = categorized;
  state.selectedPath = '';
  document.querySelectorAll('.folder-header.active').forEach((el) => el.classList.remove('active'));
  dom.allPostsTab.classList.add('active');
  dom.allPostsCount.textContent = categorized.length;
  setGridHeader(`All Posts — ${categorized.length}`);
  renderGrid(categorized);
}

// ─── Folder Selection ─────────────────────────────────────────────────────────

function onFolderSelect(posts, pathLabel) {
  state.selectedPosts = posts;
  state.selectedPath = pathLabel;
  state.searchQuery = '';
  dom.searchInput.value = '';
  dom.allPostsTab.classList.remove('active');
  setGridHeader(`${pathLabel} — ${posts.length}`);
  renderGrid(posts);
}

// ─── Search ───────────────────────────────────────────────────────────────────

function applySearch() {
  const q = state.searchQuery;
  if (!q) {
    const source = state.selectedPosts || state.posts;
    renderGrid(source);
    updateGridHeaderCount(source);
    return;
  }

  // Word-boundary regex for structured fields; substring match for tags (already concise)
  const wordRe = new RegExp(`(?<![a-z])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i');

  let filtered = (state.posts || []).filter((post) => {
    const c = post.categorization;
    if (!c) return false;
    // Check structured fields with word-boundary match
    if ([c.category, c.subcategory, c.tertiary].some((f) => f && wordRe.test(f))) return true;
    // Check tags with substring match (tags are short, intentional keywords)
    if ((c.tags || []).some((t) => t && t.toLowerCase().includes(q))) return true;
    return false;
  });

  if (state.filterFavorites) {
    filtered = filtered.filter((p) => p.user_favorited);
  }
  if (state.filterNotes) {
    filtered = filtered.filter((p) => p.user_notes || (p.user_tags && p.user_tags.length > 0));
  }

  setGridHeader(`"${q}" — ${filtered.length} result${filtered.length !== 1 ? 's' : ''}`);
  renderGrid(filtered);
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
    renderSidebar(categorized);
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
      false,
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
      dom.creditsKeyInput.value = Storage.loadApiKey() || '';
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
