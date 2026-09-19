// Search the prepared bookmark index immediately; history never blocks typing.
import {
  isSearchMode, setIsSearchMode, searchQuery, setSearchQuery, setOriginalSearchQuery,
  currentSearchId, setCurrentSearchId, setFocusedItemIndex, clearSelectionState
} from './state.js';
import {
  escapeHtml, isUrl, normalizeUrl, getBookmarkDisplayUrl, searchChromePages, formatVisitTime,
  searchIconSvgHtml, globeIconSvgHtml, linkIconSvgHtml, historyIconSvgHtml,
  getFolderIconSvg, getIconSvg
} from './utils.js';
import {
  getFaviconHtml, getCachedBookmarkSearchEntries, loadBookmarkSearchEntries,
  getFolderIconName, getFaviconUrl
} from './storage.js';

const MIN_HISTORY_QUERY_LENGTH = 2;
const INITIAL_HISTORY_LIMIT = 8;
const HISTORY_PAGE_SIZE = 20;
let historyLimit = INITIAL_HISTORY_LIMIT;
let historyLimitQuery = '';
let loadingHistoryId = null;
const GOOGLE_SEARCH_URL = 'https://www.google.com';
const CHATGPT_FAVICON_URL = 'icons/chatgpt.webp';
let searchBar;
let searchInput;
let searchIconContainer;
let searchResultType;
let itemsGrid;
let searchResultsCount;
let lastFocusItem;
let displayedHistory = [];
let displayedHistoryQuery = '';
const sections = new Map();
let folderView = null;
let searchFocusWasNavigated = false;

export function markSearchFocusNavigated() {
  searchFocusWasNavigated = true;
}

export function initSearchElements() {
  searchBar = document.getElementById('search-bar');
  searchInput = document.getElementById('search-input');
  searchIconContainer = document.getElementById('search-icon-container');
  searchResultType = document.getElementById('search-result-type');
  itemsGrid = document.getElementById('items-grid');
  searchResultsCount = document.getElementById('search-results-count');

  // Warm the same snapshot used by folder rendering, and refresh on mutations.
  const refresh = async () => {
    await loadBookmarkSearchEntries();
    if (isSearchMode && getCachedBookmarkSearchEntries()) renderSearchResults(lastFocusItem, true);
  };
  void refresh();
  for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved',
    'onChildrenReordered', 'onImportEnded']) {
    chrome.bookmarks[event].addListener(() => {
      // Folder rendering warms the index when needed. Do not rebuild it for
      // every imported or moved bookmark while search is closed.
      if (isSearchMode) void refresh();
    });
  }
}

export function setSearchIcon(type, faviconUrl = null) {
  if (!searchIconContainer) return;
  const html = type === 'website' && faviconUrl ? getFaviconHtml(faviconUrl, 'globe')
    : type === 'globe' ? globeIconSvgHtml
    : type === 'folder' ? getFolderIconSvg()
    : type === 'link' ? linkIconSvgHtml
    : type === 'history' ? historyIconSvgHtml
    : type === 'favicon' && faviconUrl
      ? `<img src="${escapeHtml(faviconUrl)}" alt="" class="search-favicon" style="width: 24px; height: 24px; object-fit: contain;">`
      : searchIconSvgHtml;
  // Keep an already loaded icon in place across keystrokes.
  if (searchIconContainer.dataset.iconKey === html) return;
  searchIconContainer.dataset.iconKey = html;
  searchIconContainer.innerHTML = html;
}

export function setSearchResultType(type = '') {
  if (!searchResultType) return;
  const labels = {
    folder: 'Folder',
    link: 'Bookmark',
    'browser-history': 'History',
    'history-more': 'History',
    'chrome-page': 'Chrome page',
    suggestion: 'Google',
    chatgpt: 'ChatGPT',
    url: 'Website'
  };
  const label = labels[type] || '';
  searchResultType.textContent = label;
  searchResultType.hidden = !label;
}

export function showAskTarget(provider = 'google') {
  if (provider === 'chatgpt') setSearchIcon('favicon', CHATGPT_FAVICON_URL);
  else setSearchIcon('favicon', getFaviconUrl(GOOGLE_SEARCH_URL));
  setSearchResultType(provider === 'chatgpt' ? 'chatgpt' : 'suggestion');
}

export function showGoogleSearchTarget() {
  showAskTarget('google');
}

export function enterSearchMode(initialChar = '', focusItem) {
  clearSelectionState();
  document.querySelectorAll('.list-item.selected').forEach(el => {
    el.classList.remove('selected', 'selection-first', 'selection-middle', 'selection-last', 'selection-single');
  });
  setIsSearchMode(true);
  setSearchQuery(initialChar);
  setOriginalSearchQuery(initialChar);
  searchBar.classList.add('active');
  document.body.classList.add('search-active');
  searchInput.value = initialChar;
  searchInput.focus();
  searchInput.selectionStart = searchInput.selectionEnd = initialChar.length;
  showGoogleSearchTarget();
  renderSearchResults(focusItem);
}

export function exitSearchMode(renderItems, renderBreadcrumb, resetKeyboardFocus) {
  // Invalidate every pending tree/history response, including exit and re-entry.
  setCurrentSearchId(currentSearchId + 1);
  setIsSearchMode(false);
  setSearchQuery('');
  setOriginalSearchQuery('');
  searchBar.classList.remove('active');
  document.body.classList.remove('search-active');
  searchInput.value = '';
  sections.clear();
  if (folderView) {
    itemsGrid.className = folderView.className;
    itemsGrid.replaceChildren(folderView.content);
    folderView = null;
  }
  displayedHistory = [];
  displayedHistoryQuery = '';
  historyLimit = INITIAL_HISTORY_LIMIT;
  historyLimitQuery = '';
  setSearchIcon('search');
  setSearchResultType();
  resetKeyboardFocus?.();
  renderItems?.();
  renderBreadcrumb?.();
}

export function searchAllItems(query) {
  const normalizedQuery = query.toLowerCase().trim();
  const folders = [];
  const links = [];
  if (!normalizedQuery) return { folders, links, chromePages: [] };
  for (const entry of getCachedBookmarkSearchEntries() || []) {
    if (entry.title.includes(normalizedQuery) || entry.url.includes(normalizedQuery)) {
      (entry.item.url ? links : folders).push(entry);
    }
  }
  return { folders, links, chromePages: searchChromePages(normalizedQuery) };
}

export async function searchBrowserHistory(query, limit = INITIAL_HISTORY_LIMIT, isCurrent = () => true) {
  if (query.length < MIN_HISTORY_QUERY_LENGTH || !chrome.history) return [];
  try {
    // Fetch one extra unsaved URL to determine whether Show more is needed.
    let maxResults = limit + 1;
    while (isCurrent()) {
      const results = await chrome.history.search({ text: query, maxResults, startTime: 0 });
      if (!isCurrent()) return [];
      const history = unsavedHistory(results.filter(item => item.url)).map(item => ({
        ...item, title: item.title || item.url
      }));
      if (history.length > limit || results.length < maxResults) return history;
      maxResults *= 2;
    }
  } catch (error) {
    console.error('Error searching browser history:', error);
  }
  return [];
}

function historyRows(history) {
  const rows = history.slice(0, historyLimit).map(item => row(
    `history:${item.url}`, 'browser-history', item.title, item.url, formatVisitTime(item.lastVisitTime)
  ));
  if (history.length > historyLimit) rows.push(row('history-more', 'history-more', 'Show more'));
  return rows;
}

export async function showMoreHistory(focusNewResults = false) {
  if (!isSearchMode || loadingHistoryId === currentSearchId ||
      unsavedHistory(displayedHistory).length <= historyLimit) return;
  const requestId = currentSearchId + 1;
  setCurrentSearchId(requestId);
  loadingHistoryId = requestId;
  const isCurrent = () => isSearchMode && currentSearchId === requestId;
  const previousLimit = historyLimit;
  const nextLimit = historyLimit + HISTORY_PAGE_SIZE;
  const results = await searchBrowserHistory(searchQuery.trim(), nextLimit, isCurrent);
  if (loadingHistoryId === requestId) loadingHistoryId = null;
  if (!isCurrent() || !results.length) return;
  const shouldMoveFocus = focusNewResults &&
    itemsGrid.querySelector('.keyboard-focused')?.dataset.type === 'history-more';
  historyLimit = nextLimit;
  displayedHistory = results;
  displayedHistoryQuery = searchQuery.trim().toLowerCase();
  renderHistory(searchAllItems(searchQuery), results, lastFocusItem);
  if (shouldMoveFocus && results[previousLimit]) {
    const key = `history:${results[previousLimit].url}`;
    const index = getNavigableItems().findIndex(item => item.dataset.searchKey === key);
    if (index >= 0) lastFocusItem?.(index);
  }
}

let savedUrlEntries = null;
let savedUrls = new Set();
function unsavedHistory(history) {
  const entries = getCachedBookmarkSearchEntries();
  if (entries !== savedUrlEntries) {
    savedUrlEntries = entries;
    savedUrls = new Set((entries || []).filter(entry => entry.url).map(entry => entry.url));
  }
  return history.filter(item => !savedUrls.has(item.url.toLowerCase()));
}

function row(key, type, title, url = '', meta = '', itemId = '', parentTitle = '') {
  return { key, type, title, url, meta, itemId, parentTitle };
}

function updateRow(element, data) {
  const previous = element.searchRow;
  if (data.type === 'folder' && (!previous || previous.parentTitle !== data.parentTitle)) {
    element.querySelector('.list-item-url').textContent = data.parentTitle;
  }
  if (!previous || previous.title !== data.title) {
    element.querySelector('.list-item-title').textContent = data.title;
  }
  if (!previous || previous.meta !== data.meta) {
    const meta = element.querySelector('.list-item-meta') || element.querySelector('.list-item-url');
    if (meta) meta.textContent = data.type === 'link' ? getBookmarkDisplayUrl(data.meta) : data.meta;
  }
  if (!previous || previous.url !== data.url) {
    if (element.tagName === 'A') element.setAttribute('href', data.url);
    if (data.type === 'url') element.dataset.url = data.url;
    if (data.type === 'browser-history') element.querySelector('.list-item-url').textContent = data.url;
  }
  if (data.type === 'suggestion' || data.type === 'chatgpt') {
    element.dataset.suggestion = data.title;
    element.dataset.provider = data.type === 'chatgpt' ? 'chatgpt' : 'google';
  }
  const iconKey = data.type === 'chatgpt' ? CHATGPT_FAVICON_URL : data.type === 'history-more' ? 'history-more' : data.type === 'folder' ? getFolderIconName(data.itemId)
    : data.type === 'suggestion' ? GOOGLE_SEARCH_URL : data.url;
  if (!previous || previous.iconKey !== iconKey) {
    element.querySelector('.list-item-icon').innerHTML = data.type === 'chatgpt' ? `<img src="${CHATGPT_FAVICON_URL}" alt="">` : data.type === 'history-more' ? getIconSvg('chevron-down', { fill: 'var(--text-secondary)' }) : data.type === 'folder'
      ? getFolderIconSvg(iconKey)
      : data.type === 'suggestion' ? getFaviconHtml(GOOGLE_SEARCH_URL)
        : getFaviconHtml(data.url, data.type === 'url' ? 'globe' : 'bookmark');
  }
  element.searchRow = { ...data, iconKey };
}

function createRow(data) {
  const isLink = ['link', 'browser-history', 'chrome-page'].includes(data.type);
  const element = document.createElement(data.type === 'history-more' ? 'button' : isLink ? 'a' : 'div');
  element.className = `list-item${['url', 'suggestion', 'browser-history', 'chrome-page'].includes(data.type) ? ` ${data.type}-item` : ''}`;
  if (data.type === 'chatgpt') element.classList.add('suggestion-item');
  if (data.type === 'history-more') {
    element.type = 'button';
    element.classList.add('history-more-item');
  }
  element.dataset.type = data.type;
  element.dataset.searchKey = data.key;
  if (data.itemId) element.dataset.itemId = data.itemId;
  element.innerHTML = '<div class="list-item-icon"></div><span class="list-item-title"></span>';
  if (['folder', 'link', 'browser-history', 'chrome-page', 'suggestion', 'chatgpt'].includes(data.type)) {
    const meta = document.createElement('span');
    meta.className = ['link', 'chrome-page'].includes(data.type) ? 'list-item-url' : 'list-item-meta';
    element.append(meta);
  }
  if (data.type === 'browser-history' || data.type === 'folder') {
    const url = document.createElement('span');
    url.className = 'list-item-url';
    element.querySelector('.list-item-title').after(url);
  }
  updateRow(element, data);
  return element;
}

// Reconcile only changed rows. Retained images, hover indicators and focus stay
// attached to the document, including when an async history response arrives.
function updateSection(key, title, rows) {
  let section = sections.get(key);
  if (!section) {
    const element = document.createElement('div');
    element.className = `list-section ${key}-section`;
    const heading = document.createElement('div');
    heading.className = 'search-section-title';
    heading.textContent = title;
    element.append(heading);
    section = { element, heading, rows: new Map() };
    sections.set(key, section);
  }
  const keys = new Set(rows.map(data => data.key));
  for (const [rowKey, element] of section.rows) {
    if (!keys.has(rowKey)) {
      element.remove();
      section.rows.delete(rowKey);
    }
  }
  let cursor = section.heading.nextSibling;
  for (const data of rows) {
    let element = section.rows.get(data.key);
    if (!element) {
      element = createRow(data);
      section.rows.set(data.key, element);
    } else {
      updateRow(element, data);
    }
    if (element !== cursor) section.element.insertBefore(element, cursor);
    cursor = element.nextSibling;
  }
  return section.element;
}

function renderResults(query, matches, history, focusItem, preserveFocus) {
  const focused = itemsGrid.querySelector('.keyboard-focused');
  const focusedKey = preserveFocus && searchFocusWasNavigated ? focused?.dataset.searchKey : null;
  const { folders, links, chromePages } = matches;
  const queryIsUrl = isUrl(query);
  const hasBookmarks = folders.length + links.length + chromePages.length > 0;
  const groups = [];
  if (queryIsUrl && hasBookmarks) {
    groups.push(['url', 'Open', [row('url', 'url', query, normalizeUrl(query))]]);
  }
  groups.push(['folders', 'Folders', folders.map(entry => row(
    `folder:${entry.item.id}`, 'folder', entry.item.title, '',
    entry.folders > 0 ? `${entry.folders} ⋅ ${entry.links}` : `${entry.links}`, entry.item.id, entry.parentTitle
  ))]);
  groups.push(['bookmarks', 'Bookmarks', links.map(({ item }) => row(
    `link:${item.id}`, 'link', item.title, item.url, item.url, item.id
  ))]);
  groups.push(['browser-history', 'History', historyRows(history)]);
  if (query && (!queryIsUrl || !hasBookmarks)) {
    groups.push(queryIsUrl
      ? ['url', 'Open', [row('url', 'url', query, normalizeUrl(query))]]
      : ['suggestions', 'Ask', [
        row('query', 'suggestion', query, '', 'Google'),
        row('chatgpt', 'chatgpt', query, '', 'ChatGPT')
      ]]);
  }
  groups.push(['chrome-pages', 'Chrome pages', chromePages.map(page => row(
    `chrome:${page.url}`, 'chrome-page', page.title, page.url, page.url
  ))]);

  // Keep the rendered folder view detached while searching so cancelling can
  // restore it in the same frame, including already loaded favicons.
  if (!sections.size) {
    const content = document.createDocumentFragment();
    content.append(...itemsGrid.childNodes);
    folderView = { className: itemsGrid.className, content };
  }
  itemsGrid.className = 'list-view';
  const visibleGroups = groups.filter(([, , rows]) => rows.length);
  const keys = new Set(visibleGroups.map(([key]) => key));
  for (const [key, section] of sections) {
    if (!keys.has(key)) {
      section.element.remove();
      sections.delete(key);
    }
  }
  let cursor = itemsGrid.firstChild;
  for (const [key, title, rows] of visibleGroups) {
    const element = updateSection(key, title, rows);
    if (element !== cursor) itemsGrid.insertBefore(element, cursor);
    cursor = element.nextSibling;
  }
  renderSearchCount(folders.length + links.length + chromePages.length + Math.min(history.length, historyLimit));
  const items = getNavigableItems();
  const index = focusedKey ? items.findIndex(item => item.dataset.searchKey === focusedKey) : -1;
  if (index >= 0) {
    // History can shift indexes without changing the selected result.
    setFocusedItemIndex(index);
  } else if (!preserveFocus || !searchFocusWasNavigated || focusedKey) {
    if (items.length && focusItem) focusItem(0);
    else setFocusedItemIndex(-1);
  }
  if (!items.length) {
    showGoogleSearchTarget();
  }
}

function renderSearchCount(count) {
  searchResultsCount.textContent = `${count} result${count === 1 ? '' : 's'}`;
}

function renderHistory(matches, history, focusItem) {
  const focused = itemsGrid.querySelector('.keyboard-focused');
  if (history.length) {
    const element = updateSection('browser-history', 'History', historyRows(history));
    if (element.parentNode !== itemsGrid) {
      const before = sections.get('suggestions')?.element || sections.get('chrome-pages')?.element || null;
      itemsGrid.insertBefore(element, before);
    }
  } else {
    sections.get('browser-history')?.element.remove();
    sections.delete('browser-history');
  }
  renderSearchCount(matches.folders.length + matches.links.length + matches.chromePages.length + Math.min(history.length, historyLimit));
  if (!searchFocusWasNavigated && getNavigableItems().length && focusItem) {
    focusItem(0);
  } else if (focused) {
    const index = getNavigableItems().indexOf(focused);
    if (index >= 0) setFocusedItemIndex(index);
    else if (getNavigableItems().length && focusItem) focusItem(0);
    else setFocusedItemIndex(-1);
  }
}

export async function deleteHistoryUrl(url) {
  await chrome.history.deleteUrl({ url });
  displayedHistory = displayedHistory.filter(item => item.url !== url);
  renderSearchResults(lastFocusItem, true);
}

export function renderSearchResults(focusItem, preserveFocus = false) {
  if (!isSearchMode) return;
  if (!preserveFocus) searchFocusWasNavigated = false;
  lastFocusItem = focusItem;
  const thisSearchId = currentSearchId + 1;
  setCurrentSearchId(thisSearchId);
  const query = searchQuery.trim();
  const normalizedQuery = query.toLowerCase();
  if (historyLimitQuery !== normalizedQuery) {
    historyLimitQuery = normalizedQuery;
    historyLimit = INITIAL_HISTORY_LIMIT;
  }
  const isCurrent = () => isSearchMode && thisSearchId === currentSearchId;
  const matches = searchAllItems(query);
  // Keep matching history visible while a more specific query is in flight.
  const history = query.length >= MIN_HISTORY_QUERY_LENGTH &&
    displayedHistoryQuery && normalizedQuery.startsWith(displayedHistoryQuery)
    ? unsavedHistory(displayedHistory.filter(item =>
      item.title.toLowerCase().includes(normalizedQuery) || item.url.toLowerCase().includes(normalizedQuery)))
    : [];
  renderResults(query, matches, history, focusItem, preserveFocus);

  if (!getCachedBookmarkSearchEntries()) {
    void loadBookmarkSearchEntries().then(() => {
      if (isCurrent() && getCachedBookmarkSearchEntries()) renderSearchResults(focusItem, true);
    });
  }
  if (query.length < MIN_HISTORY_QUERY_LENGTH) return;
  void searchBrowserHistory(query, historyLimit, isCurrent).then(results => {
    if (!isCurrent()) return;
    displayedHistory = results;
    displayedHistoryQuery = normalizedQuery;
    renderHistory(matches, unsavedHistory(results), focusItem);
  });
}

export function handleSearchInput(e, focusItem, resetKeyboardFocus, exitSearchModeCallback) {
  setSearchQuery(e.target.value);
  setOriginalSearchQuery(searchQuery);
  if (!searchQuery) {
    exitSearchModeCallback();
    return;
  }
  renderSearchResults(focusItem);
  if (!getNavigableItems().length) resetKeyboardFocus?.();
}

export function getNavigableItems() {
  return itemsGrid ? Array.from(itemsGrid.querySelectorAll('.list-item')) : [];
}
