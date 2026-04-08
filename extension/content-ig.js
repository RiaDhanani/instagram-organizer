// content-ig.js — injected at document_start in the MAIN world on instagram.com
//
// Wraps IntersectionObserver so background.js can trigger lazy-loading while
// the Instagram tab is in the background without activating the tab.
//
// How it works:
//   - Every IntersectionObserver Instagram creates goes through our wrapper,
//     which tracks the callback and observed targets.
//   - window.__igForceLoad() directly invokes each observer's callback with
//     fake "fully intersecting" entries for all tracked targets. This bypasses
//     the render pipeline entirely — no active tab or render frame needed.

(function () {
  const _Native = window.IntersectionObserver;
  if (!_Native) return;

  const _registry = new Set();

  class _IO {
    constructor(callback, options) {
      this._callback = callback;
      this._targets = new Set();
      this._native = new _Native((entries) => callback(entries, this), options);
      _registry.add(this);
    }
    observe(el) {
      this._targets.add(el);
      this._native.observe(el);
    }
    unobserve(el) {
      this._targets.delete(el);
      this._native.unobserve(el);
    }
    disconnect() {
      this._targets.clear();
      this._native.disconnect();
      _registry.delete(this);
    }
    takeRecords() { return this._native.takeRecords(); }
    get root()       { return this._native.root; }
    get rootMargin() { return this._native.rootMargin; }
    get thresholds() { return this._native.thresholds; }
  }

  window.IntersectionObserver = _IO;

  // Directly invoke each observer's callback with fake "fully visible" entries
  // for all tracked targets. Works in background tabs — no render frame needed.
  window.__igForceLoad = function () {
    const fakeRect = { x: 0, y: 0, width: 100, height: 100, top: 0, right: 100, bottom: 100, left: 0 };
    const fakeRoot = { x: 0, y: 0, width: window.innerWidth || 1280, height: window.innerHeight || 900,
                       top: 0, right: window.innerWidth || 1280, bottom: window.innerHeight || 900, left: 0 };
    for (const obs of _registry) {
      if (obs._targets.size === 0) continue;
      const entries = [...obs._targets].map(target => ({
        target,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: fakeRect,
        intersectionRect: fakeRect,
        rootBounds: fakeRoot,
        time: performance.now(),
      }));
      try { obs._callback(entries, obs); } catch {}
    }
  };
})();
