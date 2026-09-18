// ============================================
// STORAGE MODULE - Chrome Native Bookmarks
// ============================================

import {
  currentTheme, setCurrentTheme, DEFAULT_THEME, ROOT_FOLDER_ID, pushToUndoStack,
  popFromUndoStack, peekUndoStack, isUndoExpired, cleanExpiredUndoActions
} from './state.js';
import {
  showNotification, escapeHtml, getChromePageIconSvg, getChromePageIcon,
  folderIconOptions, isKnownFolderIcon, DEFAULT_FOLDER_ICON, globeIconSvgHtml, getIconSvg
} from './utils.js';

// ============================================
// FAVICON CACHE SYSTEM
// ============================================

const DEFAULT_FAVICON = 'icons/bookmark.svg';
const faviconCache = new Map();
const pendingFavicons = new Map();
const FAVICON_CACHE_DB_NAME = 'faviconCache';
const FAVICON_CACHE_STORE_NAME = 'favicons';
const FAVICON_CACHE_DB_VERSION = 2;
const FAVICON_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
let faviconCacheDB = null;
const FOLDER_ICONS_STORAGE_KEY = 'folderIcons';
let folderIcons = {};

// Initialize IndexedDB for favicon caching
export async function initFaviconCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FAVICON_CACHE_DB_NAME, FAVICON_CACHE_DB_VERSION);

    request.onerror = () => {
      console.warn('IndexedDB not available, using in-memory cache only');
      resolve(null);
    };

    request.onsuccess = (event) => {
      faviconCacheDB = event.target.result;
      resolve(faviconCacheDB);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(FAVICON_CACHE_STORE_NAME)) {
        db.createObjectStore(FAVICON_CACHE_STORE_NAME, { keyPath: 'domain' });
      } else {
        event.target.transaction.objectStore(FAVICON_CACHE_STORE_NAME).clear();
      }
    };
  });
}

// Get cached favicon from IndexedDB
export async function getCachedFavicon(domain) {
  if (faviconCache.has(domain)) {
    return faviconCache.get(domain);
  }

  if (!faviconCacheDB) return null;

  return new Promise((resolve) => {
    try {
      const transaction = faviconCacheDB.transaction([FAVICON_CACHE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(FAVICON_CACHE_STORE_NAME);
      const request = store.get(domain);

      request.onsuccess = () => {
        const result = request.result;
        if (result && Date.now() - result.timestamp < FAVICON_CACHE_DURATION) {
          faviconCache.set(domain, result.dataUrl);
          resolve(result.dataUrl);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// Save favicon to cache
export async function cacheFavicon(domain, dataUrl) {
  faviconCache.set(domain, dataUrl);

  if (!faviconCacheDB) return;

  try {
    const transaction = faviconCacheDB.transaction([FAVICON_CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(FAVICON_CACHE_STORE_NAME);
    store.put({ domain, dataUrl, timestamp: Date.now() });
  } catch (e) {
    // Silently fail - caching is non-critical
  }
}

// Fetch and cache favicon
export async function fetchAndCacheFavicon(url) {
  let domain;
  try {
    domain = new URL(url).hostname;
  } catch {
    return DEFAULT_FAVICON;
  }
  if (pendingFavicons.has(domain)) return pendingFavicons.get(domain);

  const faviconUrl = `https://a.favicon.im/${encodeURIComponent(domain)}?larger=true&throw-error-on-404=true`;
  const pending = (async () => {
    const cached = await getCachedFavicon(domain);
    if (cached) return cached;
    const response = await fetch(faviconUrl, { referrerPolicy: 'no-referrer' });
    if (response.status === 404) {
      await cacheFavicon(domain, DEFAULT_FAVICON);
      return DEFAULT_FAVICON;
    }
    if (!response.ok) return faviconUrl;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size === 0) return DEFAULT_FAVICON;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        cacheFavicon(domain, reader.result);
        resolve(reader.result);
      };
      reader.onerror = () => resolve(faviconUrl);
      reader.readAsDataURL(blob);
    });
  })().catch(() => faviconUrl);
  pendingFavicons.set(domain, pending);
  try {
    const resolvedUrl = await pending;
    // The fragment identifies the domain without requesting a different SVG file.
    const placeholder = `${DEFAULT_FAVICON}#${encodeURIComponent(domain)}`;
    for (const img of document.querySelectorAll('img')) {
      if (img.getAttribute('src') === placeholder) img.src = resolvedUrl;
    }
    for (const icon of document.querySelectorAll('[data-favicon-placeholder]')) {
      if (icon.dataset.faviconPlaceholder === placeholder) {
        icon.outerHTML = renderFaviconSource(resolvedUrl, icon.dataset.faviconFallback);
      }
    }
    return resolvedUrl;
  } finally {
    pendingFavicons.delete(domain);
  }
}

function renderFaviconSource(source, fallback = 'bookmark') {
  if (source === DEFAULT_FAVICON || source.startsWith(`${DEFAULT_FAVICON}#`)) {
    if (fallback === 'globe') {
      return `<span data-favicon-placeholder="${escapeHtml(source)}" data-favicon-fallback="globe">${globeIconSvgHtml}</span>`;
    }
    return `<span data-favicon-placeholder="${escapeHtml(source)}">${getIconSvg('bookmark', { className: 'bookmark-placeholder', width: 24, height: 24 })}</span>`;
  }
  return `<img src="${escapeHtml(source)}" alt="" loading="lazy">`;
}

// Inline system icons and placeholders inherit the active theme without re-rendering.
export function getFaviconHtml(url, fallback = 'bookmark') {
  if (url.startsWith('chrome://')) return getChromePageIconSvg(url);
  return renderFaviconSource(getFaviconUrl(url), fallback);
}

// Get favicon URL (sync, will cache async)
export function getFaviconUrl(url) {
  try {
    if (url.startsWith('chrome://')) {
      return getChromePageIcon(url);
    }
    const domain = new URL(url).hostname;

    if (faviconCache.has(domain)) {
      return faviconCache.get(domain);
    }

    fetchAndCacheFavicon(url).catch(() => {});
    return `${DEFAULT_FAVICON}#${encodeURIComponent(domain)}`;
  } catch {
    return DEFAULT_FAVICON;
  }
}

// ============================================
// FOLDER ICON STORAGE
// ============================================

export async function loadFolderIcons() {
  try {
    const result = await chrome.storage.local.get(FOLDER_ICONS_STORAGE_KEY);
    folderIcons = result[FOLDER_ICONS_STORAGE_KEY] || {};
  } catch (error) {
    console.error('Error loading folder icons:', error);
    folderIcons = {};
  }
}

export function getFolderIconName(folderId) {
  const iconName = folderIcons[String(folderId)];
  return isKnownFolderIcon(iconName) ? iconName : DEFAULT_FOLDER_ICON;
}

export async function setFolderIconName(folderId, iconName) {
  if (!folderId || !folderIconOptions.includes(iconName)) return false;

  const key = String(folderId);
  if (iconName === DEFAULT_FOLDER_ICON) {
    delete folderIcons[key];
  } else {
    folderIcons[key] = iconName;
  }

  try {
    await chrome.storage.local.set({ [FOLDER_ICONS_STORAGE_KEY]: folderIcons });
    return true;
  } catch (error) {
    console.error('Error saving folder icon:', error);
    return false;
  }
}

// ============================================
// CHROME BOOKMARKS API OPERATIONS
// ============================================

// Get bookmarks for a folder
export async function getBookmarks(folderId = ROOT_FOLDER_ID) {
  try {
    const results = await chrome.bookmarks.getChildren(folderId);
    return results;
  } catch (error) {
    console.error('Error getting bookmarks:', error);
    return [];
  }
}

// Get a single bookmark by ID
export async function getBookmarkById(id) {
  try {
    const results = await chrome.bookmarks.get(id);
    return results[0];
  } catch (error) {
    console.error('Error getting bookmark:', error);
    return null;
  }
}

// Create a new bookmark
export async function createBookmark(parentId, title, url) {
  try {
    // Normalize URL
    if (url && !url.match(/^https?:\/\//) && !url.match(/^chrome:\/\//)) {
      url = 'https://' + url;
    }

    const bookmark = await chrome.bookmarks.create({
      parentId: parentId || ROOT_FOLDER_ID,
      title: title,
      url: url
    });
    return bookmark;
  } catch (error) {
    console.error('Error creating bookmark:', error);
    return null;
  }
}

// Create a new folder
export async function createFolder(parentId, title) {
  try {
    const folder = await chrome.bookmarks.create({
      parentId: parentId || ROOT_FOLDER_ID,
      title: title
    });
    return folder;
  } catch (error) {
    console.error('Error creating folder:', error);
    return null;
  }
}

// Update a bookmark or folder
export async function updateBookmark(id, title, url = null) {
  try {
    const changes = { title };
    if (url !== null) {
      // Normalize URL
      if (url && !url.match(/^https?:\/\//) && !url.match(/^chrome:\/\//)) {
        url = 'https://' + url;
      }
      changes.url = url;
    }
    const bookmark = await chrome.bookmarks.update(id, changes);
    return bookmark;
  } catch (error) {
    console.error('Error updating bookmark:', error);
    return null;
  }
}

// Delete a bookmark or folder (folders are deleted recursively)
export async function deleteBookmark(id) {
  try {
    // First check if it's a folder
    const bookmark = await getBookmarkById(id);
    if (!bookmark) return false;

    if (!bookmark.url) {
      // It's a folder, use removeTree
      await chrome.bookmarks.removeTree(id);
    } else {
      // It's a bookmark
      await chrome.bookmarks.remove(id);
    }
    return true;
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    return false;
  }
}

// Share one tree read and count each node once. Any bookmark change invalidates
// the snapshot, including changes from other tabs and native bookmark controls.
let bookmarkSnapshot = null;
let readyBookmarkSnapshot = null;

function invalidateBookmarkSnapshot() {
  bookmarkSnapshot = null;
  readyBookmarkSnapshot = null;
}

for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved',
  'onChildrenReordered', 'onImportEnded']) {
  chrome.bookmarks[event].addListener(invalidateBookmarkSnapshot);
}

async function getBookmarkSnapshot() {
  if (!bookmarkSnapshot) {
    const pending = chrome.bookmarks.getTree().then(roots => {
      const nodes = new Map();
      const counts = new Map();
      function visit(node) {
        nodes.set(node.id, node);
        let links = 0;
        let folders = 0;
        for (const child of node.children || []) {
          const childCounts = visit(child);
          links += child.url ? 1 : childCounts.links;
          folders += child.url ? 0 : 1 + childCounts.folders;
        }
        const result = { links, folders };
        counts.set(node.id, result);
        return result;
      }
      roots.forEach(visit);
      const searchEntries = [];
      function indexChildren(node) {
        for (const child of node?.children || []) {
          const { children, ...item } = child;
          searchEntries.push({
            item,
            parentTitle: node.id === ROOT_FOLDER_ID ? 'Bookmarks' : node.title,
            title: item.title.toLowerCase(),
            url: item.url?.toLowerCase() || '',
            ...counts.get(item.id)
          });
          if (!child.url) indexChildren(child);
        }
      }
      indexChildren(nodes.get(ROOT_FOLDER_ID));
      searchEntries.sort((a, b) => (a.item.index ?? 0) - (b.item.index ?? 0));
      return { nodes, counts, searchEntries };
    });
    bookmarkSnapshot = pending;
    pending.catch(() => {
      if (bookmarkSnapshot === pending) bookmarkSnapshot = null;
    });
  }
  const pending = bookmarkSnapshot;
  let snapshot;
  try {
    snapshot = await pending;
  } catch (error) {
    console.error('Error getting bookmark tree:', error);
    return { nodes: new Map(), counts: new Map() };
  }
  // A mutation during the read must not repopulate the cache with old data.
  if (pending !== bookmarkSnapshot) return getBookmarkSnapshot();
  readyBookmarkSnapshot = snapshot;
  return snapshot;
}

// Search reads the prepared index synchronously between bookmark mutations.
export function getCachedBookmarkSearchEntries() {
  return readyBookmarkSnapshot?.searchEntries || null;
}

export async function loadBookmarkSearchEntries() {
  const snapshot = await getBookmarkSnapshot();
  return snapshot.searchEntries || [];
}

// Preserve the existing depth-first order and bookmark object shape.
export async function getAllBookmarks(folderId = ROOT_FOLDER_ID) {
  const { nodes } = await getBookmarkSnapshot();
  const result = [];
  function visit(node) {
    for (const child of node.children || []) {
      const { children, ...bookmark } = child;
      result.push(bookmark);
      if (!child.url) visit(child);
    }
  }
  const root = nodes.get(folderId);
  if (root) visit(root);
  return result;
}

export async function getTotalBookmarkCount(folderId = ROOT_FOLDER_ID) {
  return getLinkCountInFolder(folderId);
}

export async function getLinkCountInFolder(folderId) {
  const { counts } = await getBookmarkSnapshot();
  return counts.get(folderId)?.links || 0;
}

export async function getFolderDescendantCount(folderId) {
  const { counts } = await getBookmarkSnapshot();
  return counts.get(folderId)?.folders || 0;
}

// Check if targetFolderId is the same as or a descendant of folderId
export async function isFolderOrDescendant(folderId, targetFolderId) {
  if (folderId === targetFolderId) return true;

  const descendants = new Set();

  async function collectDescendants(id) {
    const children = await getBookmarks(id);
    for (const child of children) {
      if (!child.url) {
        descendants.add(child.id);
        await collectDescendants(child.id);
      }
    }
  }

  await collectDescendants(folderId);
  return descendants.has(targetFolderId);
}

// ============================================
// UNDO FUNCTIONALITY
// ============================================

// Collect full bookmark data (including children for folders) before deletion
async function collectBookmarkData(bookmark) {
  const data = {
    id: bookmark.id,
    parentId: bookmark.parentId,
    index: bookmark.index,
    title: bookmark.title,
    url: bookmark.url || null,
    children: []
  };

  // If it's a folder, recursively collect children
  if (!bookmark.url) {
    const children = await getBookmarks(bookmark.id);
    for (const child of children) {
      data.children.push(await collectBookmarkData(child));
    }
  }

  return data;
}

// Save bookmark(s) data to undo stack before deletion
export async function saveForUndo(bookmarkIds, actionType = 'delete') {
  const items = [];

  for (const id of bookmarkIds) {
    const bookmark = await getBookmarkById(id);
    if (bookmark) {
      const data = await collectBookmarkData(bookmark);
      items.push(data);
    }
  }

  if (items.length > 0) {
    pushToUndoStack({
      type: actionType,
      items: items
    });
  }
}

// Restore bookmarks from undo data
async function restoreBookmarkData(data, parentId = null) {
  try {
    const createData = {
      parentId: parentId || data.parentId,
      title: data.title,
      index: data.index
    };

    if (data.url) {
      createData.url = data.url;
    }

    const created = await chrome.bookmarks.create(createData);

    // If it was a folder, restore children
    if (data.children && data.children.length > 0) {
      for (const child of data.children) {
        await restoreBookmarkData(child, created.id);
      }
    }

    return created;
  } catch (error) {
    console.error('Error restoring bookmark:', error);
    return null;
  }
}

// Perform undo operation
export async function performUndo() {
  // Clean expired actions first
  cleanExpiredUndoActions();

  const action = popFromUndoStack();
  if (!action) {
    return { success: false, message: 'Nothing to undo' };
  }

  // Check if action has expired
  if (isUndoExpired(action)) {
    return { success: false, message: 'Undo expired' };
  }

  try {
    switch (action.type) {
      case 'delete': {
        // Restore deleted items
        let restoredCount = 0;

        for (const itemData of action.items) {
          const restored = await restoreBookmarkData(itemData);
          if (restored) {
            restoredCount++;
          }
        }

        if (restoredCount > 0) {
          const itemCount = action.items.length;
          const isFolder = action.items.length === 1 && !action.items[0].url;

          if (itemCount === 1) {
            const name = action.items[0].title || (isFolder ? 'Folder' : 'Bookmark');
            return { success: true, message: `Restored "${name}"` };
          } else {
            return { success: true, message: `Restored ${itemCount} items` };
          }
        }
        return { success: false, message: 'Failed to restore' };
      }

      case 'create': {
        // Undo create by deleting the created item(s)
        for (const item of action.items) {
          await deleteBookmark(item.id);
        }
        const itemCount = action.items.length;
        if (itemCount === 1) {
          return { success: true, message: 'Creation undone' };
        }
        return { success: true, message: `${itemCount} creations undone` };
      }

      case 'edit': {
        // Restore previous values
        const item = action.items[0];
        if (item.url) {
          await chrome.bookmarks.update(item.id, { title: item.title, url: item.url });
        } else {
          await chrome.bookmarks.update(item.id, { title: item.title });
        }
        return { success: true, message: 'Edit undone' };
      }

      case 'move': {
        // Move items back to original location
        for (const item of action.items) {
          await chrome.bookmarks.move(item.id, {
            parentId: item.originalParentId,
            index: item.originalIndex
          });
        }
        const itemCount = action.items.length;
        if (itemCount === 1) {
          return { success: true, message: 'Move undone' };
        }
        return { success: true, message: `${itemCount} moves undone` };
      }

      case 'createFolderFromSelected': {
        // Delete the created folder (which moves items back to original locations due to Chrome behavior)
        // But we need to move items back first, then delete the empty folder
        const folderId = action.folderId;
        const originalItems = action.originalItems;

        // Move items back to original locations
        for (const item of originalItems) {
          try {
            await chrome.bookmarks.move(item.id, {
              parentId: item.originalParentId,
              index: item.originalIndex
            });
          } catch (e) {
            // Item might have been deleted, skip
          }
        }

        // Delete the now-empty folder
        try {
          await chrome.bookmarks.removeTree(folderId);
        } catch (e) {
          // Folder might already be deleted
        }

        return { success: true, message: 'Folder creation undone' };
      }

      default:
        return { success: false, message: 'Unknown action type' };
    }
  } catch (error) {
    console.error('Undo failed:', error);
    return { success: false, message: 'Undo failed' };
  }
}

// Check if undo is available
export function canUndo() {
  cleanExpiredUndoActions();
  const action = peekUndoStack();
  return action !== null && !isUndoExpired(action);
}

// Save created item(s) to undo stack (undo will delete them)
export function saveCreateForUndo(createdItems) {
  const items = Array.isArray(createdItems) ? createdItems : [createdItems];
  pushToUndoStack({
    type: 'create',
    items: items.map(item => ({ id: item.id, title: item.title }))
  });
}

// Save edit action to undo stack (stores previous values)
export async function saveEditForUndo(itemId) {
  const bookmark = await getBookmarkById(itemId);
  if (!bookmark) return;

  pushToUndoStack({
    type: 'edit',
    items: [{
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url || null
    }]
  });
}

// Save move action to undo stack (stores original location)
export async function saveMoveForUndo(itemIds) {
  const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
  const items = [];

  for (const id of ids) {
    const bookmark = await getBookmarkById(id);
    if (bookmark) {
      items.push({
        id: bookmark.id,
        originalParentId: bookmark.parentId,
        originalIndex: bookmark.index
      });
    }
  }

  if (items.length > 0) {
    pushToUndoStack({
      type: 'move',
      items: items
    });
  }
}

// Save create folder from selected action
export function saveCreateFolderFromSelectedForUndo(folderId, originalItemsData) {
  pushToUndoStack({
    type: 'createFolderFromSelected',
    folderId: folderId,
    originalItems: originalItemsData
  });
}

// ============================================
// Remove search queries saved by versions that included extension search history.
export async function clearLegacySearchHistory() {
  try {
    await chrome.storage.local.remove('searchHistory');
  } catch (error) {
    console.error('Error removing legacy search history:', error);
  }
  localStorage.removeItem('searchHistory');
}

// ============================================
// THEME SYSTEM
// ============================================

export async function loadTheme() {
  try {
    const result = await chrome.storage.local.get('theme');
    const themeToApply = result.theme || DEFAULT_THEME;
    applyTheme(themeToApply);
  } catch (error) {
    console.error('Error loading theme:', error);
    applyTheme(DEFAULT_THEME);
  }
}

export async function saveTheme(theme) {
  try {
    await chrome.storage.local.set({ theme });
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

export function applyTheme(theme) {
  const themeToApply = theme || DEFAULT_THEME;
  if (themeToApply === 'default') {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', themeToApply);
  }
  setCurrentTheme(themeToApply);
  updateThemePickerUI();
}

// Theme picker element reference (local to this module)
let themePicker = null;

export function updateThemePickerUI() {
  if (!themePicker) return;

  const options = themePicker.querySelectorAll('.theme-option');
  options.forEach(option => {
    const theme = option.getAttribute('data-theme');
    if (theme === currentTheme) {
      option.classList.add('active');
    } else {
      option.classList.remove('active');
    }
  });
}

export function showThemePicker() {
  if (!themePicker) return;
  themePicker.classList.add('active');
  document.body.classList.add('theme-picker-open');
}

export function hideThemePicker() {
  if (!themePicker) return;
  themePicker.classList.remove('active');
  document.body.classList.remove('theme-picker-open');
}

export function initThemePicker() {
  themePicker = document.getElementById('theme-picker');
  if (!themePicker) return;

  const options = themePicker.querySelectorAll('.theme-option');
  options.forEach(option => {
    option.addEventListener('click', () => {
      const theme = option.getAttribute('data-theme');
      applyTheme(theme);
      saveTheme(theme);
    });
  });

  document.addEventListener('click', (e) => {
    if (themePicker.classList.contains('active') &&
        !themePicker.contains(e.target) &&
        e.target.id !== 'body-context-theme') {
      hideThemePicker();
    }
  });

  updateThemePickerUI();
}

// ============================================
// FETCH PAGE TITLE
// ============================================

export async function fetchPageTitle(url) {
  try {
    if (url.startsWith('chrome://')) {
      const path = url.replace('chrome://', '').replace(/\/$/, '');
      return 'Chrome ' + (path.charAt(0).toUpperCase() + path.slice(1) || 'Page');
    }

    const normalizedUrl = url.match(/^https?:\/\//) ? url : 'https://' + url;

    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html'
      }
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      if (title.length > 0) {
        return title;
      }
    }

    return null;
  } catch (error) {
    console.log('Could not fetch page title:', error.message);
    return null;
  }
}

// ============================================
// COPY TO CLIPBOARD
// ============================================

export async function copyLinkToClipboard(url, successMessage = 'Link copied') {
  try {
    await navigator.clipboard.writeText(url);
    showNotification(successMessage);
  } catch (error) {
    console.error('Failed to copy link:', error);
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showNotification(successMessage);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  }
}
