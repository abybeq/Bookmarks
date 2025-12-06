// Background service worker for handling extension button clicks

const UNSORTED_FOLDER_ID = 'unsorted-folder';

// Create context menu on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'bookmark-page',
    title: 'Bookmark',
    contexts: ['page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'bookmark-page') {
    // Don't save extension pages or about: pages (but allow chrome:// internal pages)
    if (tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:')) {
      showBadge('✗', '#f44336');
      return;
    }
    
    // Extract title - use page path for chrome:// URLs, hostname for others
    let title = tab.title;
    if (!title) {
      if (tab.url.startsWith('chrome://')) {
        // For chrome:// URLs, use the path as title (e.g., "extensions", "settings")
        title = tab.url.replace('chrome://', '').replace(/\/$/, '') || 'Chrome';
      } else {
        try {
          title = new URL(tab.url).hostname.replace(/^www\./, '');
        } catch {
          title = tab.url;
        }
      }
    }
    
    // Show the bookmark modal
    await showBookmarkModal(tab, title);
  }
});

// Generate unique ID
function generateId() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Get or create the Unsorted folder
async function getOrCreateUnsortedFolder(items) {
  // Check if Unsorted folder exists
  let unsortedFolder = items.find(item => item.id === UNSORTED_FOLDER_ID);
  
  if (!unsortedFolder) {
    // Create Unsorted folder with special ID and order -1 to always be first
    unsortedFolder = {
      id: UNSORTED_FOLDER_ID,
      type: 'folder',
      title: 'Unsorted',
      parentId: 'root',
      order: -1 // Negative order ensures it's always first
    };
    items.push(unsortedFolder);
  }
  
  return unsortedFolder;
}

// Get all folders from storage with hierarchy info
async function getAllFolders() {
  try {
    const result = await chrome.storage.local.get('speedDialItems');
    let items = result.speedDialItems || [];
    
    // Ensure Unsorted folder exists
    await getOrCreateUnsortedFolder(items);
    
    // Get all folders
    const folders = items.filter(item => item.type === 'folder');
    
    // Build flat list with hierarchy (depth-first)
    const buildHierarchy = (parentId, depth = 0) => {
      const children = folders
        .filter(f => f.parentId === parentId)
        .sort((a, b) => {
          // Unsorted always first at root level
          if (parentId === 'root') {
            if (a.id === UNSORTED_FOLDER_ID) return -1;
            if (b.id === UNSORTED_FOLDER_ID) return 1;
          }
          return (a.order ?? 0) - (b.order ?? 0);
        });
      
      let result = [];
      for (const folder of children) {
        result.push({ ...folder, depth });
        result = result.concat(buildHierarchy(folder.id, depth + 1));
      }
      return result;
    };
    
    return buildHierarchy('root');
  } catch (error) {
    console.error('Error getting folders:', error);
    return [];
  }
}

// Save link to specified folder
async function saveLinkToFolder(url, title, folderId) {
  try {
    // Load existing items using local storage (same as script.js)
    const result = await chrome.storage.local.get('speedDialItems');
    let items = result.speedDialItems || [];
    
    // Get or create Unsorted folder if saving to unsorted
    if (folderId === UNSORTED_FOLDER_ID) {
      await getOrCreateUnsortedFolder(items);
    }
    
    // Check if link already exists in the target folder
    const existingLink = items.find(item => 
      item.type === 'link' && 
      item.parentId === folderId && 
      item.url === url
    );
    
    if (existingLink) {
      // Link already exists, update title if different
      if (existingLink.title !== title) {
        existingLink.title = title;
        await chrome.storage.local.set({ speedDialItems: items });
      }
      showBadge('✓', '#4CAF50');
      return existingLink;
    }
    
    // Get max order for links in target folder
    const folderLinks = items.filter(item => 
      item.type === 'link' && item.parentId === folderId
    );
    const maxOrder = folderLinks.length > 0 
      ? Math.max(...folderLinks.map(item => item.order ?? 0))
      : -1;
    
    // Create new link
    const newLink = {
      id: generateId(),
      type: 'link',
      title: title,
      url: url,
      parentId: folderId,
      order: maxOrder + 1
    };
    
    items.push(newLink);
    
    // Save to local storage (same as script.js)
    await chrome.storage.local.set({ speedDialItems: items });
    
    // Show success badge
    showBadge('✓', '#4CAF50');
    
    return newLink;
    
  } catch (error) {
    console.error('Error saving link:', error);
    showBadge('✗', '#f44336');
    return null;
  }
}

// Check and delete Unsorted folder if empty
function checkAndDeleteUnsortedFolderIfEmpty(items) {
  const unsortedContents = items.filter(i => i.parentId === UNSORTED_FOLDER_ID);
  if (unsortedContents.length === 0) {
    // Delete the empty Unsorted folder
    const index = items.findIndex(i => i.id === UNSORTED_FOLDER_ID);
    if (index !== -1) {
      items.splice(index, 1);
    }
  }
  return items;
}

// Delete a bookmark by ID
async function deleteBookmark(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('speedDialItems');
    let items = result.speedDialItems || [];
    
    // Find and remove the bookmark
    const index = items.findIndex(item => item.id === bookmarkId);
    if (index !== -1) {
      items.splice(index, 1);
      
      // Check if Unsorted folder should be deleted
      items = checkAndDeleteUnsortedFolderIfEmpty(items);
      
      await chrome.storage.local.set({ speedDialItems: items });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    return false;
  }
}

// Update a bookmark
async function updateBookmark(bookmarkId, updates) {
  try {
    const result = await chrome.storage.local.get('speedDialItems');
    let items = result.speedDialItems || [];
    
    // Find the bookmark
    const bookmark = items.find(item => item.id === bookmarkId);
    if (bookmark) {
      // Check if moving from Unsorted folder to another folder
      const wasInUnsorted = bookmark.parentId === UNSORTED_FOLDER_ID;
      const movingToNewFolder = updates.parentId && updates.parentId !== UNSORTED_FOLDER_ID;
      
      Object.assign(bookmark, updates);
      
      // If moved out of Unsorted folder, check if it should be deleted
      if (wasInUnsorted && movingToNewFolder) {
        items = checkAndDeleteUnsortedFolderIfEmpty(items);
      }
      
      await chrome.storage.local.set({ speedDialItems: items });
      return bookmark;
    }
    return null;
  } catch (error) {
    console.error('Error updating bookmark:', error);
    return null;
  }
}

// Show badge on extension icon
function showBadge(text, color) {
  chrome.action.setBadgeText({ text: text });
  chrome.action.setBadgeBackgroundColor({ color: color });
  
  // Clear badge after 2 seconds
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 2000);
}

// Show the bookmark modal on the current tab
async function showBookmarkModal(tab, title) {
  try {
    // Get all folders first
    const folders = await getAllFolders();
    
    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    // Send message to show the modal with page data and folders
    await chrome.tabs.sendMessage(tab.id, { 
      type: 'SHOW_BOOKMARK_MODAL',
      data: {
        url: tab.url,
        title: title,
        folders: folders,
        defaultFolderId: UNSORTED_FOLDER_ID
      }
    });
  } catch (error) {
    // Fallback: directly save if can't show modal
    console.log('Could not show modal, saving directly:', error.message);
    await saveLinkToFolder(tab.url, title, UNSORTED_FOLDER_ID);
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_BOOKMARK') {
    const { url, title, folderId } = message.data;
    saveLinkToFolder(url, title, folderId).then(result => {
      sendResponse({ success: !!result, bookmark: result });
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'DELETE_BOOKMARK') {
    deleteBookmark(message.data.bookmarkId).then(success => {
      sendResponse({ success });
    });
    return true;
  }
  
  if (message.type === 'UPDATE_BOOKMARK') {
    const { bookmarkId, updates } = message.data;
    updateBookmark(bookmarkId, updates).then(result => {
      sendResponse({ success: !!result, bookmark: result });
    });
    return true;
  }
  
  if (message.type === 'GET_FOLDERS') {
    getAllFolders().then(folders => {
      sendResponse({ folders });
    });
    return true;
  }
});

// Handle extension button click
chrome.action.onClicked.addListener(async (tab) => {
  // Don't save extension pages or about: pages (but allow chrome:// internal pages)
  if (tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:')) {
    showBadge('✗', '#f44336');
    return;
  }
  
  // Extract title - use page path for chrome:// URLs, hostname for others
  let title = tab.title;
  if (!title) {
    if (tab.url.startsWith('chrome://')) {
      // For chrome:// URLs, use the path as title (e.g., "extensions", "settings")
      title = tab.url.replace('chrome://', '').replace(/\/$/, '') || 'Chrome';
    } else {
      try {
        title = new URL(tab.url).hostname.replace(/^www\./, '');
      } catch {
        title = tab.url;
      }
    }
  }
  
  // Show the bookmark modal
  await showBookmarkModal(tab, title);
});
