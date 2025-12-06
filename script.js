// Utility functions
function debounce(func, wait) {
  let timeoutId = null;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), wait);
  };
}

// State management
let items = [];
let currentFolderId = 'root';
let navigationStack = []; // Track folder navigation for breadcrumbs
let editingItemId = null; // Track item being edited
let deletingItemId = null; // Track item being deleted
let deletingItemIds = []; // Track multiple items being deleted (for multi-select)
let isSearchMode = false; // Track if we're in search mode
let searchQuery = ''; // Current search query
let focusedItemIndex = -1; // Track focused item index for keyboard navigation
let searchHistory = []; // Search history for suggestions
const MAX_SEARCH_HISTORY = 50; // Maximum number of search history items to store
let originalSearchQuery = ''; // Store original user-typed query for restoring when navigating suggestions

// Multi-select state
let selectedItemIds = new Set(); // Track selected item IDs
let isBoxSelecting = false; // Track if currently box selecting
let selectionBox = { startX: 0, startY: 0, currentX: 0, currentY: 0 }; // Box selection coordinates
let selectionBoxElement = null; // DOM element for selection box visual

// Undo functionality
const undoStack = [];
const MAX_UNDO_STACK_SIZE = 50;

// Theme state
let currentTheme = 'default';
let themePicker = null;

// ============================================
// THEME SYSTEM
// ============================================

// Load theme from storage
async function loadTheme() {
  try {
    const result = await chrome.storage.local.get('theme');
    currentTheme = result.theme || 'default';
    applyTheme(currentTheme);
  } catch (error) {
    console.error('Error loading theme:', error);
    currentTheme = 'default';
    applyTheme(currentTheme);
  }
}

// Save theme to storage
async function saveTheme(theme) {
  try {
    await chrome.storage.local.set({ theme });
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

// Apply theme to document
function applyTheme(theme) {
  if (theme === 'default') {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', theme);
  }
  currentTheme = theme;
  updateThemePickerUI();
}

// Update theme picker UI to show active theme
function updateThemePickerUI() {
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

// Show theme picker
function showThemePicker() {
  if (!themePicker) return;
  themePicker.classList.add('active');
  document.body.classList.add('theme-picker-open');
}

// Hide theme picker
function hideThemePicker() {
  if (!themePicker) return;
  themePicker.classList.remove('active');
  document.body.classList.remove('theme-picker-open');
}

// Initialize theme picker
function initThemePicker() {
  themePicker = document.getElementById('theme-picker');
  if (!themePicker) return;
  
  // Theme option click handlers
  const options = themePicker.querySelectorAll('.theme-option');
  options.forEach(option => {
    option.addEventListener('click', () => {
      const theme = option.getAttribute('data-theme');
      applyTheme(theme);
      saveTheme(theme);
    });
  });
  
  // Click outside to close
  document.addEventListener('click', (e) => {
    if (themePicker.classList.contains('active') &&
        !themePicker.contains(e.target) &&
        e.target.id !== 'body-context-theme') {
      hideThemePicker();
    }
  });
  
  // Update UI to show current theme
  updateThemePickerUI();
}

// ============================================
// PERFORMANCE: Favicon Cache System
// ============================================
const faviconCache = new Map();
const FAVICON_CACHE_DB_NAME = 'faviconCache';
const FAVICON_CACHE_STORE_NAME = 'favicons';
const FAVICON_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
let faviconCacheDB = null;

// Initialize IndexedDB for favicon caching
async function initFaviconCache() {
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
async function getCachedFavicon(domain) {
  // Check in-memory cache first
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
async function cacheFavicon(domain, dataUrl) {
  // Save to in-memory cache
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
async function fetchAndCacheFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    
    // Check cache first
    const cached = await getCachedFavicon(domain);
    if (cached) return cached;
    
    // Fetch from Google's favicon service
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    const response = await fetch(faviconUrl);
    const blob = await response.blob();
    
    // Convert to data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        cacheFavicon(domain, dataUrl);
        resolve(dataUrl);
      };
      reader.onerror = () => resolve(faviconUrl); // Fallback to direct URL
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=64`;
  }
}

// Pre-load favicons for visible items (improves subsequent renders)
function preloadVisibleFavicons() {
  const links = items.filter(i => i.type === 'link' && i.parentId === currentFolderId);
  // Pre-load first 20 favicons in background
  const toPreload = links.slice(0, 20);
  toPreload.forEach(link => {
    if (link.url && !link.url.startsWith('chrome://')) {
      fetchAndCacheFavicon(link.url).catch(() => {});
    }
  });
}

// ============================================
// PERFORMANCE: Debounced Storage Operations
// ============================================
let pendingStorageWrite = null;
const STORAGE_DEBOUNCE_MS = 300;

// Debounced save function for rapid operations (like drag-drop reordering)
const debouncedSaveItems = debounce(async () => {
  try {
    await chrome.storage.local.set({ speedDialItems: items });
    pendingStorageWrite = null;
  } catch (error) {
    console.error('Error in debounced save:', error);
    localStorage.setItem('speedDialItems', JSON.stringify(items));
    pendingStorageWrite = null;
  }
}, STORAGE_DEBOUNCE_MS);

// ============================================
// PERFORMANCE: Event Delegation Flag
// ============================================
let eventDelegationInitialized = false;

// Save current state to undo stack
function saveStateForUndo() {
  // Deep clone the items array
  const stateCopy = JSON.parse(JSON.stringify(items));
  undoStack.push(stateCopy);
  
  // Limit stack size to prevent memory issues
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift();
  }
}

// Undo last action
async function undo() {
  if (undoStack.length === 0) {
    showUndoNotification('Nothing to undo');
    return;
  }
  
  // Restore previous state
  items = undoStack.pop();
  await saveItems();
  renderItems();
  renderBreadcrumb();
  showUndoNotification('Undone');
}

// Show undo notification
function showUndoNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  notification.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 10h10a5 5 0 0 1 5 5v2"/>
      <path d="M3 10l4-4"/>
      <path d="M3 10l4 4"/>
    </svg>
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 1500);
}

// DOM Elements
const itemsGrid = document.getElementById('items-grid');
const breadcrumb = document.getElementById('breadcrumb');

// Add bookmark modal elements
const addModalOverlay = document.getElementById('add-modal-overlay');
const addModalClose = document.getElementById('add-modal-close');
const addForm = document.getElementById('add-form');
const addFormRows = document.getElementById('add-form-rows');
const addSubmitBtn = document.getElementById('add-submit-btn');
let addRowCount = 1; // Track number of input rows

// Add folder modal elements
const addFolderModalOverlay = document.getElementById('add-folder-modal-overlay');
const addFolderModalClose = document.getElementById('add-folder-modal-close');
const addFolderForm = document.getElementById('add-folder-form');
const folderNameInput = document.getElementById('folder-name');
const addFolderSubmitBtn = document.getElementById('add-folder-submit-btn');

// Edit modal elements
const editModalOverlay = document.getElementById('edit-modal-overlay');
const modalTitle = document.getElementById('modal-title');
const editForm = document.getElementById('edit-form');
const itemTypeInput = document.getElementById('item-type');
const itemIdInput = document.getElementById('item-id');
const itemTitleInput = document.getElementById('item-title');
const itemUrlInput = document.getElementById('item-url');
const urlGroup = document.getElementById('url-group');
const cancelBtn = document.getElementById('cancel-btn');
const submitBtn = document.getElementById('submit-btn');

// Delete modal elements
const deleteModalOverlay = document.getElementById('delete-modal-overlay');
const deleteItemName = document.getElementById('delete-item-name');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

// Move mode elements and state
const moveBanner = document.getElementById('move-banner');
const moveBannerDismiss = document.getElementById('move-banner-dismiss');
const moveBannerIcon = document.getElementById('move-banner-icon');
const moveBannerText = document.getElementById('move-banner-text');
const moveBannerAction = document.getElementById('move-banner-action');
let movingItemId = null;
let movingItemIds = []; // Track multiple items being moved (for multi-select)
let moveModePreviousFolderId = null; // Track where we came from to return after move

// Search elements
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const searchIconContainer = document.getElementById('search-icon-container');

// Search icon SVGs
const searchIconSvgHtml = `
  <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="11" cy="11" r="8"/>
    <path d="M21 21l-4.35-4.35"/>
  </svg>
`;

const googleIconSvgHtml = `
  <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
`;

const globeIconSvgHtml = `
  <svg class="globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
`;

const linkIconSvgHtml = `
  <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
`;

const historyIconSvgHtml = `
  <svg class="history-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
`;

// Check if a string looks like a URL
function isUrl(str) {
  const trimmed = str.trim();
  if (!trimmed) return false;
  
  // Check for explicit protocol (including chrome:// internal URLs)
  if (/^https?:\/\//i.test(trimmed) || /^chrome:\/\//i.test(trimmed)) {
    return true;
  }
  
  // Check for common URL patterns without protocol
  // Match: domain.tld, domain.tld/path, subdomain.domain.tld, localhost:port, IP addresses
  const urlPattern = /^(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/\S*)?$/i;
  
  return urlPattern.test(trimmed);
}

// Normalize URL (add protocol if missing)
function normalizeUrl(url) {
  const trimmed = url.trim();
  // Keep chrome:// URLs as-is
  if (/^chrome:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return 'https://' + trimmed;
}

// Set search icon (search, google, globe, folder, inbox, link, history, or favicon URL)
function setSearchIcon(type, faviconUrl = null) {
  if (type === 'google') {
    searchIconContainer.innerHTML = googleIconSvgHtml;
  } else if (type === 'globe') {
    searchIconContainer.innerHTML = globeIconSvgHtml;
  } else if (type === 'folder') {
    searchIconContainer.innerHTML = getFolderIconSvg();
  } else if (type === 'inbox') {
    searchIconContainer.innerHTML = getInboxIconSvg();
  } else if (type === 'link') {
    searchIconContainer.innerHTML = linkIconSvgHtml;
  } else if (type === 'history') {
    searchIconContainer.innerHTML = historyIconSvgHtml;
  } else if (type === 'favicon' && faviconUrl) {
    searchIconContainer.innerHTML = `<img src="${faviconUrl}" alt="" class="search-favicon" style="width: 24px; height: 24px; object-fit: contain;">`;
  } else {
    searchIconContainer.innerHTML = searchIconSvgHtml;
  }
}

// Generate unique ID
function generateId() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Storage functions
async function loadItems() {
  try {
    // Use chrome.storage.local for better quota (5MB vs 100KB for sync)
    const result = await chrome.storage.local.get('speedDialItems');
    
    // If no data in local storage, try to migrate from sync storage
    if (!result.speedDialItems) {
      const syncResult = await chrome.storage.sync.get('speedDialItems');
      if (syncResult.speedDialItems && syncResult.speedDialItems.length > 0) {
        // Migrate from sync to local storage
        items = syncResult.speedDialItems;
        await chrome.storage.local.set({ speedDialItems: items });
        // Clear sync storage after migration
        await chrome.storage.sync.remove('speedDialItems');
      } else {
        items = [];
      }
    } else {
      items = result.speedDialItems;
    }
  } catch (error) {
    console.error('Error loading items from chrome.storage:', error);
    // Fallback to localStorage if chrome.storage is not available
    const stored = localStorage.getItem('speedDialItems');
    items = stored ? JSON.parse(stored) : [];
  }
  
  // Migrate existing items to include order property
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

async function saveItems(immediate = true) {
  if (immediate) {
    // Immediate save - cancel any pending debounced save
    pendingStorageWrite = null;
    try {
      // Use chrome.storage.local for better quota (5MB vs 100KB for sync)
      await chrome.storage.local.set({ speedDialItems: items });
    } catch (error) {
      console.error('Error saving items to chrome.storage:', error);
      // Fallback to localStorage
      localStorage.setItem('speedDialItems', JSON.stringify(items));
    }
  } else {
    // Debounced save - for rapid operations like drag-drop reordering
    pendingStorageWrite = true;
    debouncedSaveItems();
  }
}

// Search history storage functions
async function loadSearchHistory() {
  try {
    const result = await chrome.storage.local.get('searchHistory');
    searchHistory = result.searchHistory || [];
  } catch (error) {
    console.error('Error loading search history:', error);
    const stored = localStorage.getItem('searchHistory');
    searchHistory = stored ? JSON.parse(stored) : [];
  }
}

async function saveSearchHistory() {
  try {
    await chrome.storage.local.set({ searchHistory: searchHistory });
  } catch (error) {
    console.error('Error saving search history:', error);
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  }
}

async function addToSearchHistory(query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return;
  
  // Remove duplicate if exists (case-insensitive)
  searchHistory = searchHistory.filter(h => h.toLowerCase() !== normalizedQuery);
  
  // Add to beginning (most recent first)
  searchHistory.unshift(query.trim());
  
  // Limit history size
  if (searchHistory.length > MAX_SEARCH_HISTORY) {
    searchHistory = searchHistory.slice(0, MAX_SEARCH_HISTORY);
  }
  
  await saveSearchHistory();
}

async function removeFromSearchHistory(query) {
  const normalizedQuery = query.trim().toLowerCase();
  searchHistory = searchHistory.filter(h => h.toLowerCase() !== normalizedQuery);
  await saveSearchHistory();
}

function getMatchingSearchHistory(query) {
  if (!query || query.trim().length === 0) return [];
  
  const normalizedQuery = query.toLowerCase().trim();
  return searchHistory.filter(h => 
    h.toLowerCase().includes(normalizedQuery) && 
    h.toLowerCase() !== normalizedQuery // Don't show exact match
  ).slice(0, 5); // Limit to 5 history suggestions
}


// Get count of links in a folder (recursive)
function getLinkCountInFolder(folderId) {
  let count = 0;
  const folderItems = items.filter(item => item.parentId === folderId);
  
  for (const item of folderItems) {
    if (item.type === 'link') {
      count++;
    } else if (item.type === 'folder') {
      count += getLinkCountInFolder(item.id);
    }
  }
  
  return count;
}


// Material Icons SVG data URIs for chrome:// URLs
// Using Material Icons (https://developers.google.com/fonts/docs/material_icons)
const chromePageIcons = {
  // Settings icon
  settings: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`),
  // Extension/puzzle piece icon
  extensions: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>`),
  // History icon
  history: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`),
  // Download icon
  downloads: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`),
  // Star icon for bookmarks
  bookmarks: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`),
  // Password/Key icon
  'password-manager': 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`),
  // Flag icon
  flags: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>`),
  // Apps grid icon
  apps: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>`),
  // Info icon
  about: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`),
  // Tab icon for newtab
  newtab: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10z"/></svg>`),
  // Security icon for safe-browsing
  'safe-browsing': 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>`),
  // Print icon
  print: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`),
  // Inspect/DevTools icon
  inspect: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`),
  // Accessibility icon
  accessibility: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"/></svg>`),
  // GPU icon
  gpu: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14zM6 13h5v4H6zm6-6h4v3h-4zM6 7h5v5H6zm6 4h4v6h-4z"/></svg>`),
  // Network/WiFi icon for net-internals
  'net-internals': 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>`),
  // Sync icon
  sync: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`),
  // Credit card icon for payment methods/autofill
  autofill: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>`),
  // Default Chrome icon for unknown pages
  default: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" fill-opacity="0.8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`)
};

// Get the icon for a chrome:// URL based on its path
function getChromePageIcon(url) {
  const path = url.replace('chrome://', '').split('/')[0].toLowerCase();
  return chromePageIcons[path] || chromePageIcons.default;
}

// Searchable Chrome internal pages
const chromeInternalPages = [
  { title: 'Extensions', url: 'chrome://extensions/', keywords: ['extensions', 'addons', 'plugins', 'manage extensions'] },
  { title: 'Settings', url: 'chrome://settings/', keywords: ['settings', 'preferences', 'options', 'config', 'configuration'] },
  { title: 'History', url: 'chrome://history/', keywords: ['history', 'browsing history', 'visited pages'] },
  { title: 'Downloads', url: 'chrome://downloads/', keywords: ['downloads', 'downloaded files'] },
  { title: 'Bookmarks', url: 'chrome://bookmarks/', keywords: ['bookmarks', 'favorites', 'saved pages'] },
  { title: 'Password Manager', url: 'chrome://password-manager/', keywords: ['passwords', 'password manager', 'saved passwords', 'credentials', 'login'] },
  { title: 'Flags', url: 'chrome://flags/', keywords: ['flags', 'experiments', 'experimental features', 'chrome flags'] },
  { title: 'Apps', url: 'chrome://apps/', keywords: ['apps', 'applications', 'chrome apps'] },
  { title: 'About Chrome', url: 'chrome://settings/help', keywords: ['about', 'version', 'chrome version', 'update', 'about chrome'] },
  { title: 'Privacy & Security', url: 'chrome://settings/privacy', keywords: ['privacy', 'security', 'safe browsing', 'cookies', 'clear data'] },
  { title: 'Appearance', url: 'chrome://settings/appearance', keywords: ['appearance', 'theme', 'dark mode', 'fonts', 'customize'] },
  { title: 'Search Engine', url: 'chrome://settings/search', keywords: ['search engine', 'default search', 'google', 'bing'] },
  { title: 'On Startup', url: 'chrome://settings/onStartup', keywords: ['startup', 'on startup', 'start page', 'homepage'] },
  { title: 'Autofill', url: 'chrome://settings/autofill', keywords: ['autofill', 'addresses', 'payment methods', 'credit cards'] },
  { title: 'Languages', url: 'chrome://settings/languages', keywords: ['languages', 'translate', 'spell check'] },
  { title: 'Accessibility', url: 'chrome://settings/accessibility', keywords: ['accessibility', 'a11y', 'screen reader'] },
  { title: 'System', url: 'chrome://settings/system', keywords: ['system', 'proxy', 'hardware acceleration'] },
  { title: 'Reset Settings', url: 'chrome://settings/reset', keywords: ['reset', 'restore', 'default settings'] },
  { title: 'Site Settings', url: 'chrome://settings/content', keywords: ['site settings', 'permissions', 'notifications', 'location', 'camera', 'microphone'] },
  { title: 'Sync', url: 'chrome://settings/syncSetup', keywords: ['sync', 'google account', 'sync data'] },
  { title: 'GPU Info', url: 'chrome://gpu/', keywords: ['gpu', 'graphics', 'hardware acceleration', 'webgl'] },
  { title: 'Network Internals', url: 'chrome://net-internals/', keywords: ['network', 'net internals', 'dns', 'sockets', 'proxy'] },
  { title: 'Inspect Devices', url: 'chrome://inspect/', keywords: ['inspect', 'devtools', 'debug', 'developer tools'] },
  { title: 'Print', url: 'chrome://print/', keywords: ['print', 'printer'] },
  { title: 'New Tab', url: 'chrome://newtab/', keywords: ['new tab', 'newtab'] },
  { title: 'Components', url: 'chrome://components/', keywords: ['components', 'update components'] },
  { title: 'Version', url: 'chrome://version/', keywords: ['version', 'chrome version', 'build'] },
  { title: 'Memory', url: 'chrome://memory-internals/', keywords: ['memory', 'ram', 'memory usage'] },
  { title: 'Crashes', url: 'chrome://crashes/', keywords: ['crashes', 'crash reports'] },
  { title: 'Credits', url: 'chrome://credits/', keywords: ['credits', 'licenses', 'open source'] }
];

// Search Chrome internal pages
function searchChromePages(query) {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];
  
  return chromeInternalPages.filter(page => {
    const titleMatch = page.title.toLowerCase().includes(normalizedQuery);
    const urlMatch = page.url.toLowerCase().includes(normalizedQuery);
    const keywordMatch = page.keywords.some(kw => kw.toLowerCase().includes(normalizedQuery));
    return titleMatch || urlMatch || keywordMatch;
  }).map(page => ({
    id: 'chrome-page-' + page.url,
    type: 'chrome-page',
    title: page.title,
    url: page.url
  }));
}

// Get favicon URL for a given domain (returns cached version if available)
function getFaviconUrl(url) {
  try {
    // For chrome:// URLs, return appropriate Material Icon
    if (url.startsWith('chrome://')) {
      return getChromePageIcon(url);
    }
    const domain = new URL(url).hostname;
    
    // Return cached favicon if available (sync check)
    if (faviconCache.has(domain)) {
      return faviconCache.get(domain);
    }
    
    // Return Google's service URL (will be cached asynchronously)
    const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    
    // Async cache the favicon for future use (fire and forget)
    fetchAndCacheFavicon(url).catch(() => {});
    
    return googleUrl;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=64`;
  }
}

// Navigate to URL (handles chrome:// URLs specially)
function navigateToUrl(url, openInNewTab = false) {
  if (!url) return;
  
  // chrome:// URLs need to use the chrome.tabs API
  if (url.startsWith('chrome://')) {
    if (openInNewTab) {
      chrome.tabs.create({ url: url });
    } else {
      chrome.tabs.update({ url: url });
    }
  } else {
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  }
}

// Get items for current folder
function getItemsForFolder(folderId) {
  const folderItems = items.filter(item => item.parentId === folderId);
  // Sort by order, then by creation order (id) as fallback
  return folderItems.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return 0;
  });
}

// Get folder by ID
function getFolderById(folderId) {
  return items.find(item => item.id === folderId && item.type === 'folder');
}

// Check if targetFolderId is the same as or a descendant of folderId
function isFolderOrDescendant(folderId, targetFolderId) {
  if (folderId === targetFolderId) return true;
  
  // Get all descendants of folderId
  const descendants = new Set();
  const queue = [folderId];
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = items.filter(i => i.parentId === currentId && i.type === 'folder');
    for (const child of children) {
      if (!descendants.has(child.id)) {
        descendants.add(child.id);
        queue.push(child.id);
      }
    }
  }
  
  return descendants.has(targetFolderId);
}

// Count total bookmarks (links only, not folders)
function getTotalBookmarkCount() {
  return items.filter(item => item.type === 'link').length;
}

// Build breadcrumb path
function getBreadcrumbPath() {
  const totalBookmarks = getTotalBookmarkCount();
  const rootTitle = `${totalBookmarks} bookmark${totalBookmarks !== 1 ? 's' : ''}`;
  const path = [{ id: 'root', title: rootTitle }];
  
  for (const folderId of navigationStack) {
    const folder = getFolderById(folderId);
    if (folder) {
      path.push({ id: folder.id, title: folder.title });
    }
  }
  
  return path;
}

// Render breadcrumb navigation
function renderBreadcrumb() {
  const path = getBreadcrumbPath();
  const isAtRoot = path.length === 1;
  
  breadcrumb.innerHTML = path.map((item, index) => {
    const isLast = index === path.length - 1;
    
    if (isLast) {
      const nonInteractiveClass = isAtRoot ? ' breadcrumb-non-interactive' : '';
      return `<span class="breadcrumb-current${nonInteractiveClass}" data-folder-id="${item.id}">${escapeHtml(item.title)}</span>`;
    }
    
    return `
      <span class="breadcrumb-item" data-folder-id="${item.id}">${escapeHtml(item.title)}</span>
      <span class="breadcrumb-separator">/</span>
    `;
  }).join('');
  
  // Event listeners are now handled by event delegation (initEventDelegation)
  // No need to attach individual listeners - improves performance significantly
}

// Start inline editing of folder name in breadcrumb
function startInlineFolderEdit(element) {
  const folderId = element.dataset.folderId;
  if (folderId === 'root') return; // Can't edit root
  if (folderId === UNSORTED_FOLDER_ID) return; // Can't edit Unsorted folder
  
  const folder = getFolderById(folderId);
  if (!folder) return;
  
  const currentText = folder.title;
  const originalWidth = element.offsetWidth;
  
  // Create input element
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = 'breadcrumb-edit-input';
  input.style.minWidth = `${Math.max(originalWidth, 60)}px`;
  
  // Replace span with input
  element.replaceWith(input);
  input.focus();
  input.select();
  
  // Handle saving
  const saveEdit = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentText) {
      await updateFolderTitle(folderId, newTitle);
    }
    renderBreadcrumb();
    renderItems(); // Update folder card title too
  };
  
  // Save on blur
  input.addEventListener('blur', saveEdit);
  
  // Save on Enter, cancel on Escape
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', saveEdit);
      renderBreadcrumb();
    }
  });
}

// Update folder title
async function updateFolderTitle(folderId, newTitle) {
  const folder = items.find(i => i.id === folderId);
  if (folder) {
    saveStateForUndo();
    folder.title = newTitle;
    await saveItems();
  }
}

// Navigate to a specific folder
function navigateToFolder(folderId, pushState = true, autoFocusFirst = false) {
  // Clear selection when navigating
  clearSelection();
  
  if (folderId === 'root') {
    currentFolderId = 'root';
    navigationStack = [];
  } else {
    // Find the index of this folder in the stack
    const stackIndex = navigationStack.indexOf(folderId);
    
    if (stackIndex >= 0) {
      // Navigate back to this folder
      navigationStack = navigationStack.slice(0, stackIndex + 1);
      currentFolderId = folderId;
    } else {
      // Navigate into a new folder
      navigationStack.push(folderId);
      currentFolderId = folderId;
    }
  }
  
  // Update browser history for back button support (only if not in move mode)
  if (pushState && !isInMoveMode()) {
    const state = { folderId, navigationStack: [...navigationStack] };
    const hash = folderId === 'root' ? '' : `#folder/${folderId}`;
    history.pushState(state, '', hash || window.location.pathname);
  }
  
  // Update move banner text if in move mode
  if (isInMoveMode()) {
    updateMoveBanner();
  }
  
  // Reset keyboard focus when navigating
  resetKeyboardFocus();
  
  renderItems();
  renderBreadcrumb();
  
  // Auto-focus first item if navigating with keyboard
  if (autoFocusFirst) {
    focusItem(0);
  }
}

// Handle browser back/forward navigation
function handlePopState(event) {
  if (event.state) {
    // Restore state from history
    currentFolderId = event.state.folderId || 'root';
    navigationStack = event.state.navigationStack || [];
  } else {
    // No state means we're at the initial page (root)
    // Check if there's a hash in the URL
    const hash = window.location.hash;
    if (hash.startsWith('#folder/')) {
      const folderId = hash.replace('#folder/', '');
      restoreNavigationToFolder(folderId);
      return;
    }
    currentFolderId = 'root';
    navigationStack = [];
  }
  
  renderItems();
  renderBreadcrumb();
}

// Restore navigation stack to a specific folder
function restoreNavigationToFolder(targetFolderId) {
  // Build the navigation stack by walking up the parent chain
  const stack = [];
  let currentId = targetFolderId;
  
  while (currentId && currentId !== 'root') {
    const folder = getFolderById(currentId);
    if (folder) {
      stack.unshift(currentId);
      currentId = folder.parentId;
    } else {
      // Folder not found, go to root
      currentFolderId = 'root';
      navigationStack = [];
      renderItems();
      renderBreadcrumb();
      return;
    }
  }
  
  currentFolderId = targetFolderId;
  navigationStack = stack;
  renderItems();
  renderBreadcrumb();
}

// Initialize history state on page load
function initializeHistoryState() {
  const hash = window.location.hash;
  
  if (hash.startsWith('#folder/')) {
    const folderId = hash.replace('#folder/', '');
    restoreNavigationToFolder(folderId);
    // Replace the initial state with proper state object
    const state = { folderId: currentFolderId, navigationStack: [...navigationStack] };
    history.replaceState(state, '', hash);
  } else {
    // At root, set initial state
    const state = { folderId: 'root', navigationStack: [] };
    history.replaceState(state, '', window.location.pathname);
  }
}

// Listen for popstate events (back/forward button)
window.addEventListener('popstate', handlePopState);

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format visit time for browser history items
// Shows time if today, date if yesterday or earlier
function formatVisitTime(timestamp) {
  const visitDate = new Date(timestamp);
  const now = new Date();
  
  // Check if it's today
  const isToday = visitDate.toDateString() === now.toDateString();
  
  if (isToday) {
    // Show time only (e.g., "2:30 PM")
    return visitDate.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  } else {
    // Show date only (e.g., "Dec 4" or "12/4/24")
    return visitDate.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric'
    });
  }
}

// Create folder icon SVG - neutral gray version
function getFolderIconSvg() {
  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.76 22H18.24C20.2562 22 21.2643 22 22.0344 21.6136C22.7117 21.2737 23.2625 20.7313 23.6076 20.0641C24 19.3057 24 18.3129 24 16.3273V16.3273V9H0V16.3273C0 18.3129 0 19.3057 0.392377 20.0641C0.737521 20.7313 1.28825 21.2737 1.96563 21.6136C2.73572 22 3.74381 22 5.76 22Z" fill="#9A9A9A"/>
      <path d="M0 5.73333V9H24V8.06667C24 6.75988 24 6.10648 23.7384 5.60736C23.5083 5.16831 23.1412 4.81136 22.6896 4.58765C22.1762 4.33333 21.5041 4.33333 20.16 4.33333H11.7906C11.2036 4.33333 10.9101 4.33333 10.6338 4.26886C10.389 4.2117 10.1549 4.11743 9.94012 3.98949C9.69792 3.8452 9.49037 3.64342 9.07529 3.23987L8.92471 3.09347C8.50963 2.68991 8.30208 2.48814 8.05988 2.34384C7.84515 2.21591 7.61104 2.12163 7.36616 2.06447C7.08995 2 6.79644 2 6.20942 2H3.84C2.49587 2 1.82381 2 1.31042 2.25432C0.858834 2.47802 0.49168 2.83498 0.261584 3.27402C0 3.77315 0 4.42654 0 5.73333Z" fill="#808080"/>
    </svg>
  `;
}

// Create inbox icon SVG - for Unsorted folder
function getInboxIconSvg() {
  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_3988_6252)">
        <path d="M15.4971 2C16.5285 1.99941 17.2806 1.99886 17.9639 2.23926C18.5655 2.45105 19.1137 2.79747 19.5684 3.25195C20.0848 3.7682 20.421 4.45456 20.8818 5.39648L20.9521 5.54004L23.3643 10.4639C23.5466 10.8359 23.6796 11.108 23.7754 11.3984C23.8601 11.6554 23.9222 11.92 23.959 12.1885C24.0006 12.4919 24.0001 12.796 24 13.2119V15.6377C24 16.5455 24.0004 17.2882 23.9521 17.8916C23.9021 18.5162 23.7952 19.0806 23.5322 19.6074C23.1206 20.4319 22.4632 21.1023 21.6553 21.5225C21.1392 21.7908 20.5865 21.9001 19.9746 21.9512C19.3834 22.0005 18.656 22 17.7666 22H6.2334C5.344 22 4.61657 22.0005 4.02539 21.9512C3.41349 21.9001 2.86085 21.7908 2.34473 21.5225C1.53684 21.1023 0.879412 20.4319 0.467773 19.6074C0.204794 19.0806 0.0978515 18.5162 0.0478516 17.8916C-0.000434011 17.2882 -1.15472e-05 16.5455 0 15.6377V13.2119C-9.49703e-05 12.796 -0.00058704 12.4919 0.0410156 12.1885C0.0778423 11.92 0.139908 11.6554 0.224609 11.3984C0.320379 11.108 0.453378 10.8359 0.635742 10.4639L3.11816 5.39648C3.57899 4.45453 3.9152 3.76822 4.43164 3.25195C4.88631 2.79747 5.4345 2.45105 6.03613 2.23926C6.71942 1.99885 7.47153 1.99941 8.50293 2H15.4971ZM8.66016 4.02344C7.40289 4.02344 7.01048 4.0366 6.68164 4.15234C6.35768 4.26639 6.0622 4.45254 5.81738 4.69727C5.56893 4.94568 5.38251 5.29873 4.82031 6.44629L2.59375 10.9902H5.26465C6.394 10.9904 7.42642 11.641 7.93164 12.6719C8.10116 13.0179 8.44809 13.2373 8.82715 13.2373H15.1729C15.5518 13.2372 15.8979 13.0178 16.0674 12.6719C16.5726 11.6408 17.6058 10.9902 18.7354 10.9902H21.4053L19.1797 6.44629C18.6174 5.2985 18.4302 4.94569 18.1816 4.69727C17.9368 4.45258 17.6413 4.26637 17.3174 4.15234C16.9886 4.03673 16.5956 4.02344 15.3389 4.02344H8.66016Z" fill="#9A9A9A"/>
      </g>
      <defs>
        <clipPath id="clip0_3988_6252">
          <rect width="24" height="24" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  `;
}

// Get edit icon SVG
function getEditIconSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  `;
}

// Get delete icon SVG
function getDeleteIconSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  `;
}



// Context menu element reference
let contextMenu = null;
let contextMenuItemId = null;
let bodyContextMenu = null;

// ============================================
// PERFORMANCE: Event Delegation System
// ============================================
// Sets up event listeners once on parent containers instead of on each item
function initEventDelegation() {
  if (eventDelegationInitialized) return;
  eventDelegationInitialized = true;
  
  // ---- Click delegation for items grid ----
  itemsGrid.addEventListener('click', (e) => {
    // Handle move button clicks
    const moveBtn = e.target.closest('.list-item-move-btn');
    if (moveBtn) {
      e.preventDefault();
      e.stopPropagation();
      const itemId = moveBtn.dataset.itemId;
      enterMoveMode(itemId);
      return;
    }
    
    // Handle "Move here" button clicks
    const moveHereBtn = e.target.closest('.list-item-move-here-btn');
    if (moveHereBtn) {
      e.preventDefault();
      e.stopPropagation();
      const folderId = moveHereBtn.dataset.folderId;
      moveItemToTargetFolder(folderId);
      return;
    }
    
    // Handle history delete button
    const historyDeleteBtn = e.target.closest('.history-delete-btn');
    if (historyDeleteBtn) {
      e.stopPropagation();
      const query = historyDeleteBtn.dataset.query;
      removeFromSearchHistory(query);
      performSearch(searchInput.value.trim());
      return;
    }
    
    // Find the clicked list item
    const listItem = e.target.closest('.list-item, .url-item, .suggestion-item, .history-item, .browser-history-item');
    if (!listItem) return;
    
    const itemType = listItem.dataset.type;
    const itemId = listItem.dataset.itemId;
    
    // Handle URL items (direct URL navigation)
    if (listItem.classList.contains('url-item')) {
      const url = listItem.dataset.url;
      navigateToUrl(url);
      return;
    }
    
    // Handle suggestion/history items (search execution)
    if (listItem.classList.contains('suggestion-item') || listItem.classList.contains('history-item')) {
      const suggestionText = listItem.dataset.suggestion;
      if (suggestionText) {
        addToSearchHistory(suggestionText);
        navigateToUrl(`https://www.google.com/search?q=${encodeURIComponent(suggestionText)}`);
      }
      return;
    }
    
    // Handle Chrome page items
    if (listItem.classList.contains('chrome-page-item')) {
      e.preventDefault();
      const href = listItem.getAttribute('href');
      if (href) {
        navigateToUrl(href);
      }
      return;
    }
    
    // Handle browser history items
    if (listItem.classList.contains('browser-history-item')) {
      // Default link behavior handles this
      return;
    }
    
    // Handle Shift+Click for multi-select (only in default mode, works for both folders and links)
    if (e.shiftKey && !isSearchMode && !isInMoveMode()) {
      // Don't allow selecting the Unsorted folder
      if (listItem.dataset.unsorted === 'true') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      toggleItemSelection(itemId, listItem);
      return;
    }
    
    // Handle folder clicks
    if (itemType === 'folder') {
      // If items are selected and clicking without modifier, clear selection
      if (selectedItemIds.size > 0) {
        clearSelection();
      }
      if (isSearchMode) {
        exitSearchMode();
      }
      navigateToFolder(itemId);
      return;
    }
    
    // Handle link clicks
    if (itemType === 'link') {
      // If items are selected and clicking on a selected item without modifier, clear selection
      if (selectedItemIds.size > 0 && !e.shiftKey) {
        clearSelection();
      }
      
      // Handle chrome:// URLs specially - they need to use chrome.tabs API
      const href = listItem.getAttribute('href');
      if (href && href.startsWith('chrome://')) {
        e.preventDefault();
        chrome.tabs.update({ url: href });
      }
      // Regular links handled by default anchor behavior
    }
  });
  
  // ---- Context menu delegation ----
  itemsGrid.addEventListener('contextmenu', (e) => {
    const listItem = e.target.closest('.list-item[data-item-id]');
    if (listItem) {
      e.preventDefault();
      e.stopPropagation();
      if (isInMoveMode()) {
        showBodyContextMenu(e.clientX, e.clientY);
      } else {
        const itemId = listItem.dataset.itemId;
        showContextMenu(e.clientX, e.clientY, itemId);
      }
    }
  });
  
  // ---- Drag and drop delegation ----
  itemsGrid.addEventListener('dragstart', (e) => {
    const draggable = e.target.closest('.list-item.draggable');
    if (draggable) {
      handleDragStart.call(draggable, e);
    }
  });
  
  itemsGrid.addEventListener('dragend', (e) => {
    const draggable = e.target.closest('.list-item.draggable');
    if (draggable) {
      handleDragEnd.call(draggable, e);
    }
  });
  
  itemsGrid.addEventListener('dragover', (e) => {
    const draggable = e.target.closest('.list-item.draggable');
    if (draggable) {
      handleDragOver.call(draggable, e);
    }
  });
  
  itemsGrid.addEventListener('dragenter', (e) => {
    const draggable = e.target.closest('.list-item.draggable');
    if (draggable) {
      handleDragEnter.call(draggable, e);
    }
  });
  
  itemsGrid.addEventListener('dragleave', (e) => {
    const draggable = e.target.closest('.list-item.draggable');
    if (draggable) {
      handleDragLeave.call(draggable, e);
    }
  });
  
  itemsGrid.addEventListener('drop', (e) => {
    const draggable = e.target.closest('.list-item.draggable');
    if (draggable) {
      handleDrop.call(draggable, e);
    }
  });
  
  // Prevent link navigation when dragging
  itemsGrid.addEventListener('click', (e) => {
    if (isDragging) {
      const link = e.target.closest('a.list-item');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true); // Use capture phase
  
  // ---- Breadcrumb delegation ----
  breadcrumb.addEventListener('click', (e) => {
    const breadcrumbItem = e.target.closest('.breadcrumb-item');
    if (breadcrumbItem) {
      const folderId = breadcrumbItem.dataset.folderId;
      navigateToFolder(folderId);
      return;
    }
    
    const currentFolder = e.target.closest('.breadcrumb-current');
    if (currentFolder && !currentFolder.classList.contains('breadcrumb-non-interactive')) {
      startInlineFolderEdit(currentFolder);
    }
  });
  
  // Breadcrumb drag and drop
  breadcrumb.addEventListener('dragover', (e) => {
    const item = e.target.closest('.breadcrumb-item');
    if (item) handleBreadcrumbDragOver.call(item, e);
  });
  
  breadcrumb.addEventListener('dragenter', (e) => {
    const item = e.target.closest('.breadcrumb-item');
    if (item) handleBreadcrumbDragEnter.call(item, e);
  });
  
  breadcrumb.addEventListener('dragleave', (e) => {
    const item = e.target.closest('.breadcrumb-item');
    if (item) handleBreadcrumbDragLeave.call(item, e);
  });
  
  breadcrumb.addEventListener('drop', (e) => {
    const item = e.target.closest('.breadcrumb-item');
    if (item) handleBreadcrumbDrop.call(item, e);
  });
}

// Initialize context menu
function initContextMenu() {
  contextMenu = document.getElementById('context-menu');
  bodyContextMenu = document.getElementById('body-context-menu');
  
  // Open all menu item (for folders or multi-select)
  document.getElementById('context-open-all').addEventListener('click', async () => {
    if (selectedItemIds.size > 1 && contextMenuItemId && selectedItemIds.has(contextMenuItemId)) {
      // Multi-select: open all selected links
      await openSelectedLinks();
    } else if (contextMenuItemId) {
      // Single folder: open all links in folder
      openAllLinksInFolder(contextMenuItemId);
    }
    hideContextMenu();
  });
  
  // Copy link menu item
  document.getElementById('context-copy-link').addEventListener('click', async () => {
    if (contextMenuItemId) {
      const item = items.find(i => i.id === contextMenuItemId);
      if (item && item.type === 'link' && item.url) {
        await copyLinkToClipboard(item.url);
      }
    }
    hideContextMenu();
  });
  
  // Edit menu item
  document.getElementById('context-edit').addEventListener('click', () => {
    if (contextMenuItemId) {
      openEditModal(contextMenuItemId);
    }
    hideContextMenu();
  });
  
  // Move menu item
  document.getElementById('context-move').addEventListener('click', () => {
    if (selectedItemIds.size > 1 && contextMenuItemId && selectedItemIds.has(contextMenuItemId)) {
      // Multi-select: enter move mode with all selected items
      enterMoveModeMultiple(Array.from(selectedItemIds));
    } else if (contextMenuItemId) {
      enterMoveMode(contextMenuItemId);
    }
    hideContextMenu();
  });
  
  // Export menu item (for multi-select)
  document.getElementById('context-export').addEventListener('click', () => {
    if (selectedItemIds.size > 1 && contextMenuItemId && selectedItemIds.has(contextMenuItemId)) {
      exportSelectedLinks();
    }
    hideContextMenu();
  });
  
  // Delete menu item
  document.getElementById('context-delete').addEventListener('click', async () => {
    if (selectedItemIds.size > 1 && contextMenuItemId && selectedItemIds.has(contextMenuItemId)) {
      // Multi-select: show delete confirmation for multiple items
      openDeleteModalMultiple(Array.from(selectedItemIds));
    } else if (contextMenuItemId) {
      const item = items.find(i => i.id === contextMenuItemId);
      if (item && item.type === 'folder') {
        openDeleteModal(contextMenuItemId);
      } else {
        await deleteItem(contextMenuItemId);
      }
    }
    hideContextMenu();
  });
  
  // Body context menu - Open all links in current folder
  document.getElementById('body-context-open-all').addEventListener('click', () => {
    openAllLinksInFolder(currentFolderId);
    hideContextMenu();
  });
  
  // Body context menu - Add bookmark
  document.getElementById('body-context-add').addEventListener('click', () => {
    hideContextMenu();
    openModal();
  });
  
  // Body context menu - Create folder
  document.getElementById('body-context-add-folder').addEventListener('click', () => {
    hideContextMenu();
    openAddFolderModal();
  });
  
  // Body context menu - Import bookmarks
  document.getElementById('body-context-import').addEventListener('click', () => {
    hideContextMenu();
    document.getElementById('import-file-input').click();
  });
  
  // Body context menu - Export bookmarks
  document.getElementById('body-context-export').addEventListener('click', () => {
    hideContextMenu();
    exportBookmarks();
  });
  
  // Body context menu - Theme picker
  document.getElementById('body-context-theme').addEventListener('click', () => {
    hideContextMenu();
    showThemePicker();
  });
  
  // File input change handler for import
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);
  
  // Hide context menu when clicking elsewhere
  document.addEventListener('click', hideContextMenu);
  
  // Show body context menu on right-click on background
  document.body.addEventListener('contextmenu', (e) => {
    // Only show if clicking on body/background, not on cards or modals
    if (e.target === document.body || 
        e.target.classList.contains('container') || 
        e.target.classList.contains('list-view') ||
        e.target.classList.contains('breadcrumb')) {
      e.preventDefault();
      showBodyContextMenu(e.clientX, e.clientY);
    }
  });
}

// Get add button HTML
function getAddButtonHtml() {
  return `
    <div class="add-card" id="add-btn">
      <div class="add-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    </div>
  `;
}

// Get folder preview favicons HTML (up to 5 items)
function getFolderPreviewHtml(folderId) {
  const folderItems = items.filter(item => item.parentId === folderId);
  
  // For unsorted folder, show badge with link count instead of favicons
  if (folderId === UNSORTED_FOLDER_ID) {
    const linkCount = folderItems.filter(item => item.type === 'link').length;
    return `
      <div class="folder-previews">
        <div class="folder-badge">${linkCount}</div>
      </div>
    `;
  }
  
  const previewItems = folderItems.slice(0, 5);
  
  if (previewItems.length === 0) {
    // Show folder icon if empty
    return `
      <div class="folder-previews">
        <div class="folder-icon-placeholder">
          ${getFolderIconSvg()}
        </div>
      </div>
    `;
  }
  
  const favicons = previewItems.map(item => {
    if (item.type === 'link') {
      return `<img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">`;
    } else {
      return `<div class="folder-icon-placeholder">${getFolderIconSvg()}</div>`;
    }
  }).join('');
  
  return `<div class="folder-previews">${favicons}</div>`;
}

// Unsorted folder ID constant
const UNSORTED_FOLDER_ID = 'unsorted-folder';

// Check and delete Unsorted folder if it's empty
function checkAndDeleteUnsortedFolderIfEmpty() {
  const unsortedContents = items.filter(i => i.parentId === UNSORTED_FOLDER_ID);
  if (unsortedContents.length === 0) {
    // Delete the empty Unsorted folder
    items = items.filter(i => i.id !== UNSORTED_FOLDER_ID);
    // If we were inside Unsorted folder, navigate back to root
    if (currentFolderId === UNSORTED_FOLDER_ID) {
      currentFolderId = 'root';
      navigationStack = [];
      renderBreadcrumb();
    }
  }
}

// Render items
function renderItems() {
  const folderItems = getItemsForFolder(currentFolderId);
  
  // Separate folders and links, maintaining their order
  let folders = folderItems.filter(item => item.type === 'folder');
  const links = folderItems.filter(item => item.type === 'link');
  
  // Filter out Unsorted folder and folders being moved when in move mode
  if (isInMoveMode()) {
    folders = folders.filter(f => f.id !== UNSORTED_FOLDER_ID && !movingItemIds.includes(f.id));
  }
  
  renderListView(folders, links);
  
  // PERFORMANCE: Pre-load favicons for visible items in background
  requestIdleCallback ? requestIdleCallback(preloadVisibleFavicons) : setTimeout(preloadVisibleFavicons, 100);
}

// Render list view
function renderListView(folders, links) {
  itemsGrid.className = 'list-view';
  
  let listHtml = '';
  const inMoveMode = isInMoveMode();
  
  // Separate Unsorted folder from other folders
  const unsortedFolder = folders.find(f => f.id === UNSORTED_FOLDER_ID);
  const regularFolders = folders.filter(f => f.id !== UNSORTED_FOLDER_ID);
  
  // Unsorted folder section (not draggable, not editable)
  if (unsortedFolder && !inMoveMode) {
    const linkCount = getLinkCountInFolder(unsortedFolder.id);
    listHtml += '<div class="list-section list-section-unsorted">';
    listHtml += `
      <div class="list-item" draggable="false" data-item-id="${unsortedFolder.id}" data-type="folder" data-unsorted="true">
        <div class="list-item-icon">
          ${getInboxIconSvg()}
        </div>
        <span class="list-item-title">${escapeHtml(unsortedFolder.title)}</span>
        <span class="list-item-meta">${linkCount}</span>
      </div>
    `;
    listHtml += '</div>';
  }
  
  // Regular folders section
  if (regularFolders.length > 0) {
    listHtml += '<div class="list-section">';
    listHtml += regularFolders.map(item => {
      const linkCount = getLinkCountInFolder(item.id);
      const linkText = `${linkCount}`;
      // Show "Move here" button on folders when in move mode (but not for invalid targets)
      let moveHereBtn = '';
      if (inMoveMode) {
        // Check if this folder is a valid move target (not the folder itself or a descendant)
        const isInvalidTarget = movingItemIds.some(movingId => {
          const movingItem = items.find(i => i.id === movingId);
          return movingItem && movingItem.type === 'folder' && isFolderOrDescendant(movingId, item.id);
        });
        if (!isInvalidTarget) {
          moveHereBtn = `<button class="list-item-move-here-btn" data-folder-id="${item.id}">Move here</button>`;
        }
      }
      return `
        <div class="list-item draggable${inMoveMode ? ' move-mode' : ''}" draggable="${!inMoveMode}" data-item-id="${item.id}" data-type="folder">
          <div class="list-item-icon">
            ${getFolderIconSvg()}
          </div>
          <span class="list-item-title">${escapeHtml(item.title)}</span>
          ${moveHereBtn}
          <span class="list-item-meta">${linkText}</span>
        </div>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  // Links section - don't show in move mode (user is navigating folders)
  if (links.length > 0 && !inMoveMode) {
    listHtml += '<div class="list-section">';
    listHtml += links.map(item => {
      // Show move button for links in Unsorted folder
      const showMoveBtn = currentFolderId === UNSORTED_FOLDER_ID;
      const moveBtnHtml = showMoveBtn ? `
        <button class="list-item-move-btn" data-item-id="${item.id}">Move</button>
      ` : '';
      
      return `
        <a class="list-item draggable" draggable="true" href="${escapeHtml(item.url)}" data-item-id="${item.id}" data-type="link">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${escapeHtml(item.title)}</span>
          <span class="list-item-url">${escapeHtml(item.url)}</span>
          ${moveBtnHtml}
        </a>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  itemsGrid.innerHTML = listHtml;
  
  // Event listeners are now handled by event delegation (initEventDelegation)
  // No need to attach individual listeners - improves performance significantly
}

// Open modal for adding
function openModal() {
  // Reset to single input row
  addFormRows.innerHTML = `
    <div class="add-form-inputs" data-row="0">
      <input type="text" class="add-input add-address" placeholder="Address" data-row="0">
      <input type="text" class="add-input add-name" placeholder="Name" data-row="0">
    </div>
  `;
  addRowCount = 1;
  addSubmitBtn.disabled = true;
  setupAddInputListeners();
  addModalOverlay.classList.add('active');
  // Focus after modal animation starts
  setTimeout(() => addFormRows.querySelector('.add-address').focus(), 50);
}

// Setup listeners for add modal inputs
function setupAddInputListeners() {
  const addresses = addFormRows.querySelectorAll('.add-address');
  const names = addFormRows.querySelectorAll('.add-name');
  
  addresses.forEach(input => {
    input.removeEventListener('input', handleAddressInput);
    input.addEventListener('input', handleAddressInput);
  });
  
  names.forEach(input => {
    input.removeEventListener('input', updateAddButtonState);
    input.addEventListener('input', updateAddButtonState);
  });
}

// Handle address input - show new row when typing in first empty address
function handleAddressInput(e) {
  updateAddButtonState();
  
  const input = e.target;
  const rowIndex = parseInt(input.dataset.row);
  const value = input.value.trim();
  
  // Check if this is the last row and user started typing
  if (rowIndex === addRowCount - 1 && value.length > 0) {
    addNewInputRow();
  }
}

// Add a new input row
function addNewInputRow() {
  const newRowIndex = addRowCount;
  const newRow = document.createElement('div');
  newRow.className = 'add-form-inputs';
  newRow.dataset.row = newRowIndex;
  newRow.innerHTML = `
    <input type="text" class="add-input add-address" placeholder="Address" data-row="${newRowIndex}">
    <input type="text" class="add-input add-name" placeholder="Name" data-row="${newRowIndex}">
  `;
  
  addFormRows.appendChild(newRow);
  addRowCount++;
  setupAddInputListeners();
}

// Open modal for editing
function openEditModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  
  editingItemId = itemId;
  modalTitle.textContent = item.type === 'folder' ? 'Edit folder' : 'Edit link';
  
  // Set form values
  itemIdInput.value = item.id;
  itemTypeInput.value = item.type;
  itemTitleInput.value = item.title;
  
  if (item.type === 'link') {
    urlGroup.classList.remove('hidden');
    itemUrlInput.value = item.url || '';
  } else {
    urlGroup.classList.add('hidden');
    itemUrlInput.value = '';
  }
  
  editModalOverlay.classList.add('active');
  
  // Delay focus to ensure modal is visible after transition starts
  setTimeout(() => {
    itemTitleInput.focus();
    itemTitleInput.select();
  }, 50);
}

// Copy link URL to clipboard
async function copyLinkToClipboard(url) {
  try {
    await navigator.clipboard.writeText(url);
    // Optional: Show a brief visual feedback (similar to paste notification)
    showCopyNotification();
  } catch (error) {
    console.error('Failed to copy link:', error);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showCopyNotification();
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  }
}

// Show notification when link is copied
function showCopyNotification() {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  notification.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    <span>Link copied</span>
  `;
  
  document.body.appendChild(notification);
  
  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  // Remove after animation
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Open all links in a folder (direct children only, not nested folders)
async function openAllLinksInFolder(folderId) {
  // Get the folder to get its title (root folder is a special case)
  let folderTitle = 'Home';
  if (folderId !== 'root') {
    const folder = items.find(item => item.id === folderId && item.type === 'folder');
    if (!folder) return;
    folderTitle = folder.title || 'Untitled';
  }
  
  // Get direct child links only (not links in nested folders)
  const directLinks = items.filter(item => item.parentId === folderId && item.type === 'link');
  
  if (directLinks.length === 0) {
    return;
  }
  
  // Create tabs for each link and collect their IDs
  const tabIds = [];
  for (const link of directLinks) {
    if (link.url) {
      try {
        const tab = await chrome.tabs.create({ url: link.url, active: false });
        tabIds.push(tab.id);
      } catch (error) {
        console.error('Error creating tab:', error);
      }
    }
  }
  
  // Group all tabs together with the folder's name
  if (tabIds.length > 0) {
    try {
      const groupId = await chrome.tabs.group({ tabIds: tabIds });
      // Small delay to ensure group is fully created before updating
      await new Promise(resolve => setTimeout(resolve, 100));
      await chrome.tabGroups.update(groupId, { 
        title: folderTitle,
        collapsed: false 
      });
    } catch (error) {
      console.error('Error creating tab group:', error);
    }
  }
}

// Open all selected links (for multi-select)
async function openSelectedLinks() {
  const selectedLinks = items.filter(item => selectedItemIds.has(item.id) && item.type === 'link');
  
  if (selectedLinks.length === 0) return;
  
  // Create tabs for each link and collect their IDs
  const tabIds = [];
  for (const link of selectedLinks) {
    if (link.url) {
      try {
        const tab = await chrome.tabs.create({ url: link.url, active: false });
        tabIds.push(tab.id);
      } catch (error) {
        console.error('Error creating tab:', error);
      }
    }
  }
  
  // Group all tabs together
  if (tabIds.length > 0) {
    try {
      const groupId = await chrome.tabs.group({ tabIds: tabIds });
      await new Promise(resolve => setTimeout(resolve, 100));
      await chrome.tabGroups.update(groupId, { 
        title: `${selectedLinks.length} links`,
        collapsed: false 
      });
    } catch (error) {
      console.error('Error creating tab group:', error);
    }
  }
  
  // Clear selection after opening
  clearSelection();
}

// Export selected items (links and folders) to HTML file
function exportSelectedLinks() {
  const selectedItems = items.filter(item => selectedItemIds.has(item.id));
  
  if (selectedItems.length === 0) return;
  
  const selectedLinks = selectedItems.filter(item => item.type === 'link');
  const selectedFolders = selectedItems.filter(item => item.type === 'folder');
  
  const timestamp = Math.floor(Date.now() / 1000);
  
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">Selected Bookmarks</H3>
    <DL><p>
`;

  // Export selected folders (with their contents)
  for (const folder of selectedFolders) {
    html += `        <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(folder.title)}</H3>\n`;
    html += `        <DL><p>\n`;
    html += exportFolderContents(folder.id, 3);
    html += `        </DL><p>\n`;
  }

  // Export selected links
  for (const link of selectedLinks) {
    html += `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${timestamp}">${escapeHtml(link.title)}</A>\n`;
  }
  
  html += `    </DL><p>
</DL><p>
`;

  // Create and download file
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date();
  const dateStr = `${date.getMonth() + 1}_${date.getDate()}_${String(date.getFullYear()).slice(-2)}`;
  a.download = `bookmarks_selected_${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  // Build notification message
  let notificationMsg = '';
  if (selectedFolders.length > 0 && selectedLinks.length > 0) {
    notificationMsg = `${selectedFolders.length} folder${selectedFolders.length > 1 ? 's' : ''} and ${selectedLinks.length} link${selectedLinks.length > 1 ? 's' : ''}`;
  } else if (selectedFolders.length > 0) {
    notificationMsg = `${selectedFolders.length} folder${selectedFolders.length > 1 ? 's' : ''}`;
  } else {
    notificationMsg = `${selectedLinks.length} link${selectedLinks.length > 1 ? 's' : ''}`;
  }
  showExportNotification(notificationMsg);
  
  // Clear selection after export
  clearSelection();
}

// Show context menu at position
function showContextMenu(x, y, itemId) {
  hideContextMenu(); // Hide any open context menu first
  
  // Check if right-clicked item is part of a multi-selection
  const isMultiSelect = selectedItemIds.size > 1 && selectedItemIds.has(itemId);
  
  // If right-clicking on a non-selected item, clear selection and use just this item
  if (!selectedItemIds.has(itemId) && selectedItemIds.size > 0) {
    clearSelection();
  }
  
  contextMenuItemId = itemId;
  
  // Show/hide options based on item type and selection
  const item = items.find(i => i.id === itemId);
  const openAllBtn = document.getElementById('context-open-all');
  const copyLinkBtn = document.getElementById('context-copy-link');
  const moveBtn = document.getElementById('context-move');
  const exportBtn = document.getElementById('context-export');
  const editBtn = document.getElementById('context-edit');
  const deleteBtn = document.getElementById('context-delete');
  
  // Check if it's the Unsorted folder
  const isUnsortedFolder = itemId === UNSORTED_FOLDER_ID;
  
  if (isMultiSelect) {
    // Multi-select mode: show bulk actions (Move, Export, Delete only)
    // Check if any selected items are links (for Open all option)
    const selectedItems = items.filter(i => selectedItemIds.has(i.id));
    const hasLinks = selectedItems.some(i => i.type === 'link');
    
    openAllBtn.textContent = 'Open all';
    openAllBtn.style.display = hasLinks ? 'flex' : 'none'; // Only show if there are links
    copyLinkBtn.style.display = 'none'; // Can't copy multiple items
    moveBtn.textContent = 'Move';
    moveBtn.style.display = 'flex';
    exportBtn.textContent = 'Export';
    exportBtn.style.display = 'flex';
    editBtn.style.display = 'none'; // Can't edit multiple items
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.display = 'flex';
  } else if (item && item.type === 'link') {
    openAllBtn.textContent = 'Open all';
    openAllBtn.style.display = 'none';
    copyLinkBtn.style.display = 'flex';
    moveBtn.textContent = 'Move';
    // Show move option for all links
    moveBtn.style.display = 'flex';
    exportBtn.style.display = 'none'; // Hide export for single link
    editBtn.style.display = 'flex';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.display = 'flex';
  } else if (item && item.type === 'folder') {
    // Show "Open all" only for folders that have links inside
    const folderHasLinks = items.some(i => i.parentId === itemId && i.type === 'link');
    openAllBtn.textContent = 'Open all';
    openAllBtn.style.display = folderHasLinks ? 'flex' : 'none';
    copyLinkBtn.style.display = 'none';
    moveBtn.textContent = 'Move';
    // Show move option for folders (except Unsorted folder)
    moveBtn.style.display = isUnsortedFolder ? 'none' : 'flex';
    exportBtn.style.display = 'none'; // Hide export for folders
    // Hide edit for Unsorted folder (name is fixed), but allow delete
    editBtn.style.display = isUnsortedFolder ? 'none' : 'flex';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.display = 'flex';
  } else {
    openAllBtn.textContent = 'Open all';
    openAllBtn.style.display = 'none';
    copyLinkBtn.style.display = 'none';
    moveBtn.textContent = 'Move';
    moveBtn.style.display = 'none';
    exportBtn.style.display = 'none';
    editBtn.style.display = 'flex';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.display = 'flex';
  }
  
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.add('active');
  
  // Adjust position if menu goes off screen
  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

// Show body context menu at position
function showBodyContextMenu(x, y) {
  hideContextMenu(); // Hide any open context menu first
  
  // When in move mode, only show "Create folder" option
  const inMoveMode = isInMoveMode();
  
  // Check if current folder has any direct links (for root folder, parentId is 'root')
  const hasLinks = items.some(item => item.parentId === currentFolderId && item.type === 'link');
  
  // Show "Open all" option only if folder has links and not in move mode
  const openAllBtn = document.getElementById('body-context-open-all');
  const openAllSeparator = document.getElementById('body-context-open-all-separator');
  const showOpenAll = hasLinks && !inMoveMode;
  openAllBtn.style.display = showOpenAll ? 'flex' : 'none';
  openAllSeparator.style.display = showOpenAll ? 'block' : 'none';
  
  document.getElementById('body-context-add').style.display = inMoveMode ? 'none' : 'flex';
  document.getElementById('body-context-import').style.display = inMoveMode ? 'none' : 'flex';
  
  // Hide export when no bookmarks exist
  const hasAnyBookmarks = getTotalBookmarkCount() > 0;
  document.getElementById('body-context-export').style.display = (!inMoveMode && hasAnyBookmarks) ? 'flex' : 'none';
  // Hide other separators in move mode too (except the open-all separator which is handled above)
  const separators = bodyContextMenu.querySelectorAll('.context-menu-separator:not(#body-context-open-all-separator)');
  separators.forEach(separator => {
    separator.style.display = inMoveMode ? 'none' : 'block';
  });
  
  // Update export button text
  const exportBtn = document.getElementById('body-context-export');
  exportBtn.textContent = 'Export';
  
  bodyContextMenu.style.left = `${x}px`;
  bodyContextMenu.style.top = `${y}px`;
  bodyContextMenu.classList.add('active');
  
  // Adjust position if menu goes off screen
  const rect = bodyContextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    bodyContextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    bodyContextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

// Hide context menu
function hideContextMenu() {
  if (contextMenu) {
    contextMenu.classList.remove('active');
    contextMenuItemId = null;
  }
  if (bodyContextMenu) {
    bodyContextMenu.classList.remove('active');
  }
}

// Open delete confirmation modal
function openDeleteModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  
  deletingItemId = itemId;
  deletingItemIds = [itemId]; // Single item
  
  // Update modal title for single item
  const modalTitle = document.querySelector('#delete-modal-overlay .modal-title');
  if (modalTitle) {
    modalTitle.textContent = item.type === 'folder' ? 'Delete folder' : 'Delete bookmark';
  }
  deleteItemName.textContent = item.title;
  deleteModalOverlay.classList.add('active');
  
  // Focus delete button for keyboard accessibility
  setTimeout(() => deleteConfirmBtn.focus(), 50);
}

// Close delete modal
function closeDeleteModal() {
  deleteModalOverlay.classList.remove('active');
  deletingItemId = null;
  deletingItemIds = [];
}

// Open delete confirmation modal for multiple items
function openDeleteModalMultiple(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  
  deletingItemIds = itemIds;
  deletingItemId = itemIds[0]; // Use first item as primary for compatibility
  
  // Update modal text for multiple items
  const modalTitle = document.querySelector('#delete-modal-overlay .modal-title');
  if (modalTitle) {
    modalTitle.textContent = `Delete ${itemIds.length} items`;
  }
  deleteItemName.textContent = `${itemIds.length} items`;
  
  deleteModalOverlay.classList.add('active');
  
  // Focus delete button for keyboard accessibility
  setTimeout(() => deleteConfirmBtn.focus(), 50);
}

// Check if we're in move mode
function isInMoveMode() {
  return movingItemId !== null;
}

// Enter move mode
function enterMoveMode(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  
  movingItemId = itemId;
  movingItemIds = [itemId];
  moveModePreviousFolderId = currentFolderId;
  
  // Update banner UI
  updateMoveBanner();
  moveBanner.classList.add('active');
  document.body.classList.add('move-mode-active');
  
  // Navigate to root to let user browse folders
  navigateToFolder('root');
}

// Enter move mode with multiple items
function enterMoveModeMultiple(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  
  movingItemIds = itemIds;
  movingItemId = itemIds[0]; // Use first item as primary for compatibility
  moveModePreviousFolderId = currentFolderId;
  
  // Update banner UI
  updateMoveBannerMultiple();
  moveBanner.classList.add('active');
  document.body.classList.add('move-mode-active');
  
  // Clear selection as we're now in move mode
  clearSelection();
  
  // Navigate to root to let user browse folders
  navigateToFolder('root');
}

// Exit move mode
function exitMoveMode(stayInCurrentFolder = false) {
  moveBanner.classList.remove('active');
  document.body.classList.remove('move-mode-active');
  
  // Return to unsorted folder if not staying in current folder
  if (!stayInCurrentFolder && moveModePreviousFolderId) {
    // Check if unsorted folder still has items
    const unsortedContents = items.filter(i => i.parentId === UNSORTED_FOLDER_ID);
    if (unsortedContents.length > 0) {
      navigateToFolder(moveModePreviousFolderId);
    }
  }
  
  movingItemId = null;
  movingItemIds = [];
  moveModePreviousFolderId = null;
  renderItems();
}

// Update move banner text and icon
function updateMoveBanner() {
  // Check if we're moving multiple items
  if (movingItemIds.length > 1) {
    updateMoveBannerMultiple();
    return;
  }
  
  const item = items.find(i => i.id === movingItemId);
  if (!item) return;
  
  // Set the icon (favicon for links)
  if (item.type === 'link') {
    moveBannerIcon.innerHTML = `<img src="${getFaviconUrl(item.url)}" alt="">`;
  } else {
    moveBannerIcon.innerHTML = getFolderIconSvg();
  }
  
  // Get current folder name for the text
  let folderName = 'Home';
  if (currentFolderId !== 'root') {
    const folder = getFolderById(currentFolderId);
    if (folder) {
      folderName = folder.title;
    }
  }
  
  moveBannerText.textContent = `Move ${item.title} to ${folderName}`;
}

// Update move banner for multiple items
function updateMoveBannerMultiple() {
  // Set the icon to show count
  moveBannerIcon.innerHTML = `<span style="font-weight: 600; font-size: 14px;">${movingItemIds.length}</span>`;
  
  // Get current folder name for the text
  let folderName = 'Home';
  if (currentFolderId !== 'root') {
    const folder = getFolderById(currentFolderId);
    if (folder) {
      folderName = folder.title;
    }
  }
  
  moveBannerText.textContent = `Move ${movingItemIds.length} items to ${folderName}`;
}

// Move item to target folder
async function moveItemToTargetFolder(targetFolderId) {
  // Handle multiple items if present
  const itemIdsToMove = movingItemIds.length > 0 ? movingItemIds : (movingItemId ? [movingItemId] : []);
  if (itemIdsToMove.length === 0) return;
  
  // Validate: prevent moving a folder into itself or a descendant
  for (const itemId of itemIdsToMove) {
    const item = items.find(i => i.id === itemId);
    if (item && item.type === 'folder') {
      if (isFolderOrDescendant(itemId, targetFolderId)) {
        showNotification('Cannot move a folder into itself or a subfolder');
        return;
      }
    }
  }
  
  saveStateForUndo();
  
  // Track if any item came from Unsorted folder
  let hadUnsortedItem = false;
  
  // Get current max order in target folder
  const targetFolderItems = items.filter(i => i.parentId === targetFolderId);
  let maxOrder = targetFolderItems.length > 0 
    ? Math.max(...targetFolderItems.map(i => i.order ?? 0))
    : -1;
  
  // Move all items
  for (const itemId of itemIdsToMove) {
    const item = items.find(i => i.id === itemId);
    if (!item) continue;
    
    // Check if coming from Unsorted folder
    if (item.parentId === UNSORTED_FOLDER_ID) {
      hadUnsortedItem = true;
    }
    
    // Update the item's parent
    item.parentId = targetFolderId;
    item.order = ++maxOrder;
  }
  
  // Check if Unsorted folder is now empty and should be deleted
  if (hadUnsortedItem) {
    checkAndDeleteUnsortedFolderIfEmpty();
  }
  
  await saveItems();
  
  // Check if unsorted folder still has items
  const unsortedContents = items.filter(i => i.parentId === UNSORTED_FOLDER_ID);
  const hasRemainingItems = unsortedContents.length > 0;
  
  // Exit move mode
  moveBanner.classList.remove('active');
  document.body.classList.remove('move-mode-active');
  
  movingItemId = null;
  movingItemIds = [];
  moveModePreviousFolderId = null;
  
  // Return to unsorted folder if there are remaining items
  if (hasRemainingItems) {
    navigateToFolder(UNSORTED_FOLDER_ID);
  } else {
    renderItems();
  }
}

// Search functionality
async function enterSearchMode(initialChar = '') {
  // Clear selection when entering search mode
  clearSelection();
  
  isSearchMode = true;
  searchQuery = initialChar;
  originalSearchQuery = initialChar; // Initialize original query
  searchBar.classList.add('active');
  document.body.classList.add('search-active');
  searchInput.value = initialChar;
  searchInput.focus();
  
  // Start with search icon (will be updated to Google if no matches)
  setSearchIcon('search');
  
  // Place cursor at end of input
  searchInput.selectionStart = searchInput.selectionEnd = initialChar.length;
  
  await renderSearchResults();
  
  // Auto-focus first item in search mode (if there are items)
  if (initialChar) {
    const navigableItems = getNavigableItems();
    if (navigableItems.length > 0) {
      focusItem(0);
    }
  }
}

function exitSearchMode() {
  isSearchMode = false;
  searchQuery = '';
  originalSearchQuery = ''; // Clear original query when exiting search
  searchBar.classList.remove('active');
  document.body.classList.remove('search-active');
  searchInput.value = '';
  
  // Reset search icon to default
  setSearchIcon('search');
  
  // Reset keyboard focus
  resetKeyboardFocus();
  
  // Re-render normal view
  renderItems();
  renderBreadcrumb();
}

// Search all items recursively
function searchAllItems(query) {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return { folders: [], links: [], chromePages: [] };
  
  const matchedFolders = [];
  const matchedLinks = [];
  
  // Search through all items
  items.forEach(item => {
    const titleMatch = item.title.toLowerCase().includes(normalizedQuery);
    const urlMatch = item.type === 'link' && item.url && item.url.toLowerCase().includes(normalizedQuery);
    
    if (titleMatch || urlMatch) {
      if (item.type === 'folder') {
        // In move mode, filter out the Unsorted folder and folders being moved from search results
        if (!isInMoveMode() || (item.id !== UNSORTED_FOLDER_ID && !movingItemIds.includes(item.id))) {
          matchedFolders.push(item);
        }
      } else {
        // In move mode, don't show links in search results
        if (!isInMoveMode()) {
          matchedLinks.push(item);
        }
      }
    }
  });
  
  // Sort by order
  matchedFolders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  matchedLinks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  
  // Search Chrome internal pages (not in move mode)
  const matchedChromePages = isInMoveMode() ? [] : searchChromePages(normalizedQuery);
  
  return { folders: matchedFolders, links: matchedLinks, chromePages: matchedChromePages };
}

// Highlight matching text
function highlightMatch(text, query) {
  // Highlighting removed - just return escaped text
  return escapeHtml(text);
}

// Search browser history
async function searchBrowserHistory(query) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  // Check if chrome.history API is available
  if (!chrome.history) {
    console.warn('chrome.history API is not available. Make sure the "history" permission is granted.');
    return [];
  }
  
  try {
    const results = await chrome.history.search({
      text: query,
      maxResults: 8,
      startTime: 0 // Search all history
    });
    
    console.log('Browser history search results for "' + query + '":', results);
    
    // Filter out duplicates with saved bookmarks and format results
    const savedUrls = new Set(items.filter(i => i.type === 'link').map(i => i.url.toLowerCase()));
    
    const filtered = results
      .filter(item => item.url && !savedUrls.has(item.url.toLowerCase()))
      .map(item => ({
        title: item.title || new URL(item.url).hostname, // Use hostname if no title
        url: item.url,
        visitCount: item.visitCount,
        lastVisitTime: item.lastVisitTime
      }));
    
    console.log('Filtered browser history:', filtered);
    return filtered;
  } catch (error) {
    console.error('Error searching browser history:', error);
    return [];
  }
}

// Fetch Google autocomplete suggestions
let suggestionsAbortController = null;

async function fetchGoogleSuggestions(query) {
  // Cancel any pending request
  if (suggestionsAbortController) {
    suggestionsAbortController.abort();
  }
  
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  suggestionsAbortController = new AbortController();
  
  try {
    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`,
      { signal: suggestionsAbortController.signal }
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    // Response format: [query, [suggestions], ...]
    return data[1] || [];
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.log('Could not fetch suggestions:', error.message);
    }
    return [];
  }
}

// Track current search request to avoid race conditions
let currentSearchId = 0;

// Render search results
async function renderSearchResults() {
  const { folders, links, chromePages } = searchAllItems(searchQuery);
  
  itemsGrid.className = 'list-view';
  
  const thisSearchId = ++currentSearchId;
  const currentQuery = searchQuery.trim();
  
  // Get matching search history
  const historyMatches = getMatchingSearchHistory(currentQuery);
  
  // Always render matched items first (if any), then suggestions below
  if (folders.length > 0 || links.length > 0 || chromePages.length > 0) {
    // Render items immediately with initial suggestions
    renderSearchResultsWithItems(folders, links, searchQuery, [currentQuery], historyMatches, [], chromePages);
    
    // Fetch Google suggestions and browser history in background
    const [googleSuggestions, browserHistory] = await Promise.all([
      fetchGoogleSuggestions(currentQuery),
      searchBrowserHistory(currentQuery)
    ]);
    
    // Check if this is still the current search (user may have typed more)
    if (thisSearchId !== currentSearchId || !isSearchMode) {
      return;
    }
    
    // Re-check matches in case they changed
    const { folders: newFolders, links: newLinks, chromePages: newChromePages } = searchAllItems(searchQuery);
    const freshHistoryMatches = getMatchingSearchHistory(searchQuery.trim());
    
    // Build suggestions list
    const userQuery = searchQuery.trim();
    const allSuggestions = [userQuery];
    
    for (const suggestion of googleSuggestions) {
      if (suggestion.toLowerCase() !== userQuery.toLowerCase() && allSuggestions.length < 8) {
        allSuggestions.push(suggestion);
      }
    }
    
    // Re-render with Google suggestions and browser history
    if (newFolders.length > 0 || newLinks.length > 0 || newChromePages.length > 0) {
      renderSearchResultsWithItems(newFolders, newLinks, searchQuery, allSuggestions, freshHistoryMatches, browserHistory, newChromePages);
    }
    return;
  }
  
  // No item results - show browser history, search history, and Google suggestions
  // Immediately show user's query and history matches
  const existingFirstItem = itemsGrid.querySelector('.suggestion-item[data-index="0"], .history-item[data-index="0"]');
  if (existingFirstItem && historyMatches.length === 0) {
    existingFirstItem.dataset.suggestion = currentQuery;
    const titleEl = existingFirstItem.querySelector('.list-item-title');
    if (titleEl) titleEl.textContent = currentQuery;
  } else {
    // Show history matches immediately with user's query
    renderSuggestions([currentQuery], currentQuery, historyMatches, []);
  }
  
  // Fetch Google suggestions and browser history in background
  const [googleSuggestions, browserHistory] = await Promise.all([
    fetchGoogleSuggestions(currentQuery),
    searchBrowserHistory(currentQuery)
  ]);
  
  // Check if this is still the current search (user may have typed more)
  if (thisSearchId !== currentSearchId) {
    return;
  }
  
  // Re-check if we're still in the same search state
  if (!isSearchMode) {
    return;
  }
  
  const { folders: newFolders, links: newLinks } = searchAllItems(searchQuery);
  if (newFolders.length > 0 || newLinks.length > 0) {
    return;
  }
  
  // Get fresh history matches
  const freshHistoryMatches = getMatchingSearchHistory(searchQuery.trim());
  
  // Build suggestions list: user's query first, then Google suggestions (excluding duplicates)
  const userQuery = searchQuery.trim();
  const allSuggestions = [userQuery];
  
  for (const suggestion of googleSuggestions) {
    if (suggestion.toLowerCase() !== userQuery.toLowerCase() && allSuggestions.length < 8) {
      allSuggestions.push(suggestion);
    }
  }
  
  renderSuggestions(allSuggestions, userQuery, freshHistoryMatches, browserHistory);
}

// Helper function to render suggestions
function renderSuggestions(suggestions, query, historyMatches = [], browserHistory = []) {
  // Check if the query is a URL
  const queryIsUrl = isUrl(query);
  
  // Set search bar icon based on whether query is a URL
  setSearchIcon(queryIsUrl ? 'globe' : 'google');
  
  // Get history icon SVG (for search history)
  const historyIconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  `;
  
  // Get search icon SVG
  const searchIconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  `;
  
  let listHtml = '';
  let itemIndex = 0;
  
  // Build combined suggestions: current query first, then Google suggestions (limit 6), then search history
  let allItems = [];
  
  // If query is a URL, add URL item first
  if (queryIsUrl) {
    const normalizedUrl = normalizeUrl(query);
    allItems.push({
      type: 'url',
      text: query,
      url: normalizedUrl,
      index: itemIndex++
    });
  }
  
  // First: add user's current query (always first for search suggestions, but after URL if present)
  const userQuery = suggestions[0];
  if (userQuery && !queryIsUrl) {
    allItems.push({
      type: 'suggestion',
      text: userQuery,
      index: itemIndex++
    });
  }
  
  // Second: add Google suggestions (limit to 7)
  let googleCount = 0;
  suggestions.slice(queryIsUrl ? 0 : 1).forEach(suggestion => {
    const isDuplicateWithHistory = historyMatches.some(h => h.toLowerCase() === suggestion.toLowerCase());
    const isDuplicateWithQuery = queryIsUrl && suggestion.toLowerCase() === query.toLowerCase();
    if (!isDuplicateWithHistory && !isDuplicateWithQuery && googleCount < 7) {
      allItems.push({
        type: 'suggestion',
        text: suggestion,
        index: itemIndex++
      });
      googleCount++;
    }
  });
  
  // Third: add search history matches (excluding user's current query)
  historyMatches.forEach(historyItem => {
    if (historyItem.toLowerCase() !== userQuery?.toLowerCase()) {
      allItems.push({
        type: 'history',
        text: historyItem,
        index: itemIndex++
      });
    }
  });
  
  // Browser history section (visited pages) - shown above Google suggestions
  if (browserHistory.length > 0) {
    listHtml += '<div class="list-section browser-history-section">';
    listHtml += browserHistory.map(item => {
      const idx = itemIndex++;
      const visitTime = formatVisitTime(item.lastVisitTime);
      return `
        <a class="list-item browser-history-item" href="${escapeHtml(item.url)}" data-index="${idx}" data-type="browser-history">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${highlightMatch(item.title, query)}</span>
          <span class="list-item-meta">${visitTime}</span>
        </a>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  if (allItems.length > 0) {
    listHtml += `
      <div class="list-section suggestions-section">
        ${allItems.map((item, idx) => {
          if (item.type === 'url') {
            return `
              <div class="list-item url-item" 
                   data-url="${escapeHtml(item.url)}" 
                   data-index="${item.index}"
                   data-type="url">
                <div class="list-item-icon">
                  <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
                </div>
                <span class="list-item-title">${escapeHtml(item.text)}</span>
              </div>
            `;
          }
          return `
            <div class="list-item ${item.type === 'history' ? 'history-item' : 'suggestion-item'}" 
                 data-suggestion="${escapeHtml(item.text)}" 
                 data-index="${item.index}"
                 data-type="${item.type}">
              <div class="list-item-icon">
                ${item.type === 'history' ? historyIconSvg : searchIconSvg}
              </div>
              <span class="list-item-title">${item.index === 0 && item.type === 'suggestion' ? escapeHtml(item.text) : highlightMatch(item.text, query)}</span>
              ${item.type === 'history' ? `
                <button class="history-delete-btn" data-query="${escapeHtml(item.text)}">Delete</button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  itemsGrid.innerHTML = listHtml;
  
  // Event listeners are now handled by event delegation (initEventDelegation)
  // Auto-focus first item
  focusItem(0);
}

// Render search results with matching items (folders/links) and suggestions below
function renderSearchResultsWithItems(folders, links, query, suggestions = [], historyMatches = [], browserHistory = [], chromePages = []) {
  // Check if the query is a URL
  const queryIsUrl = isUrl(query);
  
  // Set search bar icon based on whether query is URL or we have suggestions
  const hasSuggestions = suggestions.length > 0;
  if (queryIsUrl) {
    setSearchIcon('globe');
  } else {
    setSearchIcon(hasSuggestions ? 'google' : 'search');
  }
  
  let listHtml = '';
  const inMoveMode = isInMoveMode();
  
  // URL item section - show FIRST when query is a URL (before folders and bookmarks)
  let urlItemIndexOffset = 0;
  if (queryIsUrl && !inMoveMode) {
    const normalizedUrl = normalizeUrl(query);
    listHtml += `
      <div class="list-section url-section">
        <div class="list-item url-item" 
             data-url="${escapeHtml(normalizedUrl)}" 
             data-index="0"
             data-type="url">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(normalizedUrl)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${escapeHtml(query)}</span>
        </div>
      </div>
    `;
    urlItemIndexOffset = 1; // Offset subsequent indices by 1
  }
  
  // Folders section
  if (folders.length > 0) {
    listHtml += '<div class="list-section">';
    listHtml += folders.map(item => {
      const linkCount = getLinkCountInFolder(item.id);
      const highlightedTitle = highlightMatch(item.title, query);
      const isUnsorted = item.id === UNSORTED_FOLDER_ID;
      
      // Show "Move here" button on folders when in move mode (but not for invalid targets)
      let moveHereBtn = '';
      if (inMoveMode) {
        // Check if this folder is a valid move target (not the folder itself or a descendant)
        const isInvalidTarget = movingItemIds.some(movingId => {
          const movingItem = items.find(i => i.id === movingId);
          return movingItem && movingItem.type === 'folder' && isFolderOrDescendant(movingId, item.id);
        });
        if (!isInvalidTarget) {
          moveHereBtn = `<button class="list-item-move-here-btn" data-folder-id="${item.id}">Move here</button>`;
        }
      }
      
      return `
        <div class="list-item${inMoveMode ? ' move-mode' : ''}" data-item-id="${item.id}" data-type="folder"${isUnsorted ? ' data-unsorted="true"' : ''}>
          <div class="list-item-icon">
            ${isUnsorted ? getInboxIconSvg() : getFolderIconSvg()}
          </div>
          <span class="list-item-title">${highlightedTitle}</span>
          ${moveHereBtn}
          <span class="list-item-meta">${linkCount}</span>
        </div>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  // Links section (not shown in move mode)
  if (links.length > 0 && !inMoveMode) {
    listHtml += '<div class="list-section">';
    listHtml += links.map(item => {
      const highlightedTitle = highlightMatch(item.title, query);
      
      return `
        <a class="list-item" href="${escapeHtml(item.url)}" data-item-id="${item.id}" data-type="link">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${highlightedTitle}</span>
          <span class="list-item-url">${escapeHtml(item.url)}</span>
        </a>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  // Chrome internal pages section (not shown in move mode)
  if (chromePages.length > 0 && !inMoveMode) {
    listHtml += '<div class="list-section chrome-pages-section">';
    listHtml += chromePages.map(page => {
      const highlightedTitle = highlightMatch(page.title, query);
      
      return `
        <a class="list-item chrome-page-item" href="${escapeHtml(page.url)}" data-type="chrome-page">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(page.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${highlightedTitle}</span>
          <span class="list-item-url">${escapeHtml(page.url)}</span>
        </a>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  // Suggestions section - always show below matched items
  if ((hasSuggestions || queryIsUrl) && !inMoveMode) {
    // Get history icon SVG (for search history)
    const historyIconSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    `;
    
    // Get search icon SVG
    const searchIconSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
    `;
    
    // Calculate starting index after URL item (if present), folders, links, and Chrome pages
    const itemStartIndex = urlItemIndexOffset + folders.length + links.length + chromePages.length;
    
    // Build combined suggestions: current query first, then Google suggestions (limit 6), then search history
    let allItems = [];
    let itemIndex = itemStartIndex;
    
    // URL item is already shown at the top, so skip adding it here
    
    // First: add user's current query (always first in suggestions for non-URL queries)
    const userQuery = suggestions[0];
    if (userQuery && !queryIsUrl) {
      allItems.push({
        type: 'suggestion',
        text: userQuery,
        index: itemIndex++
      });
    }
    
    // Second: add Google suggestions (limit to 7)
    let googleCount = 0;
    suggestions.slice(queryIsUrl ? 0 : 1).forEach(suggestion => {
      const isDuplicateWithHistory = historyMatches.some(h => h.toLowerCase() === suggestion.toLowerCase());
      const isDuplicateWithQuery = queryIsUrl && suggestion.toLowerCase() === query.toLowerCase();
      if (!isDuplicateWithHistory && !isDuplicateWithQuery && googleCount < 7) {
        allItems.push({
          type: 'suggestion',
          text: suggestion,
          index: itemIndex++
        });
        googleCount++;
      }
    });
    
    // Third: add search history matches (excluding user's current query)
    historyMatches.forEach(historyItem => {
      if (historyItem.toLowerCase() !== userQuery?.toLowerCase()) {
        allItems.push({
          type: 'history',
          text: historyItem,
          index: itemIndex++
        });
      }
    });
    
    // Browser history section (visited pages, not shown in move mode) - shown above Google suggestions
    if (browserHistory.length > 0 && !inMoveMode) {
      listHtml += '<div class="list-section browser-history-section">';
      listHtml += browserHistory.map((item, idx) => {
        const highlightedTitle = highlightMatch(item.title, query);
        const browserItemIndex = itemIndex++;
        const visitTime = formatVisitTime(item.lastVisitTime);
        
        return `
          <a class="list-item browser-history-item" href="${escapeHtml(item.url)}" data-index="${browserItemIndex}" data-type="browser-history">
            <div class="list-item-icon">
              <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
            </div>
            <span class="list-item-title">${highlightedTitle}</span>
            <span class="list-item-meta">${visitTime}</span>
          </a>
        `;
      }).join('');
      listHtml += '</div>';
    }
    
    if (allItems.length > 0) {
      listHtml += `
        <div class="list-section suggestions-section">
          ${allItems.map((item, idx) => {
            return `
              <div class="list-item ${item.type === 'history' ? 'history-item' : 'suggestion-item'}" 
                   data-suggestion="${escapeHtml(item.text)}" 
                   data-index="${item.index}"
                   data-type="${item.type}">
                <div class="list-item-icon">
                  ${item.type === 'history' ? historyIconSvg : searchIconSvg}
                </div>
                <span class="list-item-title">${idx === 0 && item.type === 'suggestion' ? escapeHtml(item.text) : highlightMatch(item.text, query)}</span>
                ${item.type === 'history' ? `
                  <button class="history-delete-btn" data-query="${escapeHtml(item.text)}">Delete</button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }
  
  itemsGrid.innerHTML = listHtml;
  
  // Event listeners are now handled by event delegation (initEventDelegation)
  
  // Auto-focus first item if there are any
  const navigableItems = getNavigableItems();
  if (navigableItems.length > 0) {
    focusItem(0);
  }
}

// Search execution (renders results and focuses first item)
async function executeSearch() {
  await renderSearchResults();
  
  // Auto-focus first item in search mode (if there are items)
  const navigableItems = getNavigableItems();
  if (navigableItems.length > 0) {
    focusItem(0);
  } else {
    resetKeyboardFocus();
  }
}

// Debounced search (150ms delay)
const debouncedSearch = debounce(executeSearch, 150);

// Handle search input changes
function handleSearchInput(e) {
  searchQuery = e.target.value;
  // Save original query when user types (not when we programmatically update it)
  originalSearchQuery = searchQuery;
  
  // Exit search mode if query is empty
  if (!searchQuery) {
    exitSearchMode();
    return;
  }
  
  // Debounced search results rendering
  debouncedSearch();
}

// Close add modal
function closeAddModal() {
  addModalOverlay.classList.remove('active');
  // Reset will happen on next open
}

// Open add folder modal
function openAddFolderModal() {
  folderNameInput.value = '';
  addFolderSubmitBtn.disabled = true;
  addFolderModalOverlay.classList.add('active');
  setTimeout(() => folderNameInput.focus(), 50);
}

// Close add folder modal
function closeAddFolderModal() {
  addFolderModalOverlay.classList.remove('active');
  folderNameInput.value = '';
  addFolderSubmitBtn.disabled = true;
}

// Close edit modal
function closeEditModal() {
  editModalOverlay.classList.remove('active');
  editingItemId = null;
  editForm.reset();
  itemIdInput.value = '';
  itemTypeInput.value = 'link';
  urlGroup.classList.remove('hidden');
}

// Update add button state based on inputs (at least one address is required)
function updateAddButtonState() {
  const addresses = addFormRows.querySelectorAll('.add-address');
  const hasValidAddress = Array.from(addresses).some(input => input.value.trim().length > 0);
  addSubmitBtn.disabled = !hasValidAddress;
}

// Add new item
async function addItem(type, title, url = '') {
  saveStateForUndo();
  
  const folderItems = getItemsForFolder(currentFolderId);
  const sameTypeItems = folderItems.filter(item => item.type === type);
  const maxOrder = sameTypeItems.length > 0 
    ? Math.max(...sameTypeItems.map(item => item.order ?? 0))
    : -1;
  
  const newItem = {
    id: generateId(),
    type: type,
    title: title,
    parentId: currentFolderId,
    order: maxOrder + 1
  };
  
  if (type === 'link') {
    // Ensure URL has protocol (but keep chrome:// URLs as-is)
    if (url && !url.match(/^https?:\/\//) && !url.match(/^chrome:\/\//)) {
      url = 'https://' + url;
    }
    newItem.url = url;
  }
  
  items.push(newItem);
  await saveItems();
  renderItems();
  
  return newItem;
}

// Add folder with multiple links inside
async function addFolderWithLinks(linkItems) {
  saveStateForUndo();
  
  // Generate folder name from first link's domain
  const folderTitle = linkItems[0].name;
  
  // Create the folder
  const folderItems = getItemsForFolder(currentFolderId);
  const folderTypeItems = folderItems.filter(item => item.type === 'folder');
  const maxFolderOrder = folderTypeItems.length > 0 
    ? Math.max(...folderTypeItems.map(item => item.order ?? 0))
    : -1;
  
  const newFolder = {
    id: generateId(),
    type: 'folder',
    title: folderTitle,
    parentId: currentFolderId,
    order: maxFolderOrder + 1
  };
  
  items.push(newFolder);
  
  // Add all links inside the folder
  for (let i = 0; i < linkItems.length; i++) {
    let url = linkItems[i].address;
    // Ensure URL has protocol (but keep chrome:// URLs as-is)
    if (url && !url.match(/^https?:\/\//) && !url.match(/^chrome:\/\//)) {
      url = 'https://' + url;
    }
    
    const newLink = {
      id: generateId(),
      type: 'link',
      title: linkItems[i].name,
      url: url,
      parentId: newFolder.id,
      order: i
    };
    
    items.push(newLink);
  }
  
  await saveItems();
  renderItems();
}

// Update existing item
async function updateItem(itemId, title, url = '') {
  const itemIndex = items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) return;
  
  saveStateForUndo();
  
  items[itemIndex].title = title;
  
  if (items[itemIndex].type === 'link') {
    // Ensure URL has protocol (but keep chrome:// URLs as-is)
    if (url && !url.match(/^https?:\/\//) && !url.match(/^chrome:\/\//)) {
      url = 'https://' + url;
    }
    items[itemIndex].url = url;
  }
  
  await saveItems();
  renderItems();
}

// Delete item (and children if folder)
async function deleteItem(itemId) {
  saveStateForUndo();
  
  // Recursively delete children if it's a folder
  const item = items.find(i => i.id === itemId);
  const parentId = item?.parentId;
  
  if (item && item.type === 'folder') {
    const children = items.filter(i => i.parentId === itemId);
    for (const child of children) {
      await deleteItemRecursive(child.id);
    }
  }
  
  // Remove the item
  items = items.filter(i => i.id !== itemId);
  
  // If we deleted the folder we're currently viewing, navigate back to root
  if (itemId === currentFolderId) {
    currentFolderId = 'root';
    navigationStack = [];
    renderBreadcrumb();
  }
  
  // Check if Unsorted folder is now empty and should be deleted
  checkAndDeleteUnsortedFolderIfEmpty();
  
  await saveItems();
  renderItems();
}

// Helper for recursive deletion
async function deleteItemRecursive(itemId) {
  const item = items.find(i => i.id === itemId);
  if (item && item.type === 'folder') {
    const children = items.filter(i => i.parentId === itemId);
    for (const child of children) {
      await deleteItemRecursive(child.id);
    }
  }
  items = items.filter(i => i.id !== itemId);
}

// Event Listeners

// Add modal events
addModalClose.addEventListener('click', closeAddModal);

addModalOverlay.addEventListener('click', (e) => {
  if (e.target === addModalOverlay) {
    closeAddModal();
  }
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Collect all filled rows
  const rows = addFormRows.querySelectorAll('.add-form-inputs');
  const filledItems = [];
  
  rows.forEach(row => {
    const addressInput = row.querySelector('.add-address');
    const nameInput = row.querySelector('.add-name');
    const address = addressInput.value.trim();
    const name = nameInput.value.trim();
    
    if (address) {
      filledItems.push({ address, name, needsTitle: !name });
    }
  });
  
  if (filledItems.length === 0) return;
  
  // Close modal immediately for better UX
  closeAddModal();
  
  // Add all links - fetch titles for those that need it
  for (const item of filledItems) {
    let title = item.name;
    
    if (item.needsTitle) {
      // Try to fetch the page title
      const fetchedTitle = await fetchPageTitle(item.address);
      if (fetchedTitle) {
        title = fetchedTitle;
      } else {
        // Fallback to domain name (or path for chrome:// URLs)
        try {
          if (item.address.match(/^chrome:\/\//)) {
            const path = item.address.replace('chrome://', '').replace(/\/$/, '');
            title = 'Chrome ' + (path.charAt(0).toUpperCase() + path.slice(1) || 'Page');
          } else {
            const url = item.address.match(/^https?:\/\//) ? item.address : 'https://' + item.address;
            title = new URL(url).hostname.replace(/^www\./, '');
          }
        } catch {
          title = item.address;
        }
      }
    }
    
    await addItem('link', title, item.address);
  }
});

// Add folder modal events
addFolderModalClose.addEventListener('click', closeAddFolderModal);

addFolderModalOverlay.addEventListener('click', (e) => {
  if (e.target === addFolderModalOverlay) {
    closeAddFolderModal();
  }
});

// Enable/disable Create button based on input
folderNameInput.addEventListener('input', () => {
  const hasText = folderNameInput.value.trim().length > 0;
  addFolderSubmitBtn.disabled = !hasText;
});

addFolderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const folderName = folderNameInput.value.trim();
  if (!folderName) return;
  
  await addItem('folder', folderName);
  closeAddFolderModal();
});

// Edit modal events
cancelBtn.addEventListener('click', closeEditModal);

editModalOverlay.addEventListener('click', (e) => {
  if (e.target === editModalOverlay) {
    closeEditModal();
  }
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const type = itemTypeInput.value;
  const title = itemTitleInput.value.trim();
  const url = itemUrlInput.value.trim();
  
  if (!title) return;
  if (type === 'link' && !url) return;
  
  if (editingItemId) {
    await updateItem(editingItemId, title, url);
  }
  closeEditModal();
});

// Delete modal event listeners
deleteCancelBtn.addEventListener('click', closeDeleteModal);

deleteModalOverlay.addEventListener('click', (e) => {
  if (e.target === deleteModalOverlay) {
    closeDeleteModal();
  }
});

deleteConfirmBtn.addEventListener('click', async () => {
  // Handle multiple items delete
  if (deletingItemIds.length > 1) {
    saveStateForUndo();
    
    // Track if any item came from Unsorted folder
    let hadUnsortedItem = false;
    
    // Delete all items (recursively for folders)
    for (const itemId of deletingItemIds) {
      const item = items.find(i => i.id === itemId);
      if (!item) continue;
      
      if (item.parentId === UNSORTED_FOLDER_ID) {
        hadUnsortedItem = true;
      }
      
      // For folders, delete children recursively first
      if (item.type === 'folder') {
        const children = items.filter(i => i.parentId === itemId);
        for (const child of children) {
          await deleteItemRecursive(child.id);
        }
      }
      
      items = items.filter(i => i.id !== itemId);
    }
    
    // Check if Unsorted folder is now empty and should be deleted
    if (hadUnsortedItem) {
      checkAndDeleteUnsortedFolderIfEmpty();
    }
    
    await saveItems();
    
    // Clear selection
    clearSelection();
    
    renderItems();
    closeDeleteModal();
  } else if (deletingItemId) {
    await deleteItem(deletingItemId);
    closeDeleteModal();
  }
});

// Move banner event listeners
moveBannerDismiss.addEventListener('click', () => {
  exitMoveMode(true); // Stay in current folder
});

moveBannerAction.addEventListener('click', () => {
  // Move to current folder
  moveItemToTargetFolder(currentFolderId);
});

// Drag and drop functionality
let draggedElement = null;
let draggedItemType = null;
let isDragging = false;
let draggedItemIds = []; // Track all items being dragged (for multi-select)
let dropIndicator = null; // Drop indicator element
let dropPosition = null; // 'before' or 'after'
let dropTargetElement = null; // Current drop target element

// Note: Drag and drop event listeners are now handled by event delegation in initEventDelegation()

// Helper function to clean up all drag-related state
function cleanupDragState() {
  document.body.classList.remove('is-dragging');
  
  // Remove dragging class from all items (for multi-select)
  document.querySelectorAll('.list-item.dragging').forEach(el => {
    el.classList.remove('dragging');
  });
  
  // Remove drop zone indicators
  itemsGrid.querySelectorAll('.folder-drop-target').forEach(el => {
    el.classList.remove('folder-drop-target');
  });
  // Remove breadcrumb drop targets
  breadcrumb.querySelectorAll('.breadcrumb-drop-target').forEach(el => {
    el.classList.remove('breadcrumb-drop-target');
  });
  
  // Remove drop indicator
  hideDropIndicator();
  
  // Reset state
  isDragging = false;
  draggedElement = null;
  draggedItemType = null;
  draggedItemIds = [];
  dropPosition = null;
  dropTargetElement = null;
}

// Drop indicator helper functions
function createDropIndicator() {
  if (!dropIndicator) {
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    dropIndicator.style.display = 'none';
  }
  return dropIndicator;
}

function showDropIndicator(targetElement, position) {
  const indicator = createDropIndicator();
  const targetRect = targetElement.getBoundingClientRect();
  const containerRect = itemsGrid.getBoundingClientRect();
  
  // Ensure indicator is in the DOM
  if (!indicator.parentNode) {
    itemsGrid.appendChild(indicator);
  }
  
  // Position relative to the items container
  const top = position === 'before' 
    ? targetRect.top - containerRect.top - 1
    : targetRect.bottom - containerRect.top - 1;
  
  indicator.style.top = `${top}px`;
  indicator.style.display = 'block';
  
  dropPosition = position;
  dropTargetElement = targetElement;
}

function hideDropIndicator() {
  if (dropIndicator) {
    dropIndicator.style.display = 'none';
  }
  dropPosition = null;
  dropTargetElement = null;
}

function handleDragStart(e) {
  // Don't start drag if clicking on action buttons
  if (e.target.closest('.item-actions')) {
    e.preventDefault();
    return;
  }
  
  isDragging = true;
  draggedElement = this;
  draggedItemType = this.dataset.type;
  this.classList.add('dragging');
  document.body.classList.add('is-dragging');
  
  const itemId = this.dataset.itemId;
  
  // Check if this item is part of a multi-selection
  if (selectedItemIds.has(itemId) && selectedItemIds.size > 1) {
    // Dragging multiple selected items
    draggedItemIds = Array.from(selectedItemIds);
    // Add dragging class to all selected items
    document.querySelectorAll('.list-item.selected').forEach(el => {
      el.classList.add('dragging');
    });
    // Check if we have mixed types
    const draggedItems = items.filter(i => selectedItemIds.has(i.id));
    const hasLinks = draggedItems.some(i => i.type === 'link');
    const hasFolders = draggedItems.some(i => i.type === 'folder');
    if (hasLinks && hasFolders) {
      draggedItemType = 'mixed'; // Mixed selection - can only drop into folders, no reorder
    }
  } else {
    // Dragging a single item (clear selection if any)
    draggedItemIds = [itemId];
    if (selectedItemIds.size > 0) {
      clearSelection();
    }
  }
  
  // Set drag data
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.outerHTML);
  e.dataTransfer.setData('application/json', JSON.stringify(draggedItemIds));
  
  // Create custom drag preview
  const item = items.find(i => i.id === itemId);
  if (item) {
    const dragPreview = document.createElement('div');
    dragPreview.className = 'drag-preview';
    
    let iconHtml = '';
    let titleText = '';
    
    if (draggedItemIds.length > 1) {
      // Multiple items - show count
      iconHtml = `<span style="font-weight: 600; font-size: 14px;">${draggedItemIds.length}</span>`;
      titleText = `${draggedItemIds.length} items`;
    } else {
      // Single item
      if (item.type === 'link') {
        iconHtml = `<img src="${getFaviconUrl(item.url)}" alt="">`;
      } else {
        iconHtml = getFolderIconSvg();
      }
      titleText = item.title;
    }
    
    dragPreview.innerHTML = `
      <div class="drag-preview-icon">${iconHtml}</div>
      <span class="drag-preview-title">${escapeHtml(titleText)}</span>
    `;
    
    // Position offscreen and add to DOM
    dragPreview.style.position = 'fixed';
    dragPreview.style.top = '-1000px';
    dragPreview.style.left = '-1000px';
    document.body.appendChild(dragPreview);
    
    // Set as drag image
    e.dataTransfer.setDragImage(dragPreview, 120, 24);
    
    // Remove after a short delay
    setTimeout(() => {
      dragPreview.remove();
    }, 0);
  }
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  cleanupDragState();
}

function handleDragOver(e) {
  if (!draggedElement || this === draggedElement) return;
  
  const rect = this.getBoundingClientRect();
  const mouseY = e.clientY;
  const dropZoneSize = 12; // 12px zones at top and bottom for reordering
  
  // Check if mouse is in the top or bottom 12px zone (for reordering)
  const inTopZone = mouseY < rect.top + dropZoneSize;
  const inBottomZone = mouseY > rect.bottom - dropZoneSize;
  const inReorderZone = inTopZone || inBottomZone;
  
  // If in reorder zone and same type (not mixed), handle reordering
  if (inReorderZone && draggedItemType !== 'mixed' && this.dataset.type === draggedItemType) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Remove folder hover effect when showing drop indicator
    this.classList.remove('folder-drop-target');
    
    const position = inTopZone ? 'before' : 'after';
    showDropIndicator(this, position);
    return;
  }
  
  // Not in reorder zone - hide indicator
  if (dropTargetElement === this) {
    hideDropIndicator();
  }
  
  // Allow dropping links, folders, or mixed selection onto folders (move into folder)
  if ((draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed') && this.dataset.type === 'folder') {
    // For folder or mixed dragging, validate none are dropping into themselves or descendants
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.itemId;
      // Check all dragged items for folder conflicts
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
          return; // Don't allow dropping on invalid targets
        }
      }
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Show folder hover effect when in middle zone
    this.classList.add('folder-drop-target');
    return;
  }
}

function handleDragEnter(e) {
  if (!draggedElement || this === draggedElement) return;
  
  // Highlight folders when dragging items over them
  if ((draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed') && this.dataset.type === 'folder') {
    // For folder or mixed dragging, validate none are dropping into themselves or descendants
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.itemId;
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
          return; // Don't highlight invalid targets
        }
      }
    }
    this.classList.add('folder-drop-target');
    return;
  }
  
  // For same type reorder and folder-over-folder, the visual feedback is handled in handleDragOver
}

function handleDragLeave(e) {
  // Only remove highlight if we're actually leaving (not entering a child)
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('folder-drop-target');
    
    // Hide drop indicator if leaving the current drop target
    if (dropTargetElement === this) {
      hideDropIndicator();
    }
  }
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!draggedElement || this === draggedElement) {
    return;
  }
  
  // Save dragged item info before cleanup
  const draggedItemId = draggedElement.dataset.itemId;
  const targetItemId = this.dataset.itemId;
  const dragType = draggedItemType;
  const itemIds = [...draggedItemIds];
  
  // Capture drop position BEFORE cleanup (determines if this is a reorder)
  const isReorder = dropPosition !== null;
  const insertAfter = dropPosition === 'after';
  
  // Clean up dragging state immediately since renderItems() will remove the original element
  // and the dragend event won't be able to find it
  cleanupDragState();
  
  // If drop indicator was shown, this is a reorder operation
  if (isReorder && this.dataset.type === dragType) {
    // Get all items of the same type in current folder
    const folderItems = getItemsForFolder(currentFolderId);
    const sameTypeItems = folderItems.filter(item => item.type === dragType);
    
    // Get all items being dragged (for multi-select reordering)
    const itemsBeingDragged = itemIds.length > 0 ? itemIds : [draggedItemId];
    const draggedSet = new Set(itemsBeingDragged);
    
    // Find target index
    const targetIndex = sameTypeItems.findIndex(item => item.id === targetItemId);
    if (targetIndex === -1) return;
    
    // Check if target is one of the dragged items
    if (draggedSet.has(targetItemId)) return;
    
    saveStateForUndo();
    
    // Get the dragged items in their current order
    const draggedItemsInOrder = sameTypeItems.filter(item => draggedSet.has(item.id));
    
    // Remove dragged items from the list
    const remainingItems = sameTypeItems.filter(item => !draggedSet.has(item.id));
    
    // Find where to insert (recalculate target index in remaining items)
    let insertIndex = remainingItems.findIndex(item => item.id === targetItemId);
    if (insertIndex === -1) {
      // Target was one of the dragged items, insert at the end
      insertIndex = remainingItems.length;
    } else if (insertAfter) {
      // Insert after the target item
      insertIndex++;
    }
    
    // Insert all dragged items at the calculated position
    remainingItems.splice(insertIndex, 0, ...draggedItemsInOrder);
    
    // Update order values
    remainingItems.forEach((item, index) => {
      const itemInArray = items.find(i => i.id === item.id);
      if (itemInArray) {
        itemInArray.order = index;
      }
    });
    
    // Clear selection after successful reorder
    clearSelection();
    
    // PERFORMANCE: Use debounced save for reordering (rapid drag operations)
    await saveItems(false);
    renderItems();
    return;
  }
  
  // Handle dropping link(s), folder(s), or mixed selection onto a folder (move into folder)
  if ((dragType === 'link' || dragType === 'folder' || dragType === 'mixed') && this.dataset.type === 'folder') {
    this.classList.remove('folder-drop-target');
    
    // Get all items to move (either from multi-select or single item)
    const itemsToMove = itemIds.length > 0 ? itemIds : [draggedItemId];
    
    // For folder or mixed drops, validate that we're not dropping folders into themselves or descendants
    if (dragType === 'folder' || dragType === 'mixed') {
      for (const itemId of itemsToMove) {
        const item = items.find(i => i.id === itemId);
        if (item && item.type === 'folder' && isFolderOrDescendant(itemId, targetItemId)) {
          showNotification('Cannot move a folder into itself or a subfolder');
          return;
        }
      }
    }
    
    saveStateForUndo();
    
    // Track if any item came from Unsorted folder
    let hadUnsortedItem = false;
    
    // Get current max order in target folder
    const targetFolderItems = items.filter(i => i.parentId === targetItemId);
    let maxOrder = targetFolderItems.length > 0 
      ? Math.max(...targetFolderItems.map(i => i.order ?? 0))
      : -1;
    
    // Move all items
    for (const itemId of itemsToMove) {
      const itemToMove = items.find(i => i.id === itemId);
      if (!itemToMove) continue;
      
      // Check if coming from Unsorted folder
      if (itemToMove.parentId === UNSORTED_FOLDER_ID) {
        hadUnsortedItem = true;
      }
      
      // Move the item into the folder
      itemToMove.parentId = targetItemId;
      itemToMove.order = ++maxOrder;
    }
    
    // Check if Unsorted folder is now empty and should be deleted
    if (hadUnsortedItem) {
      checkAndDeleteUnsortedFolderIfEmpty();
    }
    
    // Clear selection after successful drop
    clearSelection();
    
    await saveItems();
    renderItems();
    return;
  }
}

// Breadcrumb drag and drop handlers
function handleBreadcrumbDragOver(e) {
  // Allow dropping links, folders, or mixed selection onto breadcrumb (parent folders)
  if (draggedElement && (draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed')) {
    // For folder or mixed dragging, validate none are dropping into themselves or descendants
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.folderId;
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
          return; // Don't allow dropping on invalid targets
        }
      }
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
}

function handleBreadcrumbDragEnter(e) {
  if (draggedElement && (draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed')) {
    // For folder or mixed dragging, validate none are dropping into themselves or descendants
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.folderId;
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
          return; // Don't highlight invalid targets
        }
      }
    }
    this.classList.add('breadcrumb-drop-target');
  }
}

function handleBreadcrumbDragLeave(e) {
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('breadcrumb-drop-target');
  }
}

async function handleBreadcrumbDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  this.classList.remove('breadcrumb-drop-target');
  
  if (!draggedElement || (draggedItemType !== 'link' && draggedItemType !== 'folder' && draggedItemType !== 'mixed')) {
    return;
  }
  
  // Save dragged item info before cleanup
  const draggedItemId = draggedElement.dataset.itemId;
  const itemIds = [...draggedItemIds];
  const dragType = draggedItemType;
  
  // Clean up dragging state immediately since renderItems() will remove the original element
  cleanupDragState();
  
  const targetFolderId = this.dataset.folderId;
  
  // Get all items to move (either from multi-select or single item)
  const itemsToMove = itemIds.length > 0 ? itemIds : [draggedItemId];
  
  // For folder or mixed drops, validate that we're not dropping folders into themselves or descendants
  if (dragType === 'folder' || dragType === 'mixed') {
    for (const itemId of itemsToMove) {
      const item = items.find(i => i.id === itemId);
      if (item && item.type === 'folder' && isFolderOrDescendant(itemId, targetFolderId)) {
        showNotification('Cannot move a folder into itself or a subfolder');
        return;
      }
    }
  }
  
  // Check if any item needs to be moved
  let needsMove = false;
  for (const itemId of itemsToMove) {
    const item = items.find(i => i.id === itemId);
    if (item && item.parentId !== targetFolderId) {
      needsMove = true;
      break;
    }
  }
  
  if (!needsMove) return;
  
  saveStateForUndo();
  
  // Track if any item came from Unsorted folder
  let hadUnsortedItem = false;
  
  // Get current max order in target folder
  const targetFolderItems = items.filter(i => i.parentId === targetFolderId);
  let maxOrder = targetFolderItems.length > 0 
    ? Math.max(...targetFolderItems.map(i => i.order ?? 0))
    : -1;
  
  // Move all items
  for (const itemId of itemsToMove) {
    const itemToMove = items.find(i => i.id === itemId);
    if (!itemToMove) continue;
    
    // Skip if already in target folder
    if (itemToMove.parentId === targetFolderId) continue;
    
    // Check if coming from Unsorted folder
    if (itemToMove.parentId === UNSORTED_FOLDER_ID) {
      hadUnsortedItem = true;
    }
    
    // Move the item to the target folder
    itemToMove.parentId = targetFolderId;
    itemToMove.order = ++maxOrder;
  }
  
  // Check if Unsorted folder is now empty and should be deleted
  if (hadUnsortedItem) {
    checkAndDeleteUnsortedFolderIfEmpty();
  }
  
  // Clear selection after successful drop
  clearSelection();
  
  await saveItems();
  renderItems();
}

// ============================================
// Multi-select functionality
// ============================================

// Update selection position classes for joined visual styling
function updateSelectionStyling() {
  // Get all list items in DOM order (within their sections)
  const allListItems = Array.from(document.querySelectorAll('.list-section .list-item'));
  
  // Remove all position classes first
  allListItems.forEach(el => {
    el.classList.remove('selection-first', 'selection-middle', 'selection-last', 'selection-single');
  });
  
  // Find consecutive groups of selected items
  let i = 0;
  while (i < allListItems.length) {
    const item = allListItems[i];
    
    if (item.classList.contains('selected')) {
      // Found a selected item, check for consecutive selected items
      let groupStart = i;
      let groupEnd = i;
      
      // Find the end of this consecutive selected group
      while (groupEnd + 1 < allListItems.length && 
             allListItems[groupEnd + 1].classList.contains('selected') &&
             // Make sure they're in the same section
             allListItems[groupEnd].closest('.list-section') === allListItems[groupEnd + 1].closest('.list-section')) {
        groupEnd++;
      }
      
      // Apply appropriate classes based on group size
      if (groupStart === groupEnd) {
        // Single selected item
        allListItems[groupStart].classList.add('selection-single');
      } else {
        // Multiple consecutive items
        allListItems[groupStart].classList.add('selection-first');
        for (let j = groupStart + 1; j < groupEnd; j++) {
          allListItems[j].classList.add('selection-middle');
        }
        allListItems[groupEnd].classList.add('selection-last');
      }
      
      i = groupEnd + 1;
    } else {
      i++;
    }
  }
}

// Clear all selected items
function clearSelection() {
  selectedItemIds.clear();
  document.querySelectorAll('.list-item.selected').forEach(el => {
    el.classList.remove('selected', 'selection-first', 'selection-middle', 'selection-last', 'selection-single');
  });
}

// Toggle selection of a single item
function toggleItemSelection(itemId, element) {
  if (selectedItemIds.has(itemId)) {
    selectedItemIds.delete(itemId);
    element.classList.remove('selected');
  } else {
    selectedItemIds.add(itemId);
    element.classList.add('selected');
  }
  updateSelectionStyling();
}

// Select a single item (used for box selection)
function selectItem(itemId, element) {
  selectedItemIds.add(itemId);
  element.classList.add('selected');
  // Note: updateSelectionStyling is called by the caller (updateBoxSelection/endBoxSelection)
}

// Deselect a single item
function deselectItem(itemId, element) {
  selectedItemIds.delete(itemId);
  element.classList.remove('selected');
  // Note: updateSelectionStyling is called by the caller (updateBoxSelection/endBoxSelection)
}

// Get array of selected item objects
function getSelectedItems() {
  return items.filter(item => selectedItemIds.has(item.id));
}

// Select all items (folders and links) in current folder
function selectAllLinks() {
  // Get all items in current folder
  const folderItems = getItemsForFolder(currentFolderId);
  // Filter out Unsorted folder from selection
  const selectableItems = folderItems.filter(item => item.id !== UNSORTED_FOLDER_ID);
  
  if (selectableItems.length === 0) return;
  
  // Clear current selection first
  clearSelection();
  
  // Select all items
  selectableItems.forEach(item => {
    selectedItemIds.add(item.id);
  });
  
  // Update visual state for both folders and links
  document.querySelectorAll('.list-item[data-type="link"], .list-item[data-type="folder"]:not([data-unsorted="true"])').forEach(el => {
    const itemId = el.dataset.itemId;
    if (selectedItemIds.has(itemId)) {
      el.classList.add('selected');
    }
  });
  
  // Update joined selection styling
  updateSelectionStyling();
}

// Check if an element intersects with the selection box
function elementIntersectsBox(element, box) {
  const rect = element.getBoundingClientRect();
  const boxLeft = Math.min(box.startX, box.currentX);
  const boxRight = Math.max(box.startX, box.currentX);
  const boxTop = Math.min(box.startY, box.currentY);
  const boxBottom = Math.max(box.startY, box.currentY);
  
  return !(rect.right < boxLeft || 
           rect.left > boxRight || 
           rect.bottom < boxTop || 
           rect.top > boxBottom);
}

// Start box selection
function startBoxSelection(e) {
  // Only start box selection in default mode (not search mode, not move mode)
  if (isSearchMode || isInMoveMode()) return;
  
  // Don't start if clicking on an interactive element
  if (e.target.closest('.list-item') || 
      e.target.closest('.context-menu') || 
      e.target.closest('.modal-overlay') ||
      e.target.closest('.breadcrumb') ||
      e.target.closest('.search-bar')) {
    return;
  }
  
  // Only start on left mouse button
  if (e.button !== 0) return;
  
  isBoxSelecting = true;
  selectionBox.startX = e.clientX;
  selectionBox.startY = e.clientY;
  selectionBox.currentX = e.clientX;
  selectionBox.currentY = e.clientY;
  
  // Create selection box element
  selectionBoxElement = document.createElement('div');
  selectionBoxElement.className = 'selection-box';
  selectionBoxElement.style.left = `${e.clientX}px`;
  selectionBoxElement.style.top = `${e.clientY}px`;
  selectionBoxElement.style.width = '0px';
  selectionBoxElement.style.height = '0px';
  document.body.appendChild(selectionBoxElement);
  
  // Clear previous selection unless Shift is held
  if (!e.shiftKey) {
    clearSelection();
  }
}

// Update box selection
function updateBoxSelection(e) {
  if (!isBoxSelecting || !selectionBoxElement) return;
  
  selectionBox.currentX = e.clientX;
  selectionBox.currentY = e.clientY;
  
  // Update visual box
  const left = Math.min(selectionBox.startX, selectionBox.currentX);
  const top = Math.min(selectionBox.startY, selectionBox.currentY);
  const width = Math.abs(selectionBox.currentX - selectionBox.startX);
  const height = Math.abs(selectionBox.currentY - selectionBox.startY);
  
  selectionBoxElement.style.left = `${left}px`;
  selectionBoxElement.style.top = `${top}px`;
  selectionBoxElement.style.width = `${width}px`;
  selectionBoxElement.style.height = `${height}px`;
  
  // Select items that intersect with the box (both folders and links, excluding Unsorted folder)
  const selectableElements = document.querySelectorAll('.list-item[data-type="link"], .list-item[data-type="folder"]:not([data-unsorted="true"])');
  selectableElements.forEach(el => {
    const itemId = el.dataset.itemId;
    if (elementIntersectsBox(el, selectionBox)) {
      selectItem(itemId, el);
    } else if (!e.shiftKey) {
      // Deselect if not in box (unless Shift is held to add to selection)
      deselectItem(itemId, el);
    }
  });
  
  // Update joined selection styling
  updateSelectionStyling();
}

// End box selection
function endBoxSelection(e) {
  if (!isBoxSelecting) return;
  
  isBoxSelecting = false;
  
  if (selectionBoxElement) {
    selectionBoxElement.remove();
    selectionBoxElement = null;
  }
  
  // Update joined selection styling
  updateSelectionStyling();
}

// Initialize multi-select event listeners
function initMultiSelect() {
  // Box selection events on document
  document.addEventListener('mousedown', startBoxSelection);
  document.addEventListener('mousemove', updateBoxSelection);
  document.addEventListener('mouseup', endBoxSelection);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Undo with Cmd/Ctrl + Z
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    // Don't interfere if user is typing in an input/textarea
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    // Check if any modal is open
    const isModalOpen = addModalOverlay.classList.contains('active') ||
                        addFolderModalOverlay.classList.contains('active') ||
                        editModalOverlay.classList.contains('active') ||
                        deleteModalOverlay.classList.contains('active');
    
    if (!isInputFocused && !isModalOpen) {
      e.preventDefault();
      undo();
    }
  }
  
  if (e.key === 'Escape') {
    // Clear multi-selection first if any items are selected
    if (selectedItemIds.size > 0) {
      clearSelection();
      return;
    }
    
    // Exit search mode first if active
    if (isSearchMode) {
      exitSearchMode();
      return;
    }
    
    if (addModalOverlay.classList.contains('active')) {
      closeAddModal();
      return;
    }
    if (addFolderModalOverlay.classList.contains('active')) {
      closeAddFolderModal();
      return;
    }
    if (editModalOverlay.classList.contains('active')) {
      closeEditModal();
      return;
    }
    if (deleteModalOverlay.classList.contains('active')) {
      closeDeleteModal();
      return;
    }
    if (isInMoveMode()) {
      exitMoveMode(true); // Stay in current folder
      return;
    }
    hideContextMenu();
    
    // Navigate to parent folder if not at root
    if (currentFolderId !== 'root') {
      // Get parent folder ID
      const currentFolder = getFolderById(currentFolderId);
      const parentFolderId = currentFolder ? currentFolder.parentId : 'root';
      navigateToFolder(parentFolderId || 'root');
    }
  }
  
  // Select all with Cmd/Ctrl + A (only in default mode, not search mode)
  if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
    // Don't interfere if user is typing in an input/textarea
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    // Check if any modal is open
    const isModalOpen = addModalOverlay.classList.contains('active') ||
                        addFolderModalOverlay.classList.contains('active') ||
                        editModalOverlay.classList.contains('active') ||
                        deleteModalOverlay.classList.contains('active');
    
    // Only work in default mode (not search, not move mode)
    if (!isInputFocused && !isModalOpen && !isSearchMode && !isInMoveMode()) {
      e.preventDefault();
      selectAllLinks();
    }
  }
  
  // Delete selected items with Delete or Backspace key
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    const isModalOpen = addModalOverlay.classList.contains('active') ||
                        addFolderModalOverlay.classList.contains('active') ||
                        editModalOverlay.classList.contains('active') ||
                        deleteModalOverlay.classList.contains('active');
    
    // Only delete if items are selected and not in input/modal
    if (!isInputFocused && !isModalOpen && selectedItemIds.size > 0 && !isSearchMode && !isInMoveMode()) {
      e.preventDefault();
      // Show delete confirmation for multiple items or single folder
      if (selectedItemIds.size > 1) {
        openDeleteModalMultiple(Array.from(selectedItemIds));
      } else {
        // Single item - check if it's a folder (needs confirmation) or link (delete directly)
        const itemId = Array.from(selectedItemIds)[0];
        const item = items.find(i => i.id === itemId);
        if (item && item.type === 'folder') {
          openDeleteModal(itemId);
        } else {
          deleteItem(itemId);
        }
        clearSelection();
      }
    }
  }
  
  // Enter key opens all selected links in a tab group
  if (e.key === 'Enter') {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    const isModalOpen = addModalOverlay.classList.contains('active') ||
                        addFolderModalOverlay.classList.contains('active') ||
                        editModalOverlay.classList.contains('active') ||
                        deleteModalOverlay.classList.contains('active');
    
    // Only open if items are selected and not in input/modal
    if (!isInputFocused && !isModalOpen && selectedItemIds.size > 0 && !isSearchMode && !isInMoveMode()) {
      e.preventDefault();
      openSelectedLinks();
    }
  }
  
  // Check if any modal is open
  const isModalOpen = addModalOverlay.classList.contains('active') ||
                      addFolderModalOverlay.classList.contains('active') ||
                      editModalOverlay.classList.contains('active') ||
                      deleteModalOverlay.classList.contains('active');
  
  // Arrow key navigation (only when not in modal)
  if (!isModalOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    // In search mode with search input focused, allow navigation
    const activeElement = document.activeElement;
    const isSearchInputFocused = activeElement === searchInput;
    const isOtherInputFocused = (activeElement.tagName === 'INPUT' || 
                                  activeElement.tagName === 'TEXTAREA' ||
                                  activeElement.isContentEditable) && !isSearchInputFocused;
    
    if (!isOtherInputFocused) {
      e.preventDefault();
      if (e.key === 'ArrowDown') {
        focusNextItem();
      } else {
        focusPreviousItem();
      }
    }
  }
  
  // Left arrow key - same as Escape (go back/parent folder)
  if (e.key === 'ArrowLeft' && !isModalOpen) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    if (!isInputFocused) {
      e.preventDefault();
      
      // Exit search mode first if active
      if (isSearchMode) {
        exitSearchMode();
        return;
      }
      
      // Navigate to parent folder if not at root
      if (currentFolderId !== 'root') {
        const currentFolder = getFolderById(currentFolderId);
        const parentFolderId = currentFolder ? currentFolder.parentId : 'root';
        navigateToFolder(parentFolderId || 'root');
      }
    }
  }
  
  // Enter or Right arrow key to activate focused item
  if ((e.key === 'Enter' || e.key === 'ArrowRight') && !isModalOpen) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    // Only activate if not typing in an input (unless it's search input)
    if (!isInputFocused || activeElement === searchInput) {
      // If there's a focused item (including suggestions), activate it
      if (focusedItemIndex >= 0) {
        e.preventDefault();
        // Cmd/Ctrl + Enter opens link in new tab
        const openInNewTab = e.metaKey || e.ctrlKey;
        activateFocusedItem(openInNewTab);
        return;
      }
      
      // Fallback: if in search mode with no focused item, search Google
      if (isSearchMode && searchQuery.trim() && e.key === 'Enter') {
        e.preventDefault();
        const queryToSearch = searchQuery.trim();
        addToSearchHistory(queryToSearch);
        const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(queryToSearch)}`;
        navigateToUrl(googleSearchUrl);
        return;
      }
    }
  }
  
  // Backspace key to delete focused item
  if (e.key === 'Backspace' && focusedItemIndex >= 0 && !isModalOpen) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    if (!isInputFocused) {
      e.preventDefault();
      deleteFocusedItem();
    }
  }
  
  // Trigger search mode when typing letters or numbers (not in search mode already)
  if (!isSearchMode) {
    // Don't trigger if user is typing in an input/textarea
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    // Only trigger on single printable characters, no modifier keys (except shift for uppercase)
    // Use \S to match any non-whitespace character, supporting all languages
    const isPrintableChar = e.key.length === 1 && /\S/.test(e.key);
    const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
    
    if (isPrintableChar && !hasModifier && !isInputFocused && !isModalOpen) {
      e.preventDefault();
      enterSearchMode(e.key);
    }
  }
});

// Search input event listener
searchInput.addEventListener('input', handleSearchInput);

// Also allow clicking outside the search bar to exit search mode
document.addEventListener('click', (e) => {
  if (isSearchMode && !searchBar.contains(e.target) && !itemsGrid.contains(e.target)) {
    exitSearchMode();
  }
  
  // Reset keyboard focus when clicking on body/background
  if (focusedItemIndex >= 0 && !itemsGrid.contains(e.target)) {
    resetKeyboardFocus();
  }
});

// Keyboard navigation functions
function getNavigableItems() {
  // Include regular list items, suggestion items, history items, and browser history items
  return Array.from(itemsGrid.querySelectorAll('.list-item, .suggestion-item, .history-item, .browser-history-item'));
}

function clearItemFocus() {
  itemsGrid.querySelectorAll('.list-item.keyboard-focused').forEach(el => {
    el.classList.remove('keyboard-focused');
  });
}

function focusItem(index, updateInputWithSuggestion = false) {
  const items = getNavigableItems();
  if (items.length === 0) return;
  
  // Clear previous focus
  clearItemFocus();
  
  // Clamp index to valid range
  if (index < 0) index = 0;
  if (index >= items.length) index = items.length - 1;
  
  focusedItemIndex = index;
  const item = items[focusedItemIndex];
  item.classList.add('keyboard-focused');
  
  // Update search icon based on focused item type
  updateSearchIconForFocusedItem(item);
  
  // Update search input with suggestion text when focusing on suggestion/history items
  // Only do this during keyboard navigation, not during auto-focus from typing
  if (updateInputWithSuggestion && isSearchMode && (item.classList.contains('suggestion-item') || item.classList.contains('history-item'))) {
    const suggestionText = item.dataset.suggestion;
    if (suggestionText) {
      searchInput.value = suggestionText;
      searchQuery = suggestionText;
    }
  }
  
  // Scroll into view if needed
  item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Update search icon based on focused item
function updateSearchIconForFocusedItem(item) {
  if (!isSearchMode) return;
  
  const itemType = item.dataset.type;
  
  // URL item - show favicon
  if (item.classList.contains('url-item')) {
    const url = item.dataset.url;
    if (url) {
      setSearchIcon('favicon', getFaviconUrl(url));
    } else {
      setSearchIcon('globe');
    }
    return;
  }
  
  // Folder - show folder icon (inbox icon for Unsorted folder)
  if (itemType === 'folder') {
    const isUnsorted = item.dataset.unsorted === 'true';
    setSearchIcon(isUnsorted ? 'inbox' : 'folder');
    return;
  }
  
  // Link/bookmark - show favicon of the bookmark
  if (itemType === 'link') {
    const href = item.getAttribute('href');
    if (href) {
      setSearchIcon('favicon', getFaviconUrl(href));
    } else {
      setSearchIcon('link');
    }
    return;
  }
  
  // History item - show history icon
  if (item.classList.contains('history-item')) {
    setSearchIcon('history');
    return;
  }
  
  // Browser history item - show favicon
  if (item.classList.contains('browser-history-item')) {
    const href = item.getAttribute('href');
    if (href) {
      setSearchIcon('favicon', getFaviconUrl(href));
    } else {
      setSearchIcon('history');
    }
    return;
  }
  
  // Chrome internal page item - show favicon
  if (item.classList.contains('chrome-page-item') || itemType === 'chrome-page') {
    const href = item.getAttribute('href');
    if (href) {
      setSearchIcon('favicon', getFaviconUrl(href));
    } else {
      setSearchIcon('globe');
    }
    return;
  }
  
  // Google suggestion - show Google icon
  if (item.classList.contains('suggestion-item')) {
    setSearchIcon('google');
    return;
  }
  
  // Default to search icon
  setSearchIcon('search');
}

function focusNextItem() {
  const items = getNavigableItems();
  if (items.length === 0) return;
  
  if (focusedItemIndex < 0) {
    // No item focused, focus first item
    focusItem(0, true);
  } else if (focusedItemIndex < items.length - 1) {
    focusItem(focusedItemIndex + 1, true);
  }
}

function focusPreviousItem() {
  const items = getNavigableItems();
  if (items.length === 0) return;
  
  if (focusedItemIndex <= 0) {
    // At first item, restore original query and unfocus
    if (isSearchMode && originalSearchQuery !== undefined) {
      searchInput.value = originalSearchQuery;
      searchQuery = originalSearchQuery;
      clearItemFocus();
      focusedItemIndex = -1;
      searchInput.focus();
      // Place cursor at end of input
      searchInput.selectionStart = searchInput.selectionEnd = originalSearchQuery.length;
      // Restore icon based on original query
      if (originalSearchQuery.trim()) {
        const queryIsUrl = isUrl(originalSearchQuery);
        setSearchIcon(queryIsUrl ? 'globe' : 'google');
      } else {
        setSearchIcon('search');
      }
    }
  } else {
    focusItem(focusedItemIndex - 1, true);
  }
}

async function activateFocusedItem(openInNewTab = false) {
  const items = getNavigableItems();
  if (focusedItemIndex < 0 || focusedItemIndex >= items.length) return;
  
  const item = items[focusedItemIndex];
  const itemId = item.dataset.itemId;
  const itemType = item.dataset.type;
  
  // Handle URL items (direct navigation)
  if (item.classList.contains('url-item')) {
    const url = item.dataset.url;
    if (url) {
      navigateToUrl(url, openInNewTab);
    }
    return;
  }
  
  // Handle suggestion and history items
  if (item.classList.contains('suggestion-item') || item.classList.contains('history-item')) {
    const suggestion = item.dataset.suggestion;
    if (suggestion) {
      await addToSearchHistory(suggestion);
      const url = `https://www.google.com/search?q=${encodeURIComponent(suggestion)}`;
      navigateToUrl(url, openInNewTab);
    }
    return;
  }
  
  // Handle browser history items
  if (item.classList.contains('browser-history-item')) {
    const href = item.getAttribute('href');
    if (href) {
      navigateToUrl(href, openInNewTab);
    }
    return;
  }
  
  // Handle Chrome internal page items
  if (item.classList.contains('chrome-page-item') || itemType === 'chrome-page') {
    const href = item.getAttribute('href');
    if (href) {
      navigateToUrl(href, openInNewTab);
    }
    return;
  }
  
  if (itemType === 'folder') {
    // Open the folder
    if (isSearchMode) {
      exitSearchMode();
    }
    // Pass flag to auto-focus first item since we're navigating with keyboard
    navigateToFolder(itemId, true, true);
  } else if (itemType === 'link') {
    // Visit the link
    const href = item.getAttribute('href');
    if (href) {
      navigateToUrl(href, openInNewTab);
    }
  }
}

function resetKeyboardFocus() {
  focusedItemIndex = -1;
  clearItemFocus();
  
  // Restore default search icon based on current query
  if (isSearchMode && searchQuery.trim()) {
    const queryIsUrl = isUrl(searchQuery);
    setSearchIcon(queryIsUrl ? 'globe' : 'google');
  }
}

async function deleteFocusedItem() {
  const items = getNavigableItems();
  if (focusedItemIndex < 0 || focusedItemIndex >= items.length) return;
  
  const item = items[focusedItemIndex];
  const itemId = item.dataset.itemId;
  const itemType = item.dataset.type;
  
  if (itemType === 'folder') {
    // Show delete confirmation modal for folders
    openDeleteModal(itemId);
  } else {
    // Delete links directly
    await deleteItem(itemId);
    
    // Adjust focus after deletion
    const newItems = getNavigableItems();
    if (newItems.length === 0) {
      resetKeyboardFocus();
    } else if (focusedItemIndex >= newItems.length) {
      focusItem(newItems.length - 1);
    } else {
      focusItem(focusedItemIndex);
    }
  }
}

// Check if text is a valid URL
function isValidUrl(text) {
  const trimmed = text.trim();
  // Allow chrome:// internal URLs
  if (/^chrome:\/\/[a-zA-Z0-9-]+(\/[^\s]*)?$/.test(trimmed)) {
    return true;
  }
  // Check for common URL patterns
  const urlPattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?$/;
  return urlPattern.test(trimmed);
}

// Extract title from URL (domain name)
function getTitleFromUrl(url) {
  try {
    // For chrome:// URLs, use the path as title
    if (url.startsWith('chrome://')) {
      const path = url.replace('chrome://', '').replace(/\/$/, '');
      // Capitalize first letter
      return path.charAt(0).toUpperCase() + path.slice(1) || 'Chrome';
    }
    const normalizedUrl = url.match(/^https?:\/\//) ? url : 'https://' + url;
    return new URL(normalizedUrl).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Fetch page title from URL
async function fetchPageTitle(url) {
  try {
    // Can't fetch chrome:// URLs, return a formatted title instead
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
    
    // Try to extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      // Return null if title is empty or just whitespace
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

// Handle paste event - auto-add links when URL is pasted
document.addEventListener('paste', async (e) => {
  // Don't interfere if user is typing in an input/textarea or modal is open
  const activeElement = document.activeElement;
  const isInputFocused = activeElement.tagName === 'INPUT' || 
                         activeElement.tagName === 'TEXTAREA' ||
                         activeElement.isContentEditable;
  
  const isModalOpen = addModalOverlay.classList.contains('active') ||
                      addFolderModalOverlay.classList.contains('active') ||
                      editModalOverlay.classList.contains('active') ||
                      deleteModalOverlay.classList.contains('active');
  
  if (isInputFocused || isModalOpen) {
    return;
  }
  
  // Get clipboard text
  const clipboardText = e.clipboardData.getData('text').trim();
  
  if (!clipboardText) return;
  
  // Check if it's a valid URL
  if (isValidUrl(clipboardText)) {
    e.preventDefault();
    
    // Show initial notification while fetching
    const domainTitle = getTitleFromUrl(clipboardText);
    showPasteNotification(domainTitle);
    
    // Try to fetch the actual page title
    const fetchedTitle = await fetchPageTitle(clipboardText);
    const title = fetchedTitle || domainTitle;
    
    await addItem('link', title, clipboardText);
  }
});

// Show notification when link is added via paste
function showPasteNotification(title) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  notification.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    <span>Added "${escapeHtml(title)}"</span>
  `;
  
  document.body.appendChild(notification);
  
  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  // Remove after animation
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Listen for storage changes (e.g., from background script saving links)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.speedDialItems) {
    // Update items from storage
    items = changes.speedDialItems.newValue || [];
    renderItems();
    renderBreadcrumb();
  }
});

// Export bookmarks to HTML file (Netscape Bookmark format)
function exportBookmarks() {
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Determine what to export based on current folder
  const isInRoot = currentFolderId === 'root';
  const currentFolder = isInRoot ? null : getFolderById(currentFolderId);
  const folderName = currentFolder ? currentFolder.title : 'Bookmarks Bar';
  
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}"${isInRoot ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''}>${escapeHtml(folderName)}</H3>
    <DL><p>
`;

  // Export items from current folder (root or specific folder)
  html += exportFolderContents(currentFolderId, 2);
  
  html += `    </DL><p>
</DL><p>
`;

  // Create and download file
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date();
  const dateStr = `${date.getMonth() + 1}_${date.getDate()}_${String(date.getFullYear()).slice(-2)}`;
  // Include folder name in filename if exporting a specific folder
  const folderSlug = isInRoot ? '' : `_${folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  a.download = `bookmarks${folderSlug}_${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showExportNotification(isInRoot ? null : folderName);
}

// Export folder contents recursively
function exportFolderContents(folderId, indentLevel) {
  const folderItems = getItemsForFolder(folderId);
  const indent = '    '.repeat(indentLevel);
  let html = '';
  
  for (const item of folderItems) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    if (item.type === 'folder') {
      html += `${indent}<DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(item.title)}</H3>\n`;
      html += `${indent}<DL><p>\n`;
      html += exportFolderContents(item.id, indentLevel + 1);
      html += `${indent}</DL><p>\n`;
    } else if (item.type === 'link') {
      html += `${indent}<DT><A HREF="${escapeHtml(item.url)}" ADD_DATE="${timestamp}">${escapeHtml(item.title)}</A>\n`;
    }
  }
  
  return html;
}

// Show notification when bookmarks are exported
function showExportNotification(folderName = null) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  const message = folderName ? `"${escapeHtml(folderName)}" exported` : 'Bookmarks exported';
  notification.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Handle import file selection
async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Reset the input so the same file can be selected again
  e.target.value = '';
  
  try {
    const text = await file.text();
    const importedCount = await importBookmarks(text);
    showImportNotification(importedCount);
  } catch (error) {
    console.error('Error importing bookmarks:', error);
    showImportNotification(0, true);
  }
}

// Import bookmarks from HTML content
async function importBookmarks(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Find the main bookmark list - usually after the H1
  const mainDL = doc.querySelector('DL');
  if (!mainDL) {
    throw new Error('No bookmark data found');
  }
  
  saveStateForUndo();
  
  let importedCount = 0;
  
  // Parse and import items
  importedCount = await parseAndImportItems(mainDL, currentFolderId);
  
  await saveItems();
  renderItems();
  
  return importedCount;
}

// Parse DL element and import its contents
async function parseAndImportItems(dlElement, parentId) {
  let count = 0;
  const dtElements = dlElement.querySelectorAll(':scope > DT');
  
  for (const dt of dtElements) {
    // Check if it's a folder (H3) or link (A)
    const h3 = dt.querySelector(':scope > H3');
    const a = dt.querySelector(':scope > A');
    
    if (h3) {
      // It's a folder
      const folderTitle = h3.textContent.trim();
      
      // Skip "Bookmarks Bar" as top level, but import its contents
      const isBookmarksBar = h3.hasAttribute('PERSONAL_TOOLBAR_FOLDER');
      const nestedDL = dt.querySelector(':scope > DL');
      
      if (isBookmarksBar && nestedDL) {
        // Import contents directly into parent
        count += await parseAndImportItems(nestedDL, parentId);
      } else if (folderTitle) {
        // Create the folder
        const folderItems = getItemsForFolder(parentId);
        const folderTypeItems = folderItems.filter(item => item.type === 'folder');
        const maxFolderOrder = folderTypeItems.length > 0 
          ? Math.max(...folderTypeItems.map(item => item.order ?? 0))
          : -1;
        
        const newFolder = {
          id: generateId(),
          type: 'folder',
          title: folderTitle,
          parentId: parentId,
          order: maxFolderOrder + 1
        };
        
        items.push(newFolder);
        count++;
        
        // Import folder contents
        if (nestedDL) {
          count += await parseAndImportItems(nestedDL, newFolder.id);
        }
      }
    } else if (a) {
      // It's a link
      const url = a.getAttribute('HREF');
      const title = a.textContent.trim();
      
      // Skip javascript: URLs but allow chrome:// internal URLs
      if (url && !url.startsWith('javascript:')) {
        const folderItems = getItemsForFolder(parentId);
        const linkItems = folderItems.filter(item => item.type === 'link');
        const maxLinkOrder = linkItems.length > 0 
          ? Math.max(...linkItems.map(item => item.order ?? 0))
          : -1;
        
        const newLink = {
          id: generateId(),
          type: 'link',
          title: title || url,
          url: url,
          parentId: parentId,
          order: maxLinkOrder + 1
        };
        
        items.push(newLink);
        count++;
      }
    }
  }
  
  return count;
}

// Show notification when bookmarks are imported
function showImportNotification(count, isError = false) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  
  if (isError) {
    notification.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span>Import failed</span>
    `;
  } else {
    notification.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>Imported ${count} item${count !== 1 ? 's' : ''}</span>
    `;
  }
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Initialize
async function init() {
  // PERFORMANCE: Initialize favicon cache early
  await initFaviconCache();
  
  // Load and apply theme early to prevent flash
  await loadTheme();
  initThemePicker();
  
  // PERFORMANCE: Set up event delegation once (instead of per-render)
  initEventDelegation();
  
  initContextMenu();
  initMultiSelect();
  await loadItems();
  await loadSearchHistory();
  
  // Initialize history state and restore folder from URL hash if present
  initializeHistoryState();
  
  // Only render if not already rendered by initializeHistoryState
  if (!window.location.hash.startsWith('#folder/')) {
    renderItems();
    renderBreadcrumb();
  }
}

init();

