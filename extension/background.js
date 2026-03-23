// Service worker — handles tab management and downloads on behalf of popup

// ── Shared helper: filter new posts, save to storage, open webapp ─────────────
function openWebappWithPosts(posts, sourceUrl) {
  chrome.storage.local.get('ig_known_urls', (stored) => {
    const knownUrls = new Set(stored.ig_known_urls || []);
    const newPosts = posts.filter((p) => !knownUrls.has(p.post_url));
    if (newPosts.length === 0) return; // nothing new to show

    const payload = {
      exported_at: new Date().toISOString(),
      source_url: sourceUrl,
      total_count: newPosts.length,
      posts: newPosts,
    };
    const updatedUrls = [...new Set([...(stored.ig_known_urls || []), ...newPosts.map((p) => p.post_url)])];

    chrome.storage.local.set({ ig_pending_posts: payload, ig_known_urls: updatedUrls }, () => {
      if (chrome.runtime.lastError) return;
      const webappUrl = chrome.runtime.getURL('webapp/index.html');
      chrome.tabs.query({ url: webappUrl }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.reload(tabs[0].id, () => chrome.tabs.update(tabs[0].id, { active: true }));
        } else {
          chrome.tabs.create({ url: webappUrl });
        }
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Scrape completed while popup was closed (user switched tabs) ───────────
  if (message.action === 'SCRAPE_COMPLETE') {
    openWebappWithPosts(message.posts, message.sourceUrl);
    return false;
  }

  // ── Open Webapp (primary flow — popup still open) ──────────────────────────
  if (message.action === 'OPEN_WEBAPP') {
    const payload = {
      exported_at: new Date().toISOString(),
      source_url: message.sourceUrl,
      total_count: message.posts.length,
      posts: message.posts,
    };

    chrome.storage.local.get('ig_known_urls', (stored) => {
      const newUrls = message.posts.map((p) => p.post_url);
      const updatedUrls = [...new Set([...(stored.ig_known_urls || []), ...newUrls])];

      chrome.storage.local.set({ ig_pending_posts: payload, ig_known_urls: updatedUrls }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        const webappUrl = chrome.runtime.getURL('webapp/index.html');
        chrome.tabs.query({ url: webappUrl }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.reload(tabs[0].id, () => {
              chrome.tabs.update(tabs[0].id, { active: true });
            });
          } else {
            chrome.tabs.create({ url: webappUrl });
          }
          sendResponse({ success: true });
        });
      });
    });
    return true;
  }

  // ── Download JSON (backup) ──────────────────────────────────────────────────
  if (message.action !== 'DOWNLOAD_JSON') return false;
  chrome.downloads.download(
    { url: message.dataUrl, filename: message.filename, saveAs: true },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    }
  );
  return true;
});
