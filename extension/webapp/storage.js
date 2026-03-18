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
    return localStorage.getItem(API_KEY_KEY) || '';
  }

  return { savePosts, loadPosts, clearPosts, saveApiKey, loadApiKey };
})();
