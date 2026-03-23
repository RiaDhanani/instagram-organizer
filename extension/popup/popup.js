// Popup controller — orchestrates injection, port, progress, and download

const state = {
  phase: 'init', // init | wrong-page | ready | scraping | complete | up-to-date | error
  postCount: 0,
  totalScraped: 0,
  allPosts: null,
  errorMessage: '',
  posts: null,
};

const ui = {
  status: document.getElementById('status'),
  exportBtn: document.getElementById('export-btn'),
  progress: document.getElementById('progress'),
  progressText: document.getElementById('progress-text'),
  result: document.getElementById('result'),
  resultMsg: document.getElementById('result-msg'),
  hintText: document.getElementById('hint-text'),
  reexportBtn: document.getElementById('reexport-btn'),
};

function render() {
  const { phase, postCount, errorMessage } = state;

  // Hide all dynamic sections first
  ui.exportBtn.style.display = 'none';
  ui.progress.style.display = 'none';
  ui.result.style.display = 'none';
  ui.status.className = 'status';

  if (phase === 'init') {
    ui.status.textContent = 'Checking page…';
  } else if (phase === 'wrong-page') {
    ui.status.textContent = state.errorMessage || 'Navigate to instagram.com/[username]/saved first.';
  } else if (phase === 'ready') {
    ui.status.textContent = 'Ready to export your saved posts.';
    ui.exportBtn.style.display = 'block';
  } else if (phase === 'scraping') {
    ui.status.textContent = 'Scraping in progress…';
    ui.progress.style.display = 'block';
    ui.progressText.textContent =
      postCount > 0 ? `${postCount} posts collected so far` : 'Starting…';
  } else if (phase === 'complete') {
    ui.status.textContent = '';
    ui.result.style.display = 'block';
    ui.resultMsg.textContent = `Exported ${postCount} new post${postCount !== 1 ? 's' : ''}!`;
    ui.hintText.textContent = 'Opening organizer tab automatically…';
    ui.reexportBtn.style.display = 'none';
  } else if (phase === 'up-to-date') {
    ui.status.textContent = '';
    ui.result.style.display = 'block';
    ui.resultMsg.textContent = `All ${state.totalScraped} posts already exported.`;
    ui.hintText.textContent = 'Nothing new to categorize.';
    ui.reexportBtn.style.display = 'block';
  } else if (phase === 'done') {
    ui.status.textContent = '';
    ui.result.style.display = 'block';
    ui.resultMsg.textContent = `Exported ${postCount} posts!`;
    ui.hintText.textContent = 'Done — organizer tab is ready.';
    ui.reexportBtn.style.display = 'none';
  } else if (phase === 'error') {
    ui.status.className = 'status error';
    ui.status.textContent = errorMessage || 'Something went wrong.';
    ui.exportBtn.style.display = 'block'; // Allow retry
    ui.exportBtn.textContent = 'Try Again';
  }
}

async function startScrape() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  ui.exportBtn.disabled = true;
  state.phase = 'scraping';
  state.postCount = 0;
  render();

  // Inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (err) {
    state.phase = 'error';
    state.errorMessage = 'Could not inject scraper: ' + err.message;
    ui.exportBtn.disabled = false;
    render();
    return;
  }

  // Open long-lived port for streaming progress
  let port;
  try {
    port = chrome.tabs.connect(tab.id, { name: 'ig-scraper' });
  } catch (err) {
    state.phase = 'error';
    state.errorMessage = 'Could not connect to page: ' + err.message;
    ui.exportBtn.disabled = false;
    render();
    return;
  }

  port.onMessage.addListener((msg) => {
    if (msg.type === 'PROGRESS') {
      state.postCount = msg.current;
      render();
    } else if (msg.type === 'COMPLETE') {
      // Clean up progress markers — scrape finished with popup open
      chrome.storage.local.remove(['igScrapeProgress', 'igScrapeComplete']);
      chrome.storage.local.get('ig_known_urls', (stored) => {
        const knownUrls = new Set(stored.ig_known_urls || []);
        const newPosts = msg.posts.filter((p) => !knownUrls.has(p.post_url));
        state.totalScraped = msg.posts.length;
        state.allPosts = msg.posts;
        state.postCount = newPosts.length;
        state.posts = newPosts;
        state.phase = newPosts.length === 0 ? 'up-to-date' : 'complete';
        render();
        if (newPosts.length > 0) triggerOpenWebapp(newPosts, tab.url);
      });
    } else if (msg.type === 'ERROR') {
      state.phase = 'error';
      state.errorMessage = msg.message;
      ui.exportBtn.disabled = false;
      ui.exportBtn.textContent = 'Try Again';
      render();
    }
  });

  port.onDisconnect.addListener(() => {
    if (state.phase === 'scraping') {
      state.phase = 'error';
      state.errorMessage = 'Connection to page was lost. Try again.';
      ui.exportBtn.disabled = false;
      ui.exportBtn.textContent = 'Try Again';
      render();
    }
  });

  port.postMessage({ action: 'START_SCRAPE' });
}

function triggerDownload(posts, sourceUrl) {
  const payload = {
    exported_at: new Date().toISOString(),
    source_url: sourceUrl,
    total_count: posts.length,
    posts,
  };
  const json = JSON.stringify(payload, null, 2);
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);

  chrome.runtime.sendMessage({
    action: 'DOWNLOAD_JSON',
    dataUrl,
    filename: 'saved_posts.json',
  });
}

function triggerOpenWebapp(posts, sourceUrl) {
  chrome.runtime.sendMessage({ action: 'OPEN_WEBAPP', posts, sourceUrl });
}

// Wire backup download button
document.getElementById('download-btn').addEventListener('click', () => {
  if (state.posts) triggerDownload(state.posts, '');
});

// Re-export all: clear known URLs and send all scraped posts
document.getElementById('reexport-btn').addEventListener('click', () => {
  chrome.storage.local.remove('ig_known_urls', () => {
    const posts = state.allPosts || state.posts;
    if (posts && posts.length > 0) {
      state.postCount = posts.length;
      state.posts = posts;
      state.phase = 'complete';
      render();
      triggerOpenWebapp(posts, '');
    }
  });
});

let pollInterval = null;
const STALE_MS = 3 * 60 * 1000; // ignore progress entries older than 3 min

function pollScrapeProgress() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const stored = await chrome.storage.local.get(['igScrapeProgress', 'igScrapeComplete']);
    if (stored.igScrapeComplete) {
      clearInterval(pollInterval);
      await chrome.storage.local.remove('igScrapeComplete');
      state.phase = 'done';
      state.postCount = stored.igScrapeComplete.postCount;
      render();
    } else if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
      state.postCount = stored.igScrapeProgress.count;
      state.phase = 'scraping';
      render();
    } else {
      clearInterval(pollInterval);
    }
  }, 800);
}

async function init() {
  // Always check local storage first — works from any tab, any context
  const stored = await chrome.storage.local.get(['igScrapeProgress', 'igScrapeComplete']);

  if (stored.igScrapeComplete) {
    await chrome.storage.local.remove('igScrapeComplete');
    state.phase = 'done';
    state.postCount = stored.igScrapeComplete.postCount;
    render();
    return;
  }

  if (stored.igScrapeProgress && Date.now() - stored.igScrapeProgress.timestamp < STALE_MS) {
    state.phase = 'scraping';
    state.postCount = stored.igScrapeProgress.count;
    render();
    pollScrapeProgress();
    return;
  }

  // Clean up any stale entry
  await chrome.storage.local.remove(['igScrapeProgress', 'igScrapeComplete']);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || '';

  if (!url.includes('instagram.com') || !url.includes('/saved')) {
    state.phase = 'wrong-page';
    state.errorMessage = 'Navigate to instagram.com/[username]/saved first.';
  } else if (!/instagram\.com\/[^/]+\/saved\/[^/]+/.test(url)) {
    state.phase = 'wrong-page';
    state.errorMessage = 'You\'re on the collections page. Click into "All Posts" (or any collection) first, then click Export.';
  } else {
    state.phase = 'ready';
  }
  render();
}

ui.exportBtn.addEventListener('click', () => {
  ui.exportBtn.textContent = 'Export Saved Posts';
  startScrape();
});

document.getElementById('open-organizer-btn').addEventListener('click', () => {
  const webappUrl = chrome.runtime.getURL('webapp/index.html');
  chrome.tabs.query({ url: webappUrl }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      chrome.tabs.create({ url: webappUrl });
    }
  });
});

init();
