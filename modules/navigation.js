// ============================================
// NAVIGATION MODULE (Chrome Native Bookmarks)
// ============================================

import {
  currentFolderId, setCurrentFolderId, navigationStack, setNavigationStack, clearSelectionState,
  ROOT_FOLDER_ID, inlineFolderMode, inlineFolderParentId, inlineBookmarkMode,
  inlineBookmarkParentId
} from './state.js';
import { escapeHtml } from './utils.js';
import {
  getBookmarkById, getBookmarks, updateBookmark, getTotalBookmarkCount, saveEditForUndo
} from './storage.js';

// ============================================
// FOLDER OPERATIONS
// ============================================

// Get folder by ID
export async function getFolderById(folderId) {
  if (folderId === ROOT_FOLDER_ID) {
    return { id: ROOT_FOLDER_ID, title: 'Bookmarks', parentId: '0' };
  }
  const bookmark = await getBookmarkById(folderId);
  // Return only if it's a folder (no url)
  return bookmark && !bookmark.url ? bookmark : null;
}

// Build the canonical path from the bookmarks root to a folder.
export async function getNavigationStackForFolder(folderId) {
  if (folderId === ROOT_FOLDER_ID) return [];

  const stack = [];
  const visited = new Set();
  let currentId = folderId;

  while (currentId && currentId !== ROOT_FOLDER_ID) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);

    const folder = await getFolderById(currentId);
    if (!folder) return null;

    stack.unshift(currentId);
    currentId = folder.parentId;
  }

  return currentId === ROOT_FOLDER_ID ? stack : null;
}

// ============================================
// BREADCRUMB
// ============================================

// Build breadcrumb path
export async function getBreadcrumbPath() {
  const totalBookmarks = await getTotalBookmarkCount();
  const rootTitle = `${totalBookmarks} bookmark${totalBookmarks !== 1 ? 's' : ''}`;
  const path = [{ id: ROOT_FOLDER_ID, title: rootTitle }];

  for (const folderId of navigationStack) {
    const folder = await getFolderById(folderId);
    if (folder) {
      path.push({ id: folder.id, title: folder.title });
    }
  }

  return path;
}

// Render breadcrumb navigation
let breadcrumbVersion = 0;

export async function renderBreadcrumb() {
  const version = ++breadcrumbVersion;
  const folderId = currentFolderId;
  const isCurrent = () => version === breadcrumbVersion && folderId === currentFolderId;
  const breadcrumb = document.getElementById('breadcrumb');
  const totalBookmarks = await getTotalBookmarkCount();
  const bookmarks = await getBookmarks(folderId);
  if (!isCurrent()) return;
  const hasAnyItems = totalBookmarks > 0 || bookmarks.length > 0;

  // Check if inline create mode is active (user clicked add bookmark/folder)
  // If so, show breadcrumb even when there are 0 items
  const isInlineFolderCreate = inlineFolderMode === 'create' && inlineFolderParentId === currentFolderId;
  const isInlineBookmarkCreate = inlineBookmarkMode === 'create' && inlineBookmarkParentId === currentFolderId;
  const shouldShowBreadcrumb = hasAnyItems || isInlineFolderCreate || isInlineBookmarkCreate;

  // Hide breadcrumb when there are 0 items and no inline create mode
  if (!shouldShowBreadcrumb) {
    breadcrumb.style.display = 'none';
    return;
  }

  const path = await getBreadcrumbPath();
  if (!isCurrent()) return;
  breadcrumb.style.display = '';
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
}

// Start inline editing of folder name in breadcrumb
export function startInlineFolderEdit(element, renderItems) {
  const folderId = element.dataset.folderId;
  if (folderId === ROOT_FOLDER_ID) return;

  getFolderById(folderId).then(folder => {
    if (!folder) return;

    const currentText = folder.title;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'breadcrumb-edit-input';

    const resizeInput = () => {
      input.style.width = '0';
      input.style.width = `${input.scrollWidth}px`;
    };

    element.replaceWith(input);
    resizeInput();
    input.focus();
    input.select();

    input.addEventListener('input', resizeInput);

    const saveEdit = async () => {
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== currentText) {
        await saveEditForUndo(folderId);
        await updateBookmark(folderId, newTitle);
      }
      renderBreadcrumb();
      renderItems();
    };

    input.addEventListener('blur', saveEdit);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.removeEventListener('blur', saveEdit);
        renderBreadcrumb();
      }
    });
  });
}

// ============================================
// NAVIGATION
// ============================================

// Navigate to a specific folder
export async function navigateToFolder(folderId, pushState = true, autoFocusFirst = false, callbacks = {}) {
  const {
    renderItems,
    renderBreadcrumb: renderBreadcrumbCallback,
    resetKeyboardFocus,
    focusItem,
    restoreFullPath = false
  } = callbacks;

  // Clear selection when navigating
  clearSelectionState();
  document.querySelectorAll('.list-item.selected').forEach(el => {
    el.classList.remove('selected', 'selection-first', 'selection-middle', 'selection-last', 'selection-single');
  });

  if (folderId === ROOT_FOLDER_ID) {
    setCurrentFolderId(ROOT_FOLDER_ID);
    setNavigationStack([]);
  } else {
    const restoredStack = restoreFullPath
      ? await getNavigationStackForFolder(folderId)
      : null;

    if (restoredStack) {
      setNavigationStack(restoredStack);
      setCurrentFolderId(folderId);
    } else {
      const stackIndex = navigationStack.indexOf(folderId);

      if (stackIndex >= 0) {
        setNavigationStack(navigationStack.slice(0, stackIndex + 1));
        setCurrentFolderId(folderId);
      } else {
        const newStack = [...navigationStack, folderId];
        setNavigationStack(newStack);
        setCurrentFolderId(folderId);
      }
    }
  }

  // Update browser history
  if (pushState) {
    const state = { folderId, navigationStack: [...navigationStack] };
    const hash = folderId === ROOT_FOLDER_ID ? '' : `#folder/${folderId}`;
    history.pushState(state, '', hash || window.location.pathname);
  }

  // Reset keyboard focus
  if (resetKeyboardFocus) {
    resetKeyboardFocus();
  }

  const renderPromise = renderItems ? renderItems() : null;
  if (renderBreadcrumbCallback) renderBreadcrumbCallback();

  // Auto-focus first item if navigating with keyboard
  if (autoFocusFirst && focusItem) {
    await renderPromise;
    if (folderId === currentFolderId) {
      focusItem(0);
    }
  }
}

// Handle browser back/forward navigation
export function handlePopState(event, renderItems, renderBreadcrumbCallback) {
  if (event.state) {
    setCurrentFolderId(event.state.folderId || ROOT_FOLDER_ID);
    setNavigationStack(event.state.navigationStack || []);
  } else {
    const hash = window.location.hash;
    if (hash.startsWith('#folder/')) {
      const folderId = hash.replace('#folder/', '');
      restoreNavigationToFolder(folderId, renderItems, renderBreadcrumbCallback);
      return;
    }
    setCurrentFolderId(ROOT_FOLDER_ID);
    setNavigationStack([]);
  }

  renderItems();
  renderBreadcrumbCallback();
}

// Restore navigation stack to a specific folder
export async function restoreNavigationToFolder(targetFolderId, renderItems, renderBreadcrumbCallback) {
  const stack = await getNavigationStackForFolder(targetFolderId);

  if (!stack) {
    setCurrentFolderId(ROOT_FOLDER_ID);
    setNavigationStack([]);
    renderItems();
    renderBreadcrumbCallback();
    return;
  }

  setCurrentFolderId(targetFolderId);
  setNavigationStack(stack);
  renderItems();
  renderBreadcrumbCallback();
}

// Initialize history state on page load
export function initializeHistoryState(renderItems, renderBreadcrumbCallback) {
  const hash = window.location.hash;

  if (hash.startsWith('#folder/')) {
    const folderId = hash.replace('#folder/', '');
    restoreNavigationToFolder(folderId, renderItems, renderBreadcrumbCallback);
    const state = { folderId: currentFolderId, navigationStack: [...navigationStack] };
    history.replaceState(state, '', hash);
  } else {
    const state = { folderId: ROOT_FOLDER_ID, navigationStack: [] };
    history.replaceState(state, '', window.location.pathname);
  }
}
