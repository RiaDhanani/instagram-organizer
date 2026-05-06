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
  downloadEnabled: false,
  downloadCount: 0,
  stopped: false,
};

// ── IndexedDB helpers (access FileSystemDirectoryHandle stored by popup) ───────
function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ig-downloader', 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = reject;
  });
}

async function getDownloadDirHandle() {
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

async function downloadPost(post, index, dirHandle) {
  if (post.post_type === 'reel' && !post.video_src) return;
  const isVideo = post.post_type === 'reel';
  const url = isVideo ? post.video_src : post.thumbnail_src;
  if (!url) return;

  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) {
      console.log('[ig-dl] fetch failed:', resp.status, url.split('?')[0]);
      return;
    }
    const blob = await resp.blob();
    if (blob.size === 0) return;

    const ext = isVideo ? 'mp4' : 'jpg';
    const filename = `post_${String(index + 1).padStart(4, '0')}.${ext}`;
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    scraping.downloadCount++;
    chrome.storage.local.set({
      igScrapeProgress: {
        count: scraping.posts.length,
        downloadCount: scraping.downloadCount,
        downloadEnabled: scraping.downloadEnabled,
        timestamp: Date.now(),
      },
    });
  } catch (err) {
    console.log('[ig-dl] error:', post.post_type, url?.split('?')[0], err?.message);
  }
}

// Parallel-download all posts after scraping is complete, when post_type and
// video_src are final. Each post produces exactly one file (.jpg or .mp4) — no
// races, no double-downloads. Concurrency keeps it fast.
async function downloadAllPosts(posts) {
  const dirHandle = await getDownloadDirHandle();
  if (!dirHandle) { console.log('[ig-dl] no dirHandle'); return; }

  try {
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { console.log('[ig-dl] permission not granted'); return; }
  } catch { return; }

  const CONCURRENCY = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < posts.length && !scraping.stopped) {
      const idx = cursor++;
      await downloadPost(posts[idx], idx, dirHandle);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// ── Injected into the Instagram tab each chunk (must be self-contained) ────────
async function inPageCollect(knownUrls) {
  const knownSet = new Set(knownUrls);

  // Canonicalize any post URL to https://www.instagram.com/p/<code>/ so that the
  // same saved post coming via API (/reel/CODE/) and via DOM (/p/CODE/) dedup.
  const _canonical = (url) => {
    const m = /\/(?:p|reel|reels|tv)\/([^/?#]+)/.exec(url || '');
    return m ? `https://www.instagram.com/p/${m[1]}/` : url;
  };

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
  const videoUpdates = [];
  const seenThisChunk = new Set();

  if (typeof window.__igDrainPosts === 'function') {
    for (const post of window.__igDrainPosts()) {
      const canonical = _canonical(post.post_url);
      post.post_url = canonical;
      if (knownSet.has(canonical)) {
        videoUpdates.push({
          post_url: canonical,
          video_src: post.video_src || null,
          post_type: post.post_type,
        });
        continue;
      }
      if (seenThisChunk.has(canonical)) continue;
      seenThisChunk.add(canonical);
      newPosts.push(post);
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
    const rawUrl = rawHref.startsWith('http') ? rawHref : 'https://www.instagram.com' + rawHref;
    const postUrl = _canonical(rawUrl);
    if (knownSet.has(postUrl) || seenThisChunk.has(postUrl)) continue;
    const img = anchor.querySelector('img');
    const postType = /\/(reel|tv|reels)\//.test(anchor.href || rawHref) ? 'reel' : 'photo';
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

  return { newPosts, videoUpdates };
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

  // Apply API-derived updates to posts already collected from the DOM. We
  // don't download here — downloads happen in finalizeScrape once post_type
  // and video_src are final, so each post produces exactly one file.
  for (const update of (result.videoUpdates || [])) {
    const existing = scraping.posts.find(p => p.post_url === update.post_url);
    if (!existing) continue;
    if (update.post_type) existing.post_type = update.post_type;
    if (update.video_src && !existing.video_src) existing.video_src = update.video_src;
  }

  scraping.retries = result.newPosts.length === 0 ? scraping.retries + 1 : 0;

  await chrome.storage.local.set({
    igScrapeProgress: {
      count: scraping.posts.length,
      downloadCount: scraping.downloadCount,
      downloadEnabled: scraping.downloadEnabled,
      timestamp: Date.now(),
    },
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

  // Run downloads now that post_type and video_src are final. Doing this here
  // (rather than per-chunk during scraping) avoids races and double-downloads:
  // a post collected first as photo from the DOM and later re-typed as reel by
  // the API would otherwise produce both a .jpg and a .mp4. Parallel workers
  // keep total time low.
  if (scraping.downloadEnabled && !scraping.stopped) {
    await downloadAllPosts(posts);
  }

  const payload = {
    exported_at: new Date().toISOString(),
    source_url: scraping.sourceUrl,
    total_count: posts.length,
    posts: posts,
    all_post_urls: posts.map(p => p.post_url),
  };
  await chrome.storage.local.set({
    ig_pending_posts: payload,
    ig_scrape_done: { postCount: posts.length, timestamp: Date.now() },
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
    scraping.downloadEnabled = !!message.downloadEnabled;
    scraping.downloadCount = 0;
    scraping.stopped = false;

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

      for (const post of result.newPosts) {
        scraping.seen.add(post.post_url);
        scraping.posts.push(post);
      }

      for (const update of (result.videoUpdates || [])) {
        const existing = scraping.posts.find(p => p.post_url === update.post_url);
        if (!existing) continue;
        if (update.post_type) existing.post_type = update.post_type;
        if (update.video_src && !existing.video_src) existing.video_src = update.video_src;
      }

      await chrome.storage.local.set({
        igScrapeProgress: {
          count: scraping.posts.length,
          downloadCount: scraping.downloadCount,
          downloadEnabled: scraping.downloadEnabled,
          timestamp: Date.now(),
        },
      });
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
    const payload = {
      exported_at: new Date().toISOString(),
      source_url: message.sourceUrl,
      total_count: message.posts.length,
      posts: message.posts,
      all_post_urls: message.posts.map(p => p.post_url),
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
    return true;
  }

  // ── Stop Scrape ───────────────────────────────────────────────────────────────
  if (message.action === 'STOP_SCRAPE') {
    // stopped=true is checked in both finalizeScrape (skips downloads) and
    // the downloadAllPosts worker loop (exits mid-download).
    scraping.stopped = true;
    if (scraping.active) {
      clearTimeout(scraping.chunkTimer);
      finalizeScrape();
    }
    sendResponse({ success: true });
    return false;
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
