// ============================================
// MAIN.JS - Entry Point (Chrome Native Bookmarks)
// ============================================

// Import state
import {
  currentFolderId, setCurrentFolderId, isSearchMode, eventDelegationInitialized,
  setEventDelegationInitialized, isDragging, ROOT_FOLDER_ID, deletingItemId, deletingItemIds,
  getSelectionSize, getSelectedIdsArray
} from './modules/state.js';

// Import utilities
import {
  isValidUrl, getTitleFromUrl, showPasteNotification, navigateToUrl, showNotification,
  openAskTarget
} from './modules/utils.js';

// Import storage (Chrome bookmarks API)
import {
  initFaviconCache, loadTheme, initThemePicker, loadFolderIcons, clearLegacySearchHistory,
  fetchPageTitle, createBookmark, deleteBookmark,
  saveForUndo, performUndo, canUndo, saveCreateForUndo, loadBookmarkSearchEntries
} from './modules/storage.js';

// Import navigation
import {
  renderBreadcrumb, navigateToFolder, handlePopState, initializeHistoryState,
  startInlineFolderEdit
} from './modules/navigation.js';

// Import search
import {
  initSearchElements, enterSearchMode, exitSearchMode, handleSearchInput, showMoreHistory
} from './modules/search.js';

// Import render
import { initRenderElements, renderItems } from './modules/render.js';

// Import interactions
import {
  initInteractionElements, setRenderCallbacks, openDeleteModal, openDeleteModalMultiple,
  closeDeleteModal, initContextMenu, showContextMenu, hideContextMenu, isContextMenuActive,
  initMultiSelect, clearSelection, toggleItemSelection, selectAllItems, openSelectedLinks,
  handleDragStart, handleDragEnd, handleDragOver, handleDragEnter, handleDragLeave, handleDrop,
  handleBreadcrumbDragOver, handleBreadcrumbDragEnter, handleBreadcrumbDragLeave,
  handleBreadcrumbDrop, getModalElements
} from './modules/interactions.js';

// Import keyboard
import {
  initKeyboardElements, setKeyboardCallbacks, initKeyboardShortcuts, focusItem,
  focusItemById, resetKeyboardFocus
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
// CRUD OPERATIONS (Chrome Bookmarks API)
// ============================================

async function addItem(title, url) {
  const bookmark = await createBookmark(currentFolderId, title, url);
  if (bookmark) {
    saveCreateForUndo(bookmark);
    renderItems();
    renderBreadcrumb();
  }
  return bookmark;
}

async function deleteItem(itemId) {
  // Save bookmark data for undo before deleting
  await saveForUndo([itemId], 'delete');

  const success = await deleteBookmark(itemId);

  if (success) {
    // If the deleted item was the current folder, navigate to root
    if (itemId === currentFolderId) {
      setCurrentFolderId(ROOT_FOLDER_ID);
      renderBreadcrumb();
    }
    renderItems();
  }

  return success;
}

// Undo function
async function handleUndo() {
  if (!canUndo()) {
    return;
  }

  const result = await performUndo();

  if (result.success) {
    showNotification(result.message);
    renderItems();
    renderBreadcrumb();
  }
}

// ============================================
// NAVIGATION WRAPPER
// ============================================

function navigateToFolderWrapper(
  folderId,
  pushState = true,
  autoFocusFirst = false,
  restoreFullPath = false,
  restoreFocusItemId = null
) {
  return navigateToFolder(folderId, pushState, autoFocusFirst, {
    renderItems,
    renderBreadcrumb,
    resetKeyboardFocus,
    focusItem,
    focusItemById,
    restoreFullPath,
    restoreFocusItemId
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
    // Find clicked list item
    const listItem = e.target.closest('.list-item, .url-item, .suggestion-item, .browser-history-item');
    if (!listItem) return;

    const itemType = listItem.dataset.type;
    const itemId = listItem.dataset.itemId;

    if (itemType === 'history-more') {
      showMoreHistory();
      return;
    }

    // URL items
    if (listItem.classList.contains('url-item')) {
      const url = listItem.dataset.url;
      navigateToUrl(url);
      return;
    }

    // Search suggestion items
    if (listItem.classList.contains('suggestion-item')) {
      const suggestionText = listItem.dataset.suggestion;
      if (suggestionText) {
        openAskTarget(suggestionText, listItem.dataset.provider, e.metaKey || e.ctrlKey);
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
    if (e.shiftKey && !isSearchMode) {
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
      const openedFromSearch = isSearchMode;
      if (openedFromSearch) {
        exitSearchModeWrapper();
      }
      await navigateToFolderWrapper(itemId, true, false, openedFromSearch);
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
    const listItem = e.target.closest('.list-item[data-item-id], .browser-history-item');
    if (listItem) {
      e.preventDefault();
      e.stopPropagation();
      const itemId = listItem.dataset.itemId;
      showContextMenu(e.clientX, e.clientY, itemId, listItem);
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
  const { deleteModalOverlay, deleteConfirmBtn } = getModalElements();

  // Delete modal
  deleteModalOverlay.addEventListener('click', (e) => {
    if (e.target === deleteModalOverlay) closeDeleteModal();
  });

  deleteConfirmBtn.addEventListener('click', async () => {
    if (deletingItemIds.length > 1) {
      // Save for undo before deleting multiple items
      await saveForUndo(deletingItemIds, 'delete');

      // Delete multiple items
      for (const itemId of deletingItemIds) {
        await deleteBookmark(itemId);
      }

      clearSelection();
      renderItems();
      closeDeleteModal();
    } else if (deletingItemId) {
      await deleteItem(deletingItemId);
      closeDeleteModal();
    }
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

    const deleteModalOverlay = document.getElementById('delete-modal-overlay');

    const isModalOpen = deleteModalOverlay.classList.contains('active');

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

      await addItem(title, clipboardText);
    }
  });
}

// ============================================
// CHROME BOOKMARKS EVENT LISTENERS
// ============================================

function initBookmarkListeners() {
  // Listen for bookmark changes made outside the extension
  chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    // Only refresh if the change is in the current folder or affects visible content
    if (bookmark.parentId === currentFolderId || bookmark.parentId === ROOT_FOLDER_ID) {
      renderItems();
      renderBreadcrumb();
    }
  });

  chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    // Refresh if removed item was in current folder or was the current folder
    if (removeInfo.parentId === currentFolderId || id === currentFolderId) {
      if (id === currentFolderId) {
        setCurrentFolderId(ROOT_FOLDER_ID);
      }
      renderItems();
      renderBreadcrumb();
    }
  });

  chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
    renderItems();
    renderBreadcrumb();
  });

  chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
    // Refresh if move affects current folder
    if (moveInfo.parentId === currentFolderId || moveInfo.oldParentId === currentFolderId) {
      renderItems();
      renderBreadcrumb();
    }
  });
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

  // Start the shared bookmark snapshot alongside appearance settings.
  // IndexedDB and legacy cleanup must not hold up the first render.
  void initFaviconCache();
  void loadBookmarkSearchEntries();
  await Promise.all([loadTheme(), loadFolderIcons()]);
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
    navigateToFolder: navigateToFolderWrapper,
    exitSearchMode: exitSearchModeWrapper,
    enterSearchMode: enterSearchModeWrapper,
    deleteItem,
    selectAll: selectAllItems,
    openSelectedLinks,
    clearSelection,
    openDeleteModal,
    openDeleteModalMultiple,
    getSelectionSize,
    getSelectedIds: getSelectedIdsArray,
    undo: handleUndo,
    hideContextMenu,
    isContextMenuActive
  });

  // Initialize event delegation and context menu early for interactivity.
  initEventDelegation();
  initContextMenu(deleteItem, navigateToFolderWrapper, exitSearchModeWrapper);

  // Initialize modal listeners and bookmark listeners
  initModalEventListeners();
  initBookmarkListeners();

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
    void clearLegacySearchHistory();
    initMultiSelect();
    initKeyboardShortcuts();
    initImportExport();
    initPasteHandler();
  });
}

// Start the app
init();
