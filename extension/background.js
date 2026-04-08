// background.js — service worker
// Owns the scraping loop so it survives popup close / tab switches.

// ── In-memory scraping state ───────────────────────────────────────────────────
const scraping = {
  active: false,
  tabId: null,
  sourceUrl: '',
  posts: [],
  seen: new Set(),
  retries: 0,
  chunkTimer: null,
};

// ── Injected into the Instagram tab each chunk (must be self-contained) ────────
async function inPageCollect(knownUrls) {
  const knownSet = new Set(knownUrls);

  // Spoof visibility so Instagram doesn't pause its loading logic.
  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('focus'));
  } catch {}

  // ── Collect posts ──────────────────────────────────────────────────────────
  // Primary source: fetch-intercepted API data from content-ig.js.
  // This works regardless of DOM rendering (background tab friendly).
  const newPosts = [];
  const seenThisChunk = new Set();

  if (typeof window.__igDrainPosts === 'function') {
    for (const post of window.__igDrainPosts()) {
      if (!knownSet.has(post.post_url) && !seenThisChunk.has(post.post_url)) {
        seenThisChunk.add(post.post_url);
        newPosts.push(post);
      }
    }
  }

  // Fallback: DOM anchors (catches first-chunk posts before any API fires,
  // and any posts the fetch interceptor might miss).
  const HREF_SELECTORS = [
    'article a[href*="/p/"], article a[href*="/reel/"]',
    '[role="main"] a[href*="/p/"], [role="main"] a[href*="/reel/"]',
    'a[href*="/p/"], a[href*="/reel/"]',
    'a[href*="/tv/"]',
  ];
  let anchors = [];
  for (const sel of HREF_SELECTORS) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) { anchors = Array.from(els); break; }
  }
  if (!anchors.length) {
    const seen = new Set();
    const imgs = document.querySelectorAll('img[src*="cdninstagram.com"], img[src*="instagram.f"]');
    for (const img of imgs) {
      let el = img.parentElement;
      for (let i = 0; i < 12; i++) {
        if (!el) break;
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          if (/^\/(p|reel|tv)\//.test(href) && !seen.has(el)) { seen.add(el); anchors.push(el); }
          break;
        }
        el = el.parentElement;
      }
    }
  }
  for (const anchor of anchors) {
    const rawHref = anchor.getAttribute('href') || '';
    if (!rawHref) continue;
    const postUrl = rawHref.startsWith('http') ? rawHref : 'https://www.instagram.com' + rawHref;
    if (knownSet.has(postUrl) || seenThisChunk.has(postUrl)) continue;
    const img = anchor.querySelector('img');
    const postType = /\/(reel|tv)\//.test(anchor.href || rawHref) ? 'reel' : 'photo';
    seenThisChunk.add(postUrl);
    newPosts.push({
      post_url: postUrl,
      thumbnail_src: img ? img.src : null,
      alt_text: img ? (img.alt || null) : null,
      post_type: postType,
    });
  }

  // ── Scroll + trigger next load ─────────────────────────────────────────────
  const POST_SEL = 'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]';
  const urlsBefore = new Set(
    Array.from(document.querySelectorAll(POST_SEL)).map(a => {
      const h = a.getAttribute('href') || '';
      return h.startsWith('http') ? h : 'https://www.instagram.com' + h;
    })
  );

  window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
  window.dispatchEvent(new Event('scroll', { bubbles: true }));
  if (typeof window.__igForceLoad === 'function') window.__igForceLoad();

  // ── Wait for next batch ────────────────────────────────────────────────────
  // Resolves as soon as ANY of:
  //   • ig:posts-loaded fires (fetch interceptor got an API response)
  //   • a new post URL appears in the DOM (visible-tab fallback)
  //   • 8 s timeout
  // Re-fires __igForceLoad every 900 ms (evenly divisible by 300 ms tick)
  // in case a new sentinel observer was registered after the previous batch.
  await new Promise(resolve => {
    let elapsed = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(ticker);
      window.removeEventListener('ig:posts-loaded', onApiLoad);
      resolve();
    };
    const onApiLoad = () => finish();
    window.addEventListener('ig:posts-loaded', onApiLoad);

    const ticker = setInterval(() => {
      elapsed += 300;
      if (elapsed % 900 === 0 && typeof window.__igForceLoad === 'function') {
        window.__igForceLoad();
      }
      // DOM fallback detection
      const hasNewDom = Array.from(document.querySelectorAll(POST_SEL)).some(a => {
        const h = a.getAttribute('href') || '';
        const url = h.startsWith('http') ? h : 'https://www.instagram.com' + h;
        return !urlsBefore.has(url);
      });
      if (hasNewDom || elapsed >= 8000) finish();
    }, 300);
  });

  return { newPosts };
}

// ── Diagnose page when no posts found on first chunk ──────────────────────────
function inPageDiagnose() {
  const cdnImgs = document.querySelectorAll('img[src*="cdninstagram.com"], img[src*="instagram.f"]').length;
  const collectionLinks = Array.from(document.querySelectorAll('a[href*="/saved/"]')).length;
  const totalA = document.querySelectorAll('a[href]').length;
  return { cdnImgs, isCollectionsPage: collectionLinks > 0 && cdnImgs > 0, totalA };
}

// ── One chunk of the scraping loop ─────────────────────────────────────────────
async function doScrapeChunk() {
  if (!scraping.active) return;

  // Verify tab still exists and is on Instagram
  let tab;
  try { tab = await chrome.tabs.get(scraping.tabId); } catch { await finalizeScrape(); return; }
  if (!tab.url || !tab.url.includes('instagram.com')) { await finalizeScrape(); return; }

  // Collect + scroll (MAIN world so inPageCollect can reach window.__igForceLoad
  // and its visibility spoofing affects Instagram's own JS context)
  let result;
  try {
    const [{ result: r }] = await chrome.scripting.executeScript({
      target: { tabId: scraping.tabId },
      func: inPageCollect,
      args: [Array.from(scraping.seen)],
      world: 'MAIN',
    });
    result = r;
  } catch { await finalizeScrape(); return; }

  for (const post of result.newPosts) {
    if (!scraping.seen.has(post.post_url)) {
      scraping.seen.add(post.post_url);
      scraping.posts.push(post);
    }
  }

  scraping.retries = result.newPosts.length === 0 ? scraping.retries + 1 : 0;

  await chrome.storage.local.set({
    igScrapeProgress: { count: scraping.posts.length, timestamp: Date.now() },
  });

  // inPageCollect already waits up to 5 s for new content internally,
  // so retries truly mean "nothing loaded after waiting" = end of feed.
  if (scraping.retries >= 3) { await finalizeScrape(); return; }

  scraping.chunkTimer = setTimeout(doScrapeChunk, 500);
}

// ── Finalize: save results and notify popup ────────────────────────────────────
async function finalizeScrape() {
  if (!scraping.active) return;
  scraping.active = false;
  clearTimeout(scraping.chunkTimer);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: scraping.tabId },
      func: () => window.scrollTo({ top: 0, behavior: 'instant' }),
      world: 'MAIN',
    });
  } catch {}

  const posts = scraping.posts.slice();

  if (posts.length === 0) {
    await chrome.storage.local.remove('igScrapeProgress');
    await chrome.storage.local.set({ ig_scrape_error: { message: 'No posts found.', timestamp: Date.now() } });
    return;
  }

  // Diff against previously exported posts
  const { ig_pending_posts: prevExport } = await chrome.storage.local.get('ig_pending_posts');
  const knownUrls = new Set(prevExport?.all_post_urls || []);
  const isIncremental = knownUrls.size > 0;

  const newPosts = isIncremental ? posts.filter(p => !knownUrls.has(p.post_url)) : posts;
  const allPosts = [...(prevExport?.all_posts || []), ...newPosts];
  const allPostUrls = allPosts.map(p => p.post_url);

  const payload = {
    exported_at: new Date().toISOString(),
    source_url: scraping.sourceUrl,
    total_count: newPosts.length,
    posts: newPosts,
    all_posts: allPosts,
    all_post_urls: allPostUrls,
    incremental: isIncremental,
  };
  await chrome.storage.local.set({
    ig_pending_posts: payload,
    ig_scrape_done: { postCount: newPosts.length, timestamp: Date.now() },
  });
  await chrome.storage.local.remove('igScrapeProgress');
}

// ── Message handlers ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Start Scrape ─────────────────────────────────────────────────────────────
  if (message.action === 'START_SCRAPE') {
    if (scraping.active) { sendResponse({ success: false, error: 'Already scraping' }); return false; }

    scraping.active = true;
    scraping.tabId = message.tabId;
    scraping.sourceUrl = message.sourceUrl;
    scraping.posts = [];
    scraping.seen = new Set();
    scraping.retries = 0;

    // First chunk
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: inPageCollect,
      args: [[]],
      world: 'MAIN',
    }).then(async ([{ result }]) => {
      if (result.newPosts.length === 0) {
        // Diagnose why
        let msg = 'No posts detected — the page may still be loading.';
        try {
          const [{ result: diag }] = await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: inPageDiagnose,
            world: 'MAIN',
          });
          if (diag.isCollectionsPage) {
            msg = "You're on the saved collections overview. Click into a collection first, then export.";
          } else if (diag.cdnImgs > 0) {
            msg = 'Found images but no post links. Try scrolling down a bit first, then export again.';
          } else if (diag.totalA > 0) {
            msg = 'Page has links but none matched post patterns. Try scrolling first.';
          }
        } catch {}
        scraping.active = false;
        await chrome.storage.local.set({ ig_scrape_error: { message: msg, timestamp: Date.now() } });
        sendResponse({ success: false, error: msg });
        return;
      }

      for (const post of result.newPosts) { scraping.seen.add(post.post_url); scraping.posts.push(post); }
      await chrome.storage.local.set({ igScrapeProgress: { count: scraping.posts.length, timestamp: Date.now() } });
      sendResponse({ success: true });
      scraping.chunkTimer = setTimeout(doScrapeChunk, 3500);
    }).catch(async (err) => {
      scraping.active = false;
      sendResponse({ success: false, error: err.message });
    });

    return true; // async response
  }

  // ── Open Webapp ───────────────────────────────────────────────────────────────
  if (message.action === 'OPEN_WEBAPP') {
    chrome.storage.local.get('ig_pending_posts', (existing) => {
      const prev = existing.ig_pending_posts || {};
      const payload = {
        exported_at: new Date().toISOString(),
        source_url: message.sourceUrl,
        total_count: message.posts.length,
        posts: message.posts,
        all_posts: prev.all_posts,
        all_post_urls: prev.all_post_urls,
        incremental: prev.incremental,
      };
      chrome.storage.local.set({ ig_pending_posts: payload }, () => {
        if (chrome.runtime.lastError) { sendResponse({ success: false, error: chrome.runtime.lastError.message }); return; }
        const vercelUrl = 'https://saved-posts-organizer.vercel.app';
        chrome.windows.getCurrent((win) => {
          if (win.incognito) {
            chrome.windows.create({ url: vercelUrl, incognito: true }, (newWin) => {
              if (chrome.runtime.lastError) {
                chrome.tabs.create({ url: vercelUrl });
                sendResponse({ success: true, incognito: false, needsPermission: true });
              } else {
                sendResponse({ success: true, incognito: true });
              }
            });
          } else {
            chrome.tabs.create({ url: vercelUrl });
            sendResponse({ success: true, incognito: false });
          }
        });
      });
    });
    return true;
  }

  // ── Download JSON ─────────────────────────────────────────────────────────────
  if (message.action !== 'DOWNLOAD_JSON') return false;
  chrome.downloads.download(
    { url: message.dataUrl, filename: message.filename, saveAs: true },
    (downloadId) => {
      if (chrome.runtime.lastError) { sendResponse({ success: false, error: chrome.runtime.lastError.message }); }
      else { sendResponse({ success: true, downloadId }); }
    }
  );
  return true;
});
