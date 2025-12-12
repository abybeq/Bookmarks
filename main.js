// ============================================
// MAIN.JS - Entry Point
// ============================================

// Import state
import {
  items, setItems, currentFolderId, setCurrentFolderId, navigationStack,
  editingItemId, isSearchMode, searchQuery,
  eventDelegationInitialized, setEventDelegationInitialized,
  isDragging, UNSORTED_FOLDER_ID, isInMoveMode,
  deletingItemId, deletingItemIds,
  getSelectionSize, getSelectedIdsArray, hasSelection, clearSelectionState
} from './modules/state.js';

// Import utilities
import {
  generateId, escapeHtml, isValidUrl, getTitleFromUrl,
  showPasteNotification, navigateToUrl, getFolderIconSvg
} from './modules/utils.js';

// Import storage
import {
  initFaviconCache, loadItems, saveItems, saveStateForUndo, undo,
  loadTheme, initThemePicker, loadSearchHistory, getFaviconUrl,
  fetchPageTitle, addToSearchHistory, removeFromSearchHistory
} from './modules/storage.js';

// Import navigation
import {
  getItemsForFolder, getFolderById, isFolderOrDescendant,
  renderBreadcrumb, navigateToFolder, navigateToFolderSimple,
  handlePopState, initializeHistoryState, startInlineFolderEdit,
  checkAndDeleteUnsortedFolderIfEmpty
} from './modules/navigation.js';

// Import search
import {
  initSearchElements, enterSearchMode, exitSearchMode,
  handleSearchInput, performSearch, getNavigableItems
} from './modules/search.js';

// Import render
import { initRenderElements, renderItems, renderListView } from './modules/render.js';

// Import interactions
import {
  initInteractionElements, setRenderCallbacks,
  closeAddModal, openAddFolderModal, closeAddFolderModal,
  closeEditModal, openDeleteModal, openDeleteModalMultiple, closeDeleteModal,
  enterMoveMode, enterMoveModeMultiple, exitMoveMode, updateMoveBanner, moveItemToTargetFolder,
  initContextMenu, showContextMenu, showBodyContextMenu, hideContextMenu,
  initMultiSelect, clearSelection, toggleItemSelection, selectAllItems,
  openAllLinksInFolder, openSelectedLinks,
  cleanupDragState, handleDragStart, handleDragEnd, handleDragOver,
  handleDragEnter, handleDragLeave, handleDrop,
  handleBreadcrumbDragOver, handleBreadcrumbDragEnter, handleBreadcrumbDragLeave, handleBreadcrumbDrop,
  getModalElements
} from './modules/interactions.js';

// Import keyboard
import {
  initKeyboardElements, setKeyboardCallbacks, initKeyboardShortcuts,
  focusItem, resetKeyboardFocus
} from './modules/keyboard.js';

// Import import/export
import { initImportExport, setImportExportCallbacks } from './modules/importExport.js';

// ============================================
// DOM ELEMENTS
// ============================================

const itemsGrid = document.getElementById('items-grid');
const breadcrumb = document.getElementById('breadcrumb');
const searchInput = document.getElementById('search-input');

// ============================================
// CRUD OPERATIONS
// ============================================

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
    if (url && !url.match(/^https?:\/\//) && !url.match(/^chrome:\/\//)) {
      url = 'https://' + url;
    }
    newItem.url = url;
  }
  
  items.push(newItem);
  await saveItems();
  renderItems();
  renderBreadcrumb(); // Ensure breadcrumb is shown after adding first item
  
  return newItem;
}

async function updateItem(itemId, title, url = '') {
  const itemIndex = items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) return;
  
  saveStateForUndo();
  
  items[itemIndex].title = title;
  
  if (items[itemIndex].type === 'link') {
    if (url && !url.match(/^https?:\/\//) && !url.match(/^chrome:\/\//)) {
      url = 'https://' + url;
    }
    items[itemIndex].url = url;
  }
  
  await saveItems();
  renderItems();
}

async function deleteItem(itemId) {
  saveStateForUndo();
  
  const item = items.find(i => i.id === itemId);
  const parentId = item?.parentId;
  
  if (item && item.type === 'folder') {
    const children = items.filter(i => i.parentId === itemId);
    for (const child of children) {
      await deleteItemRecursive(child.id);
    }
  }
  
  const index = items.findIndex(i => i.id === itemId);
  if (index !== -1) {
    items.splice(index, 1);
  }
  
  if (itemId === currentFolderId) {
    setCurrentFolderId('root');
    renderBreadcrumb();
  }
  
  checkAndDeleteUnsortedFolderIfEmpty();
  
  await saveItems();
  renderItems();
}

async function deleteItemRecursive(itemId) {
  const item = items.find(i => i.id === itemId);
  if (item && item.type === 'folder') {
    const children = items.filter(i => i.parentId === itemId);
    for (const child of children) {
      await deleteItemRecursive(child.id);
    }
  }
  const index = items.findIndex(i => i.id === itemId);
  if (index !== -1) {
    items.splice(index, 1);
  }
}

// ============================================
// NAVIGATION WRAPPER
// ============================================

function navigateToFolderWrapper(folderId, pushState = true, autoFocusFirst = false) {
  navigateToFolder(folderId, pushState, autoFocusFirst, {
    renderItems,
    renderBreadcrumb,
    updateMoveBanner,
    resetKeyboardFocus,
    focusItem
  });
}

// ============================================
// SEARCH WRAPPER
// ============================================

function exitSearchModeWrapper() {
  exitSearchMode(renderItems, renderBreadcrumb, resetKeyboardFocus);
}

function enterSearchModeWrapper(initialChar = '') {
  enterSearchMode(initialChar, focusItem);
}

// ============================================
// EVENT DELEGATION
// ============================================

function initEventDelegation() {
  if (eventDelegationInitialized) return;
  setEventDelegationInitialized(true);
  
  // Click delegation for items grid
  itemsGrid.addEventListener('click', async (e) => {
    // Move button
    const moveBtn = e.target.closest('.list-item-move-btn');
    if (moveBtn) {
      e.preventDefault();
      e.stopPropagation();
      const itemId = moveBtn.dataset.itemId;
      enterMoveMode(itemId, navigateToFolderWrapper);
      return;
    }
    
    // Delete button (Unsorted list items)
    const deleteBtn = e.target.closest('.list-item-delete-btn');
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const itemId = deleteBtn.dataset.itemId;
      await deleteItem(itemId);
      return;
    }
    
    // Move here button
    const moveHereBtn = e.target.closest('.list-item-move-here-btn');
    if (moveHereBtn) {
      e.preventDefault();
      e.stopPropagation();
      const folderId = moveHereBtn.dataset.folderId;
      moveItemToTargetFolder(folderId, navigateToFolderWrapper);
      return;
    }
    
    // History delete button
    const historyDeleteBtn = e.target.closest('.history-delete-btn');
    if (historyDeleteBtn) {
      e.stopPropagation();
      const query = historyDeleteBtn.dataset.query;
      removeFromSearchHistory(query);
      performSearch(searchInput.value.trim(), focusItem);
      return;
    }
    
    // Find clicked list item
    const listItem = e.target.closest('.list-item, .url-item, .suggestion-item, .history-item, .browser-history-item');
    if (!listItem) return;
    
    const itemType = listItem.dataset.type;
    const itemId = listItem.dataset.itemId;
    
    // URL items
    if (listItem.classList.contains('url-item')) {
      const url = listItem.dataset.url;
      navigateToUrl(url);
      return;
    }
    
    // Suggestion/history items
    if (listItem.classList.contains('suggestion-item') || listItem.classList.contains('history-item')) {
      const suggestionText = listItem.dataset.suggestion;
      if (suggestionText) {
        addToSearchHistory(suggestionText);
        navigateToUrl(`https://www.google.com/search?q=${encodeURIComponent(suggestionText)}`);
      }
      return;
    }
    
    // Chrome page items
    if (listItem.classList.contains('chrome-page-item')) {
      e.preventDefault();
      const href = listItem.getAttribute('href');
      if (href) {
        navigateToUrl(href);
      }
      return;
    }
    
    // Shift+Click for multi-select
    if (e.shiftKey && !isSearchMode && !isInMoveMode()) {
      if (listItem.dataset.unsorted === 'true') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      toggleItemSelection(itemId, listItem);
      return;
    }
    
    // Folder clicks
    if (itemType === 'folder') {
      if (getSelectionSize() > 0) {
        clearSelection();
      }
      if (isSearchMode) {
        exitSearchModeWrapper();
      }
      navigateToFolderWrapper(itemId);
      return;
    }
    
    // Link clicks
    if (itemType === 'link') {
      if (getSelectionSize() > 0 && !e.shiftKey) {
        clearSelection();
      }
      
      const href = listItem.getAttribute('href');
      if (href && href.startsWith('chrome://')) {
        e.preventDefault();
        chrome.tabs.update({ url: href });
      }
    }
  });
  
  // Context menu delegation
  itemsGrid.addEventListener('contextmenu', (e) => {
    const listItem = e.target.closest('.list-item[data-item-id]');
    if (listItem) {
      e.preventDefault();
      e.stopPropagation();
      const itemId = listItem.dataset.itemId;
      showContextMenu(e.clientX, e.clientY, itemId);
    }
  });
  
  // Drag and drop delegation
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
  }, true);
  
  // Breadcrumb delegation
  breadcrumb.addEventListener('click', (e) => {
    const breadcrumbItem = e.target.closest('.breadcrumb-item');
    if (breadcrumbItem) {
      const folderId = breadcrumbItem.dataset.folderId;
      navigateToFolderWrapper(folderId);
      return;
    }
    
    const currentFolder = e.target.closest('.breadcrumb-current');
    if (currentFolder && !currentFolder.classList.contains('breadcrumb-non-interactive')) {
      startInlineFolderEdit(currentFolder, renderItems);
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

// ============================================
// MODAL EVENT LISTENERS
// ============================================

function initModalEventListeners() {
  const {
    addModalOverlay, addModalClose, addForm, addFormRows, addSubmitBtn,
    addFolderModalOverlay, addFolderModalClose, addFolderForm, folderNameInput, addFolderSubmitBtn,
    editModalOverlay, editForm, itemTypeInput, itemTitleInput, itemUrlInput, cancelBtn,
    deleteModalOverlay, deleteCancelBtn, deleteConfirmBtn,
    moveBannerDismiss, moveBannerAction
  } = getModalElements();
  
  // Add modal
  addModalClose.addEventListener('click', closeAddModal);
  addModalOverlay.addEventListener('click', (e) => {
    if (e.target === addModalOverlay) closeAddModal();
  });
  
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
    
    closeAddModal();
    
    for (const item of filledItems) {
      let title = item.name;
      
      if (item.needsTitle) {
        const fetchedTitle = await fetchPageTitle(item.address);
        if (fetchedTitle) {
          title = fetchedTitle;
        } else {
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
  
  // Add folder modal
  addFolderModalClose.addEventListener('click', closeAddFolderModal);
  addFolderModalOverlay.addEventListener('click', (e) => {
    if (e.target === addFolderModalOverlay) closeAddFolderModal();
  });
  
  folderNameInput.addEventListener('input', () => {
    addFolderSubmitBtn.disabled = !folderNameInput.value.trim();
  });
  
  addFolderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const folderName = folderNameInput.value.trim();
    if (!folderName) return;
    
    await addItem('folder', folderName);
    closeAddFolderModal();
  });
  
  // Edit modal
  cancelBtn.addEventListener('click', closeEditModal);
  editModalOverlay.addEventListener('click', (e) => {
    if (e.target === editModalOverlay) closeEditModal();
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
  
  // Delete modal
  deleteCancelBtn.addEventListener('click', closeDeleteModal);
  deleteModalOverlay.addEventListener('click', (e) => {
    if (e.target === deleteModalOverlay) closeDeleteModal();
  });
  
  deleteConfirmBtn.addEventListener('click', async () => {
    if (deletingItemIds.length > 1) {
      saveStateForUndo();
      
      let hadUnsortedItem = false;
      
      for (const itemId of deletingItemIds) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;
        
        if (item.parentId === UNSORTED_FOLDER_ID) {
          hadUnsortedItem = true;
        }
        
        if (item.type === 'folder') {
          const children = items.filter(i => i.parentId === itemId);
          for (const child of children) {
            await deleteItemRecursive(child.id);
          }
        }
        
        const index = items.findIndex(i => i.id === itemId);
        if (index !== -1) {
          items.splice(index, 1);
        }
      }
      
      if (hadUnsortedItem) {
        checkAndDeleteUnsortedFolderIfEmpty();
      }
      
      await saveItems();
      clearSelection();
      renderItems();
      closeDeleteModal();
    } else if (deletingItemId) {
      await deleteItem(deletingItemId);
      closeDeleteModal();
    }
  });
  
  // Move banner
  moveBannerDismiss.addEventListener('click', () => {
    exitMoveMode(true, navigateToFolderWrapper);
  });
  
  moveBannerAction.addEventListener('click', () => {
    moveItemToTargetFolder(currentFolderId, navigateToFolderWrapper);
  });
}

// ============================================
// PASTE HANDLER
// ============================================

function initPasteHandler() {
  document.addEventListener('paste', async (e) => {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA' ||
                           activeElement.isContentEditable;
    
    const addModalOverlay = document.getElementById('add-modal-overlay');
    const addFolderModalOverlay = document.getElementById('add-folder-modal-overlay');
    const editModalOverlay = document.getElementById('edit-modal-overlay');
    const deleteModalOverlay = document.getElementById('delete-modal-overlay');
    
    const isModalOpen = addModalOverlay.classList.contains('active') ||
                        addFolderModalOverlay.classList.contains('active') ||
                        editModalOverlay.classList.contains('active') ||
                        deleteModalOverlay.classList.contains('active');
    
    if (isInputFocused || isModalOpen) {
      return;
    }
    
    const clipboardText = e.clipboardData.getData('text').trim();
    
    if (!clipboardText) return;
    
    if (isValidUrl(clipboardText)) {
      e.preventDefault();
      
      const domainTitle = getTitleFromUrl(clipboardText);
      showPasteNotification(domainTitle);
      
      const fetchedTitle = await fetchPageTitle(clipboardText);
      const title = fetchedTitle || domainTitle;
      
      await addItem('link', title, clipboardText);
    }
  });
}

// ============================================
// STORAGE CHANGE LISTENER
// ============================================

function initStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.speedDialItems) {
      setItems(changes.speedDialItems.newValue || []);
      renderItems();
      renderBreadcrumb();
    }
  });
}

// ============================================
// UNDO WRAPPER
// ============================================

function undoWrapper() {
  undo(renderItems, renderBreadcrumb);
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // Helper to defer non-critical work until the main thread is idle.
  const runIdle = (fn) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(fn, { timeout: 500 });
    } else {
      setTimeout(fn, 0);
    }
  };
  
  // Initialize caches and theme as early as possible.
  await Promise.all([initFaviconCache(), loadTheme()]);
  initThemePicker();
  
  // Initialize DOM elements for all modules
  initSearchElements();
  initRenderElements();
  initInteractionElements();
  initKeyboardElements();
  
  // Set callbacks
  setRenderCallbacks(renderItems, renderBreadcrumb);
  setImportExportCallbacks(renderItems);
  setKeyboardCallbacks({
    renderItems,
    renderBreadcrumb,
    navigateToFolder: navigateToFolderWrapper,
    exitSearchMode: exitSearchModeWrapper,
    enterSearchMode: enterSearchModeWrapper,
    deleteItem,
    undo: undoWrapper,
    selectAll: selectAllItems,
    openSelectedLinks,
    clearSelection,
    exitMoveMode: (stayInFolder) => exitMoveMode(stayInFolder, navigateToFolderWrapper),
    openDeleteModal,
    openDeleteModalMultiple,
    getSelectionSize,
    getSelectedIds: getSelectedIdsArray
  });
  
  // Initialize event delegation and context menu early for interactivity.
  initEventDelegation();
  initContextMenu(deleteItem, navigateToFolderWrapper);
  
  // Initialize modal listeners and storage listener (critical for correctness).
  initModalEventListeners();
  initStorageListener();
  
  // Load persisted data in parallel.
  await Promise.all([loadItems(), loadSearchHistory()]);
  
  // Initialize history state
  initializeHistoryState(renderItems, renderBreadcrumb);
  
  // Render if not already rendered
  if (!window.location.hash.startsWith('#folder/')) {
    renderItems();
    renderBreadcrumb();
  }
  
  // Set up popstate listener
  window.addEventListener('popstate', (e) => handlePopState(e, renderItems, renderBreadcrumb));
  
  // Set up search input listener
  searchInput.addEventListener('input', (e) => {
    handleSearchInput(e, focusItem, resetKeyboardFocus, exitSearchModeWrapper);
  });
  
  // Defer non-critical work to keep first paint fast.
  runIdle(() => {
    initMultiSelect();
    initKeyboardShortcuts();
    initImportExport();
    initPasteHandler();
  });
}

// Start the app
init();

