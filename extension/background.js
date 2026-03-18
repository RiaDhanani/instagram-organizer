// Service worker — handles tab management and downloads on behalf of popup

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Open Webapp (primary flow) ─────────────────────────────────────────────
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
