// 1. Create FBP Context Menu Suite on Install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cs_parent",
    title: "CinemaStream / FBP Suite",
    contexts: ["selection", "image", "link"],
    documentUrlPatterns: ["https://*.facebook.com/*", "https://*.youtube.com/*"]
  });

  chrome.contextMenus.create({
    id: "cs_add_keyword_filter",
    parentId: "cs_parent",
    title: "Add \"%s\" to Text Filter",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "cs_translate_link",
    parentId: "cs_parent",
    title: "Translate Link (Google Translate)",
    contexts: ["link"]
  });

  chrome.contextMenus.create({
    id: "cs_translate_image",
    parentId: "cs_parent",
    title: "Search / Translate Image (Google Lens)",
    contexts: ["image"]
  });
});

// 2. Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "cs_add_keyword_filter" && info.selectionText) {
    const keyword = info.selectionText.trim().toLowerCase();
    chrome.storage.sync.get(['cs_filter_keywords'], (data) => {
      let keywords = data.cs_filter_keywords || [];
      if (!keywords.includes(keyword)) {
        keywords.push(keyword);
        chrome.storage.sync.set({ cs_filter_keywords: keywords }, () => {
          chrome.tabs.sendMessage(tab.id, { action: 'KEYWORDS_UPDATED', keywords }).catch(() => {});
        });
      }
    });
  } else if (info.menuItemId === "cs_translate_link" && info.linkUrl) {
    const translateUrl = `https://translate.google.com/translate?u=${encodeURIComponent(info.linkUrl)}&sl=auto&tl=en`;
    chrome.tabs.create({ url: translateUrl });
  } else if (info.menuItemId === "cs_translate_image" && info.srcUrl) {
    const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(info.srcUrl)}`;
    chrome.tabs.create({ url: lensUrl });
  }
});

// 3. Message Router for FBP News & Badge
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UPDATE_BADGE') {
    const count = request.count > 0 ? request.count.toString() : '';
    chrome.action.setBadgeText({ text: count });
    chrome.action.setBadgeBackgroundColor({ color: '#f5b041' });
  } else if (request.method === "GetFBPNews") {
    fetch('https://www.fbpurity.com/fbpnewsupdates.txt', { cache: "no-store" })
      .then(res => res.text())
      .then(html => sendResponse({ data: html }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});
