// ============================================
// INTERACTIONS MODULE (Chrome Native Bookmarks)
// Handles modals, context menus, drag-drop, and multi-select
// ============================================

import {
  currentFolderId, setDeletingItemId, setDeletingItemIds, contextMenu, setContextMenu,
  contextMenuItemId, setContextMenuItemId, bodyContextMenu, setBodyContextMenu,
  clearSelectionState, addToSelection, removeFromSelection, hasSelection, getSelectionSize,
  getSelectedIdsArray, isBoxSelecting, setIsBoxSelecting, selectionBox, setSelectionBox,
  selectionBoxElement, setSelectionBoxElement, draggedElement, setDraggedElement, draggedItemType,
  setDraggedItemType, setIsDragging, setDraggedItemIds,
  setDropPosition, setDropTargetElement,
  isSearchMode, ROOT_FOLDER_ID, setInlineFolderMode, setInlineFolderTargetId,
  setInlineFolderParentId, setInlineFolderDraft, setInlineFolderRenameUndoEnabled,
  resetInlineFolderState, setInlineBookmarkMode,
  setInlineBookmarkTargetId, setInlineBookmarkParentId, setInlineBookmarkDraftUrl,
  setInlineBookmarkDraftTitle, resetInlineBookmarkState
} from './state.js';
import { escapeHtml, showNotification, getFolderIconSvg, getIconSvg, folderIconOptions } from './utils.js';
import { deleteHistoryUrl } from './search.js';
import { getIconOptionScrollDelta, searchFolderIcons } from './icon-search.js';
import {
  getFaviconUrl, copyLinkToClipboard, showThemePicker, getBookmarks, getBookmarkById,
  getTotalBookmarkCount, isFolderOrDescendant, saveMoveForUndo,
  saveCreateFolderFromSelectedForUndo, getFolderIconName, setFolderIconName
} from './storage.js';

// ============================================
// DOM ELEMENT REFERENCES
// ============================================

let deleteModalOverlay, deleteModalIcon, deleteModalTitle, deleteModalDescription;
let deleteConfirmBtn;
let itemsGrid, breadcrumb;
let keyboardReorderActive = false;
let folderIconMenu = null;
let folderIconMenuItemId = null;
let folderIconMenuAnchorRect = null;
let folderIconMenuOriginalIconName = null;
let contextMenuAnchorElement = null;
let lastPointerPosition = null;
const FOLDER_ICON_GRID_COLUMNS = 6;

// Callbacks for render functions
let renderItemsCallback = null;
let renderBreadcrumbCallback = null;
let deleteItemCallback = null;

export function setRenderCallbacks(renderItems, renderBreadcrumb) {
  renderItemsCallback = renderItems;
  renderBreadcrumbCallback = renderBreadcrumb;
}

// ============================================
// INITIALIZATION
// ============================================

export function initInteractionElements() {
  // Delete modal
  deleteModalOverlay = document.getElementById('delete-modal-overlay');
  deleteModalIcon = document.getElementById('delete-modal-icon');
  deleteModalTitle = document.getElementById('delete-modal-title');
  deleteModalDescription = document.getElementById('delete-modal-description');
  deleteConfirmBtn = document.getElementById('delete-confirm-btn');

  // Grid and breadcrumb
  itemsGrid = document.getElementById('items-grid');
  breadcrumb = document.getElementById('breadcrumb');

  // Context menus
  setContextMenu(document.getElementById('context-menu'));
  setBodyContextMenu(document.getElementById('body-context-menu'));
  folderIconMenu = document.getElementById('folder-icon-menu');
}

// ============================================
// INLINE FOLDER CREATE/RENAME
// ============================================

export function startInlineFolderCreate() {
  resetInlineBookmarkState();
  resetInlineFolderState();
  setInlineFolderMode('create');
  setInlineFolderParentId(currentFolderId);
  setInlineFolderTargetId(null);
  setInlineFolderDraft('');
  if (renderItemsCallback) renderItemsCallback();
  if (renderBreadcrumbCallback) renderBreadcrumbCallback();
}

export function startInlineFolderRename(folderId) {
  getBookmarkById(folderId).then(folder => {
    if (!folder) return;
    enterInlineFolderRename(folder);
  });
}

function enterInlineFolderRename(folder, { undoEnabled = true } = {}) {
  resetInlineBookmarkState();
  resetInlineFolderState();
  setInlineFolderMode('rename');
  setInlineFolderTargetId(folder.id);
  setInlineFolderParentId(folder.parentId);
  setInlineFolderDraft(folder.title || '');
  setInlineFolderRenameUndoEnabled(undoEnabled);
  if (renderItemsCallback) return renderItemsCallback();
}

// ============================================
// INLINE BOOKMARK CREATE/EDIT
// ============================================

export function startInlineBookmarkCreate() {
  resetInlineFolderState();
  resetInlineBookmarkState();
  setInlineBookmarkMode('create');
  setInlineBookmarkParentId(currentFolderId);
  setInlineBookmarkTargetId(null);
  setInlineBookmarkDraftUrl('');
  setInlineBookmarkDraftTitle('');
  if (renderItemsCallback) renderItemsCallback();
  if (renderBreadcrumbCallback) renderBreadcrumbCallback();
}

export function startInlineBookmarkEdit(bookmarkId) {
  getBookmarkById(bookmarkId).then(bookmark => {
    if (!bookmark || !bookmark.url) return;
    resetInlineFolderState();
    resetInlineBookmarkState();
    setInlineBookmarkMode('edit');
    setInlineBookmarkTargetId(bookmarkId);
    setInlineBookmarkParentId(bookmark.parentId);
    setInlineBookmarkDraftUrl(bookmark.url || '');
    setInlineBookmarkDraftTitle(bookmark.title || '');
    if (renderItemsCallback) renderItemsCallback();
  });
}

// ============================================
// DELETE MODAL
// ============================================

function getDeletedBookmarkCopy(count) {
  return `${count} ${count === 1 ? 'bookmark' : 'bookmarks'} will be deleted`;
}

function setDeleteModalContent({ title, bookmarkCount, iconName }) {
  deleteModalTitle.textContent = title;
  deleteModalDescription.textContent = getDeletedBookmarkCopy(bookmarkCount);
  deleteModalIcon.innerHTML = getFolderIconSvg(iconName);
}

export async function openDeleteModal(itemId) {
  const item = await getBookmarkById(itemId);
  if (!item) return;

  const isFolder = !item.url;
  const bookmarkCount = isFolder ? await getTotalBookmarkCount(itemId) : 1;

  if (isFolder && bookmarkCount === 0 && deleteItemCallback) {
    await deleteItemCallback(itemId);
    return;
  }

  setDeletingItemId(itemId);
  setDeletingItemIds([itemId]);

  setDeleteModalContent({
    title: `Delete ${item.title}?`,
    bookmarkCount,
    iconName: isFolder ? getFolderIconName(itemId) : 'bookmark'
  });
  deleteModalOverlay.classList.add('active');

  setTimeout(() => deleteConfirmBtn.focus(), 50);
}

export async function openDeleteModalMultiple(itemIds) {
  if (!itemIds || itemIds.length === 0) return;

  const items = (await Promise.all(itemIds.map(getBookmarkById))).filter(Boolean);
  if (items.length === 0) return;

  setDeletingItemIds(itemIds);
  setDeletingItemId(itemIds[0]);

  const folders = items.filter(item => !item.url);
  const bookmarkCount = (await Promise.all(items.map(item => (
    item.url ? 1 : getTotalBookmarkCount(item.id)
  )))).reduce((total, count) => total + count, 0);
  const allFolders = folders.length === items.length;
  const noun = allFolders ? 'folders' : 'items';

  setDeleteModalContent({
    title: `Delete ${items.length} ${noun}?`,
    bookmarkCount,
    iconName: folders.length > 0 && !allFolders ? 'trash-can' : 'folder-closed'
  });

  deleteModalOverlay.classList.add('active');

  setTimeout(() => deleteConfirmBtn.focus(), 50);
}

export function closeDeleteModal() {
  deleteModalOverlay.classList.remove('active');
  setDeletingItemId(null);
  setDeletingItemIds([]);
}

// ============================================
// CONTEXT MENU
// ============================================

export function initContextMenu(deleteItemFn, navigateToFolder, exitSearchMode) {
  deleteItemCallback = deleteItemFn;

  document.addEventListener('pointermove', (e) => {
    lastPointerPosition = { x: e.clientX, y: e.clientY };
  }, { passive: true });

  for (const menu of [contextMenu, bodyContextMenu]) {
    menu?.addEventListener('keydown', handleContextMenuKeydown);
  }

  // Open all menu item
  document.getElementById('context-open-all').addEventListener('click', async () => {
    // Capture itemId before any async work, as hideContextMenu() clears it during event propagation
    const itemId = contextMenuItemId;
    hideContextMenu();

    if (getSelectionSize() > 1 && itemId && hasSelection(itemId)) {
      await openSelectedLinks();
    } else if (itemId) {
      openAllLinksInFolder(itemId);
    }
  });

  // Copy link
  document.getElementById('context-copy-link').addEventListener('click', async () => {
    // Capture the history URL before hiding the menu clears its anchor.
    const historyUrl = contextMenuAnchorElement?.dataset.type === 'browser-history'
      ? contextMenuAnchorElement.getAttribute('href') : null;
    const itemId = contextMenuItemId;
    hideContextMenu();

    if (historyUrl) {
      await copyLinkToClipboard(historyUrl);
    } else if (itemId) {
      const item = await getBookmarkById(itemId);
      if (item && item.url) {
        await copyLinkToClipboard(item.url);
      }
    }
  });

  // Reveal a bookmark from search inside its parent folder.
  document.getElementById('context-show-in-folder').addEventListener('click', async () => {
    const itemId = contextMenuItemId;
    hideContextMenu();

    if (!itemId || !isSearchMode) return;
    const item = await getBookmarkById(itemId);
    if (!item?.url || !item.parentId) return;

    exitSearchMode();
    await navigateToFolder(item.parentId, true, false, true, item.id);
  });

  // Edit
  document.getElementById('context-edit').addEventListener('click', async () => {
    // Capture itemId before any async work, as hideContextMenu() clears it during event propagation
    const itemId = contextMenuItemId;
    hideContextMenu();

    if (itemId && !isSearchMode) {
      const item = await getBookmarkById(itemId);
      if (item && !item.url) {
        startInlineFolderRename(itemId);
      } else {
        startInlineBookmarkEdit(itemId);
      }
    }
  });

  // Export
  document.getElementById('context-export').addEventListener('click', () => {
    // Capture itemId before hideContextMenu clears it
    const itemId = contextMenuItemId;
    const selectionSize = getSelectionSize();
    hideContextMenu();

    if (selectionSize > 1 && itemId && hasSelection(itemId)) {
      exportSelectedLinks();
    }
  });

  // Delete
  document.getElementById('context-delete').addEventListener('click', async () => {
    // Capture the URL before hiding the menu clears its anchor.
    const historyUrl = contextMenuAnchorElement?.dataset.type === 'browser-history'
      ? contextMenuAnchorElement.getAttribute('href') : null;
    const itemId = contextMenuItemId;
    const selectionSize = getSelectionSize();
    const selectedIds = getSelectedIdsArray();
    hideContextMenu();

    if (historyUrl) {
      try {
        await deleteHistoryUrl(historyUrl);
        showNotification('Deleted from history');
      } catch (error) {
        console.error('Failed to delete history URL:', error);
        showNotification('Could not delete from history');
      }
      return;
    }

    if (selectionSize > 1 && itemId && hasSelection(itemId)) {
      openDeleteModalMultiple(selectedIds);
    } else if (itemId) {
      const item = await getBookmarkById(itemId);
      if (item && !item.url) {
        openDeleteModal(itemId);
      } else {
        await deleteItemFn(itemId);
      }
    }
  });

  // Create folder from selected links
  document.getElementById('context-create-folder').addEventListener('click', async () => {
    hideContextMenu();
    await createFolderFromSelectedLinks();
  });

  document.getElementById('context-change-icon').addEventListener('click', (e) => {
    e.stopPropagation();
    const itemId = contextMenuItemId;
    if (isSearchMode) {
      hideContextMenu();
      return;
    }
    const iconElement = getFolderIconAnchorElement(itemId);
    const iconRect = iconElement ? iconElement.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
    hideContextMenu();

    if (itemId) {
      showFolderIconMenu(iconRect, itemId);
    }
  });

  if (folderIconMenu) {
    document.addEventListener('keydown', redirectFolderIconTypingToSearch, true);

    folderIconMenu.addEventListener('input', (e) => {
      if (!e.target.classList.contains('folder-icon-search')) return;
      renderFolderIconOptions(e.target.value);
      if (folderIconMenuAnchorRect) positionFolderIconMenu(folderIconMenuAnchorRect);
    });

    folderIconMenu.addEventListener('click', async (e) => {
      e.stopPropagation();
      const option = e.target.closest('.folder-icon-option');
      if (!option || !folderIconMenuItemId) return;

      await applyFolderIconOption(option);
    });

    folderIconMenu.addEventListener('pointerover', (e) => {
      const option = e.target.closest('.folder-icon-option');
      previewFolderIconOption(option || folderIconMenu.querySelector('.folder-icon-option.active'));
    });

    folderIconMenu.addEventListener('pointerleave', () => {
      previewFolderIconOption(folderIconMenu.querySelector('.folder-icon-option.active'));
    });

    folderIconMenu.addEventListener('focusin', (e) => {
      const option = e.target.closest('.folder-icon-option');
      previewFolderIconOption(option || folderIconMenu.querySelector('.folder-icon-option.active'));
    });

    folderIconMenu.addEventListener('keydown', async (e) => {
      if (!folderIconMenu.classList.contains('active')) return;

      const handledKeys = ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter'];
      if (!handledKeys.includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Enter') {
        const activeOption = folderIconMenu.querySelector('.folder-icon-option.active');
        if (activeOption) await applyFolderIconOption(activeOption);
        return;
      }

      moveFolderIconKeyboardSelection(e.key);
    });
  }

  // Body context menu handlers
  document.getElementById('body-context-open-all').addEventListener('click', () => {
    openAllLinksInFolder(currentFolderId);
    hideContextMenu();
  });

  document.getElementById('body-context-add').addEventListener('click', () => {
    hideContextMenu();
    startInlineBookmarkCreate();
  });

  document.getElementById('body-context-add-folder').addEventListener('click', () => {
    hideContextMenu();
    startInlineFolderCreate();
  });

  document.getElementById('body-context-import').addEventListener('click', () => {
    hideContextMenu();
    document.getElementById('import-file-input').click();
  });

  document.getElementById('body-context-export').addEventListener('click', () => {
    hideContextMenu();
    // Export will be called from main.js
    const event = new CustomEvent('exportBookmarks');
    document.dispatchEvent(event);
  });

  document.getElementById('body-context-theme').addEventListener('click', (e) => {
    hideContextMenu();
    showThemePicker(e.detail === 0);
  });

  // Hide on click
  document.addEventListener('click', hideContextMenu);

  // Body context menu trigger
  document.body.addEventListener('contextmenu', (e) => {
    if (e.target === document.body ||
        e.target.classList.contains('container') ||
        e.target.classList.contains('list-view') ||
        e.target.classList.contains('breadcrumb')) {
      e.preventDefault();
      showBodyContextMenu(e.clientX, e.clientY);
    }
  });
}

function redirectFolderIconTypingToSearch(e) {
  if (!folderIconMenu?.classList.contains('active')) return;

  const searchInput = folderIconMenu.querySelector('.folder-icon-search');
  if (!searchInput || e.target === searchInput) return;

  const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
  const isPrintableCharacter = e.key.length === 1 && !hasModifier && !e.isComposing;
  if (!isPrintableCharacter && e.key !== 'Backspace') return;

  e.preventDefault();
  e.stopImmediatePropagation();
  searchInput.focus({ preventScroll: true });

  const selectionStart = searchInput.selectionStart ?? searchInput.value.length;
  const selectionEnd = searchInput.selectionEnd ?? selectionStart;

  if (isPrintableCharacter) {
    searchInput.setRangeText(e.key, selectionStart, selectionEnd, 'end');
  } else if (selectionStart !== selectionEnd) {
    searchInput.setRangeText('', selectionStart, selectionEnd, 'end');
  } else if (selectionStart > 0) {
    searchInput.setRangeText('', selectionStart - 1, selectionStart, 'end');
  }

  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
}

async function createFolderFromSelectedLinks() {
  const selectedIds = getSelectedIdsArray();
  const selectedBookmarks = [];

  for (const id of selectedIds) {
    const bookmark = await getBookmarkById(id);
    if (bookmark && bookmark.url) {
      selectedBookmarks.push(bookmark);
    }
  }

  if (selectedBookmarks.length === 0) {
    showNotification('Select at least one link');
    return;
  }

  // Save original item locations for undo
  const originalItemsData = selectedBookmarks.map(b => ({
    id: b.id,
    originalParentId: b.parentId,
    originalIndex: b.index
  }));

  const folderName = `${selectedBookmarks.length} links`;

  // Create the folder
  const { createFolder } = await import('./storage.js');
  const newFolder = await createFolder(currentFolderId, folderName);

  if (!newFolder) {
    showNotification('Failed to create folder');
    return;
  }

  // Move selected bookmarks into the new folder
  for (const bookmark of selectedBookmarks) {
    await chrome.bookmarks.move(bookmark.id, { parentId: newFolder.id });
  }

  // Save for undo after all operations complete
  saveCreateFolderFromSelectedForUndo(newFolder.id, originalItemsData);

  clearSelection();
  await enterInlineFolderRename(newFolder, { undoEnabled: false });
  if (renderBreadcrumbCallback) renderBreadcrumbCallback();
  showNotification(`Created "${newFolder.title}"`);
}

export async function showContextMenu(x, y, itemId, anchorElement = null) {
  hideContextMenu();

  const isMultiSelect = getSelectionSize() > 1 && hasSelection(itemId);

  if (!hasSelection(itemId) && getSelectionSize() > 0) {
    clearSelection();
  }

  setContextMenuItemId(itemId);
  contextMenuAnchorElement = anchorElement;

  const isHistory = anchorElement?.dataset.type === 'browser-history';
  const item = isHistory ? null : await getBookmarkById(itemId);
  const isFolder = item && !item.url;

  const openAllBtn = document.getElementById('context-open-all');
  const createFolderBtn = document.getElementById('context-create-folder');
  const copyLinkBtn = document.getElementById('context-copy-link');
  const showInFolderBtn = document.getElementById('context-show-in-folder');
  const exportBtn = document.getElementById('context-export');
  const editBtn = document.getElementById('context-edit');
  const changeIconBtn = document.getElementById('context-change-icon');
  const deleteBtn = document.getElementById('context-delete');

  if (isHistory) {
    for (const button of contextMenu.querySelectorAll('.context-menu-item')) {
      button.style.display = button === copyLinkBtn || button === deleteBtn ? 'flex' : 'none';
    }
  } else if (isMultiSelect) {
    const selectedIds = getSelectedIdsArray();
    let hasLinks = false;
    let linksOnly = true;

    for (const id of selectedIds) {
      const b = await getBookmarkById(id);
      if (b) {
        if (b.url) hasLinks = true;
        else linksOnly = false;
      }
    }
    linksOnly = hasLinks && linksOnly;

    openAllBtn.textContent = 'Open all';
    openAllBtn.style.display = hasLinks ? 'flex' : 'none';
    createFolderBtn.style.display = linksOnly ? 'flex' : 'none';
    copyLinkBtn.style.display = 'none';
    showInFolderBtn.style.display = 'none';
    exportBtn.textContent = 'Export';
    exportBtn.style.display = 'flex';
    editBtn.textContent = 'Edit';
    editBtn.style.display = 'none';
    changeIconBtn.style.display = 'none';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.display = 'flex';
  } else if (item && item.url) {
    // It's a link
    openAllBtn.style.display = 'none';
    createFolderBtn.style.display = 'none';
    copyLinkBtn.style.display = 'flex';
    showInFolderBtn.style.display = isSearchMode ? 'flex' : 'none';
    exportBtn.style.display = 'none';
    editBtn.textContent = 'Edit';
    editBtn.style.display = isSearchMode ? 'none' : 'flex';
    changeIconBtn.style.display = 'none';
    deleteBtn.style.display = 'flex';
  } else if (isFolder) {
    // It's a folder
    const children = await getBookmarks(itemId);
    const folderHasLinks = children.some(c => c.url);
    openAllBtn.style.display = folderHasLinks ? 'flex' : 'none';
    createFolderBtn.style.display = 'none';
    copyLinkBtn.style.display = 'none';
    showInFolderBtn.style.display = 'none';
    exportBtn.style.display = 'none';
    editBtn.textContent = 'Rename';
    editBtn.style.display = isSearchMode ? 'none' : 'flex';
    changeIconBtn.style.display = isSearchMode ? 'none' : 'flex';
    deleteBtn.style.display = 'flex';
  } else {
    openAllBtn.style.display = 'none';
    createFolderBtn.style.display = 'none';
    copyLinkBtn.style.display = 'none';
    showInFolderBtn.style.display = 'none';
    exportBtn.style.display = 'none';
    editBtn.textContent = 'Edit';
    editBtn.style.display = 'flex';
    changeIconBtn.style.display = 'none';
    deleteBtn.style.display = 'flex';
  }

  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.add('active');

  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

function getVisibleContextMenuItems(menu) {
  return Array.from(menu?.querySelectorAll('.context-menu-item') || [])
    .filter(item => item.style.display !== 'none' && !item.disabled);
}

function focusContextMenuItem(menu, item) {
  if (!item) return;
  getVisibleContextMenuItems(menu).forEach(menuItem => {
    menuItem.tabIndex = menuItem === item ? 0 : -1;
  });
  item.focus({ preventScroll: true });
}

function focusFirstContextMenuItem(menu) {
  focusContextMenuItem(menu, getVisibleContextMenuItems(menu)[0]);
}

function handleContextMenuKeydown(e) {
  const menu = e.currentTarget;
  if (!menu.classList.contains('active')) return;

  // Keep menu keystrokes from reaching the list navigation underneath it.
  e.stopPropagation();

  if (e.key === 'Escape') {
    e.preventDefault();
    hideContextMenu();
    return;
  }

  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    const activeItem = document.activeElement?.closest?.('.context-menu-item');
    if (!activeItem || !menu.contains(activeItem)) return;
    e.preventDefault();
    activeItem.click();
    return;
  }

  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

  const items = getVisibleContextMenuItems(menu);
  if (items.length === 0) return;

  e.preventDefault();
  const currentIndex = items.indexOf(document.activeElement);
  const direction = e.key === 'ArrowDown' ? 1 : -1;
  const nextIndex = currentIndex < 0
    ? (direction > 0 ? 0 : items.length - 1)
    : (currentIndex + direction + items.length) % items.length;
  focusContextMenuItem(menu, items[nextIndex]);
}

export async function showContextMenuFromKeyboard() {
  const selectedItem = document.querySelector('.list-item.selected[data-item-id]');
  const focusedItem = document.querySelector(
    '.list-item.keyboard-focused[data-item-id], .browser-history-item.keyboard-focused'
  );
  const anchorElement = selectedItem || focusedItem;

  if (anchorElement) {
    const rect = anchorElement.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    await showContextMenu(x, y, anchorElement.dataset.itemId, anchorElement);
    const menuRect = contextMenu.getBoundingClientRect();
    const maxLeft = Math.max(10, window.innerWidth - menuRect.width - 10);
    const centeredLeft = Math.min(Math.max(10, x - menuRect.width / 2), maxLeft);
    contextMenu.style.left = `${centeredLeft}px`;
    focusFirstContextMenuItem(contextMenu);
    return;
  }

  const point = lastPointerPosition || {
    x: Math.round(window.innerWidth / 2),
    y: Math.round(window.innerHeight / 2)
  };
  await showBodyContextMenu(point.x, point.y);
  focusFirstContextMenuItem(bodyContextMenu);
}

function updateVisibleFolderIcons(folderId, iconName) {
  document
    .querySelectorAll(`.list-item[data-item-id="${folderId}"][data-type="folder"] .list-item-icon`)
    .forEach(iconContainer => {
      iconContainer.innerHTML = getFolderIconSvg(iconName);
    });
}

function previewFolderIconOption(option) {
  if (!option || !folderIconMenuItemId) return;
  updateVisibleFolderIcons(folderIconMenuItemId, option.dataset.iconName);
}

async function applyFolderIconOption(option) {
  if (!option || !folderIconMenuItemId) return;

  const folderId = folderIconMenuItemId;
  const iconName = option.dataset.iconName;
  const saved = await setFolderIconName(folderId, iconName);
  if (saved) folderIconMenuOriginalIconName = iconName;
  hideContextMenu();

  if (saved) {
    updateVisibleFolderIcons(folderId, iconName);
    if (!isSearchMode && renderItemsCallback) renderItemsCallback();
    if (renderBreadcrumbCallback) renderBreadcrumbCallback();
  } else {
    showNotification('Could not change folder icon');
  }
}

function getFolderIconAnchorElement(folderId) {
  if (!folderId) return null;

  if (
    contextMenuAnchorElement &&
    contextMenuAnchorElement.dataset.itemId === folderId &&
    contextMenuAnchorElement.dataset.type === 'folder'
  ) {
    return contextMenuAnchorElement.querySelector('.list-item-icon');
  }

  const folderIdString = String(folderId);
  const escapedFolderId = window.CSS?.escape ? CSS.escape(folderIdString) : folderIdString.replace(/"/g, '\\"');
  return document.querySelector(
    `.list-item[data-item-id="${escapedFolderId}"][data-type="folder"] .list-item-icon`
  );
}

function positionFolderIconMenu(anchorRect) {
  const viewportMargin = 10;
  const anchorGap = 12;
  const tailWidth = 10;
  const minimumTailInset = 16;
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;

  const menuRect = folderIconMenu.getBoundingClientRect();
  const maxLeft = Math.max(viewportMargin, window.innerWidth - menuRect.width - viewportMargin);
  const left = Math.min(
    Math.max(anchorCenterX - menuRect.width / 2, viewportMargin),
    maxLeft
  );

  const belowTop = anchorRect.bottom + anchorGap;
  const aboveTop = anchorRect.top - menuRect.height - anchorGap;
  const hasRoomBelow = belowTop + menuRect.height <= window.innerHeight - viewportMargin;
  const isAbove = !hasRoomBelow;
  const maxTop = Math.max(viewportMargin, window.innerHeight - menuRect.height - viewportMargin);
  const top = isAbove
    ? Math.min(Math.max(aboveTop, viewportMargin), maxTop)
    : Math.min(Math.max(belowTop, viewportMargin), maxTop);
  const tailLeft = Math.min(
    Math.max(anchorCenterX - left - tailWidth / 2, minimumTailInset),
    menuRect.width - minimumTailInset
  );

  folderIconMenu.classList.toggle('above', isAbove);
  folderIconMenu.classList.toggle('below', !isAbove);
  folderIconMenu.style.left = `${left}px`;
  folderIconMenu.style.top = `${top}px`;
  folderIconMenu.style.setProperty('--folder-icon-tail-left', `${tailLeft}px`);
}

function showFolderIconMenu(anchorRect, folderId) {
  if (!folderIconMenu) return;

  folderIconMenuItemId = folderId;
  folderIconMenuAnchorRect = anchorRect;
  folderIconMenuOriginalIconName = getFolderIconName(folderId);
  folderIconMenu.innerHTML = `
    <div class="folder-icon-menu-content">
      <div class="folder-icon-search-container">
        <input class="folder-icon-search" type="search" placeholder="Search icons" aria-label="Search icons" autocomplete="off" spellcheck="false">
      </div>
      <div class="folder-icon-grid"></div>
    </div>
  `;
  renderFolderIconOptions('');

  folderIconMenu.style.left = '0px';
  folderIconMenu.style.top = '0px';
  folderIconMenu.classList.add('active');
  positionFolderIconMenu(anchorRect);

  const searchInput = folderIconMenu.querySelector('.folder-icon-search');
  if (searchInput) {
    searchInput.focus({ preventScroll: true });
  }
}

function renderFolderIconOptions(query) {
  if (!folderIconMenu || !folderIconMenuItemId) return;

  const grid = folderIconMenu.querySelector('.folder-icon-grid');
  if (!grid) return;

  const currentIcon = getFolderIconName(folderIconMenuItemId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredIcons = normalizedQuery
    ? searchFolderIcons(normalizedQuery)
    : folderIconOptions;

  if (filteredIcons.length === 0) {
    grid.innerHTML = '<div class="folder-icon-empty">No icons</div>';
    if (folderIconMenuOriginalIconName) {
      updateVisibleFolderIcons(folderIconMenuItemId, folderIconMenuOriginalIconName);
    }
    return;
  }

  const activeIcon = folderIconOptions.includes(currentIcon) ? currentIcon : null;
  grid.innerHTML = filteredIcons.map(iconName => {
    const label = iconName.replace(/-/g, ' ');
    const isActive = iconName === activeIcon;
    return `
      <button
        class="folder-icon-option${isActive ? ' active' : ''}"
        type="button"
        data-icon-name="${iconName}"
        aria-selected="${isActive ? 'true' : 'false'}"
        aria-label="${escapeHtml(label)}"
        tabindex="${isActive ? '0' : '-1'}"
        title="${escapeHtml(label)}"
      >
        ${getFolderIconSvg(iconName)}
      </button>
    `;
  }).join('');

  const activeOption = grid.querySelector('.folder-icon-option.active');
  if (activeOption) previewFolderIconOption(activeOption);
  else setActiveFolderIconOption(grid.querySelector('.folder-icon-option'));
}

function moveFolderIconKeyboardSelection(key) {
  if (!folderIconMenu) return;

  const options = Array.from(folderIconMenu.querySelectorAll('.folder-icon-option'));
  if (options.length === 0) return;

  const focusedIndex = options.indexOf(document.activeElement);
  const activeIndex = options.findIndex(option => option.classList.contains('active'));
  const currentIndex = focusedIndex >= 0 ? focusedIndex : Math.max(activeIndex, 0);

  let nextIndex = currentIndex;
  if (key === 'ArrowRight') nextIndex += 1;
  if (key === 'ArrowLeft') nextIndex -= 1;
  if (key === 'ArrowDown') nextIndex += FOLDER_ICON_GRID_COLUMNS;
  if (key === 'ArrowUp') nextIndex -= FOLDER_ICON_GRID_COLUMNS;

  nextIndex = Math.min(Math.max(nextIndex, 0), options.length - 1);
  setActiveFolderIconOption(options[nextIndex], true);
}

function setActiveFolderIconOption(option, shouldFocus = false) {
  if (!option || !folderIconMenu) return;

  const previous = folderIconMenu.querySelector('.folder-icon-option.active');
  if (previous !== option) {
    if (previous) {
      previous.classList.remove('active');
      previous.setAttribute('aria-selected', 'false');
      previous.tabIndex = -1;
    }
    option.classList.add('active');
    option.setAttribute('aria-selected', 'true');
    option.tabIndex = 0;
  }

  previewFolderIconOption(option);

  if (shouldFocus) {
    option.focus({ preventScroll: true });
  }

  const scrollViewport = option.closest('.folder-icon-menu-content');
  if (scrollViewport) {
    const scrollDelta = getIconOptionScrollDelta(
      option.getBoundingClientRect(),
      scrollViewport.getBoundingClientRect()
    );
    if (scrollDelta !== 0) scrollViewport.scrollTop += scrollDelta;
  }
}

export async function showBodyContextMenu(x, y) {
  hideContextMenu();

  const children = await getBookmarks(currentFolderId);
  const hasLinks = children.some(item => item.url);

  const openAllBtn = document.getElementById('body-context-open-all');
  const openAllSeparator = document.getElementById('body-context-open-all-separator');
  const showOpenAll = hasLinks;
  openAllBtn.style.display = showOpenAll ? 'flex' : 'none';
  openAllSeparator.style.display = showOpenAll ? 'block' : 'none';

  document.getElementById('body-context-add').style.display = 'flex';
  document.getElementById('body-context-import').style.display = 'flex';

  const hasAnyBookmarks = await getTotalBookmarkCount() > 0;
  document.getElementById('body-context-export').style.display = hasAnyBookmarks ? 'flex' : 'none';

  bodyContextMenu.style.left = `${x}px`;
  bodyContextMenu.style.top = `${y}px`;
  bodyContextMenu.classList.add('active');

  const rect = bodyContextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    bodyContextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    bodyContextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

export function hideContextMenu() {
  const focusedMenuItem = document.activeElement?.closest?.('.context-menu-item');
  if (focusedMenuItem) focusedMenuItem.blur();

  if (contextMenu) {
    contextMenu.classList.remove('active');
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => { item.tabIndex = -1; });
    setContextMenuItemId(null);
    contextMenuAnchorElement = null;
  }
  if (bodyContextMenu) {
    bodyContextMenu.classList.remove('active');
    bodyContextMenu.querySelectorAll('.context-menu-item').forEach(item => { item.tabIndex = -1; });
  }
  if (folderIconMenu) {
    if (
      folderIconMenu.classList.contains('active') &&
      folderIconMenuItemId &&
      folderIconMenuOriginalIconName
    ) {
      updateVisibleFolderIcons(folderIconMenuItemId, folderIconMenuOriginalIconName);
    }
    folderIconMenu.classList.remove('active');
    folderIconMenu.classList.remove('above', 'below');
    folderIconMenuItemId = null;
    folderIconMenuAnchorRect = null;
    folderIconMenuOriginalIconName = null;
  }
}

export function isContextMenuActive() {
  return Boolean(
    contextMenu?.classList.contains('active') ||
    bodyContextMenu?.classList.contains('active') ||
    folderIconMenu?.classList.contains('active')
  );
}

// ============================================
// MULTI-SELECT
// ============================================

export function updateSelectionStyling() {
  const allListItems = Array.from(document.querySelectorAll('.list-section .list-item'));

  allListItems.forEach(el => {
    el.classList.remove('selection-first', 'selection-middle', 'selection-last', 'selection-single');
  });

  let i = 0;
  while (i < allListItems.length) {
    const item = allListItems[i];

    if (item.classList.contains('selected')) {
      let groupStart = i;
      let groupEnd = i;

      while (groupEnd + 1 < allListItems.length &&
             allListItems[groupEnd + 1].classList.contains('selected') &&
             allListItems[groupEnd].closest('.list-section') === allListItems[groupEnd + 1].closest('.list-section')) {
        groupEnd++;
      }

      if (groupStart === groupEnd) {
        allListItems[groupStart].classList.add('selection-single');
      } else {
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

export function clearSelection() {
  clearSelectionState();
  document.querySelectorAll('.list-item.selected').forEach(el => {
    el.classList.remove('selected', 'selection-first', 'selection-middle', 'selection-last', 'selection-single');
  });
}

export function toggleItemSelection(itemId, element) {
  if (hasSelection(itemId)) {
    removeFromSelection(itemId);
    element.classList.remove('selected');
  } else {
    addToSelection(itemId);
    element.classList.add('selected');
  }
  updateSelectionStyling();
}

export function setItemSelection(itemIds) {
  const ids = new Set(itemIds);
  clearSelectionState();
  document.querySelectorAll('.list-item[data-item-id]').forEach(element => {
    const isSelected = ids.has(element.dataset.itemId);
    element.classList.toggle('selected', isSelected);
    if (isSelected) addToSelection(element.dataset.itemId);
  });
  updateSelectionStyling();
}

export function reorderSelectedForKeyboard(items, selectedIds, direction) {
  const selected = new Set(selectedIds);
  const reordered = [...items];
  const itemTypes = ['folder', 'link'];

  for (const type of itemTypes) {
    const positions = [];
    const typedItems = [];

    reordered.forEach((item, index) => {
      const itemType = item.url ? 'link' : 'folder';
      if (itemType === type) {
        positions.push(index);
        typedItems.push(item);
      }
    });

    if (direction < 0) {
      for (let index = 1; index < typedItems.length; index++) {
        if (selected.has(typedItems[index].id) && !selected.has(typedItems[index - 1].id)) {
          [typedItems[index - 1], typedItems[index]] = [typedItems[index], typedItems[index - 1]];
        }
      }
    } else {
      for (let index = typedItems.length - 2; index >= 0; index--) {
        if (selected.has(typedItems[index].id) && !selected.has(typedItems[index + 1].id)) {
          [typedItems[index], typedItems[index + 1]] = [typedItems[index + 1], typedItems[index]];
        }
      }
    }

    positions.forEach((position, index) => {
      reordered[position] = typedItems[index];
    });
  }

  return reordered;
}

export async function moveFocusedItems(direction, focusedIds) {
  if (isSearchMode || !focusedIds?.length) return false;

  const bookmarks = await getBookmarks(currentFolderId);
  const reordered = reorderSelectedForKeyboard(bookmarks, focusedIds, direction);
  if (reordered.every((item, index) => item.id === bookmarks[index].id)) return false;

  const previousPositions = new Map();
  document.querySelectorAll('.list-item[data-item-id]').forEach(element => {
    element.getAnimations().forEach(animation => animation.cancel());
    previousPositions.set(element.dataset.itemId, element.getBoundingClientRect());
  });
  keyboardReorderActive = true;

  try {
    await saveMoveForUndo(bookmarks.map(item => item.id));
    const currentOrder = bookmarks.map(item => item.id);

    for (let index = 0; index < reordered.length; index++) {
      const id = reordered[index].id;
      const oldIndex = currentOrder.indexOf(id);
      if (oldIndex === index) continue;

      await chrome.bookmarks.move(id, { parentId: currentFolderId, index });
      currentOrder.splice(oldIndex, 1);
      currentOrder.splice(index, 0, id);
    }

    if (renderItemsCallback) await renderItemsCallback();
    document.querySelectorAll('.list-item[data-item-id]').forEach(element => {
      if (hasSelection(element.dataset.itemId)) element.classList.add('selected');
    });
    updateSelectionStyling();

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.list-item[data-item-id]').forEach(element => {
        const previous = previousPositions.get(element.dataset.itemId);
        if (!previous) return;
        const current = element.getBoundingClientRect();
        const deltaY = previous.top - current.top;
        if (!deltaY) return;
        element.animate([
          { transform: `translateY(${deltaY}px)` },
          { transform: 'translateY(0)' }
        ], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
    return true;
  } catch (error) {
    console.error('Error moving selected items:', error);
    showNotification('Could not move all items. Please try again.');
    return false;
  } finally {
    keyboardReorderActive = false;
  }
}

export function isKeyboardReorderActive() {
  return keyboardReorderActive;
}

export function selectItem(itemId, element) {
  addToSelection(itemId);
  element.classList.add('selected');
}

export function deselectItem(itemId, element) {
  removeFromSelection(itemId);
  element.classList.remove('selected');
}

export async function selectAllItems() {
  const bookmarks = await getBookmarks(currentFolderId);

  if (bookmarks.length === 0) return;

  clearSelection();

  bookmarks.forEach(item => {
    addToSelection(item.id);
  });

  document.querySelectorAll('.list-item[data-type="link"], .list-item[data-type="folder"]').forEach(el => {
    const itemId = el.dataset.itemId;
    if (hasSelection(itemId)) {
      el.classList.add('selected');
    }
  });

  updateSelectionStyling();
}

// Box selection
export function elementIntersectsBox(element, box) {
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

export async function startBoxSelection(e) {
  if (isSearchMode || e.button !== 0) return;
  if (e.target.closest('.list-item') ||
      e.target.closest('.context-menu') ||
      e.target.closest('.modal-overlay') ||
      e.target.closest('.breadcrumb') ||
      e.target.closest('.search-bar') ||
      e.target.closest('.empty-state')) {
    return;
  }

  // Only blank-space selection needs bookmark data; ordinary row/menu clicks do not.
  const totalBookmarks = await getTotalBookmarkCount();
  const bookmarks = await getBookmarks(currentFolderId);
  const hasAnyItems = totalBookmarks > 0 || bookmarks.length > 0;
  if (!hasAnyItems) return;

  setIsBoxSelecting(true);
  setSelectionBox({
    startX: e.clientX,
    startY: e.clientY,
    currentX: e.clientX,
    currentY: e.clientY
  });

  const element = document.createElement('div');
  element.className = 'selection-box';
  element.style.left = `${e.clientX}px`;
  element.style.top = `${e.clientY}px`;
  element.style.width = '0px';
  element.style.height = '0px';
  document.body.appendChild(element);
  setSelectionBoxElement(element);

  if (!e.shiftKey) {
    clearSelection();
  }
}

export function updateBoxSelection(e) {
  if (!isBoxSelecting || !selectionBoxElement) return;

  const newBox = {
    ...selectionBox,
    currentX: e.clientX,
    currentY: e.clientY
  };
  setSelectionBox(newBox);

  const left = Math.min(newBox.startX, newBox.currentX);
  const top = Math.min(newBox.startY, newBox.currentY);
  const width = Math.abs(newBox.currentX - newBox.startX);
  const height = Math.abs(newBox.currentY - newBox.startY);

  const selectableElements = [...document.querySelectorAll('.list-item[data-type="link"], .list-item[data-type="folder"]')];
  // Read row bounds together, before selection classes invalidate styles.
  const intersections = selectableElements.map(el => elementIntersectsBox(el, newBox));
  selectionBoxElement.style.left = `${left}px`;
  selectionBoxElement.style.top = `${top}px`;
  selectionBoxElement.style.width = `${width}px`;
  selectionBoxElement.style.height = `${height}px`;

  selectableElements.forEach((el, index) => {
    const itemId = el.dataset.itemId;
    if (intersections[index]) {
      selectItem(itemId, el);
    } else if (!e.shiftKey) {
      deselectItem(itemId, el);
    }
  });

  updateSelectionStyling();
}

export function endBoxSelection(e) {
  if (!isBoxSelecting) return;

  setIsBoxSelecting(false);

  if (selectionBoxElement) {
    selectionBoxElement.remove();
    setSelectionBoxElement(null);
  }

  updateSelectionStyling();
}

export function initMultiSelect() {
  document.addEventListener('mousedown', startBoxSelection);
  document.addEventListener('mousemove', updateBoxSelection);
  document.addEventListener('mouseup', endBoxSelection);
}

// ============================================
// OPEN ALL LINKS
// ============================================

export async function openAllLinksInFolder(folderId) {
  let folderTitle = folderId === ROOT_FOLDER_ID ? 'Bookmarks' : 'Home';
  if (folderId !== ROOT_FOLDER_ID) {
    const folder = await getBookmarkById(folderId);
    if (folder) {
      folderTitle = folder.title || 'Untitled';
    }
  }

  const children = await getBookmarks(folderId);
  const directLinks = children.filter(item => item.url);

  if (directLinks.length === 0) return;

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

  if (tabIds.length > 0) {
    try {
      const groupId = await chrome.tabs.group({ tabIds: tabIds });
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

export async function openSelectedLinks() {
  const selectedIds = getSelectedIdsArray();
  const selectedLinks = [];

  for (const id of selectedIds) {
    const bookmark = await getBookmarkById(id);
    if (bookmark && bookmark.url) {
      selectedLinks.push(bookmark);
    }
  }

  if (selectedLinks.length === 0) return;

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

  clearSelection();
}

// ============================================
// EXPORT SELECTED
// ============================================

export function exportSelectedLinks() {
  // Will be implemented with import/export module
  const event = new CustomEvent('exportSelected');
  document.dispatchEvent(event);
}

// ============================================
// DRAG AND DROP
// Native drag transport with a live preview and an animated insertion slot.
// ============================================

let dragSession = null;
let restoreDragHover = null;
const MULTI_SELECTION_LANDING_COLOR =
  'color-mix(in srgb, var(--bg-primary) 52.4%, var(--bg-secondary) 47.6%)';

function getMultiDragIconSvg(types) {
  if (types.has('folder')) return getFolderIconSvg();
  return getIconSvg('bookmark', {
    className: 'bookmark-placeholder',
    width: 24,
    height: 24,
    fill: 'var(--text-secondary)'
  });
}

function getMultiDragTitle(sources) {
  const folderCount = sources.filter(row => row.dataset.type === 'folder').length;
  const bookmarkCount = sources.length - folderCount;
  const folders = `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`;
  const bookmarks = `${bookmarkCount} ${bookmarkCount === 1 ? 'bookmark' : 'bookmarks'}`;
  if (folderCount && bookmarkCount) return `${folders} and ${bookmarks}`;
  return folderCount ? folders : bookmarks;
}

function resetDragHover() {
  restoreDragHover?.();
  // Chromium can retain :hover on the row it last hit during native dragging.
  // A real pointer movement refreshes that hit test; until then use default fill.
  document.body.classList.add('drag-hover-reset');
  restoreDragHover = () => {
    document.body.classList.remove('drag-hover-reset');
    document.removeEventListener('pointermove', restoreDragHover);
    restoreDragHover = null;
  };
  document.addEventListener('pointermove', restoreDragHover);
}


function cancelPendingReorder(session) {
  clearTimeout(session.reorderTimer);
  session.reorderTimer = null;
  session.reorderCandidate = null;
}

function clearDragTarget() {
  const session = dragSession;
  if (!session) return;
  cancelPendingReorder(session);
  clearTimeout(session.timer);
  session.timer = null;
  session.candidate = null;
  session.target?.classList.remove('folder-drop-target', 'breadcrumb-drop-target');
  session.target = null;
  session.mode = null;
  if (!session.nesting) session.preview.classList.remove('is-compact');
  setDropPosition(null);
  setDropTargetElement(null);
}

export function cleanupDragState() {
  const session = dragSession;
  if (session) {
    clearDragTarget();
    cancelAnimationFrame(session.frame);
    session.controller.abort();
    session.preview.remove();
    session.ghost.remove();
    session.slot.remove();
    session.landingSlot?.remove();
    for (const row of session.rows) {
      row.classList.remove('dragging', 'drag-source');
      row.getAnimations().forEach(animation => animation.cancel());
    }
    dragSession = null;
    resetDragHover();
  }
  document.body.classList.remove('is-dragging', 'is-drag-settling');
  setIsDragging(false);
  setDraggedElement(null);
  setDraggedItemType(null);
  setDraggedItemIds([]);
  setDropPosition(null);
  setDropTargetElement(null);
}

// Keep the floating row alive until both the landing and the data update finish.
function animateDragLanding(session, destination, fade = false) {
  const { preview } = session;
  if (!fade) {
    // The renderer replaces the list during landing. Keep an independent
    // background at the destination until the floating row is handed off.
    if (!session.landingSlot) {
      session.landingSlot = document.createElement('div');
      session.landingSlot.className = 'drag-placeholder';
      session.landingSlot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(session.landingSlot);
    }
    Object.assign(session.landingSlot.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '9999',
      left: `${destination.left}px`, top: `${destination.top}px`,
      width: `${destination.width}px`, height: `${destination.height}px`
    });
  }
  const from = preview.getBoundingClientRect();
  preview.style.visibility = '';
  preview.style.transition = 'none';
  preview.classList.remove('is-compact');
  Object.assign(preview.style, {
    left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`,
    height: `${from.height}px`, translate: 'none', transform: 'none'
  });
  const animateSelection = session.retainSelection && !fade;
  const landingSelectionColor = session.ids.length > 1
    ? MULTI_SELECTION_LANDING_COLOR
    : 'var(--bg-secondary)';
  const animation = preview.animate([
    { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`,
      height: `${from.height}px`, opacity: 1,
      ...(animateSelection ? { backgroundColor: 'var(--bg-primary)' } : {}) },
    { left: `${destination.left}px`, top: `${destination.top}px`,
      width: `${destination.width}px`, height: `${destination.height}px`,
      opacity: fade ? 0 : 1,
      ...(animateSelection ? { backgroundColor: landingSelectionColor } : {}) }
  ], {
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200,
    easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards'
  });
  return animation.finished.then(() => {
    if (animateSelection) preview.style.backgroundColor = landingSelectionColor;
  }).catch(() => {});
}

async function expandRenderedRows(session, rows) {
  rows.forEach(row => { row.style.visibility = ''; });
  session.preview.style.visibility = 'hidden';
  if (rows.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const parent = rows[0].parentNode;
  if (!parent || rows.some(row => row.parentNode !== parent)) return;

  const rowHeight = rows[0].getBoundingClientRect().height;
  const expandedHeight = rows.reduce((height, row) => (
    height + row.getBoundingClientRect().height
  ), 0);
  const wrapper = document.createElement('div');
  wrapper.className = 'multi-drop-expansion';
  wrapper.style.height = `${rowHeight}px`;
  parent.insertBefore(wrapper, rows[0]);
  rows.forEach(row => wrapper.appendChild(row));

  // The fixed landing background has completed its handoff. Leaving it above
  // the list would cover the real rows while their stack opens.
  session.landingSlot?.remove();
  session.landingSlot = null;

  const originalStyles = rows.map(row => ({
    position: row.style.position,
    zIndex: row.style.zIndex,
    backgroundColor: row.style.backgroundColor
  }));
  rows.forEach((row, index) => {
    row.style.position = 'relative';
    row.style.zIndex = String(rows.length - index);
    row.style.backgroundColor = session.retainSelection
      ? MULTI_SELECTION_LANDING_COLOR
      : 'var(--bg-primary)';
  });

  const heightAnimation = wrapper.animate([
    { height: `${rowHeight}px` },
    { height: `${expandedHeight}px` }
  ], {
    duration: 220,
    easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
    fill: 'forwards'
  }).finished.catch(() => {});
  let precedingHeight = 0;
  const rowAnimations = rows.map((row, index) => {
    const offset = precedingHeight;
    precedingHeight += row.getBoundingClientRect().height;
    if (index === 0) return Promise.resolve();
    return row.animate([
      { transform: `translateY(-${offset}px)` },
      { transform: 'translateY(0)' }
    ], {
      duration: 220,
      easing: 'cubic-bezier(0.77, 0, 0.175, 1)'
    }).finished.catch(() => {});
  });
  const colorAnimations = session.retainSelection ? rows.map(row => row.animate([
    { backgroundColor: MULTI_SELECTION_LANDING_COLOR },
    { backgroundColor: 'var(--bg-secondary)' }
  ], {
    duration: 220,
    easing: 'linear'
  }).finished.catch(() => {})) : [];
  await Promise.all([heightAnimation, ...rowAnimations, ...colorAnimations]);

  rows.forEach((row, index) => {
    Object.assign(row.style, originalStyles[index]);
  });

  for (const row of rows) parent.insertBefore(row, wrapper);
  wrapper.remove();
}

function beginDragSettlement(session) {
  session.settling = true;
  cancelPendingReorder(session);
  document.body.classList.add('is-drag-settling');
  clearTimeout(session.timer);
  cancelAnimationFrame(session.frame);
  session.controller.abort();
  document.body.classList.remove('is-dragging');
}

async function returnDraggedItem() {
  const session = dragSession;
  if (!session || session.settling) return;
  beginDragSettlement(session);
  // Restore layout under the preview, without showing a second copy of the item.
  session.slot.remove();
  session.sources.forEach(row => {
    row.classList.remove('drag-source');
    row.style.visibility = 'hidden';
  });
  // A returning group lands at the top of its original block, matching the
  // insertion-slot handoff used by a successful multi-row drop.
  const destination = session.sources.length > 1
    ? session.sources[0]
    : session.sources.find(row => row.dataset.itemId === session.primaryId);
  try {
    if (destination?.isConnected) await animateDragLanding(session, destination.getBoundingClientRect());
    if (session.sources.length > 1) await expandRenderedRows(session, session.sources);
  } finally {
    session.sources.forEach(row => { row.style.visibility = ''; });
    if (dragSession === session) cleanupDragState();
  }
}

function moveSlot(target, after = false) {
  const session = dragSession;
  const reference = after ? target.nextSibling : target;
  if (reference === session.slot || (session.slot.parentNode === target.parentNode && session.slot.nextSibling === reference)) return;
  const rows = session.rows.filter(row => !row.classList.contains('drag-source'));
  const positions = rows.map(row => row.getBoundingClientRect().top);
  rows.forEach(row => row.getAnimations().forEach(animation => animation.cancel()));
  target.parentNode.insertBefore(session.slot, reference);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Finish all layout reads before starting animations. Interleaving these
    // forces the browser to recalculate styles for every following row.
    const destinations = rows.map(row => row.getBoundingClientRect().top);
    rows.forEach((row, index) => {
      const delta = positions[index] - destinations[index];
      if (delta) row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
        duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)'
      });
    });
  }
}

function showDropIndicator(target, position) {
  if (!dragSession) return;
  dragSession.nesting = false;
  clearDragTarget();
  if (target === dragSession.slot) {
    target = dragSession.slotTarget;
    position = dragSession.slotPosition;
    if (!target) return;
  }
  dragSession.target = target;
  dragSession.mode = position;
  dragSession.slotTarget = target;
  dragSession.slotPosition = position;
  moveSlot(target, position === 'after');
  setDropPosition(position);
  setDropTargetElement(target);
}

function requestDropIndicator(target, position) {
  const session = dragSession;
  if (!session) return;
  if (!session.nesting) {
    showDropIndicator(target, position);
    return;
  }
  if (session.reorderCandidate?.target === target && session.reorderCandidate.position === position) return;
  cancelPendingReorder(session);
  session.reorderCandidate = { target, position };
  // Preserve the nesting preview until the pointer dwells in an insertion zone.
  session.reorderTimer = setTimeout(() => {
    if (dragSession === session && !session.settling && target.isConnected) {
      showDropIndicator(target, position);
    }
  }, 180);
}

function positionPreview(e) {
  const session = dragSession;
  if (!session) return;
  // Translation moves only the preview, without invalidating list layout.
  // Keep it separate from the compact state's animated transform.
  session.preview.style.translate = `${e.clientX - session.offsetX}px ${e.clientY - session.offsetY}px`;
}

function selectFolderTarget(target, breadcrumbTarget = false) {
  const session = dragSession;
  if (!session) return;
  cancelPendingReorder(session);
  if (session.target === target && session.mode === 'inside' || session.candidate === target) return;
  clearDragTarget();
  session.candidate = target;
  const activate = () => {
    session.target = target;
    session.mode = 'inside';
    session.nesting = true;
    target.classList.add(breadcrumbTarget ? 'breadcrumb-drop-target' : 'folder-drop-target');
    session.preview.classList.add('is-compact');
  };
  // Links cannot contain the destination folder, so no dwell or ancestry lookup
  // is needed before showing the drop-into-folder state.
  if (draggedItemType === 'link') {
    activate();
    return;
  }
  const folderId = breadcrumbTarget ? target.dataset.folderId : target.dataset.itemId;
  const validateAndActivate = async () => {
    try {
      for (const id of session.ids) {
        if (await isFolderOrDescendant(id, folderId)) return;
      }
      if (dragSession !== session || session.settling || session.candidate !== target || !target.isConnected) return;
      activate();
    } catch (error) {
      if (dragSession === session) clearDragTarget();
      console.error('Cannot validate drag target:', error);
    }
  };
  if (session.nesting) {
    // Keep the compact preview while validating the next folder, without
    // restarting the dwell timer. The drop handler still rechecks ancestry.
    void validateAndActivate();
  } else {
    session.timer = setTimeout(validateAndActivate, breadcrumbTarget ? 100 : 180);
  }
}

export function handleDragStart(e) {
  if (dragSession?.settling || e.target.closest('.item-actions')) { e.preventDefault(); return; }
  cleanupDragState();
  const rows = [...itemsGrid.querySelectorAll('.list-item.draggable')];
  const id = this.dataset.itemId;
  const retainSelection = hasSelection(id);
  const ids = hasSelection(id) && getSelectionSize() > 1 ? getSelectedIdsArray() : [id];
  const sources = rows.filter(row => ids.includes(row.dataset.itemId));
  const types = new Set(sources.map(row => row.dataset.type));
  if (!hasSelection(id)) clearSelection();
  setDraggedElement(this);
  setDraggedItemIds(ids);
  setDraggedItemType(types.size > 1 ? 'mixed' : this.dataset.type);
  setIsDragging(true);
  document.body.classList.add('is-dragging');
  const rect = this.getBoundingClientRect();
  const preview = document.createElement('div');
  preview.className = 'drag-preview';
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  const icon = this.querySelector('.list-item-icon');
  if (icon) {
    const previewIcon = icon.cloneNode(ids.length === 1);
    if (ids.length > 1) previewIcon.innerHTML = getMultiDragIconSvg(types);
    preview.appendChild(previewIcon);
  }
  const title = document.createElement('span');
  title.className = 'drag-preview-title';
  title.textContent = this.querySelector('.list-item-title')?.textContent || '';
  preview.appendChild(title);
  if (ids.length > 1) title.textContent = getMultiDragTitle(sources);
  const count = document.createElement('span');
  count.className = 'drag-preview-count';
  count.textContent = String(ids.length);
  preview.appendChild(count);
  preview.classList.toggle('is-multiple', ids.length > 1);
  document.body.appendChild(preview);
  const ghost = document.createElement('canvas');
  ghost.width = ghost.height = 1;
  ghost.className = 'drag-native-ghost';
  document.body.appendChild(ghost);
  // DataTransfer is writable only during the synchronous dragstart event.
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/json', JSON.stringify(ids));
  e.dataTransfer.setDragImage(ghost, 0, 0);
  const slot = document.createElement('div');
  slot.className = 'drag-placeholder';
  slot.style.height = `${rect.height}px`;
  slot.setAttribute('aria-hidden', 'true');
  const controller = new AbortController();
  dragSession = { rows, ids, sources, preview, ghost, slot, controller, primaryId: id,
    retainSelection,
    offsetX: Math.min(e.clientX - rect.left, rect.width - 24), offsetY: e.clientY - rect.top,
    target: null, mode: null, candidate: null, timer: null, frame: null,
    folderId: currentFolderId };
  const session = dragSession;
  preview.style.setProperty('--compact-offset', `${session.offsetX - 12}px`);
  positionPreview(e);
  session.frame = requestAnimationFrame(() => {
    if (dragSession !== session) return;
    this.before(slot);
    sources.forEach(row => row.classList.add('drag-source'));
  });
  const options = { signal: controller.signal, capture: true };
  document.addEventListener('dragover', updateDrag, options);
  document.addEventListener('drop', finishDrag, options);
  document.addEventListener('dragend', returnDraggedItem, options);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      returnDraggedItem();
    }
  }, options);
  window.addEventListener('blur', returnDraggedItem, { signal: controller.signal });
  document.addEventListener('dragleave', event => {
    if (!event.relatedTarget && (event.clientX <= 0 || event.clientY <= 0)) {
      clearDragTarget();
      // Native dragleave can precede dragend when releasing/cancelling. Keep
      // the live row visible until its return animation takes over.
    }
  }, options);
}

function updateDrag(e) {
  const session = dragSession;
  if (!session) return;
  session.preview.style.visibility = '';
  positionPreview(e);
  let hit = document.elementFromPoint(e.clientX, e.clientY);
  const gridRect = itemsGrid.getBoundingClientRect();
  // Extend the list's rows and insertion slots across the window. Keep real
  // controls and breadcrumbs as their own targets rather than projecting them.
  if ((e.clientX < gridRect.left || e.clientX > gridRect.right) &&
      !hit?.closest('button, input, a, [role="button"], .breadcrumb-item')) {
    hit = document.elementFromPoint(gridRect.left + gridRect.width / 2, e.clientY);
  }
  const crumb = hit?.closest('.breadcrumb-item[data-folder-id]');
  const row = hit?.closest('.list-item.draggable');
  e.preventDefault();
  // Accept the browser event even over empty/invalid space. finishDrag still
  // validates the target and returns the row without moving any bookmarks.
  // Rejecting the native drop defers that return until the OS finishes cancelling.
  e.dataTransfer.dropEffect = 'move';
  if (hit === session.slot) {
    if (session.nesting) requestDropIndicator(session.slot, 'restore');
    else if (session.candidate) clearDragTarget();
    return;
  }
  // The last insertion slot remains a valid destination below the list across
  // the window width. Do not leave a visible slot whose drop is cancelled.
  if (!row && !crumb && session.mode === 'after') {
    const remaining = session.rows.filter(item =>
      !session.ids.includes(item.dataset.itemId) && item.dataset.type === session.target.dataset.type);
    const slotRect = session.slot.getBoundingClientRect();
    if (session.target === remaining.at(-1) &&
        e.clientX >= 0 && e.clientX < window.innerWidth &&
        e.clientY >= slotRect.top && e.clientY < window.innerHeight &&
        !hit?.closest('button, input, a, [role="button"]')) return;
  }
  if (crumb) {
    selectFolderTarget(crumb, true);
  } else if (row && !session.ids.includes(row.dataset.itemId)) {
    const rect = row.getBoundingClientRect();
    const y = e.clientY - rect.top;
    // Retain the active center target slightly beyond its entry boundaries.
    const edge = session.nesting ? 5 : 10;
    if (row.dataset.type === 'folder' &&
        (draggedItemType === 'link' || y > edge && y < rect.height - edge)) {
      selectFolderTarget(row);
    } else if (row.dataset.type === draggedItemType) {
      const position = y < rect.height / 2 ? 'before' : 'after';
      if (session.target !== row || session.mode !== position) requestDropIndicator(row, position);
    } else clearDragTarget();
  } else clearDragTarget();
}


async function finishDrag(e) {
  if (!dragSession) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const session = dragSession;
  if (session.settling) return;
  const { ids, target, mode, folderId } = session;
  const targetId = target?.dataset.folderId || target?.dataset.itemId;
  if (!targetId || !mode) { await returnDraggedItem(); return; }
  beginDragSettlement(session);
  const landing = animateDragLanding(session,
    (mode === 'inside' ? target : session.slot).getBoundingClientRect(), mode === 'inside');
  let didMove = false;
  try {
    if (mode === 'inside') {
      for (const id of ids) {
        if (await isFolderOrDescendant(id, targetId)) return;
      }
      const moves = [];
      for (const id of ids) {
        const item = await getBookmarkById(id);
        if (item && item.parentId !== targetId) moves.push(id);
      }
      if (!moves.length) return;
      await saveMoveForUndo(moves);
      for (const id of moves) await chrome.bookmarks.move(id, { parentId: targetId });
      didMove = true;
    } else {
      const bookmarks = await getBookmarks(folderId);
      const selected = new Set(ids);
      const moving = bookmarks.filter(item => selected.has(item.id));
      const remaining = bookmarks.filter(item => !selected.has(item.id));
      const index = remaining.findIndex(item => item.id === targetId);
      if (index < 0 || moving.length !== ids.length) return;
      remaining.splice(index + (mode === 'after' ? 1 : 0), 0, ...moving);
      if (remaining.every((item, i) => item.id === bookmarks[i].id)) return;
      await saveMoveForUndo(bookmarks.map(item => item.id));
      const order = bookmarks.map(item => item.id);
      // Move from later to earlier indices, avoiding Chrome's forward-index adjustment.
      for (let i = 0; i < remaining.length; i++) {
        const id = remaining[i].id;
        const oldIndex = order.indexOf(id);
        if (oldIndex === i) continue;
        await chrome.bookmarks.move(id, { parentId: folderId, index: i });
        order.splice(oldIndex, 1);
        order.splice(i, 0, id);
      }
      didMove = true;
    }
    // Reordering selected rows should keep them selected. Moving them into a
    // folder removes them from this list, so there is nothing here to retain.
    if (mode === 'inside' || !session.retainSelection) clearSelection();
  } catch (error) {
    console.error('Error moving bookmarks:', error);
    showNotification('Could not move all items. Please try again.');
  } finally {
    const hiddenRows = [];
    try {
      // A multi-row drop should always hand off as one stacked row and then
      // open, even when it lands back in its original position and Chrome
      // does not need to persist a new order.
      const expandAfterRender = mode !== 'inside' && ids.length > 1;
      if (expandAfterRender) await landing;
      if (renderItemsCallback) await renderItemsCallback();
      if (session.retainSelection && mode !== 'inside') setItemSelection(ids);
      // The renderer has committed the final order. Hide its copies until the
      // floating row reaches that position, including when saving is very fast.
      for (const row of itemsGrid.querySelectorAll('.list-item[data-item-id]')) {
        if (ids.includes(row.dataset.itemId)) {
          row.style.visibility = 'hidden';
          hiddenRows.push(row);
        }
      }
      if (!expandAfterRender) await landing;
      const expandedMultiple = expandAfterRender && hiddenRows.length > 1;
      if (expandedMultiple) {
        await expandRenderedRows(session, hiddenRows);
      }
      const destination = hiddenRows.find(row => row.dataset.itemId === session.primaryId);
      if (destination && !expandedMultiple) {
        const actual = destination.getBoundingClientRect();
        const shown = session.preview.getBoundingClientRect();
        // A failed move lands back at the real, unchanged position.
        if (Math.abs(actual.top - shown.top) > 1 || Math.abs(actual.left - shown.left) > 1) {
          session.preview.getAnimations().forEach(animation => animation.cancel());
          Object.assign(session.preview.style, {
            left: `${shown.left}px`, top: `${shown.top}px`, width: `${shown.width}px`
          });
          await animateDragLanding(session, actual);
        }
      }
    } finally {
      hiddenRows.forEach(row => { row.style.visibility = ''; });
      if (dragSession === session) cleanupDragState();
    }
  }
}

// ============================================
// GETTERS FOR MODAL ELEMENTS
// ============================================

export function getModalElements() {
  return {
    deleteModalOverlay, deleteConfirmBtn
  };
}
