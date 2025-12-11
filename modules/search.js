// ============================================
// SEARCH MODULE
// ============================================

import {
  items, isSearchMode, setIsSearchMode, searchQuery, setSearchQuery,
  originalSearchQuery, setOriginalSearchQuery, searchHistory,
  isInMoveMode, movingItemIds, UNSORTED_FOLDER_ID,
  suggestionsAbortController, setSuggestionsAbortController,
  currentSearchId, setCurrentSearchId, focusedItemIndex, setFocusedItemIndex,
  clearSelectionState
} from './state.js';
import {
  escapeHtml, isUrl, normalizeUrl, debounce,
  searchChromePages, highlightMatch, formatVisitTime,
  searchIconSvgHtml, googleIconSvgHtml, globeIconSvgHtml, historyIconSvgHtml,
  getFolderIconSvg, getInboxIconSvg
} from './utils.js';
import { getFaviconUrl } from './storage.js';
import { getLinkCountInFolder, getFolderDescendantCount, isFolderOrDescendant } from './navigation.js';

// Remote suggestion/history fetches are only useful once the user has typed
// a couple of characters; this keeps early keystrokes from spamming requests.
const MIN_REMOTE_QUERY_LENGTH = 2;

// DOM elements
let searchBar = null;
let searchInput = null;
let searchIconContainer = null;
let itemsGrid = null;

// Initialize search DOM elements
export function initSearchElements() {
  searchBar = document.getElementById('search-bar');
  searchInput = document.getElementById('search-input');
  searchIconContainer = document.getElementById('search-icon-container');
  itemsGrid = document.getElementById('items-grid');
}

// ============================================
// SEARCH ICON
// ============================================

export function setSearchIcon(type, faviconUrl = null) {
  if (!searchIconContainer) return;
  
  if (type === 'google') {
    searchIconContainer.innerHTML = googleIconSvgHtml;
  } else if (type === 'globe') {
    searchIconContainer.innerHTML = globeIconSvgHtml;
  } else if (type === 'folder') {
    searchIconContainer.innerHTML = getFolderIconSvg();
  } else if (type === 'inbox') {
    searchIconContainer.innerHTML = getInboxIconSvg();
  } else if (type === 'link') {
    searchIconContainer.innerHTML = `
      <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    `;
  } else if (type === 'history') {
    searchIconContainer.innerHTML = historyIconSvgHtml;
  } else if (type === 'favicon' && faviconUrl) {
    searchIconContainer.innerHTML = `<img src="${faviconUrl}" alt="" class="search-favicon" style="width: 24px; height: 24px; object-fit: contain;">`;
  } else {
    searchIconContainer.innerHTML = searchIconSvgHtml;
  }
}

// ============================================
// SEARCH MODE
// ============================================

export async function enterSearchMode(initialChar = '', focusItem) {
  // Clear selection when entering search mode
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
  
  setSearchIcon('search');
  
  searchInput.selectionStart = searchInput.selectionEnd = initialChar.length;
  
  await renderSearchResults(focusItem);
  
  if (initialChar) {
    const navigableItems = getNavigableItems();
    if (navigableItems.length > 0 && focusItem) {
      focusItem(0);
    }
  }
}

export function exitSearchMode(renderItems, renderBreadcrumb, resetKeyboardFocus) {
  setIsSearchMode(false);
  setSearchQuery('');
  setOriginalSearchQuery('');
  searchBar.classList.remove('active');
  document.body.classList.remove('search-active');
  searchInput.value = '';
  
  setSearchIcon('search');
  
  if (resetKeyboardFocus) resetKeyboardFocus();
  
  if (renderItems) renderItems();
  if (renderBreadcrumb) renderBreadcrumb();
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

// Search all items recursively
export function searchAllItems(query) {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return { folders: [], links: [], chromePages: [] };
  
  const matchedFolders = [];
  const matchedLinks = [];
  
  items.forEach(item => {
    const titleMatch = item.title.toLowerCase().includes(normalizedQuery);
    const urlMatch = item.type === 'link' && item.url && item.url.toLowerCase().includes(normalizedQuery);
    
    if (titleMatch || urlMatch) {
      if (item.type === 'folder') {
        if (!isInMoveMode() || (item.id !== UNSORTED_FOLDER_ID && !movingItemIds.includes(item.id))) {
          matchedFolders.push(item);
        }
      } else {
        if (!isInMoveMode()) {
          matchedLinks.push(item);
        }
      }
    }
  });
  
  matchedFolders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  matchedLinks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  
  const matchedChromePages = isInMoveMode() ? [] : searchChromePages(normalizedQuery);
  
  return { folders: matchedFolders, links: matchedLinks, chromePages: matchedChromePages };
}

// Search browser history
export async function searchBrowserHistory(query) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  if (query.trim().length < MIN_REMOTE_QUERY_LENGTH) {
    return [];
  }
  
  if (!chrome.history) {
    console.warn('chrome.history API is not available.');
    return [];
  }
  
  try {
    const results = await chrome.history.search({
      text: query,
      maxResults: 8,
      startTime: 0
    });
    
    const savedUrls = new Set(items.filter(i => i.type === 'link').map(i => i.url.toLowerCase()));
    
    return results
      .filter(item => item.url && !savedUrls.has(item.url.toLowerCase()))
      .map(item => ({
        title: item.title || new URL(item.url).hostname,
        url: item.url,
        visitCount: item.visitCount,
        lastVisitTime: item.lastVisitTime
      }));
  } catch (error) {
    console.error('Error searching browser history:', error);
    return [];
  }
}

// Fetch Google autocomplete suggestions
export async function fetchGoogleSuggestions(query) {
  if (suggestionsAbortController) {
    suggestionsAbortController.abort();
  }
  
  if (!query || query.trim().length === 0 || query.trim().length < MIN_REMOTE_QUERY_LENGTH) {
    return [];
  }
  
  const controller = new AbortController();
  setSuggestionsAbortController(controller);
  
  try {
    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`,
      { signal: controller.signal }
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data[1] || [];
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.log('Could not fetch suggestions:', error.message);
    }
    return [];
  }
}

// ============================================
// SEARCH RESULTS RENDERING
// ============================================

export async function renderSearchResults(focusItem) {
  const inMoveMode = isInMoveMode();
  
  // In move mode we only search folders; skip suggestions/history/google fetches.
  if (inMoveMode) {
    const { folders } = searchAllItems(searchQuery);
    
    itemsGrid.className = 'list-view';
    
    setCurrentSearchId(currentSearchId + 1);
    
    renderSearchResultsWithItems(
      folders,
      [],
      searchQuery,
      [],
      [],
      [],
      [],
      focusItem
    );
    return;
  }
  
  const { folders, links, chromePages } = searchAllItems(searchQuery);
  
  itemsGrid.className = 'list-view';
  
  const thisSearchId = currentSearchId + 1;
  setCurrentSearchId(thisSearchId);
  const currentQuery = searchQuery.trim();

  if (folders.length > 0 || links.length > 0 || chromePages.length > 0) {
    renderSearchResultsWithItems(folders, links, searchQuery, [currentQuery], [], [], chromePages, focusItem);
    
    const [googleSuggestions, browserHistory] = await Promise.all([
      fetchGoogleSuggestions(currentQuery),
      searchBrowserHistory(currentQuery)
    ]);
    
    if (thisSearchId !== currentSearchId || !isSearchMode) {
      return;
    }
    
    const { folders: newFolders, links: newLinks, chromePages: newChromePages } = searchAllItems(searchQuery);
    const freshHistoryMatches = [];

    const userQuery = searchQuery.trim();
    const allSuggestions = [userQuery];
    
    for (const suggestion of googleSuggestions) {
      if (suggestion.toLowerCase() !== userQuery.toLowerCase() && allSuggestions.length < 8) {
        allSuggestions.push(suggestion);
      }
    }
    
    if (newFolders.length > 0 || newLinks.length > 0 || newChromePages.length > 0) {
      renderSearchResultsWithItems(newFolders, newLinks, searchQuery, allSuggestions, freshHistoryMatches, browserHistory, newChromePages, focusItem);
    }
    return;
  }
  
  renderSuggestions([currentQuery], currentQuery, [], [], focusItem);
  
  const [googleSuggestions, browserHistory] = await Promise.all([
    fetchGoogleSuggestions(currentQuery),
    searchBrowserHistory(currentQuery)
  ]);
  
  if (thisSearchId !== currentSearchId || !isSearchMode) {
    return;
  }
  
  const { folders: newFolders, links: newLinks } = searchAllItems(searchQuery);
  if (newFolders.length > 0 || newLinks.length > 0) {
    return;
  }
  
  const freshHistoryMatches = [];
  
  const userQuery = searchQuery.trim();
  const allSuggestions = [userQuery];
  
  for (const suggestion of googleSuggestions) {
    if (suggestion.toLowerCase() !== userQuery.toLowerCase() && allSuggestions.length < 8) {
      allSuggestions.push(suggestion);
    }
  }
  
  renderSuggestions(allSuggestions, userQuery, freshHistoryMatches, browserHistory, focusItem);
}

// Render suggestions only (no matched items)
export function renderSuggestions(suggestions, query, historyMatches = [], browserHistory = [], focusItem) {
  const queryIsUrl = isUrl(query);
  
  // No results were found; show the neutral search icon to match native styling.
  setSearchIcon('search');
  
  // Pull out the first URL-like suggestion (if any) so we can show it as a
  // dedicated URL row at the top of the list.
  let urlSuggestion = null;
  let filteredSuggestions = suggestions;
  if (!queryIsUrl) {
    const urlCandidate = suggestions.slice(1).find(s => isUrl(s));
    if (urlCandidate) {
      urlSuggestion = normalizeUrl(urlCandidate);
      let removed = false;
      filteredSuggestions = suggestions.filter(s => {
        if (!removed && s === urlCandidate) {
          removed = true;
          return false;
        }
        return true;
      });
    }
  }
  
  const historyIconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  `;
  
  const searchIconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  `;
  
  let listHtml = '';
  let itemIndex = 0;
  
  let allItems = [];
  
  if (queryIsUrl) {
    const normalizedUrl = normalizeUrl(query);
    allItems.push({
      type: 'url',
      text: query,
      url: normalizedUrl,
      index: itemIndex++
    });
  }
  
  if (urlSuggestion) {
    allItems.push({
      type: 'url',
      text: urlSuggestion,
      url: urlSuggestion,
      index: itemIndex++
    });
  }
  
  const userQuery = filteredSuggestions[0];
  if (userQuery && !queryIsUrl) {
    allItems.push({
      type: 'suggestion',
      text: userQuery,
      index: itemIndex++
    });
  }
  
  let googleCount = 0;
  filteredSuggestions.slice(queryIsUrl ? 0 : 1).forEach(suggestion => {
    const isDuplicateWithHistory = historyMatches.some(h => h.toLowerCase() === suggestion.toLowerCase());
    const isDuplicateWithQuery = queryIsUrl && suggestion.toLowerCase() === query.toLowerCase();
    const isDuplicateWithUrlSuggestion = urlSuggestion && suggestion.toLowerCase() === urlSuggestion.toLowerCase();
    if (!isDuplicateWithHistory && !isDuplicateWithQuery && !isDuplicateWithUrlSuggestion && googleCount < 7) {
      allItems.push({
        type: 'suggestion',
        text: suggestion,
        index: itemIndex++
      });
      googleCount++;
    }
  });
  
  historyMatches.forEach(historyItem => {
    if (historyItem.toLowerCase() !== userQuery?.toLowerCase()) {
      allItems.push({
        type: 'history',
        text: historyItem,
        index: itemIndex++
      });
    }
  });
  
  if (browserHistory.length > 0) {
    listHtml += '<div class="list-section browser-history-section">';
    listHtml += browserHistory.map(item => {
      const idx = itemIndex++;
      const visitTime = formatVisitTime(item.lastVisitTime);
      return `
        <a class="list-item browser-history-item" href="${escapeHtml(item.url)}" data-index="${idx}" data-type="browser-history">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${highlightMatch(item.title, query)}</span>
          <span class="list-item-meta">${visitTime}</span>
        </a>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  if (allItems.length > 0) {
    listHtml += `
      <div class="list-section suggestions-section">
        ${allItems.map((item, idx) => {
          if (item.type === 'url') {
            return `
              <div class="list-item url-item" 
                   data-url="${escapeHtml(item.url)}" 
                   data-index="${item.index}"
                   data-type="url">
                <div class="list-item-icon">
                  <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
                </div>
                <span class="list-item-title">${escapeHtml(item.text)}</span>
              </div>
            `;
          }
          return `
            <div class="list-item ${item.type === 'history' ? 'history-item' : 'suggestion-item'}" 
                 data-suggestion="${escapeHtml(item.text)}" 
                 data-index="${item.index}"
                 data-type="${item.type}">
              <div class="list-item-icon">
                ${item.type === 'history' ? historyIconSvg : searchIconSvg}
              </div>
              <span class="list-item-title">${item.index === 0 && item.type === 'suggestion' ? escapeHtml(item.text) : highlightMatch(item.text, query)}</span>
              ${item.type === 'history' ? `
                <button class="history-delete-btn" data-query="${escapeHtml(item.text)}">Delete</button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  itemsGrid.innerHTML = listHtml;
  
  if (focusItem) focusItem(0);
}

// Render search results with matching items
export function renderSearchResultsWithItems(folders, links, query, suggestions = [], historyMatches = [], browserHistory = [], chromePages = [], focusItem) {
  const queryIsUrl = isUrl(query);
  const inMoveMode = isInMoveMode();
  
  // Pull out the first URL-like suggestion (if any) so we can show it as a
  // dedicated URL row at the top of the list.
  let urlSuggestion = null;
  let filteredSuggestions = suggestions;
  if (!queryIsUrl && !inMoveMode) {
    const urlCandidate = suggestions.slice(1).find(s => isUrl(s));
    if (urlCandidate) {
      urlSuggestion = normalizeUrl(urlCandidate);
      let removed = false;
      filteredSuggestions = suggestions.filter(s => {
        if (!removed && s === urlCandidate) {
          removed = true;
          return false;
        }
        return true;
      });
    }
  }
  
  const hasResults =
    folders.length > 0 ||
    links.length > 0 ||
    chromePages.length > 0 ||
    browserHistory.length > 0;
  
  const hasSuggestions = filteredSuggestions.length > 0;
  if (!hasResults) {
    setSearchIcon('search');
  } else if (queryIsUrl) {
    setSearchIcon('globe');
  } else {
    setSearchIcon(hasSuggestions ? 'google' : 'search');
  }
  
  let listHtml = '';
  
  let urlItemIndexOffset = 0;
  if (queryIsUrl && !inMoveMode) {
    const normalizedUrl = normalizeUrl(query);
    listHtml += `
      <div class="list-section url-section">
        <div class="list-item url-item" 
             data-url="${escapeHtml(normalizedUrl)}" 
             data-index="0"
             data-type="url">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(normalizedUrl)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${escapeHtml(query)}</span>
        </div>
      </div>
    `;
    urlItemIndexOffset = 1;
  }
  
  if (urlSuggestion && !inMoveMode) {
    const suggestionIndex = urlItemIndexOffset;
    listHtml += `
      <div class="list-section url-section">
        <div class="list-item url-item" 
             data-url="${escapeHtml(urlSuggestion)}" 
             data-index="${suggestionIndex}"
             data-type="url">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(urlSuggestion)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${escapeHtml(urlSuggestion)}</span>
        </div>
      </div>
    `;
    urlItemIndexOffset += 1;
  }
  
  // Folders section
  if (folders.length > 0) {
    listHtml += '<div class="list-section">';
    listHtml += folders.map(item => {
      const nestedCount = getFolderDescendantCount(item.id);
      const linkCount = getLinkCountInFolder(item.id);
      const metaText = nestedCount > 0 ? `${nestedCount} ⋅ ${linkCount}` : `${linkCount}`;
      const highlightedTitle = highlightMatch(item.title, query);
      const isUnsorted = item.id === UNSORTED_FOLDER_ID;
      
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
        <div class="list-item${inMoveMode ? ' move-mode' : ''}" data-item-id="${item.id}" data-type="folder"${isUnsorted ? ' data-unsorted="true"' : ''}>
          <div class="list-item-icon">
            ${isUnsorted ? getInboxIconSvg() : getFolderIconSvg()}
          </div>
          <span class="list-item-title">${highlightedTitle}</span>
          ${moveHereBtn}
        <span class="list-item-meta">${metaText}</span>
        </div>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  // Links section
  if (links.length > 0 && !inMoveMode) {
    listHtml += '<div class="list-section">';
    listHtml += links.map(item => {
      const highlightedTitle = highlightMatch(item.title, query);
      
      return `
        <a class="list-item" href="${escapeHtml(item.url)}" data-item-id="${item.id}" data-type="link">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${highlightedTitle}</span>
          <span class="list-item-url">${escapeHtml(item.url)}</span>
        </a>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  // Suggestions section
  if ((hasSuggestions || queryIsUrl) && !inMoveMode) {
    const historyIconSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    `;
    
    const searchIconSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
    `;
    
    const itemStartIndex = urlItemIndexOffset + folders.length + links.length;
    
    let allItems = [];
    let itemIndex = itemStartIndex;
    
    const userQuery = filteredSuggestions[0];
    if (userQuery && !queryIsUrl) {
      allItems.push({
        type: 'suggestion',
        text: userQuery,
        index: itemIndex++
      });
    }
    
    let googleCount = 0;
    filteredSuggestions.slice(queryIsUrl ? 0 : 1).forEach(suggestion => {
      const isDuplicateWithHistory = historyMatches.some(h => h.toLowerCase() === suggestion.toLowerCase());
      const isDuplicateWithQuery = queryIsUrl && suggestion.toLowerCase() === query.toLowerCase();
      const isDuplicateWithUrlSuggestion = urlSuggestion && suggestion.toLowerCase() === urlSuggestion.toLowerCase();
      if (!isDuplicateWithHistory && !isDuplicateWithQuery && !isDuplicateWithUrlSuggestion && googleCount < 7) {
        allItems.push({
          type: 'suggestion',
          text: suggestion,
          index: itemIndex++
        });
        googleCount++;
      }
    });
    
    historyMatches.forEach(historyItem => {
      if (historyItem.toLowerCase() !== userQuery?.toLowerCase()) {
        allItems.push({
          type: 'history',
          text: historyItem,
          index: itemIndex++
        });
      }
    });
    
    if (browserHistory.length > 0 && !inMoveMode) {
      listHtml += '<div class="list-section browser-history-section">';
      listHtml += browserHistory.map((item, idx) => {
        const highlightedTitle = highlightMatch(item.title, query);
        const browserItemIndex = itemIndex++;
        const visitTime = formatVisitTime(item.lastVisitTime);
        
        return `
          <a class="list-item browser-history-item" href="${escapeHtml(item.url)}" data-index="${browserItemIndex}" data-type="browser-history">
            <div class="list-item-icon">
              <img src="${getFaviconUrl(item.url)}" alt="" loading="lazy">
            </div>
            <span class="list-item-title">${highlightedTitle}</span>
            <span class="list-item-meta">${visitTime}</span>
          </a>
        `;
      }).join('');
      listHtml += '</div>';
    }
    
    if (allItems.length > 0) {
      listHtml += `
        <div class="list-section suggestions-section">
          ${allItems.map((item, idx) => {
            return `
              <div class="list-item ${item.type === 'history' ? 'history-item' : 'suggestion-item'}" 
                   data-suggestion="${escapeHtml(item.text)}" 
                   data-index="${item.index}"
                   data-type="${item.type}">
                <div class="list-item-icon">
                  ${item.type === 'history' ? historyIconSvg : searchIconSvg}
                </div>
                <span class="list-item-title">${idx === 0 && item.type === 'suggestion' ? escapeHtml(item.text) : highlightMatch(item.text, query)}</span>
                ${item.type === 'history' ? `
                  <button class="history-delete-btn" data-query="${escapeHtml(item.text)}">Delete</button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }
  
  // Chrome pages section (shown at the end of the list)
  if (chromePages.length > 0 && !inMoveMode) {
    listHtml += '<div class="list-section chrome-pages-section">';
    listHtml += chromePages.map(page => {
      const highlightedTitle = highlightMatch(page.title, query);
      
      return `
        <a class="list-item chrome-page-item" href="${escapeHtml(page.url)}" data-type="chrome-page">
          <div class="list-item-icon">
            <img src="${getFaviconUrl(page.url)}" alt="" loading="lazy">
          </div>
          <span class="list-item-title">${highlightedTitle}</span>
          <span class="list-item-url">${escapeHtml(page.url)}</span>
        </a>
      `;
    }).join('');
    listHtml += '</div>';
  }
  
  itemsGrid.innerHTML = listHtml;
  
  const navigableItems = getNavigableItems();
  if (navigableItems.length > 0 && focusItem) {
    focusItem(0);
  }
}

// Execute search (renders results and focuses first item)
export async function executeSearch(focusItem, resetKeyboardFocus) {
  await renderSearchResults(focusItem);
  
  const navigableItems = getNavigableItems();
  if (navigableItems.length > 0 && focusItem) {
    focusItem(0);
  } else if (resetKeyboardFocus) {
    resetKeyboardFocus();
  }
}

// Debounced search
export const debouncedSearch = debounce((focusItem, resetKeyboardFocus) => {
  executeSearch(focusItem, resetKeyboardFocus);
}, 150);

// Handle search input changes
export function handleSearchInput(e, focusItem, resetKeyboardFocus, exitSearchModeCallback) {
  setSearchQuery(e.target.value);
  setOriginalSearchQuery(searchQuery);
  
  if (!searchQuery) {
    exitSearchModeCallback();
    return;
  }
  
  debouncedSearch(focusItem, resetKeyboardFocus);
}

// Get navigable items in the grid
export function getNavigableItems() {
  if (!itemsGrid) return [];
  return Array.from(itemsGrid.querySelectorAll('.list-item, .suggestion-item, .history-item, .browser-history-item'));
}

// Perform search (used after removing history item)
export function performSearch(query, focusItem) {
  setSearchQuery(query);
  renderSearchResults(focusItem);
}

