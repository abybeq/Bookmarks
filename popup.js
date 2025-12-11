// Popup script for bookmark extension

// SVG Icons
const folderIconSvg = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.76 22H18.24C20.2562 22 21.2643 22 22.0344 21.6136C22.7117 21.2737 23.2625 20.7313 23.6076 20.0641C24 19.3057 24 18.3129 24 16.3273V16.3273V9H0V16.3273C0 18.3129 0 19.3057 0.392377 20.0641C0.737521 20.7313 1.28825 21.2737 1.96563 21.6136C2.73572 22 3.74381 22 5.76 22Z" fill="#9A9A9A"/>
    <path d="M0 5.73333V9H24V8.06667C24 6.75988 24 6.10648 23.7384 5.60736C23.5083 5.16831 23.1412 4.81136 22.6896 4.58765C22.1762 4.33333 21.5041 4.33333 20.16 4.33333H11.7906C11.2036 4.33333 10.9101 4.33333 10.6338 4.26886C10.389 4.2117 10.1549 4.11743 9.94012 3.98949C9.69792 3.8452 9.49037 3.64342 9.07529 3.23987L8.92471 3.09347C8.50963 2.68991 8.30208 2.48814 8.05988 2.34384C7.84515 2.21591 7.61104 2.12163 7.36616 2.06447C7.08995 2 6.79644 2 6.20942 2H3.84C2.49587 2 1.82381 2 1.31042 2.25432C0.858834 2.47802 0.49168 2.83498 0.261584 3.27402C0 3.77315 0 4.42654 0 5.73333Z" fill="#808080"/>
  </svg>
`;

const inboxIconSvg = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="mix-blend-mode:luminosity;">
    <g clip-path="url(#clip0_inbox)">
      <path d="M15.4971 2C16.5285 1.99941 17.2806 1.99886 17.9639 2.23926C18.5655 2.45105 19.1137 2.79747 19.5684 3.25195C20.0848 3.7682 20.421 4.45456 20.8818 5.39648L20.9521 5.54004L23.3643 10.4639C23.5466 10.8359 23.6796 11.108 23.7754 11.3984C23.8601 11.6554 23.9222 11.92 23.959 12.1885C24.0006 12.4919 24.0001 12.796 24 13.2119V15.6377C24 16.5455 24.0004 17.2882 23.9521 17.8916C23.9021 18.5162 23.7952 19.0806 23.5322 19.6074C23.1206 20.4319 22.4632 21.1023 21.6553 21.5225C21.1392 21.7908 20.5865 21.9001 19.9746 21.9512C19.3834 22.0005 18.656 22 17.7666 22H6.2334C5.344 22 4.61657 22.0005 4.02539 21.9512C3.41349 21.9001 2.86085 21.7908 2.34473 21.5225C1.53684 21.1023 0.879412 20.4319 0.467773 19.6074C0.204794 19.0806 0.0978515 18.5162 0.0478516 17.8916C-0.000434011 17.2882 -1.15472e-05 16.5455 0 15.6377V13.2119C-9.49703e-05 12.796 -0.00058704 12.4919 0.0410156 12.1885C0.0778423 11.92 0.139908 11.6554 0.224609 11.3984C0.320379 11.108 0.453378 10.8359 0.635742 10.4639L3.11816 5.39648C3.57899 4.45453 3.9152 3.76822 4.43164 3.25195C4.88631 2.79747 5.4345 2.45105 6.03613 2.23926C6.71942 1.99885 7.47153 1.99941 8.50293 2H15.4971ZM8.66016 4.02344C7.40289 4.02344 7.01048 4.0366 6.68164 4.15234C6.35768 4.26639 6.0622 4.45254 5.81738 4.69727C5.56893 4.94568 5.38251 5.29873 4.82031 6.44629L2.59375 10.9902H5.26465C6.394 10.9904 7.42642 11.641 7.93164 12.6719C8.10116 13.0179 8.44809 13.2373 8.82715 13.2373H15.1729C15.5518 13.2372 15.8979 13.0178 16.0674 12.6719C16.5726 11.6408 17.6058 10.9902 18.7354 10.9902H21.4053L19.1797 6.44629C18.6174 5.2985 18.4302 4.94569 18.1816 4.69727C17.9368 4.45258 17.6413 4.26637 17.3174 4.15234C16.9886 4.03673 16.5956 4.02344 15.3389 4.02344H8.66016Z" fill="currentColor" opacity="1"/>
    </g>
    <defs>
      <clipPath id="clip0_inbox">
        <rect width="24" height="24" fill="white"/>
      </clipPath>
    </defs>
  </svg>
`;

const extensionIconUrl = chrome.runtime.getURL('icons/bookmark.svg');
const extensionIconImg = `<img src="${extensionIconUrl}" alt="Bookmark icon" class="extension-icon">`;

// State
let state = {
  url: '',
  title: '',
  folders: [],
  selectedFolderId: 'unsorted-folder',
  bookmarkId: null,
  isExisting: false,
  expandedFolders: new Set(),
  faviconUrl: '',
  showNewFolderRow: false,
  newFolderParentId: 'root'
};

// DOM Elements
const mainView = document.getElementById('main-view');
const folderPickerView = document.getElementById('folder-picker-view');
const createFolderView = document.getElementById('create-folder-view');

const popupTitle = document.querySelector('.popup-title');
const deleteBtn = document.querySelector('.delete-btn');
const bookmarkFavicon = document.querySelector('.bookmark-favicon');
const bookmarkNameInput = document.getElementById('bookmark-name-input');
const folderPickerBtn = document.getElementById('folder-picker-btn');
const selectedFolderIcon = document.getElementById('selected-folder-icon');
const selectedFolderName = document.getElementById('selected-folder-name');

const backToMainBtn = document.getElementById('back-to-main-btn');
const showCreateFolderBtn = document.getElementById('show-create-folder-btn');
const folderList = document.getElementById('folder-list');

const backToPickerBtn = document.getElementById('back-to-picker-btn');
const createFolderBtn = document.getElementById('create-folder-btn');
const folderNameInput = document.getElementById('folder-name-input');
const newFolderIcon = document.getElementById('new-folder-icon');

// Initialize popup
async function init() {
  // Set folder icon for create view
  newFolderIcon.innerHTML = folderIconSvg;
  
  // Get data from background
  const response = await chrome.runtime.sendMessage({ type: 'POPUP_INIT' });
  
  if (!response || !response.success) {
    // Can't bookmark this page - close popup immediately
    window.close();
    return;
  }
  
  // Update state
  state.url = response.url;
  state.title = response.title;
  state.folders = response.folders || [];
  state.selectedFolderId = response.defaultFolderId || 'unsorted-folder';
  state.bookmarkId = response.bookmarkId;
  state.isExisting = response.isExisting;
  state.faviconUrl = getFaviconUrl(state.url);
  state.expandedFolders = new Set();
  state.showNewFolderRow = false;
  state.newFolderParentId = 'root';
  expandAncestorsOfSelected();
  
  // Update UI
  updateMainView();
  
  // If new bookmark, save it immediately
  if (!state.isExisting) {
    const saveResponse = await chrome.runtime.sendMessage({
      type: 'SAVE_BOOKMARK',
      data: {
        url: state.url,
        title: state.title,
        folderId: state.selectedFolderId
      }
    });
    
    if (saveResponse && saveResponse.success && saveResponse.bookmark) {
      state.bookmarkId = saveResponse.bookmark.id;
    }
  }
  
  // Focus name input
  setTimeout(() => {
    bookmarkNameInput.focus();
    bookmarkNameInput.select();
  }, 50);
}

// Build children map
function buildChildrenByParent() {
  const map = {};
  state.folders.forEach(folder => {
    const parentId = folder.parentId || 'root';
    if (!map[parentId]) map[parentId] = [];
    map[parentId].push(folder);
  });
  return map;
}

// Count descendant folders for each folder
function buildDescendantCounts(childrenByParent) {
  const memo = {};
  const countDesc = (id) => {
    if (memo[id] !== undefined) return memo[id];
    const children = childrenByParent[id] || [];
    const directFolderChildren = children.filter(c => c.type === 'folder');
    let total = directFolderChildren.length;
    directFolderChildren.forEach(child => {
      total += countDesc(child.id);
    });
    memo[id] = total;
    return total;
  };
  // precompute for all folders
  state.folders.forEach(f => countDesc(f.id));
  return memo;
}

// Expand ancestors so selected folder is visible
function expandAncestorsOfSelected() {
  const parentMap = {};
  state.folders.forEach(f => {
    if (f.id) parentMap[f.id] = f.parentId || 'root';
  });
  
  let current = state.selectedFolderId;
  while (current && parentMap[current] && parentMap[current] !== 'root') {
    state.expandedFolders.add(parentMap[current]);
    current = parentMap[current];
  }
}

// Build a human-readable folder path like "Parent / Child"
function getFolderPathDisplay(folderId) {
  if (folderId === 'root') return 'Bookmarks';
  if (folderId === 'unsorted-folder') return 'Unsorted';

  const folderMap = {};
  state.folders.forEach(folder => {
    if (folder.id) folderMap[folder.id] = folder;
  });

  let current = folderMap[folderId];
  if (!current) return 'Unsorted';

  const segments = [];
  const visited = new Set();

  while (current && !visited.has(current.id)) {
    segments.unshift(current.title);
    visited.add(current.id);

    const parentId = current.parentId;
    if (!parentId || parentId === 'root') break;
    current = folderMap[parentId];
  }

  return segments.join(' / ') || 'Unsorted';
}

// Build folder path as HTML with styled separators
function getFolderPathHtml(folderId) {
  if (folderId === 'root') return 'Bookmarks';
  const folderMap = {};
  state.folders.forEach(folder => {
    if (folder.id) folderMap[folder.id] = folder;
  });

  const segments = [];

  let current = folderMap[folderId];
  if (!current) {
    if (folderId === 'unsorted-folder') return 'Unsorted';
    return 'Unsorted';
  }

  const visited = new Set();
  while (current && !visited.has(current.id)) {
    segments.unshift(current.title);
    visited.add(current.id);

    const parentId = current.parentId;
    if (!parentId || parentId === 'root') break;
    current = folderMap[parentId];
  }

  if (!segments.length) return 'Unsorted';

  return segments
    .map((seg, idx) => {
      const escaped = escapeHtml(seg);
      const isLast = idx === segments.length - 1;
      if (isLast) return escaped;
      return `${escaped}<span class="folder-separator"> / </span>`;
    })
    .join('');
}

// Update main view UI
function updateMainView() {
  // Title
  popupTitle.textContent = state.isExisting ? 'Edit bookmark' : 'Bookmark saved';
  
  // Favicon
  if (state.faviconUrl) {
    bookmarkFavicon.src = state.faviconUrl;
    bookmarkFavicon.style.display = 'block';
  } else {
    bookmarkFavicon.style.display = 'none';
  }
  
  // Name input
  bookmarkNameInput.value = state.title;
  
  // Selected folder
  const isUnsorted = state.selectedFolderId === 'unsorted-folder';
  const isRoot = state.selectedFolderId === 'root';
  const folderPathHtml = getFolderPathHtml(state.selectedFolderId);
  
  selectedFolderIcon.innerHTML = isRoot ? extensionIconImg : (isUnsorted ? inboxIconSvg : folderIconSvg);
  selectedFolderName.innerHTML = folderPathHtml;
}

// Show view helper
function showView(view) {
  mainView.classList.add('hidden');
  folderPickerView.classList.add('hidden');
  createFolderView.classList.add('hidden');
  view.classList.remove('hidden');
}

// Render folder list
function renderFolderList() {
  const childrenByParent = buildChildrenByParent();
  const descendantCounts = buildDescendantCounts(childrenByParent);

  const buildRows = (parentId, depth) => {
    const children = childrenByParent[parentId] || [];
    return children.map(folder => {
      const isSelected = folder.id === state.selectedFolderId;
      const isUnsorted = folder.id === 'unsorted-folder';
      const indentPx = depth * 16; // 16px per level
      const hasChildren = (childrenByParent[folder.id] || []).length > 0;
      const isExpanded = state.expandedFolders.has(folder.id);
      const nestedCount = descendantCounts[folder.id] || 0;

      const rowHtml = `
        <button class="folder-item${isSelected ? ' selected' : ''}${hasChildren ? ' has-children' : ''}${isExpanded ? ' expanded' : ''}${isUnsorted ? ' unsorted-row' : ''}${isUnsorted && isSelected ? ' keep-favicon' : ''}" data-folder-id="${folder.id}" type="button" style="--indent-level: ${indentPx}px;">
          <div class="folder-item-icon" data-folder-id="${folder.id}" data-has-children="${hasChildren}">
            <span class="icon-folder">${isUnsorted ? inboxIconSvg : folderIconSvg}</span>
            <span class="icon-chevron icon-chevron-right">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
                <polyline points="9 6 15 12 9 18"/>
              </svg>
            </span>
            <span class="icon-chevron icon-chevron-down">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
          <span class="folder-item-name">${escapeHtml(folder.title)}</span>
          <span class="folder-right">
            ${!isSelected && hasChildren && nestedCount > 0 ? `<span class="folder-children-count">${nestedCount}</span>` : ''}
            ${isSelected ? getSelectedBadgeHtml() : ''}
            ${isUnsorted ? '' : `<span class="folder-add-btn" role="button" tabindex="0" title="Add subfolder" data-folder-id="${folder.id}">Add</span>`}
          </span>
        </button>
      `;

      const childRows = hasChildren && isExpanded ? buildRows(folder.id, depth + 1) : '';
      const inlineRow = state.showNewFolderRow && state.newFolderParentId === folder.id ? `
        <div class="folder-item new-folder-row" data-parent-id="${folder.id}" style="--indent-level: ${(depth + 1) * 16}px;">
          <div class="folder-item-icon">
            ${folderIconSvg}
          </div>
          <input id="new-folder-inline-input" class="folder-new-input" placeholder="New folder" />
        </div>
      ` : '';

      return rowHtml + childRows + inlineRow;
    }).join('');
  };

  const rowsHtml = buildRows('root', 0);
  const rootInlineRow = state.showNewFolderRow && state.newFolderParentId === 'root' ? `
    <div class="folder-item new-folder-row" data-parent-id="root" style="--indent-level: 0px;">
      <div class="folder-item-icon">
        ${folderIconSvg}
      </div>
      <input id="new-folder-inline-input" class="folder-new-input" placeholder="New folder" />
    </div>
  ` : '';

  const saveToBookmarksRow = `
    <button class="folder-item save-to-bookmarks${state.selectedFolderId === 'root' ? ' selected' : ''}" data-folder-id="root" type="button" style="--indent-level: 0px;">
      <div class="folder-item-icon">
        ${extensionIconImg}
      </div>
      <span class="folder-item-name">Bookmarks</span>
      <span class="folder-right">
        ${state.selectedFolderId === 'root' ? getSelectedBadgeHtml() : ''}
      </span>
    </button>
  `;

  folderList.innerHTML = rowsHtml + rootInlineRow + saveToBookmarksRow;

  // Add click handlers for selection
  folderList.querySelectorAll('.folder-item[data-folder-id]').forEach(item => {
    item.addEventListener('click', () => selectFolder(item.dataset.folderId));
  });

  // Add toggle handlers for chevrons (icon area)
  folderList.querySelectorAll('.folder-item-icon').forEach(icon => {
    const hasChildren = icon.dataset.hasChildren === 'true';
    const folderId = icon.dataset.folderId;
    if (hasChildren) {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolderExpansion(folderId);
      });
    }
  });

  // Inline add buttons
  folderList.querySelectorAll('.folder-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.folderId;
      startInlineNewFolder(folderId);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const folderId = btn.dataset.folderId;
        startInlineNewFolder(folderId);
      }
    });
  });

  // Inline new folder input handlers
  if (state.showNewFolderRow) {
    const input = folderList.querySelector('#new-folder-inline-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          createFolder(input.value.trim(), { inline: true });
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          state.showNewFolderRow = false;
          renderFolderList();
        }
      });
      setTimeout(() => input.focus(), 30);
    }
  }
}

// Select folder
async function selectFolder(folderId) {
  if (folderId !== state.selectedFolderId) {
    state.selectedFolderId = folderId;
    
    // Update bookmark folder
    if (state.bookmarkId) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_BOOKMARK',
        data: {
          bookmarkId: state.bookmarkId,
          updates: { parentId: folderId }
        }
      });
    }
  }
  
  // Go back to main view
  updateMainView();
  showView(mainView);
}

// Toggle folder expansion
function toggleFolderExpansion(folderId) {
  if (state.expandedFolders.has(folderId)) {
    state.expandedFolders.delete(folderId);
  } else {
    state.expandedFolders.add(folderId);
  }
  renderFolderList();
}

// Start inline nested folder creation
function startInlineNewFolder(parentId) {
  state.showNewFolderRow = true;
  state.newFolderParentId = parentId || 'root';
  state.expandedFolders.add(state.newFolderParentId);
  renderFolderList();
  showView(folderPickerView);
}

// Selected badge as favicon
function getSelectedBadgeHtml() {
  if (state.faviconUrl) {
    return `<img class="folder-item-favicon" src="${state.faviconUrl}" alt="">`;
  }
  return `<div class="folder-item-favicon placeholder"></div>`;
}

// Favicon helper
function getFaviconUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return '';
  }
}

// Create folder (supports inline creation)
async function createFolder(nameFromInline = '', options = { inline: false }) {
  const inline = options.inline;
  const folderName = inline ? nameFromInline : (folderNameInput ? folderNameInput.value.trim() : '').trim();
  if (!folderName) return;
  
  if (!inline && createFolderBtn) {
    createFolderBtn.disabled = true;
    createFolderBtn.textContent = 'Creating...';
  }
  
  const parentId = inline ? (state.newFolderParentId || document.querySelector('.new-folder-row')?.dataset.parentId || 'root') : 'root';
  const parentFolder = state.folders.find(f => f.id === parentId);
  
  const response = await chrome.runtime.sendMessage({
    type: 'CREATE_FOLDER',
    data: { title: folderName, parentId }
  });
  
  if (response && response.success && response.folder) {
    state.folders.push(response.folder);
    state.selectedFolderId = response.folder.id;
    state.showNewFolderRow = false;
    state.newFolderParentId = 'root';
    
    // Update bookmark to use new folder
    if (state.bookmarkId) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_BOOKMARK',
        data: {
          bookmarkId: state.bookmarkId,
          updates: { parentId: response.folder.id }
        }
      });
    }
    
    updateMainView();
    renderFolderList();
    showView(mainView);
  }
  
  if (!inline && createFolderBtn) {
    createFolderBtn.disabled = false;
    createFolderBtn.textContent = 'Add';
    if (folderNameInput) folderNameInput.value = '';
  }
}

// Delete bookmark
async function deleteBookmark() {
  if (state.bookmarkId) {
    await chrome.runtime.sendMessage({
      type: 'DELETE_BOOKMARK',
      data: { bookmarkId: state.bookmarkId }
    });
  }
  window.close();
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
deleteBtn.addEventListener('click', deleteBookmark);

// Name input - save on change
let saveTimeout;
bookmarkNameInput.addEventListener('input', (e) => {
  state.title = e.target.value;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (state.bookmarkId) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_BOOKMARK',
        data: {
          bookmarkId: state.bookmarkId,
          updates: { title: state.title }
        }
      });
    }
  }, 300);
});

// Close on Enter/Escape
bookmarkNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault();
    window.close();
  }
});

// Folder picker button
folderPickerBtn.addEventListener('click', () => {
  renderFolderList();
  showView(folderPickerView);
});

// Back to main
backToMainBtn.addEventListener('click', () => {
  showView(mainView);
});

// Show create folder
showCreateFolderBtn.addEventListener('click', () => {
  state.showNewFolderRow = true;
  state.newFolderParentId = 'root';
  renderFolderList();
  showView(folderPickerView);
});

// Back to folder picker
backToPickerBtn.addEventListener('click', () => {
  if (folderNameInput) folderNameInput.value = '';
  renderFolderList();
  showView(folderPickerView);
});

// Create folder button (legacy create view)
createFolderBtn.addEventListener('click', () => createFolder('', { inline: false }));

// Create folder on Enter in legacy view
folderNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    createFolder('', { inline: false });
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (folderNameInput) folderNameInput.value = '';
    renderFolderList();
    showView(folderPickerView);
  }
});

// Initialize
init();

