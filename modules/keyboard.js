// ============================================
// KEYBOARD MODULE (Chrome Native Bookmarks)
// Handles keyboard shortcuts and navigation
// ============================================

import {
  currentFolderId, isSearchMode, searchQuery, focusedItemIndex, setFocusedItemIndex,
  originalSearchQuery, ROOT_FOLDER_ID
} from './state.js';
import { isUrl, navigateToUrl, performDefaultSearch } from './utils.js';
import { getFaviconUrl, copyLinkToClipboard, getBookmarkById } from './storage.js';
import { getFolderById } from './navigation.js';
import { getNavigableItems, setSearchIcon, setSearchResultType } from './search.js';

// DOM elements
let searchInput = null;
let itemsGrid = null;

// Callbacks
let navigateToFolderCallback = null;
let exitSearchModeCallback = null;
let enterSearchModeCallback = null;
let deleteItemCallback = null;
let selectAllCallback = null;
let openSelectedLinksCallback = null;
let clearSelectionCallback = null;
let openDeleteModalCallback = null;
let openDeleteModalMultipleCallback = null;
let getSelectionSizeCallback = null;
let getSelectedIdsCallback = null;
let undoCallback = null;
let hideContextMenuCallback = null;
let isContextMenuActiveCallback = null;
const FOCUSED_ITEM_TOP_GAP = 140;
const FOCUSED_ITEM_BOTTOM_GAP = 48;

async function getSelectedBookmarkUrls() {
  if (!getSelectedIdsCallback) return [];

  const selectedIds = getSelectedIdsCallback();
  if (!selectedIds || selectedIds.length === 0) {
    return [];
  }

  const urls = [];
  for (const id of selectedIds) {
    const bookmark = await getBookmarkById(id);
    if (bookmark && bookmark.url) {
      urls.push(bookmark.url);
    }
  }

  return urls;
}

export function initKeyboardElements() {
  searchInput = document.getElementById('search-input');
  itemsGrid = document.getElementById('items-grid');
}

export function setKeyboardCallbacks(callbacks) {
  navigateToFolderCallback = callbacks.navigateToFolder;
  exitSearchModeCallback = callbacks.exitSearchMode;
  enterSearchModeCallback = callbacks.enterSearchMode;
  deleteItemCallback = callbacks.deleteItem;
  selectAllCallback = callbacks.selectAll;
  openSelectedLinksCallback = callbacks.openSelectedLinks;
  clearSelectionCallback = callbacks.clearSelection;
  openDeleteModalCallback = callbacks.openDeleteModal;
  openDeleteModalMultipleCallback = callbacks.openDeleteModalMultiple;
  getSelectionSizeCallback = callbacks.getSelectionSize;
  getSelectedIdsCallback = callbacks.getSelectedIds;
  undoCallback = callbacks.undo;
  hideContextMenuCallback = callbacks.hideContextMenu;
  isContextMenuActiveCallback = callbacks.isContextMenuActive;
}

// ============================================
// FOCUS MANAGEMENT
// ============================================

export function clearItemFocus() {
  if (!itemsGrid) return;
  itemsGrid.querySelectorAll('.list-item.keyboard-focused').forEach(el => {
    el.classList.remove('keyboard-focused');
  });
}

export function keepFocusedItemVisible(item) {
  const rect = item.getBoundingClientRect();
  const bottomBoundary = window.innerHeight - FOCUSED_ITEM_BOTTOM_GAP;

  if (rect.bottom > bottomBoundary) {
    window.scrollBy({ top: rect.bottom - bottomBoundary, behavior: 'auto' });
  } else if (rect.top < FOCUSED_ITEM_TOP_GAP) {
    window.scrollBy({ top: rect.top - FOCUSED_ITEM_TOP_GAP, behavior: 'auto' });
  }
}

export function focusItem(index, updateInputWithSuggestion = false) {
  const navigableItems = getNavigableItems();
  if (navigableItems.length === 0) return;

  clearItemFocus();

  if (index < 0) index = 0;
  if (index >= navigableItems.length) index = navigableItems.length - 1;

  setFocusedItemIndex(index);
  const item = navigableItems[focusedItemIndex];
  item.classList.add('keyboard-focused');

  updateSearchIconForFocusedItem(item);

  if (updateInputWithSuggestion && isSearchMode && item.classList.contains('suggestion-item')) {
    const suggestionText = item.dataset.suggestion;
    if (suggestionText && searchInput) {
      searchInput.value = suggestionText;
    }
  }

  keepFocusedItemVisible(item);
}

export function updateSearchIconForFocusedItem(item) {
  if (!isSearchMode) return;

  const itemType = item.dataset.type;
  setSearchResultType(itemType);

  if (item.classList.contains('url-item')) {
    const url = item.dataset.url;
    if (url) {
      setSearchIcon('favicon', getFaviconUrl(url));
    } else {
      setSearchIcon('globe');
    }
    return;
  }

  if (itemType === 'folder') {
    setSearchIcon('folder');
    return;
  }

  if (itemType === 'link') {
    const href = item.getAttribute('href');
    if (href) {
      setSearchIcon('favicon', getFaviconUrl(href));
    } else {
      setSearchIcon('link');
    }
    return;
  }

  if (item.classList.contains('browser-history-item')) {
    const href = item.getAttribute('href');
    if (href) {
      setSearchIcon('favicon', getFaviconUrl(href));
    } else {
      setSearchIcon('history');
    }
    return;
  }

  if (item.classList.contains('chrome-page-item') || itemType === 'chrome-page') {
    const href = item.getAttribute('href');
    if (href) {
      setSearchIcon('favicon', getFaviconUrl(href));
    } else {
      setSearchIcon('globe');
    }
    return;
  }

  if (item.classList.contains('suggestion-item')) {
    setSearchIcon('search');
    return;
  }

  setSearchIcon('search');
}

export function focusNextItem() {
  const navigableItems = getNavigableItems();
  if (navigableItems.length === 0) return;

  if (focusedItemIndex < 0) {
    focusItem(0, true);
  } else if (focusedItemIndex < navigableItems.length - 1) {
    focusItem(focusedItemIndex + 1, true);
  }
}

export function focusPreviousItem() {
  const navigableItems = getNavigableItems();
  if (navigableItems.length === 0) return;

  if (focusedItemIndex <= 0) {
    if (isSearchMode && originalSearchQuery !== undefined && searchInput) {
      searchInput.value = originalSearchQuery;
      clearItemFocus();
      setFocusedItemIndex(-1);
      searchInput.focus();
      searchInput.selectionStart = searchInput.selectionEnd = originalSearchQuery.length;
      if (originalSearchQuery.trim()) {
        const queryIsUrl = isUrl(originalSearchQuery);
        setSearchIcon(queryIsUrl ? 'globe' : 'search');
      } else {
        setSearchIcon('search');
      }
      setSearchResultType();
    }
  } else {
    focusItem(focusedItemIndex - 1, true);
  }
}

export async function activateFocusedItem(openInNewTab = false) {
  const navigableItems = getNavigableItems();
  if (focusedItemIndex < 0 || focusedItemIndex >= navigableItems.length) return;

  const item = navigableItems[focusedItemIndex];
  const itemId = item.dataset.itemId;
  const itemType = item.dataset.type;

  if (item.classList.contains('url-item')) {
    const url = item.dataset.url;
    if (url) {
      navigateToUrl(url, openInNewTab);
    }
    return;
  }

  if (item.classList.contains('suggestion-item')) {
    const suggestion = item.dataset.suggestion;
    if (suggestion) {
      await performDefaultSearch(suggestion, openInNewTab);
    }
    return;
  }

  if (item.classList.contains('browser-history-item')) {
    const href = item.getAttribute('href');
    if (href) {
      navigateToUrl(href, openInNewTab);
    }
    return;
  }

  if (item.classList.contains('chrome-page-item') || itemType === 'chrome-page') {
    const href = item.getAttribute('href');
    if (href) {
      navigateToUrl(href, openInNewTab);
    }
    return;
  }

  if (itemType === 'folder') {
    const openedFromSearch = isSearchMode;
    if (openedFromSearch && exitSearchModeCallback) {
      exitSearchModeCallback();
    }
    if (navigateToFolderCallback) {
      await navigateToFolderCallback(itemId, true, true, openedFromSearch);
    }
  } else if (itemType === 'link') {
    const href = item.getAttribute('href');
    if (href) {
      navigateToUrl(href, openInNewTab);
    }
  }
}

export function resetKeyboardFocus() {
  setFocusedItemIndex(-1);
  clearItemFocus();

  if (isSearchMode && searchQuery.trim()) {
    const queryIsUrl = isUrl(searchQuery);
    setSearchIcon(queryIsUrl ? 'globe' : 'search');
  }
  setSearchResultType();
}

export async function deleteFocusedItem() {
  const navigableItems = getNavigableItems();
  if (focusedItemIndex < 0 || focusedItemIndex >= navigableItems.length) return;

  const item = navigableItems[focusedItemIndex];
  const itemId = item.dataset.itemId;
  const itemType = item.dataset.type;

  if (itemType === 'folder') {
    if (openDeleteModalCallback) {
      openDeleteModalCallback(itemId);
    }
  } else {
    if (deleteItemCallback) {
      await deleteItemCallback(itemId);
    }

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

// ============================================
// KEYBOARD EVENT HANDLER
// ============================================

export function initKeyboardShortcuts() {

  const deleteModalOverlay = document.getElementById('delete-modal-overlay');

  document.addEventListener('keydown', async (e) => {
    // Escape key
    if (e.key === 'Escape') {
      if (isContextMenuActiveCallback && isContextMenuActiveCallback()) {
        if (hideContextMenuCallback) hideContextMenuCallback();
        return;
      }

      if (getSelectionSizeCallback && getSelectionSizeCallback() > 0) {
        if (clearSelectionCallback) clearSelectionCallback();
        return;
      }

      if (isSearchMode) {
        if (exitSearchModeCallback) exitSearchModeCallback();
        return;
      }

      if (deleteModalOverlay.classList.contains('active')) {
        deleteModalOverlay.classList.remove('active');
        return;
      }

      // Navigate to parent folder
      if (currentFolderId !== ROOT_FOLDER_ID && navigateToFolderCallback) {
        const currentFolder = await getFolderById(currentFolderId);
        const parentFolderId = currentFolder ? currentFolder.parentId : ROOT_FOLDER_ID;
        navigateToFolderCallback(parentFolderId || ROOT_FOLDER_ID, true, true);
      }
    }

    // Select all with Cmd/Ctrl + A
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      const isModalOpen = deleteModalOverlay.classList.contains('active');

      if (!isInputFocused && !isModalOpen && !isSearchMode && selectAllCallback) {
        e.preventDefault();
        selectAllCallback();
      }
    }

    // Copy focused/selected bookmarks with Cmd/Ctrl + C
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      const isModalOpen = deleteModalOverlay.classList.contains('active');

      if (!isInputFocused && !isModalOpen) {
        const bookmarkUrls = await getSelectedBookmarkUrls();

        if (bookmarkUrls.length > 0) {
          e.preventDefault();
          const successMessage = bookmarkUrls.length > 1 ? 'Links copied' : 'Link copied';
          copyLinkToClipboard(bookmarkUrls.join('\n'), successMessage);
          return;
        }

        const navigableItems = getNavigableItems();
        if (focusedItemIndex >= 0 && focusedItemIndex < navigableItems.length) {
          const item = navigableItems[focusedItemIndex];
          if (item.dataset.type === 'link') {
            const itemId = item.dataset.itemId;
            const focusedBookmark = await getBookmarkById(itemId);
            const url = focusedBookmark?.url || item.getAttribute('href');
            if (url) {
              e.preventDefault();
              copyLinkToClipboard(url);
              return;
            }
          }
        }
      }
    }

    // Undo with Cmd/Ctrl + Z
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      const isModalOpen = deleteModalOverlay.classList.contains('active');

      if (!isInputFocused && !isModalOpen && undoCallback) {
        e.preventDefault();
        undoCallback();
        return;
      }
    }

    // Delete selected items
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      const isModalOpen = deleteModalOverlay.classList.contains('active');

      const selectionSize = getSelectionSizeCallback ? getSelectionSizeCallback() : 0;

      if (!isInputFocused && !isModalOpen && selectionSize > 0 && !isSearchMode) {
        e.preventDefault();
        if (selectionSize > 1) {
          if (openDeleteModalMultipleCallback && getSelectedIdsCallback) {
            openDeleteModalMultipleCallback(getSelectedIdsCallback());
          }
        } else {
          const selectedIds = getSelectedIdsCallback ? getSelectedIdsCallback() : [];
          const itemId = selectedIds[0];
          const bookmark = await getBookmarkById(itemId);
          if (bookmark && !bookmark.url) {
            // It's a folder
            if (openDeleteModalCallback) openDeleteModalCallback(itemId);
          } else if (deleteItemCallback) {
            deleteItemCallback(itemId);
          }
          if (clearSelectionCallback) clearSelectionCallback();
        }
      }
    }

    // Enter key opens selected links
    if (e.key === 'Enter') {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      const isModalOpen = deleteModalOverlay.classList.contains('active');

      const selectionSize = getSelectionSizeCallback ? getSelectionSizeCallback() : 0;

      if (!isInputFocused && !isModalOpen && selectionSize > 0 && !isSearchMode) {
        e.preventDefault();
        if (openSelectedLinksCallback) openSelectedLinksCallback();
      }
    }

    // Arrow key navigation
    const isModalOpen = deleteModalOverlay.classList.contains('active');

    if (!isModalOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
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

    // Left arrow - go back
    if (e.key === 'ArrowLeft' && !isModalOpen) {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      if (!isInputFocused) {
        e.preventDefault();

        if (isSearchMode && exitSearchModeCallback) {
          exitSearchModeCallback();
          return;
        }

        if (currentFolderId !== ROOT_FOLDER_ID && navigateToFolderCallback) {
          const currentFolder = await getFolderById(currentFolderId);
          const parentFolderId = currentFolder ? currentFolder.parentId : ROOT_FOLDER_ID;
          navigateToFolderCallback(parentFolderId || ROOT_FOLDER_ID, true, true);
        }
      }
    }

    // Enter or Right arrow to activate focused item
    if ((e.key === 'Enter' || e.key === 'ArrowRight') && !isModalOpen) {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      if (!isInputFocused || activeElement === searchInput) {
        if (focusedItemIndex >= 0) {
          e.preventDefault();
          const openInNewTab = e.metaKey || e.ctrlKey;
          activateFocusedItem(openInNewTab);
          return;
        }

        if (isSearchMode && searchQuery.trim() && e.key === 'Enter') {
          e.preventDefault();
          const queryToSearch = searchQuery.trim();
          await performDefaultSearch(queryToSearch);
          return;
        }
      }
    }

    // Backspace to delete focused item
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

    // Trigger search mode on printable character
    if (!isSearchMode) {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;

      const isPrintableChar = e.key.length === 1 && /\S/.test(e.key);
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

      if (isPrintableChar && !hasModifier && !isInputFocused && !isModalOpen && enterSearchModeCallback) {
        e.preventDefault();
        enterSearchModeCallback(e.key);
      }
    }
  });

  // Click outside search bar to exit
  document.addEventListener('click', (e) => {
    const searchBar = document.getElementById('search-bar');
    if (isSearchMode && searchBar && !searchBar.contains(e.target) && itemsGrid && !itemsGrid.contains(e.target)) {
      if (exitSearchModeCallback) exitSearchModeCallback();
    }

    if (focusedItemIndex >= 0 && itemsGrid && !itemsGrid.contains(e.target)) {
      resetKeyboardFocus();
    }
  });
}
