// ============================================
// RENDER MODULE
// ============================================

import {
  items,
  currentFolderId,
  isInMoveMode,
  movingItemIds,
  UNSORTED_FOLDER_ID,
  inlineFolderMode,
  inlineFolderTargetId,
  inlineFolderParentId,
  inlineFolderDraft,
  inlineFolderSaving,
  setInlineFolderDraft,
  setInlineFolderSaving,
  resetInlineFolderState,
  inlineBookmarkMode,
  inlineBookmarkTargetId,
  inlineBookmarkParentId,
  inlineBookmarkDraftUrl,
  inlineBookmarkDraftTitle,
  inlineBookmarkSaving,
  setInlineBookmarkDraftUrl,
  setInlineBookmarkDraftTitle,
  setInlineBookmarkSaving,
  resetInlineBookmarkState
} from './state.js';
import { escapeHtml, getFolderIconSvg, getInboxIconSvg, generateId, normalizeUrl, getTitleFromUrl, isUrl } from './utils.js';
import { getFaviconUrl, preloadVisibleFavicons, saveItems, saveStateForUndo } from './storage.js';
import { getItemsForFolder, getLinkCountInFolder, getFolderDescendantCount, isFolderOrDescendant } from './navigation.js';

// DOM elements
let itemsGrid = null;

// Initialize render DOM elements
export function initRenderElements() {
  itemsGrid = document.getElementById('items-grid');
}

// ============================================
// MAIN RENDER FUNCTION
// ============================================

export function renderItems() {
  const folderItems = getItemsForFolder(currentFolderId);
  
  // Separate folders and links
  let folders = folderItems.filter(item => item.type === 'folder');
  const links = folderItems.filter(item => item.type === 'link');
  
  // Filter out Unsorted folder and folders being moved when in move mode
  if (isInMoveMode()) {
    folders = folders.filter(f => f.id !== UNSORTED_FOLDER_ID && !movingItemIds.includes(f.id));
  }
  
  renderListView(folders, links);
  
  // Pre-load favicons for visible items
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => preloadVisibleFavicons(currentFolderId));
  } else {
    setTimeout(() => preloadVisibleFavicons(currentFolderId), 100);
  }
}

// ============================================
// LIST VIEW RENDERING
// ============================================

export function renderListView(folders, links) {
  if (!itemsGrid) {
    itemsGrid = document.getElementById('items-grid');
  }
  
  itemsGrid.className = 'list-view';
  
  let listHtml = '';
  const inMoveMode = isInMoveMode();
  const isInlineCreateActive = inlineFolderMode === 'create' && inlineFolderParentId === currentFolderId;
  const inlineRenameId = inlineFolderMode === 'rename' ? inlineFolderTargetId : null;
  const isInlineBookmarkCreateActive = inlineBookmarkMode === 'create' && inlineBookmarkParentId === currentFolderId;
  const inlineBookmarkEditId = inlineBookmarkMode === 'edit' ? inlineBookmarkTargetId : null;
  
  // Separate Unsorted folder from other folders
  const unsortedFolder = folders.find(f => f.id === UNSORTED_FOLDER_ID);
  const regularFolders = folders.filter(f => f.id !== UNSORTED_FOLDER_ID);
  
  // Unsorted folder section
  if (unsortedFolder && !inMoveMode) {
    const nestedCount = getFolderDescendantCount(unsortedFolder.id);
    const linkCount = getLinkCountInFolder(unsortedFolder.id);
    const metaText = nestedCount > 0 ? `${nestedCount} ⋅ ${linkCount}` : `${linkCount}`;
    listHtml += '<div class="list-section list-section-unsorted">';
    listHtml += `
      <div class="list-item" draggable="false" data-item-id="${unsortedFolder.id}" data-type="folder" data-unsorted="true">
        <div class="list-item-icon">
          ${getInboxIconSvg()}
        </div>
        <span class="list-item-title">${escapeHtml(unsortedFolder.title)}</span>
        <span class="list-item-meta">${metaText}</span>
      </div>
    `;
    listHtml += '</div>';
  }
  
  // Regular folders section
  const shouldRenderRegularSection = regularFolders.length > 0 || isInlineCreateActive;
  
  if (shouldRenderRegularSection) {
    listHtml += '<div class="list-section">';
    listHtml += regularFolders.map(item => {
      const nestedCount = getFolderDescendantCount(item.id);
      const linkCount = getLinkCountInFolder(item.id);
      const metaText = nestedCount > 0 ? `${nestedCount} ⋅ ${linkCount}` : `${linkCount}`;
      
      if (inlineRenameId === item.id) {
        return renderInlineFolderInput({
          mode: 'rename',
          value: inlineFolderDraft || item.title,
          folderId: item.id
        });
      }
      
      // Show "Move here" button on folders when in move mode
      let moveHereBtn = '';
      if (inMoveMode) {
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
          <span class="list-item-meta">${metaText}</span>
        </div>
      `;
    }).join('');
    
    if (isInlineCreateActive) {
      listHtml += renderInlineFolderInput({
        mode: 'create',
        value: inlineFolderDraft
      });
    }
    
    listHtml += '</div>';
  }
  
  // Links section - don't show in move mode
  const shouldRenderLinksSection = !inMoveMode && (links.length > 0 || isInlineBookmarkCreateActive || inlineBookmarkEditId);
  if (shouldRenderLinksSection) {
    listHtml += '<div class="list-section">';
    listHtml += links.map(item => {
      if (inlineBookmarkEditId === item.id) {
        return renderInlineBookmarkInput({
          mode: 'edit',
          urlValue: inlineBookmarkDraftUrl || item.url || '',
          titleValue: inlineBookmarkDraftTitle || item.title || '',
          bookmarkId: item.id,
          parentId: item.parentId
        });
      }
      // Show move button for links in Unsorted folder
      const showUnsortedActions = currentFolderId === UNSORTED_FOLDER_ID;
      const actionButtonsHtml = showUnsortedActions ? `
        <div class="list-item-actions">
          <button class="list-item-action-btn list-item-delete-btn" data-item-id="${item.id}">Delete</button>
          <button class="list-item-action-btn list-item-move-btn" data-item-id="${item.id}">Move</button>
        </div>
      ` : '';
      
      return `
        <a class="list-item draggable" draggable="true" href="${escapeHtml(item.url)}" data-item-id="${item.id}" data-type="link">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${escapeHtml(item.title)}</span>
          <span class="list-item-url">${escapeHtml(item.url)}</span>
          ${actionButtonsHtml}
        </a>
      `;
    }).join('');
    
    if (isInlineBookmarkCreateActive) {
      listHtml += renderInlineBookmarkInput({
        mode: 'create',
        urlValue: inlineBookmarkDraftUrl,
        titleValue: inlineBookmarkDraftTitle,
        parentId: inlineBookmarkParentId || currentFolderId
      });
    }
    listHtml += '</div>';
  }
  
  itemsGrid.innerHTML = listHtml;
  attachInlineFolderInputHandlers();
  attachInlineBookmarkInputHandlers();
}

function renderInlineFolderInput({ mode, value = '', folderId = '' }) {
  const parentId = inlineFolderParentId || currentFolderId;
  const safeValue = escapeHtml(value);
  return `
    <div class="list-item inline-folder-item" data-inline-mode="${mode}" ${folderId ? `data-folder-id="${folderId}"` : ''}>
      <div class="list-item-icon">
        ${getFolderIconSvg()}
      </div>
      <input
        type="text"
        class="inline-folder-input"
        placeholder="New folder"
        value="${safeValue}"
        data-mode="${mode}"
        data-parent-id="${parentId}"
        ${folderId ? `data-folder-id="${folderId}"` : ''}
      >
    </div>
  `;
}

async function commitInlineFolderCreate(title, parentId) {
  saveStateForUndo();
  const siblingFolders = items.filter(item => item.parentId === parentId && item.type === 'folder');
  const maxOrder = siblingFolders.length > 0
    ? Math.max(...siblingFolders.map(f => f.order ?? 0))
    : -1;
  
  const newFolder = {
    id: generateId(),
    type: 'folder',
    title: title,
    parentId,
    order: maxOrder + 1
  };
  
  items.push(newFolder);
  await saveItems();
}

async function commitInlineFolderRename(folderId, newTitle) {
  const folder = items.find(i => i.id === folderId);
  if (!folder) return;
  if (folder.title === newTitle) return;
  
  saveStateForUndo();
  folder.title = newTitle;
  await saveItems();
}

function attachInlineFolderInputHandlers() {
  if (!itemsGrid) return;
  const input = itemsGrid.querySelector('.inline-folder-input');
  if (!input) return;
  if (input.dataset.inlineBound === 'true') return;
  input.dataset.inlineBound = 'true';
  
  input.focus();
  input.select();
  
  const mode = input.dataset.mode;
  const folderId = input.dataset.folderId || null;
  const parentId = input.dataset.parentId || currentFolderId;
  let settled = false;
  
  const cleanup = () => {
    input.removeEventListener('keydown', onKeyDown);
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('input', onInput);
  };
  
  const finish = async (shouldSave) => {
    if (settled || inlineFolderSaving) return;
    settled = true;
    setInlineFolderSaving(true);
    cleanup();
    
    const value = input.value.trim();
    const capturedMode = mode;
    const capturedFolderId = folderId;
    const capturedParentId = parentId;
    
    // Clear inline UI before any async work to avoid duplicate renders
    resetInlineFolderState();
    
    try {
      if (shouldSave && value) {
        if (capturedMode === 'create') {
          await commitInlineFolderCreate(value, capturedParentId);
        } else if (capturedMode === 'rename' && capturedFolderId) {
          await commitInlineFolderRename(capturedFolderId, value);
        }
      }
    } finally {
      setInlineFolderSaving(false);
      renderItems();
    }
  };
  
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };
  
  const onBlur = () => finish(true);
  const onInput = () => setInlineFolderDraft(input.value);
  
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('blur', onBlur);
  input.addEventListener('input', onInput);
}

function renderInlineBookmarkInput({ mode, urlValue = '', titleValue = '', bookmarkId = '', parentId = currentFolderId }) {
  const iconHtml = getInlineBookmarkIconHtml(urlValue);
  return `
    <div class="list-item inline-bookmark-item" data-inline-mode="${mode}" data-parent-id="${parentId}" ${bookmarkId ? `data-bookmark-id="${bookmarkId}"` : ''}>
      <div class="list-item-icon">
        ${iconHtml}
      </div>
      <div class="inline-bookmark-fields">
        <input
          type="text"
          class="inline-bookmark-input inline-bookmark-url"
          placeholder="Address"
          value="${escapeHtml(urlValue)}"
          data-field="url"
        >
        <div class="inline-bookmark-divider" aria-hidden="true"></div>
        <input
          type="text"
          class="inline-bookmark-input inline-bookmark-title"
          placeholder="Name"
          value="${escapeHtml(titleValue)}"
          data-field="title"
        >
      </div>
    </div>
  `;
}

function getInlineBookmarkIconHtml(urlValue = '') {
  const trimmed = (urlValue || '').trim();
  if (trimmed && isUrl(trimmed)) {
    const normalized = normalizeUrl(trimmed);
    return `<img class="inline-bookmark-favicon" src="${escapeHtml(getFaviconUrl(normalized))}" alt="" loading="lazy">`;
  }
  return `<img class="inline-bookmark-favicon" src="icons/bookmark.svg" alt="Bookmark">`;
}

async function commitInlineBookmarkCreate(url, title, parentId) {
  saveStateForUndo();
  const siblingLinks = items.filter(item => item.parentId === parentId && item.type === 'link');
  const maxOrder = siblingLinks.length > 0
    ? Math.max(...siblingLinks.map(link => link.order ?? 0))
    : -1;

  const newBookmark = {
    id: generateId(),
    type: 'link',
    title,
    url,
    parentId,
    order: maxOrder + 1
  };

  items.push(newBookmark);
  await saveItems();
}

async function commitInlineBookmarkEdit(bookmarkId, url, title) {
  const bookmark = items.find(i => i.id === bookmarkId && i.type === 'link');
  if (!bookmark) return;
  const nextTitle = title || getTitleFromUrl(url);
  const urlChanged = bookmark.url !== url;
  const titleChanged = bookmark.title !== nextTitle;
  if (!urlChanged && !titleChanged) return;

  saveStateForUndo();
  bookmark.url = url;
  bookmark.title = nextTitle;
  await saveItems();
}

function attachInlineBookmarkInputHandlers() {
  if (!itemsGrid) return;
  const container = itemsGrid.querySelector('.inline-bookmark-item');
  if (!container) return;
  if (container.dataset.inlineBound === 'true') return;
  container.dataset.inlineBound = 'true';

  const urlInput = container.querySelector('.inline-bookmark-url');
  const titleInput = container.querySelector('.inline-bookmark-title');
  const iconImg = container.querySelector('.inline-bookmark-favicon');
  const mode = container.dataset.inlineMode;
  const bookmarkId = container.dataset.bookmarkId || null;
  const parentId = container.dataset.parentId || currentFolderId;
  let settled = false;

  const inputs = [urlInput, titleInput].filter(Boolean);

  if (urlInput) {
    urlInput.focus();
    urlInput.select();
  } else if (titleInput) {
    titleInput.focus();
    titleInput.select();
  }

  const cleanup = () => {
    inputs.forEach(input => {
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('input', onInput);
    });
  };

  const finish = async (shouldSave) => {
    if (settled || inlineBookmarkSaving) return;
    settled = true;
    setInlineBookmarkSaving(true);
    cleanup();

    const rawUrl = urlInput ? urlInput.value.trim() : '';
    const rawTitle = titleInput ? titleInput.value.trim() : '';
    const capturedMode = mode;
    const capturedBookmarkId = bookmarkId;
    const capturedParentId = parentId;

    resetInlineBookmarkState();

    try {
      if (shouldSave) {
        if (!rawUrl) return;
        const normalized = normalizeUrl(rawUrl);
        const finalTitle = rawTitle || getTitleFromUrl(normalized);
        if (capturedMode === 'create') {
          await commitInlineBookmarkCreate(normalized, finalTitle, capturedParentId);
        } else if (capturedMode === 'edit' && capturedBookmarkId) {
          await commitInlineBookmarkEdit(capturedBookmarkId, normalized, finalTitle);
        }
      }
    } finally {
      setInlineBookmarkSaving(false);
      renderItems();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };

  const onBlur = () => {
    setTimeout(() => {
      if (!container.contains(document.activeElement)) {
        finish(true);
      }
    }, 0);
  };

  const onInput = () => {
    setInlineBookmarkDraftUrl(urlInput ? urlInput.value : '');
    setInlineBookmarkDraftTitle(titleInput ? titleInput.value : '');
    if (iconImg && urlInput) {
      updateInlineBookmarkFavicon(iconImg, urlInput.value);
    }
  };

  inputs.forEach(input => {
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', onBlur);
    input.addEventListener('input', onInput);
  });

  // Initialize icon based on any prefilled value
  if (iconImg && urlInput) {
    updateInlineBookmarkFavicon(iconImg, urlInput.value);
  }
}

function updateInlineBookmarkFavicon(iconImg, urlValue = '') {
  if (!iconImg) return;
  const trimmed = (urlValue || '').trim();
  if (trimmed && isUrl(trimmed)) {
    const normalized = normalizeUrl(trimmed);
    iconImg.src = getFaviconUrl(normalized);
    iconImg.alt = '';
  } else {
    iconImg.src = 'icons/bookmark.svg';
    iconImg.alt = 'Bookmark';
  }
}
