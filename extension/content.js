// Instagram Saved Posts Scraper — injected into the active tab by popup.js
(function () {
  if (window.__igScraperRegistered) return;
  window.__igScraperRegistered = true;

  // ── Strategy 1: query <a> tags by href pattern ──────────────────────────────
  const HREF_SELECTORS = [
    'article a[href*="/p/"], article a[href*="/reel/"]',
    '[role="main"] a[href*="/p/"], [role="main"] a[href*="/reel/"]',
    'a[href*="/p/"], a[href*="/reel/"]',
    'a[href*="/tv/"]',
  ];

  function findByHref() {
    for (const sel of HREF_SELECTORS) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    }
    return [];
  }

  // ── Strategy 2: walk up from CDN <img> tags to find a parent <a> ────────────
  // Handles cases where Instagram renders post tiles without standard <a href="/p/"> structure.
  function findByImageWalkup() {
    const anchors = [];
    const seen = new Set();
    // Instagram CDN images: scontent-*.cdninstagram.com or cdninstagram.com
    const imgs = document.querySelectorAll('img[src*="cdninstagram.com"], img[src*="instagram.f"]');

    for (const img of imgs) {
      let el = img.parentElement;
      let found = null;
      // Walk up max 12 levels to find an <a> with a post-like href
      for (let i = 0; i < 12; i++) {
        if (!el) break;
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          if (/^\/(p|reel|tv)\//.test(href) || /instagram\.com\/(p|reel|tv)\//.test(el.href)) {
            found = el;
          }
          break; // Stop at the first <a>, whether it matched or not
        }
        el = el.parentElement;
      }
      if (found && !seen.has(found)) {
        seen.add(found);
        anchors.push(found);
      }
    }
    return anchors;
  }

  // ── Strategy 3: find all internal <a> links and filter by post-URL pattern ──
  function findByPattern() {
    const all = document.querySelectorAll('a[href]');
    const POST_RE = /^\/(p|reel|tv)\/[A-Za-z0-9_-]{5,}/;
    return Array.from(all).filter((a) => POST_RE.test(a.getAttribute('href') || ''));
  }

  // ── Diagnostics — returned in error message to help debug selector misses ───
  function diagnose() {
    const totalA = document.querySelectorAll('a[href]').length;
    const cdnImgs = document.querySelectorAll(
      'img[src*="cdninstagram.com"], img[src*="instagram.f"]'
    ).length;
    const sampleHrefs = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('/'))
      .slice(0, 6);
    return { totalA, cdnImgs, sampleHrefs };
  }

  // ── Find all post anchor elements using best available strategy ──────────────
  function findPostAnchors() {
    const byHref = findByHref();
    if (byHref.length > 0) return byHref;

    const byWalkup = findByImageWalkup();
    if (byWalkup.length > 0) return byWalkup;

    return findByPattern();
  }

  function detectPostType(anchor) {
    const href = anchor.href || anchor.getAttribute('href') || '';
    if (href.includes('/reel/') || href.includes('/tv/')) return 'reel';
    const svgs = anchor.querySelectorAll('svg');
    for (const svg of svgs) {
      const label = svg.getAttribute('aria-label') || '';
      if (/carousel|album|multiple/i.test(label)) return 'carousel';
    }
    return 'photo';
  }

  function extractPost(anchor) {
    const img = anchor.querySelector('img');
    // Normalise href: could be relative (/p/ABC) or absolute
    const rawHref = anchor.getAttribute('href') || '';
    const postUrl = rawHref.startsWith('http')
      ? rawHref
      : 'https://www.instagram.com' + rawHref;

    return {
      post_url: postUrl,
      thumbnail_src: img ? img.src : null,
      alt_text: img ? (img.alt || null) : null,
      post_type: detectPostType(anchor),
    };
  }

  // Count CDN images — used as a reliable proxy for "have new posts loaded?"
  function countCdnImgs() {
    return document.querySelectorAll(
      'img[src*="cdninstagram.com"], img[src*="instagram.f"]'
    ).length;
  }

  function waitForMore(countBefore, timeout = 3500) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeout;
      const interval = setInterval(() => {
        if (countCdnImgs() > countBefore || Date.now() > deadline) {
          clearInterval(interval);
          resolve();
        }
      }, 250);
    });
  }

  function safeSend(port, msg) {
    try {
      port.postMessage(msg);
      return true;
    } catch {
      return false;
    }
  }

  async function scrape(port) {
    // Small delay to let the page settle after injection
    await new Promise((r) => setTimeout(r, 600));

    const initialAnchors = findPostAnchors();
    if (initialAnchors.length === 0) {
      const d = diagnose();
      // Check if we're on a collections overview page (links go to /saved/... not /p/...)
      const collectionLinks = Array.from(document.querySelectorAll('a[href*="/saved/"]'));
      const isCollectionsPage = collectionLinks.length > 0 && d.cdnImgs > 0;

      const hint = isCollectionsPage
        ? 'You\'re viewing the saved collections overview. Click into "All Posts" first, then click Export again.'
        : d.cdnImgs > 0
        ? `Found ${d.cdnImgs} images but couldn't link them to posts. Sample hrefs: ${d.sampleHrefs.join(', ')}`
        : d.totalA > 0
        ? `Page has ${d.totalA} links but none matched post patterns. Sample hrefs: ${d.sampleHrefs.join(', ')}`
        : 'Page appears empty — it may still be loading. Try scrolling down a bit first, then click Export again.';

      safeSend(port, {
        type: 'ERROR',
        message: `No posts detected. ${hint}`,
      });
      window.__igScraperRegistered = false;
      return;
    }

    const seen = new Set();
    const posts = [];
    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries < MAX_RETRIES) {
      const imgCountBefore = countCdnImgs();
      const anchors = findPostAnchors();
      let addedThisRound = 0;

      for (const anchor of anchors) {
        const rawHref = anchor.getAttribute('href') || anchor.href || '';
        if (!rawHref || seen.has(rawHref)) continue;
        seen.add(rawHref);
        posts.push(extractPost(anchor));
        addedThisRound++;
      }

      try {
        await chrome.storage.session.set({
          igScrapeProgress: { posts, timestamp: Date.now() },
        });
      } catch (_) {}

      if (!safeSend(port, { type: 'PROGRESS', current: posts.length })) break;

      if (addedThisRound === 0) {
        retries++;
      } else {
        retries = 0;
      }

      window.scrollBy({ top: window.innerHeight * 1.5, behavior: 'smooth' });
      await waitForMore(imgCountBefore);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    safeSend(port, { type: 'COMPLETE', posts });

    try {
      await chrome.storage.session.remove('igScrapeProgress');
    } catch (_) {}

    window.__igScraperRegistered = false;
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'ig-scraper') return;
    port.onMessage.addListener((msg) => {
      if (msg.action === 'START_SCRAPE') {
        scrape(port);
      }
    });
  });
})();
