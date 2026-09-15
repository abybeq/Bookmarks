// Background service worker for better bookmarks
// Simplified version using Chrome's native bookmarks API

// Create context menu on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-bookmarks',
    title: 'Open better bookmarks',
    contexts: ['page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-bookmarks') {
    // Open the bookmarks page in a new tab
    chrome.tabs.create({ url: 'newtab.html' });
  }
});

// Handle extension icon click (open bookmarks page)
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'newtab.html' });
});
