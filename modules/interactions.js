// ============================================
// INTERACTIONS MODULE
// Handles modals, context menus, drag-drop, and multi-select
// ============================================

import {
  items, currentFolderId, setCurrentFolderId,
  editingItemId, setEditingItemId, deletingItemId, setDeletingItemId,
  deletingItemIds, setDeletingItemIds,
  movingItemId, setMovingItemId, movingItemIds, setMovingItemIds,
  moveModePreviousFolderId, setMoveModePreviousFolderId, isInMoveMode,
  contextMenu, setContextMenu, contextMenuItemId, setContextMenuItemId,
  bodyContextMenu, setBodyContextMenu,
  selectedItemIds, clearSelectionState, addToSelection, removeFromSelection,
  hasSelection, getSelectionSize, getSelectedIdsArray,
  isBoxSelecting, setIsBoxSelecting, selectionBox, setSelectionBox,
  selectionBoxElement, setSelectionBoxElement,
  draggedElement, setDraggedElement, draggedItemType, setDraggedItemType,
  isDragging, setIsDragging, draggedItemIds, setDraggedItemIds,
  dropIndicator, setDropIndicator, dropPosition, setDropPosition,
  dropTargetElement, setDropTargetElement,
  isSearchMode, UNSORTED_FOLDER_ID, navigationStack, setNavigationStack,
  setInlineFolderMode, setInlineFolderTargetId, setInlineFolderParentId, setInlineFolderDraft, resetInlineFolderState,
  setInlineBookmarkMode, setInlineBookmarkTargetId, setInlineBookmarkParentId, setInlineBookmarkDraftUrl, setInlineBookmarkDraftTitle, resetInlineBookmarkState
} from './state.js';
import { escapeHtml, showNotification, getFolderIconSvg, generateId } from './utils.js';
import { saveItems, saveStateForUndo, getFaviconUrl, copyLinkToClipboard, showThemePicker } from './storage.js';
import { getItemsForFolder, getFolderById, isFolderOrDescendant, getTotalBookmarkCount, checkAndDeleteUnsortedFolderIfEmpty, navigateToFolderSimple } from './navigation.js';

// ============================================
// DOM ELEMENT REFERENCES
// ============================================

let addModalOverlay, addModalClose, addForm, addFormRows, addSubmitBtn;
let addFolderModalOverlay, addFolderModalClose, addFolderForm, folderNameInput, addFolderSubmitBtn;
let editModalOverlay, modalTitle, editForm, itemTypeInput, itemIdInput, itemTitleInput, itemUrlInput, urlGroup, cancelBtn, submitBtn;
let deleteModalOverlay, deleteItemName, deleteCancelBtn, deleteConfirmBtn;
let moveBanner, moveBannerDismiss, moveBannerIcon, moveBannerText, moveBannerAction;
let itemsGrid, breadcrumb;

let addRowCount = 1;

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
  // Add bookmark modal
  addModalOverlay = document.getElementById('add-modal-overlay');
  addModalClose = document.getElementById('add-modal-close');
  addForm = document.getElementById('add-form');
  addFormRows = document.getElementById('add-form-rows');
  addSubmitBtn = document.getElementById('add-submit-btn');
  
  // Add folder modal
  addFolderModalOverlay = document.getElementById('add-folder-modal-overlay');
  addFolderModalClose = document.getElementById('add-folder-modal-close');
  addFolderForm = document.getElementById('add-folder-form');
  folderNameInput = document.getElementById('folder-name');
  addFolderSubmitBtn = document.getElementById('add-folder-submit-btn');
  
  // Edit modal
  editModalOverlay = document.getElementById('edit-modal-overlay');
  modalTitle = document.getElementById('modal-title');
  editForm = document.getElementById('edit-form');
  itemTypeInput = document.getElementById('item-type');
  itemIdInput = document.getElementById('item-id');
  itemTitleInput = document.getElementById('item-title');
  itemUrlInput = document.getElementById('item-url');
  urlGroup = document.getElementById('url-group');
  cancelBtn = document.getElementById('cancel-btn');
  submitBtn = document.getElementById('submit-btn');
  
  // Delete modal
  deleteModalOverlay = document.getElementById('delete-modal-overlay');
  deleteItemName = document.getElementById('delete-item-name');
  deleteCancelBtn = document.getElementById('delete-cancel-btn');
  deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  
  // Move banner
  moveBanner = document.getElementById('move-banner');
  moveBannerDismiss = document.getElementById('move-banner-dismiss');
  moveBannerIcon = document.getElementById('move-banner-icon');
  moveBannerText = document.getElementById('move-banner-text');
  moveBannerAction = document.getElementById('move-banner-action');
  
  // Grid and breadcrumb
  itemsGrid = document.getElementById('items-grid');
  breadcrumb = document.getElementById('breadcrumb');
  
  // Context menus
  setContextMenu(document.getElementById('context-menu'));
  setBodyContextMenu(document.getElementById('body-context-menu'));
}

// ============================================
// ADD MODAL
// ============================================

export function openAddModal() {
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
  setTimeout(() => addFormRows.querySelector('.add-address').focus(), 50);
}

export function closeAddModal() {
  addModalOverlay.classList.remove('active');
}

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

function handleAddressInput(e) {
  updateAddButtonState();
  
  const input = e.target;
  const rowIndex = parseInt(input.dataset.row);
  const value = input.value.trim();
  
  if (rowIndex === addRowCount - 1 && value.length > 0) {
    addNewInputRow();
  }
}

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

function updateAddButtonState() {
  const addresses = addFormRows.querySelectorAll('.add-address');
  const hasValidAddress = Array.from(addresses).some(input => input.value.trim().length > 0);
  addSubmitBtn.disabled = !hasValidAddress;
}

// ============================================
// ADD FOLDER MODAL
// ============================================

export function openAddFolderModal() {
  folderNameInput.value = '';
  addFolderSubmitBtn.disabled = true;
  addFolderModalOverlay.classList.add('active');
  setTimeout(() => folderNameInput.focus(), 50);
}

export function closeAddFolderModal() {
  addFolderModalOverlay.classList.remove('active');
  folderNameInput.value = '';
  addFolderSubmitBtn.disabled = true;
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
}

export function startInlineFolderRename(folderId) {
  const folder = items.find(i => i.id === folderId);
  if (!folder) return;
  resetInlineBookmarkState();
  resetInlineFolderState();
  setInlineFolderMode('rename');
  setInlineFolderTargetId(folderId);
  setInlineFolderParentId(folder.parentId);
  setInlineFolderDraft(folder.title || '');
  if (renderItemsCallback) renderItemsCallback();
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
}

export function startInlineBookmarkEdit(bookmarkId) {
  const bookmark = items.find(i => i.id === bookmarkId && i.type === 'link');
  if (!bookmark) return;
  resetInlineFolderState();
  resetInlineBookmarkState();
  setInlineBookmarkMode('edit');
  setInlineBookmarkTargetId(bookmarkId);
  setInlineBookmarkParentId(bookmark.parentId);
  setInlineBookmarkDraftUrl(bookmark.url || '');
  setInlineBookmarkDraftTitle(bookmark.title || '');
  if (renderItemsCallback) renderItemsCallback();
}

// ============================================
// EDIT MODAL
// ============================================

export function openEditModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  
  setEditingItemId(itemId);
  modalTitle.textContent = item.type === 'folder' ? 'Rename folder' : 'Edit link';
  
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
  
  setTimeout(() => {
    itemTitleInput.focus();
    itemTitleInput.select();
  }, 50);
}

export function closeEditModal() {
  editModalOverlay.classList.remove('active');
  setEditingItemId(null);
  editForm.reset();
  itemIdInput.value = '';
  itemTypeInput.value = 'link';
  urlGroup.classList.remove('hidden');
}

// ============================================
// DELETE MODAL
// ============================================

export function openDeleteModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  
  setDeletingItemId(itemId);
  setDeletingItemIds([itemId]);
  
  const modalTitleEl = document.querySelector('#delete-modal-overlay .modal-title');
  if (modalTitleEl) {
    modalTitleEl.textContent = item.type === 'folder' ? 'Delete folder' : 'Delete bookmark';
  }
  deleteItemName.textContent = item.title;
  deleteModalOverlay.classList.add('active');
  
  setTimeout(() => deleteConfirmBtn.focus(), 50);
}

export function openDeleteModalMultiple(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  
  setDeletingItemIds(itemIds);
  setDeletingItemId(itemIds[0]);
  
  const modalTitleEl = document.querySelector('#delete-modal-overlay .modal-title');
  if (modalTitleEl) {
    modalTitleEl.textContent = `Delete ${itemIds.length} items`;
  }
  deleteItemName.textContent = `${itemIds.length} items`;
  
  deleteModalOverlay.classList.add('active');
  
  setTimeout(() => deleteConfirmBtn.focus(), 50);
}

export function closeDeleteModal() {
  deleteModalOverlay.classList.remove('active');
  setDeletingItemId(null);
  setDeletingItemIds([]);
}

// ============================================
// MOVE MODE
// ============================================

export function enterMoveMode(itemId, navigateToFolder) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  
  setMovingItemId(itemId);
  setMovingItemIds([itemId]);
  setMoveModePreviousFolderId(currentFolderId);
  
  updateMoveBanner();
  moveBanner.classList.add('active');
  document.body.classList.add('move-mode-active');
  
  navigateToFolder('root');
}

export function enterMoveModeMultiple(itemIds, navigateToFolder) {
  if (!itemIds || itemIds.length === 0) return;
  
  setMovingItemIds(itemIds);
  setMovingItemId(itemIds[0]);
  setMoveModePreviousFolderId(currentFolderId);
  
  updateMoveBannerMultiple();
  moveBanner.classList.add('active');
  document.body.classList.add('move-mode-active');
  
  clearSelection();
  
  navigateToFolder('root');
}

export function exitMoveMode(stayInCurrentFolder = false, navigateToFolder) {
  moveBanner.classList.remove('active');
  document.body.classList.remove('move-mode-active');
  
  if (!stayInCurrentFolder && moveModePreviousFolderId) {
    const unsortedContents = items.filter(i => i.parentId === UNSORTED_FOLDER_ID);
    if (unsortedContents.length > 0 && navigateToFolder) {
      navigateToFolder(moveModePreviousFolderId);
    }
  }
  
  setMovingItemId(null);
  setMovingItemIds([]);
  setMoveModePreviousFolderId(null);
  if (renderItemsCallback) renderItemsCallback();
}

export function updateMoveBanner() {
  if (movingItemIds.length > 1) {
    updateMoveBannerMultiple();
    return;
  }
  
  const item = items.find(i => i.id === movingItemId);
  if (!item) return;
  
  if (item.type === 'link') {
    moveBannerIcon.innerHTML = `<img src="${getFaviconUrl(item.url)}" alt="">`;
  } else {
    moveBannerIcon.innerHTML = getFolderIconSvg();
  }
  
  let folderName = 'Home';
  if (currentFolderId !== 'root') {
    const folder = getFolderById(currentFolderId);
    if (folder) {
      folderName = folder.title;
    }
  }
  
  moveBannerText.textContent = `Move ${item.title} to ${folderName}`;
}

export function updateMoveBannerMultiple() {
  moveBannerIcon.innerHTML = `<span style="font-weight: 600; font-size: 14px;">${movingItemIds.length}</span>`;
  
  let folderName = 'Home';
  if (currentFolderId !== 'root') {
    const folder = getFolderById(currentFolderId);
    if (folder) {
      folderName = folder.title;
    }
  }
  
  moveBannerText.textContent = `Move ${movingItemIds.length} items to ${folderName}`;
}

export async function moveItemToTargetFolder(targetFolderId, navigateToFolder) {
  const itemIdsToMove = movingItemIds.length > 0 ? movingItemIds : (movingItemId ? [movingItemId] : []);
  if (itemIdsToMove.length === 0) return;
  
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
  
  let hadUnsortedItem = false;
  
  const targetFolderItems = items.filter(i => i.parentId === targetFolderId);
  let maxOrder = targetFolderItems.length > 0 
    ? Math.max(...targetFolderItems.map(i => i.order ?? 0))
    : -1;
  
  for (const itemId of itemIdsToMove) {
    const item = items.find(i => i.id === itemId);
    if (!item) continue;
    
    if (item.parentId === UNSORTED_FOLDER_ID) {
      hadUnsortedItem = true;
    }
    
    item.parentId = targetFolderId;
    item.order = ++maxOrder;
  }
  
  if (hadUnsortedItem) {
    checkAndDeleteUnsortedFolderIfEmpty();
  }
  
  await saveItems();
  
  const unsortedContents = items.filter(i => i.parentId === UNSORTED_FOLDER_ID);
  const hasRemainingItems = unsortedContents.length > 0;
  
  moveBanner.classList.remove('active');
  document.body.classList.remove('move-mode-active');
  
  setMovingItemId(null);
  setMovingItemIds([]);
  setMoveModePreviousFolderId(null);
  
  if (hasRemainingItems && navigateToFolder) {
    navigateToFolder(UNSORTED_FOLDER_ID);
  } else if (renderItemsCallback) {
    renderItemsCallback();
  }
}

// ============================================
// CONTEXT MENU
// ============================================

async function createFolderFromSelectedLinks() {
  const selectedLinks = items
    .filter(i => hasSelection(i.id) && i.type === 'link')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (selectedLinks.length === 0) {
    showNotification('Select at least one link');
    return;
  }

  const folderName = `${selectedLinks.length} links`;

  saveStateForUndo();

  const siblingFolders = items.filter(item => item.parentId === currentFolderId && item.type === 'folder');
  const maxFolderOrder = siblingFolders.length > 0
    ? Math.max(...siblingFolders.map(f => f.order ?? 0))
    : -1;

  const newFolderId = generateId();
  const newFolder = {
    id: newFolderId,
    type: 'folder',
    title: folderName.trim(),
    parentId: currentFolderId,
    order: maxFolderOrder + 1
  };

  items.push(newFolder);

  let hadUnsortedItem = false;
  let linkOrder = -1;
  selectedLinks.forEach(link => {
    if (link.parentId === UNSORTED_FOLDER_ID) {
      hadUnsortedItem = true;
    }
    link.parentId = newFolderId;
    link.order = ++linkOrder;
  });

  if (hadUnsortedItem) {
    checkAndDeleteUnsortedFolderIfEmpty();
  }

  clearSelection();
  await saveItems();
  if (renderItemsCallback) renderItemsCallback();
  if (renderBreadcrumbCallback) renderBreadcrumbCallback();
  showNotification(`Created "${newFolder.title}"`);
}

export function initContextMenu(deleteItemFn, navigateToFolder) {
  // Open all menu item
  document.getElementById('context-open-all').addEventListener('click', async () => {
    if (getSelectionSize() > 1 && contextMenuItemId && hasSelection(contextMenuItemId)) {
      await openSelectedLinks();
    } else if (contextMenuItemId) {
      openAllLinksInFolder(contextMenuItemId);
    }
    hideContextMenu();
  });
  
  // Copy link
  document.getElementById('context-copy-link').addEventListener('click', async () => {
    if (contextMenuItemId) {
      const item = items.find(i => i.id === contextMenuItemId);
      if (item && item.type === 'link' && item.url) {
        await copyLinkToClipboard(item.url);
      }
    }
    hideContextMenu();
  });
  
  // Edit
  document.getElementById('context-edit').addEventListener('click', () => {
    if (contextMenuItemId) {
      const item = items.find(i => i.id === contextMenuItemId);
      if (item && item.type === 'folder') {
        startInlineFolderRename(contextMenuItemId);
      } else {
        startInlineBookmarkEdit(contextMenuItemId);
      }
    }
    hideContextMenu();
  });
  
  // Move
  document.getElementById('context-move').addEventListener('click', () => {
    if (getSelectionSize() > 1 && contextMenuItemId && hasSelection(contextMenuItemId)) {
      enterMoveModeMultiple(getSelectedIdsArray(), navigateToFolder);
    } else if (contextMenuItemId) {
      enterMoveMode(contextMenuItemId, navigateToFolder);
    }
    hideContextMenu();
  });
  
  // Export
  document.getElementById('context-export').addEventListener('click', () => {
    if (getSelectionSize() > 1 && contextMenuItemId && hasSelection(contextMenuItemId)) {
      exportSelectedLinks();
    }
    hideContextMenu();
  });
  
  // Delete
  document.getElementById('context-delete').addEventListener('click', async () => {
    if (getSelectionSize() > 1 && contextMenuItemId && hasSelection(contextMenuItemId)) {
      openDeleteModalMultiple(getSelectedIdsArray());
    } else if (contextMenuItemId) {
      const item = items.find(i => i.id === contextMenuItemId);
      if (item && item.type === 'folder') {
        openDeleteModal(contextMenuItemId);
      } else {
        await deleteItemFn(contextMenuItemId);
      }
    }
    hideContextMenu();
  });

  // Create folder from selected links
  document.getElementById('context-create-folder').addEventListener('click', async () => {
    await createFolderFromSelectedLinks();
    hideContextMenu();
  });
  
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

export function showContextMenu(x, y, itemId) {
  hideContextMenu();
  
  const isMultiSelect = getSelectionSize() > 1 && hasSelection(itemId);
  
  if (!hasSelection(itemId) && getSelectionSize() > 0) {
    clearSelection();
  }
  
  setContextMenuItemId(itemId);
  
  const item = items.find(i => i.id === itemId);
  const openAllBtn = document.getElementById('context-open-all');
  const createFolderBtn = document.getElementById('context-create-folder');
  const copyLinkBtn = document.getElementById('context-copy-link');
  const moveBtn = document.getElementById('context-move');
  const exportBtn = document.getElementById('context-export');
  const editBtn = document.getElementById('context-edit');
  const deleteBtn = document.getElementById('context-delete');
  
  const isUnsortedFolder = itemId === UNSORTED_FOLDER_ID;
  
  if (isMultiSelect) {
    const selectedItems = items.filter(i => hasSelection(i.id));
    const hasLinks = selectedItems.some(i => i.type === 'link');
    const linksOnly = selectedItems.length > 0 && selectedItems.every(i => i.type === 'link');
    
    openAllBtn.textContent = 'Open all';
    openAllBtn.style.display = hasLinks ? 'flex' : 'none';
    createFolderBtn.style.display = linksOnly ? 'flex' : 'none';
    copyLinkBtn.style.display = 'none';
    moveBtn.textContent = 'Move';
    moveBtn.style.display = 'flex';
    exportBtn.textContent = 'Export';
    exportBtn.style.display = 'flex';
    editBtn.textContent = 'Edit';
    editBtn.style.display = 'none';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.display = 'flex';
  } else if (item && item.type === 'link') {
    openAllBtn.style.display = 'none';
    createFolderBtn.style.display = 'none';
    copyLinkBtn.style.display = 'flex';
    moveBtn.style.display = 'flex';
    exportBtn.style.display = 'none';
    editBtn.textContent = 'Edit';
    editBtn.style.display = 'flex';
    deleteBtn.style.display = 'flex';
  } else if (item && item.type === 'folder') {
    const folderHasLinks = items.some(i => i.parentId === itemId && i.type === 'link');
    openAllBtn.style.display = folderHasLinks ? 'flex' : 'none';
    createFolderBtn.style.display = 'none';
    copyLinkBtn.style.display = 'none';
    moveBtn.style.display = isUnsortedFolder ? 'none' : 'flex';
    exportBtn.style.display = 'none';
    editBtn.textContent = 'Rename';
    editBtn.style.display = isUnsortedFolder ? 'none' : 'flex';
    deleteBtn.style.display = 'flex';
  } else {
    openAllBtn.style.display = 'none';
    createFolderBtn.style.display = 'none';
    copyLinkBtn.style.display = 'none';
    moveBtn.style.display = 'none';
    exportBtn.style.display = 'none';
    editBtn.textContent = 'Edit';
    editBtn.style.display = 'flex';
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

export function showBodyContextMenu(x, y) {
  hideContextMenu();
  
  const inMoveMode = isInMoveMode();
  
  const hasLinks = items.some(item => item.parentId === currentFolderId && item.type === 'link');
  
  const openAllBtn = document.getElementById('body-context-open-all');
  const openAllSeparator = document.getElementById('body-context-open-all-separator');
  const showOpenAll = hasLinks && !inMoveMode;
  openAllBtn.style.display = showOpenAll ? 'flex' : 'none';
  openAllSeparator.style.display = showOpenAll ? 'block' : 'none';
  
  document.getElementById('body-context-add').style.display = inMoveMode ? 'none' : 'flex';
  document.getElementById('body-context-import').style.display = inMoveMode ? 'none' : 'flex';
  
  const hasAnyBookmarks = getTotalBookmarkCount() > 0;
  document.getElementById('body-context-export').style.display = (!inMoveMode && hasAnyBookmarks) ? 'flex' : 'none';
  
  const separators = bodyContextMenu.querySelectorAll('.context-menu-separator:not(#body-context-open-all-separator)');
  separators.forEach(separator => {
    separator.style.display = inMoveMode ? 'none' : 'block';
  });
  
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
  }
  if (bodyContextMenu) {
    bodyContextMenu.classList.remove('active');
  }
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

export function selectAllItems() {
  const folderItems = getItemsForFolder(currentFolderId);
  const selectableItems = folderItems.filter(item => item.id !== UNSORTED_FOLDER_ID);
  
  if (selectableItems.length === 0) return;
  
  clearSelection();
  
  selectableItems.forEach(item => {
    addToSelection(item.id);
  });
  
  document.querySelectorAll('.list-item[data-type="link"], .list-item[data-type="folder"]:not([data-unsorted="true"])').forEach(el => {
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

export function startBoxSelection(e) {
  if (isSearchMode || isInMoveMode()) return;
  
  // Prevent box selection when empty state is shown
  if (getTotalBookmarkCount() === 0) return;
  
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
  
  const selectableElements = document.querySelectorAll('.list-item[data-type="link"], .list-item[data-type="folder"]:not([data-unsorted="true"])');
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
  // Use a more descriptive root label for tab groups opened from the root
  let folderTitle = folderId === 'root' ? 'Bookmarks' : 'Home';
  if (folderId !== 'root') {
    const folder = items.find(item => item.id === folderId && item.type === 'folder');
    if (!folder) return;
    folderTitle = folder.title || 'Untitled';
  }
  
  const directLinks = items.filter(item => item.parentId === folderId && item.type === 'link');
  
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
  const selectedLinks = items.filter(item => hasSelection(item.id) && item.type === 'link');
  
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
// ============================================

export function cleanupDragState() {
  document.body.classList.remove('is-dragging');
  
  document.querySelectorAll('.list-item.dragging').forEach(el => {
    el.classList.remove('dragging');
  });
  
  itemsGrid.querySelectorAll('.folder-drop-target').forEach(el => {
    el.classList.remove('folder-drop-target');
  });
  breadcrumb.querySelectorAll('.breadcrumb-drop-target').forEach(el => {
    el.classList.remove('breadcrumb-drop-target');
  });
  
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

export function handleDragStart(e) {
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
    const draggedItems = items.filter(i => hasSelection(i.id));
    const hasLinks = draggedItems.some(i => i.type === 'link');
    const hasFolders = draggedItems.some(i => i.type === 'folder');
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
  
  const item = items.find(i => i.id === itemId);
  if (item) {
    const dragPreview = document.createElement('div');
    dragPreview.className = 'drag-preview';
    
    let iconHtml = '';
    let titleText = '';
    
    if (draggedItemIds.length > 1) {
      iconHtml = `<span style="font-weight: 600; font-size: 14px;">${draggedItemIds.length}</span>`;
      titleText = `${draggedItemIds.length} items`;
    } else {
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

export function handleDragOver(e) {
  if (!draggedElement || this === draggedElement) return;
  
  const rect = this.getBoundingClientRect();
  const mouseY = e.clientY;
  const dropZoneSize = 12;
  
  const inTopZone = mouseY < rect.top + dropZoneSize;
  const inBottomZone = mouseY > rect.bottom - dropZoneSize;
  const inReorderZone = inTopZone || inBottomZone;
  
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
  
  if ((draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed') && this.dataset.type === 'folder') {
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.itemId;
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
          return;
        }
      }
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    this.classList.add('folder-drop-target');
    return;
  }
}

export function handleDragEnter(e) {
  if (!draggedElement || this === draggedElement) return;
  
  if ((draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed') && this.dataset.type === 'folder') {
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.itemId;
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
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
  
  if (isReorder && this.dataset.type === dragType) {
    const folderItems = getItemsForFolder(currentFolderId);
    const sameTypeItems = folderItems.filter(item => item.type === dragType);
    
    const itemsBeingDragged = itemIds.length > 0 ? itemIds : [draggedItemId];
    const draggedSet = new Set(itemsBeingDragged);
    
    const targetIndex = sameTypeItems.findIndex(item => item.id === targetItemId);
    if (targetIndex === -1) return;
    
    if (draggedSet.has(targetItemId)) return;
    
    saveStateForUndo();
    
    const draggedItemsInOrder = sameTypeItems.filter(item => draggedSet.has(item.id));
    
    const remainingItems = sameTypeItems.filter(item => !draggedSet.has(item.id));
    
    let insertIndex = remainingItems.findIndex(item => item.id === targetItemId);
    if (insertIndex === -1) {
      insertIndex = remainingItems.length;
    } else if (insertAfter) {
      insertIndex++;
    }
    
    remainingItems.splice(insertIndex, 0, ...draggedItemsInOrder);
    
    remainingItems.forEach((item, index) => {
      const itemInArray = items.find(i => i.id === item.id);
      if (itemInArray) {
        itemInArray.order = index;
      }
    });
    
    clearSelection();
    
    await saveItems(false);
    if (renderItemsCallback) renderItemsCallback();
    return;
  }
  
  if ((dragType === 'link' || dragType === 'folder' || dragType === 'mixed') && this.dataset.type === 'folder') {
    this.classList.remove('folder-drop-target');
    
    const itemsToMove = itemIds.length > 0 ? itemIds : [draggedItemId];
    
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
    
    let hadUnsortedItem = false;
    
    const targetFolderItems = items.filter(i => i.parentId === targetItemId);
    let maxOrder = targetFolderItems.length > 0 
      ? Math.max(...targetFolderItems.map(i => i.order ?? 0))
      : -1;
    
    for (const itemId of itemsToMove) {
      const itemToMove = items.find(i => i.id === itemId);
      if (!itemToMove) continue;
      
      if (itemToMove.parentId === UNSORTED_FOLDER_ID) {
        hadUnsortedItem = true;
      }
      
      itemToMove.parentId = targetItemId;
      itemToMove.order = ++maxOrder;
    }
    
    if (hadUnsortedItem) {
      checkAndDeleteUnsortedFolderIfEmpty();
    }
    
    clearSelection();
    
    await saveItems();
    if (renderItemsCallback) renderItemsCallback();
    return;
  }
}

// Breadcrumb drag handlers
export function handleBreadcrumbDragOver(e) {
  if (draggedElement && (draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed')) {
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.folderId;
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
          return;
        }
      }
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
}

export function handleBreadcrumbDragEnter(e) {
  if (draggedElement && (draggedItemType === 'link' || draggedItemType === 'folder' || draggedItemType === 'mixed')) {
    if (draggedItemType === 'folder' || draggedItemType === 'mixed') {
      const targetFolderId = this.dataset.folderId;
      for (const dragId of draggedItemIds) {
        const dragItem = items.find(i => i.id === dragId);
        if (dragItem && dragItem.type === 'folder' && isFolderOrDescendant(dragId, targetFolderId)) {
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
      const item = items.find(i => i.id === itemId);
      if (item && item.type === 'folder' && isFolderOrDescendant(itemId, targetFolderId)) {
        showNotification('Cannot move a folder into itself or a subfolder');
        return;
      }
    }
  }
  
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
  
  let hadUnsortedItem = false;
  
  const targetFolderItems = items.filter(i => i.parentId === targetFolderId);
  let maxOrder = targetFolderItems.length > 0 
    ? Math.max(...targetFolderItems.map(i => i.order ?? 0))
    : -1;
  
  for (const itemId of itemsToMove) {
    const itemToMove = items.find(i => i.id === itemId);
    if (!itemToMove) continue;
    
    if (itemToMove.parentId === targetFolderId) continue;
    
    if (itemToMove.parentId === UNSORTED_FOLDER_ID) {
      hadUnsortedItem = true;
    }
    
    itemToMove.parentId = targetFolderId;
    itemToMove.order = ++maxOrder;
  }
  
  if (hadUnsortedItem) {
    checkAndDeleteUnsortedFolderIfEmpty();
  }
  
  clearSelection();
  
  await saveItems();
  if (renderItemsCallback) renderItemsCallback();
}

// ============================================
// GETTERS FOR MODAL ELEMENTS
// ============================================

export function getModalElements() {
  return {
    addModalOverlay, addModalClose, addForm, addFormRows, addSubmitBtn,
    addFolderModalOverlay, addFolderModalClose, addFolderForm, folderNameInput, addFolderSubmitBtn,
    editModalOverlay, modalTitle, editForm, itemTypeInput, itemIdInput, itemTitleInput, itemUrlInput, urlGroup, cancelBtn, submitBtn,
    deleteModalOverlay, deleteItemName, deleteCancelBtn, deleteConfirmBtn,
    moveBanner, moveBannerDismiss, moveBannerIcon, moveBannerText, moveBannerAction
  };
}

