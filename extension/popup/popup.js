// Popup controller

const state = {
  // phases: init | checking | wrong-page | ready-first | ready-new | ready-current
  //         | scraping | complete-new | error
  phase: 'init',
  postCount: 0,
  newPostCount: -1,  // -1 = unknown, 0 = none, >0 = count
  posts: null,
  sourceUrl: '',
  errorMessage: '',
  hasExported: false,

  // Download Posts
  downloadEnabled: false,
  folderName: '',
  downloadCount: 0,
};

const ui = {
  status:             document.getElementById('status'),
  result:             document.getElementById('result'),
  resultMsg:          document.getElementById('result-msg'),
  resultStatus:       document.getElementById('result-status'),
  exportBtn:          document.getElementById('export-btn'),
  actionRow:          document.getElementById('action-row'),
  actionExportBtn:    document.getElementById('action-export-btn'),
  actionOrganizerBtn: document.getElementById('action-organizer-btn'),
  resultActions:      document.getElementById('result-actions'),
  resultOrganizerBtn: document.getElementById('result-organizer-btn'),
  soloOrganizerBtn:   document.getElementById('solo-organizer-btn'),
  downloadBtn:        document.getElementById('download-btn'),

  // Download toggle
  downloadSection:    document.getElementById('download-section'),
  downloadToggle:     document.getElementById('download-toggle'),
  folderRow:          document.getElementById('folder-row'),
  pickFolderBtn:      document.getElementById('pick-folder-btn'),
  folderName:         document.getElementById('folder-name'),

  // Scraping view
  scrapeView:         document.getElementById('scrape-view'),
  scrapeCount:        document.getElementById('scrape-count'),
  dlStatsRow:         document.getElementById('dl-stats-row'),
  dlCount:            document.getElementById('dl-count'),
  stopBtn:            document.getElementById('stop-btn'),
  scrapeOrganizerBtn: document.getElementById('scrape-organizer-btn'),
};

function render() {
  // Hide everything
  ui.status.style.display          = 'none';
  ui.result.style.display          = 'none';
  ui.exportBtn.style.display       = 'none';
  ui.actionRow.style.display       = 'none';
  ui.resultActions.style.display   = 'none';
  ui.soloOrganizerBtn.style.display = 'none';
  ui.downloadSection.style.display  = 'none';
  ui.scrapeView.style.display       = 'none';

  // Reset mutable button states
  ui.status.className            = 'status';
  ui.exportBtn.textContent       = 'Export All Posts';
  ui.exportBtn.disabled          = false;
  ui.actionExportBtn.disabled    = false;
  ui.actionExportBtn.textContent = 'Export';

  switch (state.phase) {
    case 'init':
      ui.status.style.display = '';
      ui.status.textContent = 'Checking…';
      break;

    case 'checking':
      ui.status.style.display = '';
      ui.status.textContent = 'Checking for new posts…';
      break;

    case 'wrong-page':
      ui.status.style.display = '';
      ui.status.textContent = state.errorMessage;
      if (state.hasExported) ui.soloOrganizerBtn.style.display = 'block';
      break;

    case 'ready-first':
      ui.status.style.display = '';
      ui.status.textContent = 'Ready to export all your saved posts.';
      ui.downloadSection.style.display = 'block';
      renderDownloadToggle();
      ui.exportBtn.style.display = 'block';
      break;

    case 'ready-new':
      ui.status.style.display = '';
      ui.status.textContent = state.newPostCount > 0
        ? `${state.newPostCount} new post${state.newPostCount !== 1 ? 's' : ''} detected.`
        : 'Ready to export.';
      ui.downloadSection.style.display = 'block';
      renderDownloadToggle();
      ui.actionRow.style.display = 'flex';
      break;

    case 'ready-current':
      ui.status.style.display = '';
      ui.status.textContent = 'Up to date — no new posts since last export.';
      ui.actionRow.style.display = 'flex';
      ui.actionExportBtn.disabled = true;
      break;

    case 'scraping':
      ui.scrapeView.style.display = 'block';
      ui.scrapeCount.textContent = state.postCount;
      if (state.downloadEnabled) {
        ui.dlStatsRow.style.display = 'block';
        ui.dlCount.textContent = state.downloadCount;
      } else {
        ui.dlStatsRow.style.display = 'none';
      }
      if (state.hasExported) {
        ui.scrapeOrganizerBtn.style.display = 'block';
      } else {
        ui.scrapeOrganizerBtn.style.display = 'none';
      }
      break;

    case 'complete-new':
      ui.result.style.display = 'block';
      ui.resultMsg.textContent = `Exported ${state.postCount} post${state.postCount !== 1 ? 's' : ''}`;
      ui.resultActions.style.display = 'flex';
      ui.resultStatus.textContent = '';
      break;

    case 'error':
      ui.status.style.display = '';
      ui.status.className = 'status error';
      ui.status.textContent = state.errorMessage || 'Something went wrong.';
      if (state.hasExported) {
        ui.actionRow.style.display = 'flex';
        ui.actionExportBtn.textContent = 'Try Again';
      } else {
        ui.exportBtn.style.display = 'block';
        ui.exportBtn.textContent = 'Try Again';
      }
      break;
  }
}

function renderDownloadToggle() {
  ui.downloadToggle.setAttribute('aria-checked', state.downloadEnabled ? 'true' : 'false');
  ui.folderRow.style.display = state.downloadEnabled ? 'block' : 'none';
  if (state.folderName) {
    ui.folderName.textContent = state.folderName;
    ui.pickFolderBtn.classList.add('has-folder');
  } else {
    ui.folderName.textContent = 'Pick a folder…';
    ui.pickFolderBtn.classList.remove('has-folder');
  }
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ig-downloader', 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = reject;
  });
}

async function storeDirectoryHandle(handle) {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'downloadDir');
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function loadDirectoryHandle() {
  try {
    const db = await openHandleDB();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('downloadDir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function startScrape() {
  // If download is enabled, verify we have a folder with permission
  if (state.downloadEnabled) {
    const handle = await loadDirectoryHandle();
    if (!handle) {
      ui.resultStatus.textContent = 'Pick a folder first.';
      return;
    }
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const granted = await handle.requestPermission({ mode: 'readwrite' });
        if (granted !== 'granted') {
          ui.resultStatus.textContent = 'Folder permission denied.';
          return;
        }
      }
    } catch {
      ui.resultStatus.textContent = 'Could not access folder.';
      return;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.sourceUrl = tab.url;
  state.phase = 'scraping';
  state.postCount = 0;
  state.downloadCount = 0;
  render();

  chrome.runtime.sendMessage(
    {
      action: 'START_SCRAPE',
      tabId: tab.id,
      sourceUrl: tab.url,
      downloadEnabled: state.downloadEnabled,
    },
    (response) => {
      if (!response || !response.success) {
        state.phase = 'error';
        state.errorMessage = response?.error || 'Failed to start export.';
        render();
        return;
      }
      pollForCompletion();
    }
  );
}

async function pickFolder() {
  if (!window.showDirectoryPicker) {
    ui.resultStatus.textContent = 'Folder picker not supported by your browser.';
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await storeDirectoryHandle(handle);
    state.folderName = handle.name;
    renderDownloadToggle();
  } catch {
    // User cancelled — silently ignore
  }
}

function stopScrape() {
  ui.stopBtn.disabled = true;
  ui.stopBtn.textContent = 'Stopping…';
  chrome.runtime.sendMessage({ action: 'STOP_SCRAPE' });
}

function triggerDownload() {
  if (!state.posts) return;
  const payload = {
    exported_at: new Date().toISOString(),
    source_url: state.sourceUrl,
    total_count: state.posts.length,
    posts: state.posts,
  };
  const json = JSON.stringify(payload, null, 2);
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
  chrome.runtime.sendMessage({ action: 'DOWNLOAD_JSON', dataUrl, filename: 'saved_posts.json' });
}

function triggerOpenWebapp() {
  const posts = state.posts;
  if (!posts) return;
  ui.resultStatus.textContent = 'Opening…';
  chrome.runtime.sendMessage(
    { action: 'OPEN_WEBAPP', posts, sourceUrl: state.sourceUrl },
    (response) => {
      if (!response || !response.success) {
        ui.resultStatus.textContent = 'Failed to open tab.';
        return;
      }
      if (response.incognito) {
        ui.resultStatus.textContent = 'Opened in a new incognito window.';
      } else if (response.needsPermission) {
        ui.resultStatus.textContent = 'Incognito blocked — opened in a regular tab.';
      } else {
        ui.resultStatus.textContent = 'Opened in a new tab.';
      }
    }
  );
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('export-btn').addEventListener('click', startScrape);
document.getElementById('action-export-btn').addEventListener('click', startScrape);
document.getElementById('download-btn').addEventListener('click', triggerDownload);
document.getElementById('popup-close-btn').addEventListener('click', () => window.close());
document.getElementById('stop-btn').addEventListener('click', stopScrape);
document.getElementById('pick-folder-btn').addEventListener('click', pickFolder);

document.getElementById('download-toggle').addEventListener('click', () => {
  state.downloadEnabled = !state.downloadEnabled;
  renderDownloadToggle();
  // If enabling and no folder yet, prompt immediately
  if (state.downloadEnabled && !state.folderName) {
    pickFolder();
  }
});

[
  document.getElementById('action-organizer-btn'),
  document.getElementById('result-organizer-btn'),
  document.getElementById('solo-organizer-btn'),
  document.getElementById('scrape-organizer-btn'),
].forEach(btn => btn.addEventListener('click', triggerOpenWebapp));

// ── State helpers ─────────────────────────────────────────────────────────────

const STALE_MS = 3 * 60 * 1000;

function loadComplete(posts, sourceUrl) {
  state.postCount   = posts.length;
  state.posts       = posts;
  state.sourceUrl   = sourceUrl || '';
  state.hasExported = true;
  state.phase       = 'complete-new';
  render();
}

// Quick DOM scan: count visible post URLs not in knownUrls.
// Returns -1 if the scan failed or found no links (page not loaded yet).
async function detectNewPosts(tabId, knownUrls) {
  try {
    const knownSet = new Set(knownUrls);
    const [{ result: urls }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const SELECTORS = [
          'article a[href*="/p/"], article a[href*="/reel/"]',
          '[role="main"] a[href*="/p/"], [role="main"] a[href*="/reel/"]',
          'a[href*="/p/"], a[href*="/reel/"]',
        ];
        let anchors = [];
        for (const sel of SELECTORS) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) { anchors = Array.from(els); break; }
        }
        return [...new Set(anchors.map(a => {
          const h = a.getAttribute('href') || '';
          return h.startsWith('http') ? h : 'https://www.instagram.com' + h;
        }))];
      },
    });
    if (!urls || urls.length === 0) return -1;
    return urls.filter(url => !knownSet.has(url)).length;
  } catch {
    return -1;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // Restore saved folder name if any
  try {
    const handle = await loadDirectoryHandle();
    if (handle) state.folderName = handle.name;
  } catch {}

  const stored = await chrome.storage.local.get([
    'ig_scrape_done', 'ig_pending_posts', 'igScrapeProgress', 'ig_scrape_error',
  ]);

  state.hasExported = !!(stored.ig_pending_posts?.posts?.length);

  // ── Error left over from background scraper ──────────────────────────────────
  if (stored.ig_scrape_error && Date.now() - stored.ig_scrape_error.timestamp < 5 * 60 * 1000) {
    await chrome.storage.local.remove('ig_scrape_error');
    state.phase = 'error';
    state.errorMessage = stored.ig_scrape_error.message;
    render();
    return;
  }

  // ── Scrape just finished ─────────────────────────────────────────────────────
  if (stored.ig_scrape_done && Date.now() - stored.ig_scrape_done.timestamp < 5 * 60 * 1000) {
    await chrome.storage.local.remove('ig_scrape_done');
    const p = stored.ig_pending_posts;
    if (p) { loadComplete(p.posts, p.source_url); return; }
  }

  // ── Scrape in progress ───────────────────────────────────────────────────────
  if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
    state.phase = 'scraping';
    state.postCount = stored.igScrapeProgress.count;
    state.downloadCount = stored.igScrapeProgress.downloadCount || 0;
    state.downloadEnabled = stored.igScrapeProgress.downloadEnabled || false;
    // Load previous export so "Open Organizer" button works during scraping
    if (stored.ig_pending_posts) {
      const p = stored.ig_pending_posts;
      state.posts = p.posts;
      state.sourceUrl = p.source_url || '';
    }
    render();
    pollForCompletion();
    return;
  }

  // ── URL check ────────────────────────────────────────────────────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  if (/instagram\.com\/[^/]+\/saved\/[^/]+/.test(url)) {
    const p = stored.ig_pending_posts;
    const knownUrls = p?.all_post_urls;

    if (knownUrls?.length) {
      state.hasExported = true;
      state.posts = p.posts;
      state.sourceUrl = p.source_url;
      state.phase = 'checking';
      render();

      const count = await detectNewPosts(tab.id, knownUrls);
      state.newPostCount = count;
      state.phase = count !== 0 ? 'ready-new' : 'ready-current';
      render();
    } else {
      state.phase = 'ready-first';
      render();
    }
    return;
  }

  // ── Not on a collection page — show last result if available ─────────────────
  if (stored.ig_pending_posts) {
    const p = stored.ig_pending_posts;
    loadComplete(p.posts, p.source_url);
    return;
  }

  // ── Wrong page, no data ──────────────────────────────────────────────────────
  state.phase = 'wrong-page';
  state.errorMessage = (!url.includes('instagram.com') || !url.includes('/saved'))
    ? 'Navigate to instagram.com/[username]/saved first.'
    : "You're on the collections page. Click into a collection first, then export.";
  render();
}

// ── Completion poller ─────────────────────────────────────────────────────────

let pollTimer = null;
function pollForCompletion() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const stored = await chrome.storage.local.get([
      'ig_scrape_done', 'ig_pending_posts', 'igScrapeProgress', 'ig_scrape_error',
    ]);
    if (stored.ig_scrape_error && Date.now() - stored.ig_scrape_error.timestamp < 5 * 60 * 1000) {
      clearInterval(pollTimer);
      await chrome.storage.local.remove('ig_scrape_error');
      state.phase = 'error';
      state.errorMessage = stored.ig_scrape_error.message;
      render();
    } else if (stored.ig_scrape_done) {
      clearInterval(pollTimer);
      await chrome.storage.local.remove('ig_scrape_done');
      const p = stored.ig_pending_posts;
      if (p) loadComplete(p.posts, p.source_url);
    } else if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
      state.postCount = stored.igScrapeProgress.count;
      state.downloadCount = stored.igScrapeProgress.downloadCount || 0;
      render();
    } else {
      clearInterval(pollTimer);
    }
  }, 800);
}

init();
