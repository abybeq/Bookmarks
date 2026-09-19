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
  setDraggedItemType, setIsDragging, draggedItemIds, setDraggedItemIds, dropIndicator,
  setDropIndicator, dropPosition, setDropPosition, dropTargetElement, setDropTargetElement,
  isSearchMode, ROOT_FOLDER_ID, setInlineFolderMode, setInlineFolderTargetId,
  setInlineFolderParentId, setInlineFolderDraft, resetInlineFolderState, setInlineBookmarkMode,
  setInlineBookmarkTargetId, setInlineBookmarkParentId, setInlineBookmarkDraftUrl,
  setInlineBookmarkDraftTitle, resetInlineBookmarkState
} from './state.js';
import { escapeHtml, showNotification, getFolderIconSvg, folderIconOptions } from './utils.js';
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
let folderIconMenu = null;
let folderIconMenuItemId = null;
let folderIconMenuAnchorRect = null;
let folderIconMenuOriginalIconName = null;
let contextMenuAnchorElement = null;
const FOLDER_ICON_GRID_COLUMNS = 6;

// Callbacks for render functions
let renderItemsCallback = null;
let renderBreadcrumbCallback = null;

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
    resetInlineBookmarkState();
    resetInlineFolderState();
    setInlineFolderMode('rename');
    setInlineFolderTargetId(folderId);
    setInlineFolderParentId(folder.parentId);
    setInlineFolderDraft(folder.title || '');
    if (renderItemsCallback) renderItemsCallback();
  });
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

  setDeletingItemId(itemId);
  setDeletingItemIds([itemId]);

  const bookmarkCount = isFolder ? await getTotalBookmarkCount(itemId) : 1;
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

  document.getElementById('body-context-theme').addEventListener('click', () => {
    hideContextMenu();
    showThemePicker();
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
  if (renderItemsCallback) renderItemsCallback();
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
        <input class="folder-icon-search" type="search" placeholder="Search icons" autocomplete="off" spellcheck="false">
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
    setTimeout(() => searchInput.focus(), 0);
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

  folderIconMenu.querySelectorAll('.folder-icon-option').forEach(iconOption => {
    const isActive = iconOption === option;
    iconOption.classList.toggle('active', isActive);
    iconOption.setAttribute('aria-selected', isActive ? 'true' : 'false');
    iconOption.tabIndex = isActive ? 0 : -1;
  });

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
  if (contextMenu) {
    contextMenu.classList.remove('active');
    setContextMenuItemId(null);
    contextMenuAnchorElement = null;
  }
  if (bodyContextMenu) {
    bodyContextMenu.classList.remove('active');
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
  if (isSearchMode) return;

  // Prevent box selection when empty state is shown
  const totalBookmarks = await getTotalBookmarkCount();
  const bookmarks = await getBookmarks(currentFolderId);
  const hasAnyItems = totalBookmarks > 0 || bookmarks.length > 0;
  if (!hasAnyItems) return;

  if (e.target.closest('.list-item') ||
      e.target.closest('.context-menu') ||
      e.target.closest('.modal-overlay') ||
      e.target.closest('.breadcrumb') ||
      e.target.closest('.search-bar') ||
      e.target.closest('.empty-state')) {
    return;
  }

  if (e.button !== 0) return;

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

  selectionBoxElement.style.left = `${left}px`;
  selectionBoxElement.style.top = `${top}px`;
  selectionBoxElement.style.width = `${width}px`;
  selectionBoxElement.style.height = `${height}px`;

  const selectableElements = document.querySelectorAll('.list-item[data-type="link"], .list-item[data-type="folder"]');
  selectableElements.forEach(el => {
    const itemId = el.dataset.itemId;
    if (elementIntersectsBox(el, newBox)) {
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
// DRAG AND DROP (Reordering only)
// ============================================

export function cleanupDragState() {
  document.body.classList.remove('is-dragging');

  document.querySelectorAll('.list-item.dragging').forEach(el => {
    el.classList.remove('dragging');
  });

  if (itemsGrid) {
    itemsGrid.querySelectorAll('.folder-drop-target').forEach(el => {
      el.classList.remove('folder-drop-target');
    });
  }
  if (breadcrumb) {
    breadcrumb.querySelectorAll('.breadcrumb-drop-target').forEach(el => {
      el.classList.remove('breadcrumb-drop-target');
    });
  }

  hideDropIndicator();

  setIsDragging(false);
  setDraggedElement(null);
  setDraggedItemType(null);
  setDraggedItemIds([]);
  setDropPosition(null);
  setDropTargetElement(null);
}

function createDropIndicator() {
  if (!dropIndicator) {
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    indicator.style.display = 'none';
    setDropIndicator(indicator);
  }
  return dropIndicator;
}

export function showDropIndicator(targetElement, position) {
  const indicator = createDropIndicator();
  const targetRect = targetElement.getBoundingClientRect();
  const containerRect = itemsGrid.getBoundingClientRect();

  if (!indicator.parentNode) {
    itemsGrid.appendChild(indicator);
  }

  const top = position === 'before'
    ? targetRect.top - containerRect.top - 1
    : targetRect.bottom - containerRect.top - 1;

  indicator.style.top = `${top}px`;
  indicator.style.display = 'block';

  setDropPosition(position);
  setDropTargetElement(targetElement);
}

export function hideDropIndicator() {
  if (dropIndicator) {
    dropIndicator.style.display = 'none';
  }
  setDropPosition(null);
  setDropTargetElement(null);
}

export async function handleDragStart(e) {
  if (e.target.closest('.item-actions')) {
    e.preventDefault();
    return;
  }

  setIsDragging(true);
  setDraggedElement(this);
  setDraggedItemType(this.dataset.type);
  this.classList.add('dragging');
  document.body.classList.add('is-dragging');

  const itemId = this.dataset.itemId;

  if (hasSelection(itemId) && getSelectionSize() > 1) {
    setDraggedItemIds(getSelectedIdsArray());
    document.querySelectorAll('.list-item.selected').forEach(el => {
      el.classList.add('dragging');
    });

    // Check if mixed types
    const selectedIds = getSelectedIdsArray();
    let hasLinks = false;
    let hasFolders = false;
    for (const id of selectedIds) {
      const b = await getBookmarkById(id);
      if (b) {
        if (b.url) hasLinks = true;
        else hasFolders = true;
      }
    }
    if (hasLinks && hasFolders) {
      setDraggedItemType('mixed');
    }
  } else {
    setDraggedItemIds([itemId]);
    if (getSelectionSize() > 0) {
      clearSelection();
    }
  }

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.outerHTML);
  e.dataTransfer.setData('application/json', JSON.stringify(draggedItemIds));

  const item = await getBookmarkById(itemId);
  if (item) {
    const dragPreview = document.createElement('div');
    dragPreview.className = 'drag-preview';

    let iconHtml = '';
    let titleText = '';

    if (draggedItemIds.length > 1) {
      iconHtml = `<span style="font-weight: 600; font-size: 14px;">${draggedItemIds.length}</span>`;
      titleText = `${draggedItemIds.length} items`;
    } else {
      if (item.url) {
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

    dragPreview.style.position = 'fixed';
    dragPreview.style.top = '-1000px';
    dragPreview.style.left = '-1000px';
    document.body.appendChild(dragPreview);

    e.dataTransfer.setDragImage(dragPreview, 120, 24);

    setTimeout(() => {
      dragPreview.remove();
    }, 0);
  }
}

export function handleDragEnd(e) {
  this.classList.remove('dragging');
  cleanupDragState();
}

export async function handleDragOver(e) {
  if (!draggedElement || this === draggedElement) return;

  const rect = this.getBoundingClientRect();
  const mouseY = e.clientY;
  const dropZoneSize = 12;

  const inTopZone = mouseY < rect.top + dropZoneSize;
  const inBottomZone = mouseY > rect.bottom - dropZoneSize;
  const inReorderZone = inTopZone || inBottomZone;

  // Only allow reordering within same type
  if (inReorderZone && draggedItemType !== 'mixed' && this.dataset.type === draggedItemType) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    this.classList.remove('folder-drop-target');

    const position = inTopZone ? 'before' : 'after';
    showDropIndicator(this, position);
    return;
  }

  if (dropTargetElement === this) {
    hideDropIndicator();
  }

  // Allow dropping into folders
  if ((draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed') && this.dataset.type === 'folder') {
    // The browser only fires `drop` if `dragover` is cancelled synchronously.
    // Folder validation is async, so we allow the drop here and enforce safety in
    // the drop handler before moving anything.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.itemId;
      for (const dragId of draggedItemIds) {
        const isDescendant = await isFolderOrDescendant(dragId, targetFolderId);
        if (isDescendant) {
          e.dataTransfer.dropEffect = 'none';
          this.classList.remove('folder-drop-target');
          return;
        }
      }
    }

    this.classList.add('folder-drop-target');
    return;
  }
}

export async function handleDragEnter(e) {
  if (!draggedElement || this === draggedElement) return;

  if ((draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed') && this.dataset.type === 'folder') {
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.itemId;
      for (const dragId of draggedItemIds) {
        const isDescendant = await isFolderOrDescendant(dragId, targetFolderId);
        if (isDescendant) {
          return;
        }
      }
    }
    this.classList.add('folder-drop-target');
    return;
  }
}

export function handleDragLeave(e) {
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('folder-drop-target');

    if (dropTargetElement === this) {
      hideDropIndicator();
    }
  }
}

export async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  if (!draggedElement || this === draggedElement) {
    return;
  }

  const draggedItemId = draggedElement.dataset.itemId;
  const targetItemId = this.dataset.itemId;
  const dragType = draggedItemType;
  const itemIds = [...draggedItemIds];

  const isReorder = dropPosition !== null;
  const insertAfter = dropPosition === 'after';

  cleanupDragState();

  // Handle reordering within same type
  if (isReorder && this.dataset.type === dragType) {
    const bookmarks = await getBookmarks(currentFolderId);
    const sameTypeItems = dragType === 'folder'
      ? bookmarks.filter(b => !b.url)
      : bookmarks.filter(b => b.url);

    const itemsBeingDragged = itemIds.length > 0 ? itemIds : [draggedItemId];
    const draggedSet = new Set(itemsBeingDragged);

    const targetIndex = sameTypeItems.findIndex(item => item.id === targetItemId);
    if (targetIndex === -1) return;

    if (draggedSet.has(targetItemId)) return;

    // Calculate new index for Chrome bookmarks API
    const targetBookmark = await getBookmarkById(targetItemId);
    let newIndex = targetBookmark.index;
    if (insertAfter) {
      newIndex++;
    }

    // Save for undo before reordering
    await saveMoveForUndo(itemsBeingDragged);

    // Move each item
    for (const itemId of itemsBeingDragged) {
      await chrome.bookmarks.move(itemId, {
        parentId: currentFolderId,
        index: newIndex
      });
    }

    clearSelection();
    if (renderItemsCallback) renderItemsCallback();
    return;
  }

  // Handle dropping into folder
  if ((dragType === 'link' || dragType === 'folder' || dragType === 'mixed') && this.dataset.type === 'folder') {
    this.classList.remove('folder-drop-target');

    const itemsToMove = itemIds.length > 0 ? itemIds : [draggedItemId];

    if (dragType === 'folder' || dragType === 'mixed') {
      for (const itemId of itemsToMove) {
        const isDescendant = await isFolderOrDescendant(itemId, targetItemId);
        if (isDescendant) {
          showNotification('Cannot move a folder into itself or a subfolder');
          return;
        }
      }
    }

    // Save for undo before moving
    await saveMoveForUndo(itemsToMove);

    // Move items into folder
    for (const itemId of itemsToMove) {
      await chrome.bookmarks.move(itemId, { parentId: targetItemId });
    }

    clearSelection();
    if (renderItemsCallback) renderItemsCallback();
    return;
  }
}

// Breadcrumb drag handlers
export async function handleBreadcrumbDragOver(e) {
  if (draggedElement && (draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed')) {
    // Cancel immediately so folder drops onto breadcrumbs are accepted by the
    // browser while the async descendant check runs.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.folderId;
      for (const dragId of draggedItemIds) {
        const isDescendant = await isFolderOrDescendant(dragId, targetFolderId);
        if (isDescendant) {
          e.dataTransfer.dropEffect = 'none';
          this.classList.remove('breadcrumb-drop-target');
          return;
        }
      }
    }
  }
}

export async function handleBreadcrumbDragEnter(e) {
  if (draggedElement && (draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed')) {
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.folderId;
      for (const dragId of draggedItemIds) {
        const isDescendant = await isFolderOrDescendant(dragId, targetFolderId);
        if (isDescendant) {
          return;
        }
      }
    }
    this.classList.add('breadcrumb-drop-target');
  }
}

export function handleBreadcrumbDragLeave(e) {
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('breadcrumb-drop-target');
  }
}

export async function handleBreadcrumbDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  this.classList.remove('breadcrumb-drop-target');

  if (!draggedElement || (draggedItemType !== 'link' && draggedItemType !== 'folder' && draggedItemType !== 'mixed')) {
    return;
  }

  const draggedItemId = draggedElement.dataset.itemId;
  const itemIds = [...draggedItemIds];
  const dragType = draggedItemType;

  cleanupDragState();

  const targetFolderId = this.dataset.folderId;

  const itemsToMove = itemIds.length > 0 ? itemIds : [draggedItemId];

  if (dragType === 'folder' || dragType === 'mixed') {
    for (const itemId of itemsToMove) {
      const isDescendant = await isFolderOrDescendant(itemId, targetFolderId);
      if (isDescendant) {
        showNotification('Cannot move a folder into itself or a subfolder');
        return;
      }
    }
  }

  // Check if any items need to be moved
  const itemsNeedingMove = [];
  for (const itemId of itemsToMove) {
    const item = await getBookmarkById(itemId);
    if (item && item.parentId !== targetFolderId) {
      itemsNeedingMove.push(itemId);
    }
  }

  if (itemsNeedingMove.length === 0) return;

  // Save for undo before moving
  await saveMoveForUndo(itemsNeedingMove);

  // Move items
  for (const itemId of itemsNeedingMove) {
    await chrome.bookmarks.move(itemId, { parentId: targetFolderId });
  }

  clearSelection();
  if (renderItemsCallback) renderItemsCallback();
}

// ============================================
// GETTERS FOR MODAL ELEMENTS
// ============================================

export function getModalElements() {
  return {
    deleteModalOverlay, deleteConfirmBtn
  };
}
