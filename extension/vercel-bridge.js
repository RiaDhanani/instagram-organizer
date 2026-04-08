// vercel-bridge.js — content script injected into saved-posts-organizer.vercel.app
// Reads pending posts from extension storage and writes them to page localStorage
// so the webapp's init() can pick them up without needing chrome.* APIs.
(function () {
  const BRIDGE_KEY = 'ig_pending_posts_bridge';

  // Webapp requested a full clear — wipe chrome.storage and load nothing
  if (localStorage.getItem('ig_wants_clear')) {
    localStorage.removeItem('ig_wants_clear');
    chrome.storage.local.remove('ig_pending_posts');
    return;
  }

  // Listen for in-app clear (no reload — webapp resets state in-place)
  window.addEventListener('ig:wants-clear', () => {
    localStorage.removeItem('ig_wants_clear');
    chrome.storage.local.remove('ig_pending_posts');
  });

  chrome.storage.local.get('ig_pending_posts', (result) => {
    if (chrome.runtime.lastError || !result.ig_pending_posts) return;
    const data = result.ig_pending_posts;
    try {
      localStorage.setItem(BRIDGE_KEY, JSON.stringify(data));
    } catch { return; }
    window.dispatchEvent(new CustomEvent('ig:pending-posts'));
  });
})();
