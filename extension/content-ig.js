// content-ig.js — injected at document_start in the MAIN world on instagram.com
//
// Wraps IntersectionObserver so background.js can trigger lazy-loading while
// the Instagram tab is in the background (Chrome pauses IntersectionObserver
// in background tabs because it's tied to the render pipeline).
//
// How it works:
//   - Every IntersectionObserver instance Instagram creates goes through our
//     wrapper, which tracks the observer and its observed targets.
//   - window.__igForceLoad() re-observes every tracked target. The initial
//     observe() callback fires from layout geometry — not a render frame — so
//     it runs even in background tabs, telling Instagram its sentinel elements
//     are now in the viewport after we scrolled to the bottom.

(function () {
  const _Native = window.IntersectionObserver;
  if (!_Native) return;

  const _registry = new Set();

  class _IO {
    constructor(callback, options) {
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

  window.__igForceLoad = function () {
    for (const obs of _registry) {
      for (const target of obs._targets) {
        obs._native.unobserve(target);
        obs._native.observe(target);
      }
    }
  };
})();
