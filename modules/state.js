// ============================================
// STATE MANAGEMENT
// ============================================

// Core data state
export let items = [];
export let currentFolderId = 'root';
export let navigationStack = []; // Track folder navigation for breadcrumbs

// Editing state
export let editingItemId = null;
export let deletingItemId = null;
export let deletingItemIds = []; // Track multiple items being deleted (for multi-select)

// Search state
export let isSearchMode = false;
export let searchQuery = '';
export let focusedItemIndex = -1;
export let searchHistory = [];
export const MAX_SEARCH_HISTORY = 50;
export let originalSearchQuery = ''; // Store original user-typed query

// Multi-select state
export let selectedItemIds = new Set();
export let isBoxSelecting = false;
export let selectionBox = { startX: 0, startY: 0, currentX: 0, currentY: 0 };
export let selectionBoxElement = null;

// Undo functionality
export const undoStack = [];
export const MAX_UNDO_STACK_SIZE = 50;

// Theme state
export const DEFAULT_THEME = 'frost';
export let currentTheme = DEFAULT_THEME;
export let themePicker = null;

// Move mode state
export let movingItemId = null;
export let movingItemIds = [];
export let moveModePreviousFolderId = null;

// Context menu state
export let contextMenu = null;
export let contextMenuItemId = null;
export let bodyContextMenu = null;

// Drag and drop state
export let draggedElement = null;
export let draggedItemType = null;
export let isDragging = false;
export let draggedItemIds = [];
export let dropIndicator = null;
export let dropPosition = null;
export let dropTargetElement = null;

// Inline folder editing/creation state
export let inlineFolderMode = null; // 'create' | 'rename' | null
export let inlineFolderTargetId = null;
export let inlineFolderParentId = null;
export let inlineFolderDraft = '';
export let inlineFolderSaving = false;

// Inline bookmark editing/creation state
export let inlineBookmarkMode = null; // 'create' | 'edit' | null
export let inlineBookmarkTargetId = null;
export let inlineBookmarkParentId = null;
export let inlineBookmarkDraftUrl = '';
export let inlineBookmarkDraftTitle = '';
export let inlineBookmarkSaving = false;

// Performance flags
export let eventDelegationInitialized = false;
export let pendingStorageWrite = null;
export const STORAGE_DEBOUNCE_MS = 300;

// Unsorted folder constant
export const UNSORTED_FOLDER_ID = 'unsorted-folder';

// Search suggestions state
export let suggestionsAbortController = null;
export let currentSearchId = 0;

// ============================================
// STATE SETTERS
// ============================================

export function setItems(newItems) {
  items = newItems;
}

export function setCurrentFolderId(folderId) {
  currentFolderId = folderId;
}

export function setNavigationStack(stack) {
  navigationStack = stack;
}

export function setEditingItemId(id) {
  editingItemId = id;
}

export function setDeletingItemId(id) {
  deletingItemId = id;
}

export function setDeletingItemIds(ids) {
  deletingItemIds = ids;
}

export function setIsSearchMode(mode) {
  isSearchMode = mode;
}

export function setSearchQuery(query) {
  searchQuery = query;
}

export function setFocusedItemIndex(index) {
  focusedItemIndex = index;
}

export function setSearchHistory(history) {
  searchHistory = history;
}

export function setOriginalSearchQuery(query) {
  originalSearchQuery = query;
}

export function setSelectedItemIds(ids) {
  selectedItemIds = ids;
}

export function setIsBoxSelecting(selecting) {
  isBoxSelecting = selecting;
}

export function setSelectionBox(box) {
  selectionBox = box;
}

export function setSelectionBoxElement(element) {
  selectionBoxElement = element;
}

export function setCurrentTheme(theme) {
  currentTheme = theme;
}

export function setThemePicker(picker) {
  themePicker = picker;
}

export function setMovingItemId(id) {
  movingItemId = id;
}

export function setMovingItemIds(ids) {
  movingItemIds = ids;
}

export function setMoveModePreviousFolderId(id) {
  moveModePreviousFolderId = id;
}

export function setContextMenu(menu) {
  contextMenu = menu;
}

export function setContextMenuItemId(id) {
  contextMenuItemId = id;
}

export function setBodyContextMenu(menu) {
  bodyContextMenu = menu;
}

export function setDraggedElement(element) {
  draggedElement = element;
}

export function setDraggedItemType(type) {
  draggedItemType = type;
}

export function setIsDragging(dragging) {
  isDragging = dragging;
}

export function setDraggedItemIds(ids) {
  draggedItemIds = ids;
}

export function setDropIndicator(indicator) {
  dropIndicator = indicator;
}

export function setDropPosition(position) {
  dropPosition = position;
}

export function setDropTargetElement(element) {
  dropTargetElement = element;
}

export function setInlineFolderMode(mode) {
  inlineFolderMode = mode;
}

export function setInlineFolderTargetId(id) {
  inlineFolderTargetId = id;
}

export function setInlineFolderParentId(parentId) {
  inlineFolderParentId = parentId;
}

export function setInlineFolderDraft(draft) {
  inlineFolderDraft = draft;
}

export function setInlineFolderSaving(flag) {
  inlineFolderSaving = flag;
}

export function setInlineBookmarkMode(mode) {
  inlineBookmarkMode = mode;
}

export function setInlineBookmarkTargetId(id) {
  inlineBookmarkTargetId = id;
}

export function setInlineBookmarkParentId(parentId) {
  inlineBookmarkParentId = parentId;
}

export function setInlineBookmarkDraftUrl(url) {
  inlineBookmarkDraftUrl = url;
}

export function setInlineBookmarkDraftTitle(title) {
  inlineBookmarkDraftTitle = title;
}

export function setInlineBookmarkSaving(flag) {
  inlineBookmarkSaving = flag;
}

export function setEventDelegationInitialized(initialized) {
  eventDelegationInitialized = initialized;
}

export function setPendingStorageWrite(pending) {
  pendingStorageWrite = pending;
}

export function setSuggestionsAbortController(controller) {
  suggestionsAbortController = controller;
}

export function setCurrentSearchId(id) {
  currentSearchId = id;
}

// ============================================
// STATE HELPERS
// ============================================

export function isInMoveMode() {
  return movingItemId !== null;
}

export function clearSelectionState() {
  selectedItemIds.clear();
}

export function addToSelection(itemId) {
  selectedItemIds.add(itemId);
}

export function removeFromSelection(itemId) {
  selectedItemIds.delete(itemId);
}

export function hasSelection(itemId) {
  return selectedItemIds.has(itemId);
}

export function getSelectionSize() {
  return selectedItemIds.size;
}

export function getSelectedIdsArray() {
  return Array.from(selectedItemIds);
}

export function resetInlineFolderState() {
  inlineFolderMode = null;
  inlineFolderTargetId = null;
  inlineFolderParentId = null;
  inlineFolderDraft = '';
  inlineFolderSaving = false;
}

export function resetInlineBookmarkState() {
  inlineBookmarkMode = null;
  inlineBookmarkTargetId = null;
  inlineBookmarkParentId = null;
  inlineBookmarkDraftUrl = '';
  inlineBookmarkDraftTitle = '';
  inlineBookmarkSaving = false;
}

