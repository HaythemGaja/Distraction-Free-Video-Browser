// 1. Chrome Native Download Handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'DOWNLOAD_MEDIA') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename || 'video.mp4',
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }
  
  // 2. Watch Later Badge Counter
  else if (request.type === 'UPDATE_BADGE') {
    const count = request.count > 0 ? request.count.toString() : '';
    chrome.action.setBadgeText({ text: count });
    chrome.action.setBadgeBackgroundColor({ color: '#f5b041' });
  }
});
