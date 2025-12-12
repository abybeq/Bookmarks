// ============================================
// NAVIGATION MODULE
// ============================================

import {
  items, currentFolderId, setCurrentFolderId, navigationStack, setNavigationStack,
  isInMoveMode, movingItemIds, UNSORTED_FOLDER_ID, clearSelectionState
} from './state.js';
import { escapeHtml } from './utils.js';
import { saveItems } from './storage.js';

// ============================================
// FOLDER OPERATIONS
// ============================================

// Get items for current folder, sorted by order
export function getItemsForFolder(folderId) {
  const folderItems = items.filter(item => item.parentId === folderId);
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
export function getFolderById(folderId) {
  return items.find(item => item.id === folderId && item.type === 'folder');
}

// Check if targetFolderId is the same as or a descendant of folderId
export function isFolderOrDescendant(folderId, targetFolderId) {
  if (folderId === targetFolderId) return true;
  
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
export function getTotalBookmarkCount() {
  return items.filter(item => item.type === 'link').length;
}

// Get count of links in a folder (recursive)
export function getLinkCountInFolder(folderId) {
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

// Count total descendant folders for a folder (recursive, excludes the folder itself)
export function getFolderDescendantCount(folderId) {
  const childFolders = items.filter(item => item.parentId === folderId && item.type === 'folder');
  let count = childFolders.length;
  
  for (const child of childFolders) {
    count += getFolderDescendantCount(child.id);
  }
  
  return count;
}

// ============================================
// BREADCRUMB
// ============================================

// Build breadcrumb path
export function getBreadcrumbPath() {
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
export function renderBreadcrumb() {
  const breadcrumb = document.getElementById('breadcrumb');
  const totalBookmarks = getTotalBookmarkCount();
  
  // Hide breadcrumb when there are 0 bookmarks
  if (totalBookmarks === 0) {
    breadcrumb.style.display = 'none';
    return;
  }
  
  breadcrumb.style.display = '';
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
}

// Start inline editing of folder name in breadcrumb
export function startInlineFolderEdit(element, renderItems) {
  const folderId = element.dataset.folderId;
  if (folderId === 'root') return;
  if (folderId === UNSORTED_FOLDER_ID) return;
  
  const folder = getFolderById(folderId);
  if (!folder) return;
  
  const currentText = folder.title;
  const originalWidth = element.offsetWidth;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = 'breadcrumb-edit-input';
  input.style.minWidth = `${Math.max(originalWidth, 60)}px`;
  
  element.replaceWith(input);
  input.focus();
  input.select();
  
  const saveEdit = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentText) {
      await updateFolderTitle(folderId, newTitle);
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
}

// Update folder title
export async function updateFolderTitle(folderId, newTitle) {
  const { saveStateForUndo } = await import('./storage.js');
  const folder = items.find(i => i.id === folderId);
  if (folder) {
    saveStateForUndo();
    folder.title = newTitle;
    await saveItems();
  }
}

// ============================================
// NAVIGATION
// ============================================

// Navigate to a specific folder
export function navigateToFolder(folderId, pushState = true, autoFocusFirst = false, callbacks = {}) {
  const { renderItems, renderBreadcrumb: renderBreadcrumbCallback, updateMoveBanner, resetKeyboardFocus, focusItem } = callbacks;
  
  // Clear selection when navigating
  clearSelectionState();
  document.querySelectorAll('.list-item.selected').forEach(el => {
    el.classList.remove('selected', 'selection-first', 'selection-middle', 'selection-last', 'selection-single');
  });
  
  if (folderId === 'root') {
    setCurrentFolderId('root');
    setNavigationStack([]);
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
  
  // Update browser history
  if (pushState && !isInMoveMode()) {
    const state = { folderId, navigationStack: [...navigationStack] };
    const hash = folderId === 'root' ? '' : `#folder/${folderId}`;
    history.pushState(state, '', hash || window.location.pathname);
  }
  
  // Update move banner if in move mode
  if (isInMoveMode() && updateMoveBanner) {
    updateMoveBanner();
  }
  
  // Reset keyboard focus
  if (resetKeyboardFocus) {
    resetKeyboardFocus();
  }
  
  if (renderItems) renderItems();
  if (renderBreadcrumbCallback) renderBreadcrumbCallback();
  
  // Auto-focus first item if navigating with keyboard
  if (autoFocusFirst && focusItem) {
    focusItem(0);
  }
}

// Simple navigate (uses imported state directly)
export function navigateToFolderSimple(folderId) {
  if (folderId === 'root') {
    setCurrentFolderId('root');
    setNavigationStack([]);
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

// Handle browser back/forward navigation
export function handlePopState(event, renderItems, renderBreadcrumbCallback) {
  if (event.state) {
    setCurrentFolderId(event.state.folderId || 'root');
    setNavigationStack(event.state.navigationStack || []);
  } else {
    const hash = window.location.hash;
    if (hash.startsWith('#folder/')) {
      const folderId = hash.replace('#folder/', '');
      restoreNavigationToFolder(folderId, renderItems, renderBreadcrumbCallback);
      return;
    }
    setCurrentFolderId('root');
    setNavigationStack([]);
  }
  
  renderItems();
  renderBreadcrumbCallback();
}

// Restore navigation stack to a specific folder
export function restoreNavigationToFolder(targetFolderId, renderItems, renderBreadcrumbCallback) {
  const stack = [];
  let currentId = targetFolderId;
  
  while (currentId && currentId !== 'root') {
    const folder = getFolderById(currentId);
    if (folder) {
      stack.unshift(currentId);
      currentId = folder.parentId;
    } else {
      setCurrentFolderId('root');
      setNavigationStack([]);
      renderItems();
      renderBreadcrumbCallback();
      return;
    }
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
    const state = { folderId: 'root', navigationStack: [] };
    history.replaceState(state, '', window.location.pathname);
  }
}

// ============================================
// UNSORTED FOLDER HELPERS
// ============================================

// Check and delete Unsorted folder if it's empty
export function checkAndDeleteUnsortedFolderIfEmpty() {
  const unsortedContents = items.filter(i => i.parentId === UNSORTED_FOLDER_ID);
  if (unsortedContents.length === 0) {
    // Find and remove the unsorted folder
    const unsortedIndex = items.findIndex(i => i.id === UNSORTED_FOLDER_ID);
    if (unsortedIndex !== -1) {
      items.splice(unsortedIndex, 1);
    }
    
    // If we were inside Unsorted folder, navigate back to root
    if (currentFolderId === UNSORTED_FOLDER_ID) {
      setCurrentFolderId('root');
      setNavigationStack([]);
    }
  }
}

