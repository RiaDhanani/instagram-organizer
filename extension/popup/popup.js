// Popup controller

const state = {
  phase: 'init', // init | wrong-page | ready | ready-with-previous | scraping | complete | error
  postCount: 0,
  posts: null,     // new posts only (for Download JSON)
  allPosts: null,  // all posts ever exported (for Open Organizer)
  sourceUrl: '',
  errorMessage: '',
  incremental: false,
};

const ui = {
  status: document.getElementById('status'),
  exportBtn: document.getElementById('export-btn'),
  readyPrevActions: document.getElementById('ready-prev-actions'),
  progress: document.getElementById('progress'),
  progressText: document.getElementById('progress-text'),
  result: document.getElementById('result'),
  resultMsg: document.getElementById('result-msg'),
  resultStatus: document.getElementById('result-status'),
};

function render() {
  ui.exportBtn.style.display = 'none';
  ui.readyPrevActions.style.display = 'none';
  ui.progress.style.display = 'none';
  ui.result.style.display = 'none';
  ui.status.style.display = '';
  ui.status.className = 'status';
  document.getElementById('export-prev-btn').disabled = false;

  if (state.phase === 'init') {
    ui.status.textContent = 'Checking page…';
  } else if (state.phase === 'wrong-page') {
    ui.status.textContent = state.errorMessage || 'Navigate to instagram.com/[username]/saved first.';
  } else if (state.phase === 'ready') {
    ui.status.textContent = 'Ready to export your saved posts.';
    ui.exportBtn.style.display = 'block';
  } else if (state.phase === 'ready-with-previous') {
    ui.status.textContent = '';
    ui.status.style.display = 'none';
    ui.readyPrevActions.style.display = 'flex';
  } else if (state.phase === 'scraping') {
    ui.status.textContent = 'Scraping in progress…';
    ui.progress.style.display = 'block';
    ui.progressText.textContent = state.postCount > 0 ? `${state.postCount} posts collected…` : 'Starting…';
  } else if (state.phase === 'complete') {
    if (state.incremental && state.postCount === 0) {
      // No new posts — disabled Export + Open Organizer
      ui.status.textContent = 'No new posts since last export.';
      ui.readyPrevActions.style.display = 'flex';
      document.getElementById('export-prev-btn').disabled = true;
    } else {
      // New posts or first export — Download JSON + Open Organizer
      ui.status.textContent = '';
      ui.result.style.display = 'block';
      ui.resultMsg.textContent = state.incremental
        ? `Found ${state.postCount} new post${state.postCount !== 1 ? 's' : ''}`
        : `Exported ${state.postCount} post${state.postCount !== 1 ? 's' : ''}`;
      ui.resultStatus.textContent = '';
    }
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
  const posts = state.allPosts || state.posts;
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
document.getElementById('export-prev-btn').addEventListener('click', startScrape);
document.getElementById('open-organizer-prev-btn').addEventListener('click', triggerOpenWebapp);
document.getElementById('popup-close-btn').addEventListener('click', () => window.close());

const STALE_MS = 3 * 60 * 1000;

function loadCompleteFromStorage(postCount, posts, allPosts, sourceUrl, incremental) {
  state.postCount = postCount;
  state.posts = posts;
  state.allPosts = allPosts || posts;
  state.sourceUrl = sourceUrl || '';
  state.incremental = !!incremental;
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
      loadCompleteFromStorage(pending.posts.length, pending.posts, pending.all_posts, pending.source_url, pending.incremental);
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

  // ── 3. URL check — valid collection page always shows Export ─────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || '';

  if (/instagram\.com\/[^/]+\/saved\/[^/]+/.test(url)) {
    if (stored.ig_pending_posts) {
      const pending = stored.ig_pending_posts;
      state.posts = pending.posts;
      state.allPosts = pending.all_posts || pending.posts;
      state.postCount = (pending.all_posts || pending.posts).length;
      state.sourceUrl = pending.source_url;
      state.phase = 'ready-with-previous';
    } else {
      state.phase = 'ready';
    }
    render();
    return;
  }

  // ── 4. Not on a collection page — show previous results if any ───────────────
  if (stored.ig_pending_posts) {
    const pending = stored.ig_pending_posts;
    loadCompleteFromStorage(pending.posts.length, pending.posts, pending.all_posts, pending.source_url, pending.incremental);
    return;
  }

  // ── 5. Wrong page, no results ─────────────────────────────────────────────────
  if (!url.includes('instagram.com') || !url.includes('/saved')) {
    state.phase = 'wrong-page';
    state.errorMessage = 'Navigate to instagram.com/[username]/saved first.';
  } else {
    state.phase = 'wrong-page';
    state.errorMessage = "You're on the collections page. Click into a collection first, then export.";
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
      if (pending) loadCompleteFromStorage(pending.posts.length, pending.posts, pending.all_posts, pending.source_url, pending.incremental);
    } else if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
      state.postCount = stored.igScrapeProgress.count;
      render();
    } else {
      clearInterval(pollTimer);
    }
  }, 800);
}

init();
