// storage.js — localStorage abstraction for persisting posts and API key
window.IG = window.IG || {};

window.IG.Storage = (() => {
  const POSTS_KEY = 'ig_organizer_posts_v1';
  const API_KEY_KEY = 'ig_organizer_openai_key';

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

  function saveApiKey(key) {
    localStorage.setItem(API_KEY_KEY, key);
  }

  function loadApiKey() {
    return localStorage.getItem(API_KEY_KEY) || window.IG_CONFIG?.defaultApiKey || '';
  }

  // True when using the baked-in default key rather than the user's own key
  function isUsingDefaultKey() {
    const userKey = localStorage.getItem(API_KEY_KEY);
    return !userKey && !!(window.IG_CONFIG?.defaultApiKey);
  }

  function saveWebSearch(enabled) {
    localStorage.setItem('ig_organizer_web_search', enabled ? '1' : '0');
  }

  function loadWebSearch() {
    // Default OFF — web search costs ~$0.025/query
    return localStorage.getItem('ig_organizer_web_search') === '1';
  }

  return { savePosts, loadPosts, clearPosts, saveApiKey, loadApiKey, isUsingDefaultKey, saveWebSearch, loadWebSearch };
})();
