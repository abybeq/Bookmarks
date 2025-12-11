// Background service worker for handling extension button clicks

const UNSORTED_FOLDER_ID = 'unsorted-folder';

// ============================================
// OPTIMIZATION: In-memory cache for speedDialItems
// Reduces storage I/O by caching items and invalidating on changes
// ============================================
let itemsCache = null;
let cacheInitialized = false;

// ============================================
// OPTIMIZATION: Cache for folder hierarchy
// Avoids rebuilding the tree on every getAllFolders() call
// ============================================
let folderHierarchyCache = null;

// Get items from cache or storage
async function getCachedItems() {
  if (itemsCache !== null) {
    return itemsCache;
  }
  try {
    const result = await chrome.storage.local.get('speedDialItems');
    itemsCache = result.speedDialItems || [];
    cacheInitialized = true;
    return itemsCache;
  } catch (error) {
    console.error('Error loading items from storage:', error);
    return [];
  }
}

// Save items to storage and update cache
async function saveItems(items) {
  itemsCache = items;
  folderHierarchyCache = null; // Invalidate folder hierarchy when items change
  await chrome.storage.local.set({ speedDialItems: items });
}

// Invalidate cache (called when storage changes externally, e.g., from newtab page)
function invalidateCache() {
  itemsCache = null;
  folderHierarchyCache = null;
}

// Check if a URL is saved in the extension
async function isUrlSaved(url) {
  try {
    const items = await getCachedItems();
    return items.some(item => item.type === 'link' && item.url === url);
  } catch (error) {
    console.error('Error checking if URL is saved:', error);
    return false;
  }
}

// Find existing bookmark by URL (returns bookmark with folder info)
async function findExistingBookmark(url) {
  try {
    const items = await getCachedItems();
    const bookmark = items.find(item => item.type === 'link' && item.url === url);
    return bookmark || null;
  } catch (error) {
    console.error('Error finding existing bookmark:', error);
    return null;
  }
}

// Update the badge for a specific tab based on whether its URL is saved
async function updateBadgeForTab(tabId, url) {
  // Don't show badge for extension pages or about: pages
  if (!url || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('chrome://newtab')) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  
  const isSaved = await isUrlSaved(url);
  
  if (isSaved) {
    // Show checkmark badge for saved pages - green background with white text for universal contrast
    await chrome.action.setBadgeText({ tabId, text: '✓' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4CAF50' });
    await chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
  } else {
    // Clear badge for unsaved pages
    await chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// Update badge for the current active tab
async function updateBadgeForActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && tab.url) {
      await updateBadgeForTab(tab.id, tab.url);
    }
  } catch (error) {
    console.error('Error updating badge for active tab:', error);
  }
}

// Update badges for all tabs (used when bookmarks change)
// Optimized: Uses Promise.all() for parallel execution instead of sequential awaits
async function updateBadgesForAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const updatePromises = tabs
      .filter(tab => tab.id && tab.url)
      .map(tab => updateBadgeForTab(tab.id, tab.url));
    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Error updating badges for all tabs:', error);
  }
}

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      await updateBadgeForTab(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.error('Error on tab activation:', error);
  }
});

// Listen for tab URL changes (navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    await updateBadgeForTab(tabId, tab.url);
  }
});

// Listen for storage changes (bookmarks added/removed from newtab page)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.speedDialItems) {
    // Invalidate cache when storage changes externally (e.g., from newtab page)
    invalidateCache();
    updateBadgesForAllTabs();
  }
});

// Create context menu on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'bookmark-page',
    title: 'Bookmark',
    contexts: ['page']
  });
  
  // Update badges for all tabs on install/update
  updateBadgesForAllTabs();
});

// Update badges when service worker starts (browser startup)
updateBadgesForAllTabs();

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'bookmark-page') {
    // Don't save extension pages or about: pages (but allow chrome:// internal pages)
    if (tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:')) {
      await showBadge('✗', '#f44336', tab.id);
      return;
    }
    try {
      // Activate the tab/window so the popup anchors to the toolbar icon
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      if (tab.id) {
        await chrome.tabs.update(tab.id, { active: true });
      }
      await chrome.action.openPopup();
    } catch (error) {
      console.error('Error opening popup from context menu:', error);
      await showBadge('✗', '#f44336', tab.id);
    }
  }
});

// Generate unique ID using crypto.randomUUID() for collision-free IDs
function generateId() {
  return crypto.randomUUID();
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
// OPTIMIZED: Uses cached hierarchy when available
async function getAllFolders() {
  // Return cached hierarchy if available
  if (folderHierarchyCache !== null) {
    return folderHierarchyCache;
  }
  
  try {
    let items = await getCachedItems();
    
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
    
    // Cache the result
    folderHierarchyCache = buildHierarchy('root');
    return folderHierarchyCache;
  } catch (error) {
    console.error('Error getting folders:', error);
    return [];
  }
}

// Save link to specified folder
async function saveLinkToFolder(url, title, folderId) {
  try {
    // Don't save the Chrome new tab page
    if (url && url.startsWith('chrome://newtab')) {
      return null;
    }

    // Load existing items from cache
    let items = await getCachedItems();
    // Clone to avoid mutating cache before save
    items = [...items];
    
    // Get or create Unsorted folder if saving to unsorted
    if (folderId === UNSORTED_FOLDER_ID) {
      await getOrCreateUnsortedFolder(items);
    }
    
    // Check if link already exists in the target folder
    const existingLinkIndex = items.findIndex(item => 
      item.type === 'link' && 
      item.parentId === folderId && 
      item.url === url
    );
    
    if (existingLinkIndex !== -1) {
      // Link already exists, update title if different
      if (items[existingLinkIndex].title !== title) {
        items[existingLinkIndex] = { ...items[existingLinkIndex], title };
        await saveItems(items);
      }
      // Badge will be updated by storage change listener
      return items[existingLinkIndex];
    }
    
    // Get max order for links in target folder so new links append
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
    
    // Save to storage and update cache
    await saveItems(items);
    
    // Badge will be updated by storage change listener
    return newLink;
    
  } catch (error) {
    console.error('Error saving link:', error);
    await showBadge('✗', '#f44336');
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
    let items = await getCachedItems();
    // Clone to avoid mutating cache before save
    items = [...items];
    
    // Find and remove the bookmark
    const index = items.findIndex(item => item.id === bookmarkId);
    if (index !== -1) {
      items.splice(index, 1);
      
      // Check if Unsorted folder should be deleted
      items = checkAndDeleteUnsortedFolderIfEmpty(items);
      
      await saveItems(items);
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
    let items = await getCachedItems();
    // Clone to avoid mutating cache before save
    items = items.map(item => item.id === bookmarkId ? { ...item } : item);
    
    // Find the bookmark
    const bookmark = items.find(item => item.id === bookmarkId);
    if (bookmark) {
      // Check if moving from Unsorted folder to another folder
      const wasInUnsorted = bookmark.parentId === UNSORTED_FOLDER_ID;
      const movingToNewFolder = updates.parentId && updates.parentId !== UNSORTED_FOLDER_ID;
      const parentChanging = updates.parentId && updates.parentId !== bookmark.parentId;
      
      // If moving to a different folder, place at end of target folder
      if (parentChanging) {
        const targetFolderId = updates.parentId;
        const targetLinks = items.filter(item =>
          item.type === 'link' &&
          item.parentId === targetFolderId &&
          item.id !== bookmarkId
        );
        const maxOrder = targetLinks.length > 0
          ? Math.max(...targetLinks.map(i => i.order ?? 0))
          : -1;
        bookmark.order = maxOrder + 1;
      }
      
      Object.assign(bookmark, updates);
      
      // If moved out of Unsorted folder, check if it should be deleted
      if (wasInUnsorted && movingToNewFolder) {
        items = checkAndDeleteUnsortedFolderIfEmpty(items);
      }
      
      await saveItems(items);
      return bookmark;
    }
    return null;
  } catch (error) {
    console.error('Error updating bookmark:', error);
    return null;
  }
}

// Create a new folder
async function createFolder(title, parentId = 'root') {
  try {
    let items = await getCachedItems();
    // Clone to avoid mutating cache before save
    items = [...items];
    
    // Get max order for siblings in parent
    const siblings = items.filter(item => 
      item.type === 'folder' && item.parentId === parentId
    );
    const maxOrder = siblings.length > 0 
      ? Math.max(...siblings.map(item => item.order ?? 0))
      : 0;
    
    // Determine depth based on parent
    const parentFolder = items.find(f => f.id === parentId && f.type === 'folder');
    const parentDepth = parentFolder && typeof parentFolder.depth === 'number' ? parentFolder.depth : -1;
    
    // Create new folder
    const newFolder = {
      id: generateId(),
      type: 'folder',
      title: title,
      parentId: parentId,
      order: maxOrder + 1,
      depth: parentDepth + 1
    };
    
    items.push(newFolder);
    
    // Save to storage and update cache
    await saveItems(items);
    
    return newFolder;
  } catch (error) {
    console.error('Error creating folder:', error);
    return null;
  }
}

// Show temporary badge on extension icon (for error feedback)
async function showBadge(text, color, tabId = null) {
  const options = { text };
  if (tabId) options.tabId = tabId;
  
  await chrome.action.setBadgeText(options);
  await chrome.action.setBadgeBackgroundColor({ ...options, color });
  
  // For error badges, clear after 2 seconds
  // For success (checkmark), keep it persistent
  if (text === '✗') {
    setTimeout(async () => {
      if (tabId) {
        // Restore proper badge state for tab
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab && tab.url) {
            await updateBadgeForTab(tabId, tab.url);
          }
        } catch (e) {
          await chrome.action.setBadgeText({ tabId, text: '' });
        }
      } else {
        await updateBadgeForActiveTab();
      }
    }, 2000);
  }
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popup initialization - return current tab data and folders
  if (message.type === 'POPUP_INIT') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url) {
          sendResponse({ success: false });
          return;
        }
        
        // Don't bookmark extension pages, about pages, or Chrome new tab
        if (tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome://newtab')) {
          sendResponse({ success: false });
          return;
        }
        
        // Get folders
        const folders = await getAllFolders();
        
        // Check if already bookmarked
        const existingBookmark = await findExistingBookmark(tab.url);
        
        // Extract title
        let title = tab.title;
        if (!title) {
          if (tab.url.startsWith('chrome://')) {
            title = tab.url.replace('chrome://', '').replace(/\/$/, '') || 'Chrome';
          } else {
            try {
              title = new URL(tab.url).hostname.replace(/^www\./, '');
            } catch {
              title = tab.url;
            }
          }
        }
        
        sendResponse({
          success: true,
          url: tab.url,
          title: existingBookmark ? existingBookmark.title : title,
          folders: folders,
          defaultFolderId: existingBookmark ? existingBookmark.parentId : UNSORTED_FOLDER_ID,
          bookmarkId: existingBookmark ? existingBookmark.id : null,
          isExisting: !!existingBookmark
        });
      } catch (error) {
        console.error('Error in POPUP_INIT:', error);
        sendResponse({ success: false });
      }
    })();
    return true; // Keep channel open for async response
  }
  
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
  
  if (message.type === 'CREATE_FOLDER') {
    createFolder(message.data.title, message.data.parentId || 'root').then(result => {
      sendResponse({ success: !!result, folder: result });
    });
    return true;
  }
});

// Note: chrome.action.onClicked is not used because default_popup is set in manifest.
// The popup (popup.html/popup.js) handles the extension button click instead.
