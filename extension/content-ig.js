// content-ig.js — injected at document_start in the MAIN world on instagram.com
//
// Two responsibilities:
//
// 1. IntersectionObserver wrapper
//    Tracks every observer + its targets so background.js can call
//    window.__igForceLoad() to directly invoke callbacks with fake
//    "fully intersecting" entries — bypassing the render pipeline so
//    Instagram's infinite scroll fires even in background tabs.
//
// 2. Fetch interceptor
//    Captures post data from Instagram's feed API responses as they
//    arrive, storing them in a buffer.  background.js drains the buffer
//    via window.__igDrainPosts() at the start of every scrape chunk,
//    so posts are collected regardless of whether the DOM has rendered.

(function () {

  // ── 1. IntersectionObserver wrapper ────────────────────────────────────────

  const _NativeIO = window.IntersectionObserver;
  if (_NativeIO) {
    const _registry = new Set();

    class _IO {
      constructor(callback, options) {
        this._callback = callback;
        this._targets  = new Set();
        this._native   = new _NativeIO((entries) => callback(entries, this), options);
        _registry.add(this);
      }
      observe(el)    { this._targets.add(el);    this._native.observe(el);    }
      unobserve(el)  { this._targets.delete(el); this._native.unobserve(el);  }
      disconnect()   { this._targets.clear();    this._native.disconnect();    _registry.delete(this); }
      takeRecords()  { return this._native.takeRecords(); }
      get root()       { return this._native.root; }
      get rootMargin() { return this._native.rootMargin; }
      get thresholds() { return this._native.thresholds; }
    }

    window.IntersectionObserver = _IO;

    // Directly invoke every observer's callback with fake "fully visible"
    // entries for all tracked targets.  Uses proper DOMRect objects and
    // binds `this` so Instagram's callback can safely call obs.unobserve().
    window.__igForceLoad = function () {
      const fakeRect = new DOMRect(0, 0, 100, 100);
      const fakeRoot = new DOMRect(0, 0, window.innerWidth || 1280, window.innerHeight || 900);
      for (const obs of _registry) {
        if (!obs._targets.size) continue;
        const entries = [...obs._targets].map(target => ({
          target,
          isIntersecting:    true,
          intersectionRatio: 1,
          boundingClientRect: fakeRect,
          intersectionRect:   fakeRect,
          rootBounds:         fakeRoot,
          time: performance.now(),
        }));
        try { obs._callback.call(obs, entries, obs); } catch (_) {}
      }
    };
  }

  // ── 2. Fetch interceptor ───────────────────────────────────────────────────

  const _postBuffer = [];

  // Atomically drain all buffered posts and return them.
  window.__igDrainPosts = function () { return _postBuffer.splice(0); };

  const _origFetch = window.fetch;
  window.fetch = function (resource, init) {
    const promise = _origFetch.apply(this, arguments);
    const url = (typeof resource === 'string' ? resource : resource?.url) || '';

    // Only intercept saved-posts / collection feed endpoints.
    if (/\/api\/v1\/feed\/(saved|collection)/.test(url)) {
      promise
        .then(resp => resp.clone().json())
        .then(data => {
          const items = data?.items || [];
          if (!items.length) return;

          for (const item of items) {
            const code = item.code || item.shortcode;
            if (!code) continue;

            const isReel = item.media_type === 2 || item.product_type === 'clips';
            const post_url = isReel
              ? `https://www.instagram.com/reel/${code}/`
              : `https://www.instagram.com/p/${code}/`;

            // Thumbnail: prefer explicit thumbnail_url (reels), else first
            // candidate from image_versions2 on the item or first carousel slide.
            let thumbnail_src = item.thumbnail_url || null;
            if (!thumbnail_src) {
              const media = item.carousel_media?.[0] ?? item;
              thumbnail_src = media.image_versions2?.candidates?.[0]?.url ?? null;
            }

            _postBuffer.push({
              post_url,
              thumbnail_src,
              alt_text:  item.accessibility_caption || null,
              post_type: isReel ? 'reel' : 'photo',
            });
          }

          // Signal background.js (via inPageCollect's event listener) that
          // new posts are ready in the buffer.
          window.dispatchEvent(new CustomEvent('ig:posts-loaded'));
        })
        .catch(() => {});
    }

    return promise;
  };

})();
