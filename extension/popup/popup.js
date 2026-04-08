// Popup controller

const state = {
  // phases: init | checking | wrong-page | ready-first | ready-new | ready-current
  //         | scraping | complete-new | complete-none | error
  phase: 'init',
  postCount: 0,
  newPostCount: -1,  // -1 = unknown, 0 = none detected, >0 = count
  posts: null,       // new posts from last export (for Download JSON)
  allPosts: null,    // all posts ever exported (for Open Organizer)
  sourceUrl: '',
  errorMessage: '',
  incremental: false,
  hasExported: false,
};

const ui = {
  status:             document.getElementById('status'),
  progress:           document.getElementById('progress'),
  progressText:       document.getElementById('progress-text'),
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
};

function render() {
  // Hide everything
  ui.status.style.display        = 'none';
  ui.progress.style.display      = 'none';
  ui.result.style.display        = 'none';
  ui.exportBtn.style.display     = 'none';
  ui.actionRow.style.display     = 'none';
  ui.resultActions.style.display = 'none';
  ui.soloOrganizerBtn.style.display = 'none';

  // Reset mutable button states
  ui.status.className         = 'status';
  ui.exportBtn.textContent    = 'Export All Posts';
  ui.exportBtn.disabled       = false;
  ui.actionExportBtn.disabled = false;
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
      ui.exportBtn.style.display = 'block';
      break;

    case 'ready-new':
      ui.status.style.display = '';
      ui.status.textContent = state.newPostCount > 0
        ? `${state.newPostCount} new post${state.newPostCount !== 1 ? 's' : ''} detected.`
        : 'Ready to export.';
      ui.actionRow.style.display = 'flex';
      break;

    case 'ready-current':
      ui.status.style.display = '';
      ui.status.textContent = 'Up to date — no new posts since last export.';
      ui.actionRow.style.display = 'flex';
      ui.actionExportBtn.disabled = true;
      break;

    case 'scraping':
      ui.progress.style.display = 'block';
      ui.progressText.textContent = state.postCount > 0
        ? `${state.postCount} posts collected…`
        : 'Starting…';
      if (state.hasExported) ui.soloOrganizerBtn.style.display = 'block';
      break;

    case 'complete-new':
      ui.result.style.display = 'block';
      ui.resultMsg.textContent = state.incremental
        ? `Found ${state.postCount} new post${state.postCount !== 1 ? 's' : ''}`
        : `Exported ${state.postCount} post${state.postCount !== 1 ? 's' : ''}`;
      ui.resultActions.style.display = 'flex';
      ui.resultStatus.textContent = '';
      break;

    case 'complete-none':
      ui.status.style.display = '';
      ui.status.textContent = 'No new posts since last export.';
      ui.actionRow.style.display = 'flex';
      ui.actionExportBtn.disabled = true;
      break;

    case 'error':
      ui.status.style.display = '';
      ui.status.className = 'status error';
      ui.status.textContent = state.errorMessage || 'Something went wrong.';
      if (state.hasExported) {
        // Show Try Again alongside Open Organizer
        ui.actionRow.style.display = 'flex';
        ui.actionExportBtn.textContent = 'Try Again';
      } else {
        ui.exportBtn.style.display = 'block';
        ui.exportBtn.textContent = 'Try Again';
      }
      break;
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function startScrape() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.sourceUrl = tab.url;
  state.phase = 'scraping';
  state.postCount = 0;
  render();

  chrome.runtime.sendMessage(
    { action: 'START_SCRAPE', tabId: tab.id, sourceUrl: tab.url },
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

[
  document.getElementById('action-organizer-btn'),
  document.getElementById('result-organizer-btn'),
  document.getElementById('solo-organizer-btn'),
].forEach(btn => btn.addEventListener('click', triggerOpenWebapp));

// ── State helpers ─────────────────────────────────────────────────────────────

const STALE_MS = 3 * 60 * 1000;

function loadComplete(postCount, posts, allPosts, sourceUrl, incremental) {
  state.postCount   = postCount;
  state.posts       = posts;
  state.allPosts    = allPosts || posts;
  state.sourceUrl   = sourceUrl || '';
  state.incremental = !!incremental;
  state.hasExported = true;
  state.phase = (incremental && postCount === 0) ? 'complete-none' : 'complete-new';
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
    if (!urls || urls.length === 0) return -1; // page not loaded yet
    return urls.filter(url => !knownSet.has(url)).length;
  } catch {
    return -1;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
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
    if (p) { loadComplete(p.posts.length, p.posts, p.all_posts, p.source_url, p.incremental); return; }
  }

  // ── Scrape in progress ───────────────────────────────────────────────────────
  if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
    state.phase = 'scraping';
    state.postCount = stored.igScrapeProgress.count;
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
      // Returning user — detect new posts before showing export option
      state.hasExported = true;
      state.allPosts = p.all_posts || p.posts;
      state.posts = p.posts;
      state.sourceUrl = p.source_url;
      state.phase = 'checking';
      render();

      const count = await detectNewPosts(tab.id, knownUrls);
      state.newPostCount = count;
      state.phase = count !== 0 ? 'ready-new' : 'ready-current';
      render();
    } else {
      // First-time user
      state.phase = 'ready-first';
      render();
    }
    return;
  }

  // ── Not on a collection page — show last result if available ─────────────────
  if (stored.ig_pending_posts) {
    const p = stored.ig_pending_posts;
    loadComplete(p.posts.length, p.posts, p.all_posts, p.source_url, p.incremental);
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
      if (p) loadComplete(p.posts.length, p.posts, p.all_posts, p.source_url, p.incremental);
    } else if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
      state.postCount = stored.igScrapeProgress.count;
      render();
    } else {
      clearInterval(pollTimer);
    }
  }, 800);
}

init();
