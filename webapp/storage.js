// storage.js — localStorage abstraction for persisting posts and settings
window.IG = window.IG || {};

window.IG.Storage = (() => {
  const POSTS_KEY = 'ig_organizer_posts_v1';

  function savePosts(data) {
    try {
      localStorage.setItem(POSTS_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to save to localStorage:', e.message);
      return false;
    }
  }

  function loadPosts() {
    try {
      const raw = localStorage.getItem(POSTS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearPosts() {
    localStorage.removeItem(POSTS_KEY);
  }

  function saveWebSearch(enabled) {
    localStorage.setItem('ig_organizer_web_search', enabled ? '1' : '0');
  }

  function loadWebSearch() {
    // Default OFF — web search costs extra per query
    return localStorage.getItem('ig_organizer_web_search') === '1';
  }

  return { savePosts, loadPosts, clearPosts, saveWebSearch, loadWebSearch };
})();
