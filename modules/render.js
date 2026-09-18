// ============================================
// RENDER MODULE (Chrome Native Bookmarks)
// ============================================

import {
  ROOT_FOLDER_ID, currentFolderId, isSearchMode, inlineFolderMode, inlineFolderTargetId, inlineFolderParentId,
  inlineFolderDraft, inlineFolderSaving, setInlineFolderDraft, setInlineFolderSaving,
  resetInlineFolderState, inlineBookmarkMode, inlineBookmarkTargetId, inlineBookmarkParentId,
  inlineBookmarkDraftUrl, inlineBookmarkDraftTitle, inlineBookmarkSaving,
  setInlineBookmarkDraftUrl, setInlineBookmarkDraftTitle, setInlineBookmarkSaving,
  resetInlineBookmarkState
} from './state.js';
import {
  DEFAULT_FOLDER_ICON, escapeHtml, getFolderIconSvg, normalizeUrl, getTitleFromUrl, getBookmarkDisplayUrl, isUrl
} from './utils.js';
import {
  getFaviconHtml, getBookmarks, createBookmark, createFolder, updateBookmark,
  getLinkCountInFolder, getFolderDescendantCount, saveCreateForUndo,
  saveEditForUndo, getFolderIconName
} from './storage.js';
import { renderBreadcrumb } from './navigation.js';

// DOM elements
let itemsGrid = null;

// Initialize render DOM elements
export function initRenderElements() {
  itemsGrid = document.getElementById('items-grid');
}

// ============================================
// MAIN RENDER FUNCTION
// ============================================

let renderVersion = 0;

export async function renderItems() {
  const version = ++renderVersion;
  const folderId = currentFolderId;
  const isCurrent = () => version === renderVersion && folderId === currentFolderId && !isSearchMode;
  // Coalesce synchronous refresh requests before reading browser data.
  await Promise.resolve();
  if (!isCurrent()) return;
  const bookmarks = await getBookmarks(folderId);
  if (!isCurrent()) return;

  // Separate folders and links based on url property
  const folders = bookmarks.filter(item => !item.url);
  const links = bookmarks.filter(item => item.url);

  await renderListView(folders, links, isCurrent);
}

// ============================================
// LIST VIEW RENDERING
// ============================================

export async function renderListView(folders, links, isCurrent = () => true) {
  if (!itemsGrid) {
    itemsGrid = document.getElementById('items-grid');
  }

  // Check inline mode states first (before empty state check)
  const isInlineCreateActive = inlineFolderMode === 'create' && inlineFolderParentId === currentFolderId;
  const inlineRenameId = inlineFolderMode === 'rename' ? inlineFolderTargetId : null;
  const isInlineBookmarkCreateActive = inlineBookmarkMode === 'create' && inlineBookmarkParentId === currentFolderId;
  const inlineBookmarkEditId = inlineBookmarkMode === 'edit' ? inlineBookmarkTargetId : null;

  // Show onboarding only at the empty root, never inside an existing folder.
  if (!isCurrent()) return;
  const hasAnyItems = currentFolderId !== ROOT_FOLDER_ID || folders.length > 0 || links.length > 0;
  const shouldSkipEmptyState = isInlineCreateActive || isInlineBookmarkCreateActive;

  if (!hasAnyItems && !shouldSkipEmptyState) {
    itemsGrid.className = 'list-view empty-state-container';
    itemsGrid.innerHTML = `
      <div class="empty-state">
        <img src="icons/click.svg" alt="" class="empty-state-icon">
        <span class="empty-state-text">To add bookmarks, right-click with your mouse</span>
      </div>
    `;
    return;
  }

  let listHtml = '';

  // Folders section
  const shouldRenderFolderSection = folders.length > 0 || isInlineCreateActive;

  if (shouldRenderFolderSection) {
    listHtml += '<div class="list-section">';

    // Use Promise.all to fetch folder counts in parallel
    const folderHtmlPromises = folders.map(async (item) => {
      const nestedCount = await getFolderDescendantCount(item.id);
      const linkCount = await getLinkCountInFolder(item.id);
      const metaText = nestedCount > 0 ? `${nestedCount} ⋅ ${linkCount}` : `${linkCount}`;

      if (inlineRenameId === item.id) {
        return renderInlineFolderInput({
          mode: 'rename',
          value: inlineFolderDraft || item.title,
          folderId: item.id
        });
      }

      return `
        <div class="list-item draggable" draggable="true" data-item-id="${item.id}" data-type="folder">
          <div class="list-item-icon">
            ${getFolderIconSvg(getFolderIconName(item.id))}
          </div>
          <span class="list-item-title">${escapeHtml(item.title)}</span>
          <span class="list-item-meta">${metaText}</span>
        </div>
      `;
    });

    const folderHtmls = await Promise.all(folderHtmlPromises);
    listHtml += folderHtmls.join('');

    if (isInlineCreateActive) {
      listHtml += renderInlineFolderInput({
        mode: 'create',
        value: inlineFolderDraft
      });
    }

    listHtml += '</div>';
  }

  // Links section
  const shouldRenderLinksSection = links.length > 0 || isInlineBookmarkCreateActive || inlineBookmarkEditId;
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

      return `
        <a class="list-item draggable" draggable="true" href="${escapeHtml(item.url)}" data-item-id="${item.id}" data-type="link">
          <div class="list-item-icon">
            ${getFaviconHtml(item.url)}
          </div>
          <span class="list-item-title">${escapeHtml(item.title)}</span>
          <span class="list-item-url">${escapeHtml(getBookmarkDisplayUrl(item.url))}</span>
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

  if (!isCurrent()) return;
  itemsGrid.className = 'list-view';
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
        ${getFolderIconSvg(folderId ? getFolderIconName(folderId) : DEFAULT_FOLDER_ICON)}
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
  const folder = await createFolder(parentId, title);
  if (folder) {
    saveCreateForUndo(folder);
  }
}

async function commitInlineFolderRename(folderId, newTitle) {
  await saveEditForUndo(folderId);
  await updateBookmark(folderId, newTitle);
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
      // Ensure breadcrumb is rendered after creating first item
      renderBreadcrumb();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
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
    return `<span class="inline-bookmark-favicon">${getFaviconHtml(normalized)}</span>`;
  }
  return `<span class="inline-bookmark-favicon">${getFaviconHtml('')}</span>`;
}

async function commitInlineBookmarkCreate(url, title, parentId) {
  const bookmark = await createBookmark(parentId, title, url);
  if (bookmark) {
    saveCreateForUndo(bookmark);
  }
}

async function commitInlineBookmarkEdit(bookmarkId, url, title) {
  await saveEditForUndo(bookmarkId);
  await updateBookmark(bookmarkId, title, url);
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

  // When editing, focus on title (name) field; when creating, focus on URL field
  if (mode === 'edit' && titleInput) {
    titleInput.focus();
    titleInput.select();
  } else if (urlInput) {
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
      // Ensure breadcrumb is rendered after creating first item
      renderBreadcrumb();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
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
    iconImg.innerHTML = getFaviconHtml(normalized);
  } else {
    iconImg.innerHTML = getFaviconHtml('');
  }
}
