// ============================================
// STORAGE MODULE
// ============================================

import {
  items, setItems, searchHistory, setSearchHistory,
  undoStack, MAX_UNDO_STACK_SIZE, currentTheme, setCurrentTheme,
  setPendingStorageWrite, STORAGE_DEBOUNCE_MS, DEFAULT_THEME
} from './state.js';
import { debounce, showUndoNotification, getChromePageIcon } from './utils.js';

// ============================================
// FAVICON CACHE SYSTEM
// ============================================

const faviconCache = new Map();
const FAVICON_CACHE_DB_NAME = 'faviconCache';
const FAVICON_CACHE_STORE_NAME = 'favicons';
const FAVICON_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
let faviconCacheDB = null;

// Initialize IndexedDB for favicon caching
export async function initFaviconCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FAVICON_CACHE_DB_NAME, 1);
    
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
  try {
    const domain = new URL(url).hostname;
    
    const cached = await getCachedFavicon(domain);
    if (cached) return cached;
    
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    const response = await fetch(faviconUrl);
    const blob = await response.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        cacheFavicon(domain, dataUrl);
        resolve(dataUrl);
      };
      reader.onerror = () => resolve(faviconUrl);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=64`;
  }
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
    
    const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    fetchAndCacheFavicon(url).catch(() => {});
    
    return googleUrl;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=64`;
  }
}

// Pre-load favicons for visible items
export function preloadVisibleFavicons(currentFolderId) {
  const links = items.filter(i => i.type === 'link' && i.parentId === currentFolderId);
  const toPreload = links.slice(0, 20);
  toPreload.forEach(link => {
    if (link.url && !link.url.startsWith('chrome://')) {
      fetchAndCacheFavicon(link.url).catch(() => {});
    }
  });
}

// ============================================
// ITEMS STORAGE
// ============================================

// Debounced save function for rapid operations
const debouncedSaveItems = debounce(async () => {
  try {
    await chrome.storage.local.set({ speedDialItems: items });
    setPendingStorageWrite(null);
  } catch (error) {
    console.error('Error in debounced save:', error);
    localStorage.setItem('speedDialItems', JSON.stringify(items));
    setPendingStorageWrite(null);
  }
}, STORAGE_DEBOUNCE_MS);

export async function loadItems() {
  try {
    const result = await chrome.storage.local.get('speedDialItems');
    
    if (!result.speedDialItems) {
      const syncResult = await chrome.storage.sync.get('speedDialItems');
      if (syncResult.speedDialItems && syncResult.speedDialItems.length > 0) {
        setItems(syncResult.speedDialItems);
        await chrome.storage.local.set({ speedDialItems: items });
        await chrome.storage.sync.remove('speedDialItems');
      } else {
        setItems([]);
      }
    } else {
      setItems(result.speedDialItems);
    }
  } catch (error) {
    console.error('Error loading items from chrome.storage:', error);
    const stored = localStorage.getItem('speedDialItems');
    setItems(stored ? JSON.parse(stored) : []);
  }
  
  // Migrate items to include order property
  let needsMigration = false;
  items.forEach((item, index) => {
    if (item.order === undefined) {
      item.order = index;
      needsMigration = true;
    }
  });
  
  if (needsMigration) {
    await saveItems();
  }
}

export async function saveItems(immediate = true) {
  if (immediate) {
    setPendingStorageWrite(null);
    try {
      await chrome.storage.local.set({ speedDialItems: items });
    } catch (error) {
      console.error('Error saving items to chrome.storage:', error);
      localStorage.setItem('speedDialItems', JSON.stringify(items));
    }
  } else {
    setPendingStorageWrite(true);
    debouncedSaveItems();
  }
}

// ============================================
// UNDO FUNCTIONALITY
// ============================================

export function saveStateForUndo() {
  const stateCopy = JSON.parse(JSON.stringify(items));
  undoStack.push(stateCopy);
  
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift();
  }
}

export async function undo(renderItems, renderBreadcrumb) {
  if (undoStack.length === 0) {
    showUndoNotification('Nothing to undo');
    return;
  }
  
  setItems(undoStack.pop());
  await saveItems();
  renderItems();
  renderBreadcrumb();
  showUndoNotification('Undone');
}

// ============================================
// SEARCH HISTORY STORAGE
// ============================================

export async function loadSearchHistory() {
  try {
    const result = await chrome.storage.local.get('searchHistory');
    setSearchHistory(result.searchHistory || []);
  } catch (error) {
    console.error('Error loading search history:', error);
    const stored = localStorage.getItem('searchHistory');
    setSearchHistory(stored ? JSON.parse(stored) : []);
  }
}

export async function saveSearchHistory() {
  try {
    await chrome.storage.local.set({ searchHistory: searchHistory });
  } catch (error) {
    console.error('Error saving search history:', error);
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  }
}

export async function addToSearchHistory(query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return;
  
  // Get current history and modify
  let history = [...searchHistory];
  history = history.filter(h => h.toLowerCase() !== normalizedQuery);
  history.unshift(query.trim());
  
  if (history.length > 50) {
    history = history.slice(0, 50);
  }
  
  setSearchHistory(history);
  await saveSearchHistory();
}

export async function removeFromSearchHistory(query) {
  const normalizedQuery = query.trim().toLowerCase();
  const newHistory = searchHistory.filter(h => h.toLowerCase() !== normalizedQuery);
  setSearchHistory(newHistory);
  await saveSearchHistory();
}

export function getMatchingSearchHistory(query) {
  if (!query || query.trim().length === 0) return [];
  
  const normalizedQuery = query.toLowerCase().trim();
  return searchHistory.filter(h => 
    h.toLowerCase().includes(normalizedQuery) && 
    h.toLowerCase() !== normalizedQuery
  ).slice(0, 5);
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
  const { showCopyNotification } = await import('./utils.js');
  
  try {
    await navigator.clipboard.writeText(url);
    showCopyNotification(successMessage);
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
      showCopyNotification(successMessage);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  }
}

