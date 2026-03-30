// Popup controller

const state = {
  phase: 'init', // init | wrong-page | ready | scraping | complete | error
  postCount: 0,
  posts: null,
  sourceUrl: '',
  errorMessage: '',
};

const ui = {
  status: document.getElementById('status'),
  exportBtn: document.getElementById('export-btn'),
  progress: document.getElementById('progress'),
  progressText: document.getElementById('progress-text'),
  result: document.getElementById('result'),
  resultMsg: document.getElementById('result-msg'),
  resultStatus: document.getElementById('result-status'),
};

function render() {
  ui.exportBtn.style.display = 'none';
  ui.progress.style.display = 'none';
  ui.result.style.display = 'none';
  ui.status.className = 'status';

  if (state.phase === 'init') {
    ui.status.textContent = 'Checking page…';
  } else if (state.phase === 'wrong-page') {
    ui.status.textContent = state.errorMessage || 'Navigate to instagram.com/[username]/saved first.';
  } else if (state.phase === 'ready') {
    ui.status.textContent = 'Ready to export your saved posts.';
    ui.exportBtn.style.display = 'block';
  } else if (state.phase === 'scraping') {
    ui.status.textContent = 'Scraping in progress…';
    ui.progress.style.display = 'block';
    ui.progressText.textContent = state.postCount > 0 ? `${state.postCount} posts collected…` : 'Starting…';
  } else if (state.phase === 'complete') {
    ui.status.textContent = '';
    ui.result.style.display = 'block';
    ui.resultMsg.textContent = `Exported ${state.postCount} post${state.postCount !== 1 ? 's' : ''}`;
    ui.resultStatus.textContent = '';
  } else if (state.phase === 'error') {
    ui.status.className = 'status error';
    ui.status.textContent = state.errorMessage || 'Something went wrong.';
    ui.exportBtn.style.display = 'block';
    ui.exportBtn.textContent = 'Try Again';
  }
}

async function startScrape() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.sourceUrl = tab.url;

  ui.exportBtn.disabled = true;
  state.phase = 'scraping';
  state.postCount = 0;
  render();

  chrome.runtime.sendMessage(
    { action: 'START_SCRAPE', tabId: tab.id, sourceUrl: tab.url },
    (response) => {
      if (!response || !response.success) {
        state.phase = 'error';
        state.errorMessage = response?.error || 'Failed to start export.';
        ui.exportBtn.disabled = false;
        ui.exportBtn.textContent = 'Try Again';
        render();
        return;
      }
      // Scraping is running in the service worker — poll for updates
      pollForCompletion();
    }
  );
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
  if (!state.posts) return;
  ui.resultStatus.textContent = 'Opening…';
  chrome.runtime.sendMessage(
    { action: 'OPEN_WEBAPP', posts: state.posts, sourceUrl: state.sourceUrl },
    (response) => {
      if (!response || !response.success) {
        ui.resultStatus.textContent = 'Failed to open tab.';
        return;
      }
      if (response.incognito) {
        ui.resultStatus.textContent = 'Opened in a new incognito window.';
      } else if (response.needsPermission) {
        ui.resultStatus.textContent = 'Incognito blocked — opened in a regular tab. To open in incognito, allow the extension in incognito mode via chrome://extensions.';
      } else {
        ui.resultStatus.textContent = 'Opened in a new tab.';
      }
    }
  );
}

document.getElementById('export-btn').addEventListener('click', () => {
  document.getElementById('export-btn').textContent = 'Export Saved Posts';
  startScrape();
});

document.getElementById('download-btn').addEventListener('click', triggerDownload);
document.getElementById('open-organizer-btn').addEventListener('click', triggerOpenWebapp);
document.getElementById('popup-close-btn').addEventListener('click', () => window.close());

const STALE_MS = 3 * 60 * 1000;

function loadCompleteFromStorage(postCount, posts, sourceUrl) {
  state.postCount = postCount;
  state.posts = posts;
  state.sourceUrl = sourceUrl || '';
  state.phase = 'complete';
  render();
}

async function init() {
  // ── 1. Check all scrape state ────────────────────────────────────────────────
  const stored = await chrome.storage.local.get([
    'ig_scrape_done', 'ig_pending_posts', 'igScrapeProgress', 'ig_scrape_error',
  ]);

  // Error from background scraper
  if (stored.ig_scrape_error && Date.now() - stored.ig_scrape_error.timestamp < 5 * 60 * 1000) {
    await chrome.storage.local.remove('ig_scrape_error');
    state.phase = 'error';
    state.errorMessage = stored.ig_scrape_error.message;
    ui.exportBtn.disabled = false;
    render();
    return;
  }

  if (stored.ig_scrape_done && Date.now() - stored.ig_scrape_done.timestamp < 5 * 60 * 1000) {
    await chrome.storage.local.remove('ig_scrape_done');
    const pending = stored.ig_pending_posts;
    if (pending) {
      loadCompleteFromStorage(pending.posts.length, pending.posts, pending.source_url);
      return;
    }
  }

  // ── 2. Scrape still in progress ──────────────────────────────────────────────
  if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
    state.phase = 'scraping';
    state.postCount = stored.igScrapeProgress.count;
    render();
    pollForCompletion();
    return;
  }

  // ── 3. Normal URL check ──────────────────────────────────────────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || '';

  if (!url.includes('instagram.com') || !url.includes('/saved')) {
    state.phase = 'wrong-page';
    state.errorMessage = 'Navigate to instagram.com/[username]/saved first.';
  } else if (!/instagram\.com\/[^/]+\/saved\/[^/]+/.test(url)) {
    state.phase = 'wrong-page';
    state.errorMessage = "You're on the collections page. Click into a collection first, then export.";
  } else {
    state.phase = 'ready';
  }
  render();
}

let pollTimer = null;
function pollForCompletion() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const stored = await chrome.storage.local.get(['ig_scrape_done', 'ig_pending_posts', 'igScrapeProgress', 'ig_scrape_error']);
    if (stored.ig_scrape_error && Date.now() - stored.ig_scrape_error.timestamp < 5 * 60 * 1000) {
      clearInterval(pollTimer);
      await chrome.storage.local.remove('ig_scrape_error');
      state.phase = 'error';
      state.errorMessage = stored.ig_scrape_error.message;
      ui.exportBtn.disabled = false;
      ui.exportBtn.textContent = 'Try Again';
      render();
    } else if (stored.ig_scrape_done) {
      clearInterval(pollTimer);
      await chrome.storage.local.remove('ig_scrape_done');
      const pending = stored.ig_pending_posts;
      if (pending) loadCompleteFromStorage(pending.posts.length, pending.posts, pending.source_url);
    } else if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
      state.postCount = stored.igScrapeProgress.count;
      render();
    } else {
      clearInterval(pollTimer);
    }
  }, 800);
}

init();
