// Content script for showing bookmark modal and toast notifications on web pages

// ============================================
// OPTIMIZATION: Prevent duplicate initialization
// Content script may be injected multiple times, so we guard against it
// ============================================
if (window.__bookmarksExtInitialized) {
  // Already initialized, skip re-registration
} else {
  window.__bookmarksExtInitialized = true;
  initContentScript();
}

function initContentScript() {

// ============================================
// OPTIMIZATION: Cached stylesheet for Shadow DOM
// Loads CSS once and reuses across modal instances
// ============================================
let cachedStyleSheet = null;

// Load and cache the modal stylesheet
async function getModalStyleSheet() {
  if (cachedStyleSheet) {
    return cachedStyleSheet;
  }
  
  try {
    const cssUrl = chrome.runtime.getURL('modal-styles.css');
    const response = await fetch(cssUrl);
    const cssText = await response.text();
    
    cachedStyleSheet = new CSSStyleSheet();
    await cachedStyleSheet.replace(cssText);
    return cachedStyleSheet;
  } catch (error) {
    console.error('Error loading modal styles:', error);
    return null;
  }
}

// State for the bookmark modal
let bookmarkModalState = {
  url: '',
  title: '',
  folders: [],
  selectedFolderId: 'unsorted-folder',
  bookmarkId: null,
  showFolderPicker: false
};

// SVG Icons (same as extension)
const folderIconSvg = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="mix-blend-mode:luminosity;">
    <path d="M5.76 22H18.24C20.2562 22 21.2643 22 22.0344 21.6136C22.7117 21.2737 23.2625 20.7313 23.6076 20.0641C24 19.3057 24 18.3129 24 16.3273V16.3273V9H0V16.3273C0 18.3129 0 19.3057 0.392377 20.0641C0.737521 20.7313 1.28825 21.2737 1.96563 21.6136C2.73572 22 3.74381 22 5.76 22Z" fill="currentColor" opacity="1"/>
    <path d="M0 5.73333V9H24V8.06667C24 6.75988 24 6.10648 23.7384 5.60736C23.5083 5.16831 23.1412 4.81136 22.6896 4.58765C22.1762 4.33333 21.5041 4.33333 20.16 4.33333H11.7906C11.2036 4.33333 10.9101 4.33333 10.6338 4.26886C10.389 4.2117 10.1549 4.11743 9.94012 3.98949C9.69792 3.8452 9.49037 3.64342 9.07529 3.23987L8.92471 3.09347C8.50963 2.68991 8.30208 2.48814 8.05988 2.34384C7.84515 2.21591 7.61104 2.12163 7.36616 2.06447C7.08995 2 6.79644 2 6.20942 2H3.84C2.49587 2 1.82381 2 1.31042 2.25432C0.858834 2.47802 0.49168 2.83498 0.261584 3.27402C0 3.77315 0 4.42654 0 5.73333Z" fill="currentColor" opacity="1"/>
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

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_BOOKMARK_MODAL') {
    showBookmarkModal(message.data);
  }
});

// Show the bookmark modal
async function showBookmarkModal(data) {
  // Remove any existing modal first
  const existingModal = document.getElementById('bookmarks-ext-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Check if this is an existing bookmark
  const isExisting = !!data.existingBookmark;

  // Update state
  bookmarkModalState = {
    url: data.url,
    title: data.title,
    folders: data.folders || [],
    selectedFolderId: data.defaultFolderId || 'unsorted-folder',
    bookmarkId: isExisting ? data.existingBookmark.id : null,
    showFolderPicker: false,
    isExisting: isExisting
  };

  // Only save if this is a new bookmark (not existing)
  if (!isExisting) {
    chrome.runtime.sendMessage({
      type: 'SAVE_BOOKMARK',
      data: {
        url: bookmarkModalState.url,
        title: bookmarkModalState.title,
        folderId: bookmarkModalState.selectedFolderId
      }
    }, (response) => {
      if (response && response.success && response.bookmark) {
        bookmarkModalState.bookmarkId = response.bookmark.id;
      }
    });
  }

  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'bookmarks-ext-modal';
  
  // Create shadow root for style isolation
  const shadow = modal.attachShadow({ mode: 'closed' });
  
  // Load cached stylesheet (loaded once, reused across modal instances)
  const styleSheet = await getModalStyleSheet();
  if (styleSheet) {
    shadow.adoptedStyleSheets = [styleSheet];
  }
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-container';
  modalContent.innerHTML = getMainModalHTML();
  
  shadow.appendChild(modalContent);
  document.body.appendChild(modal);

  // Setup event listeners
  setupModalEventListeners(shadow, modalContent);

  // Focus the name input
  setTimeout(() => {
    const nameInput = shadow.querySelector('.bookmark-name-input');
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }, 50);
}

// Get the main modal HTML
function getMainModalHTML() {
  const selectedFolder = bookmarkModalState.folders.find(f => f.id === bookmarkModalState.selectedFolderId);
  const folderName = selectedFolder ? selectedFolder.title : 'Unsorted';
  const isUnsorted = bookmarkModalState.selectedFolderId === 'unsorted-folder';
  const headerText = bookmarkModalState.isExisting ? 'Edit bookmark' : 'Bookmark saved';
  
  // Get favicon URL
  let faviconUrl = '';
  try {
    const url = new URL(bookmarkModalState.url);
    faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    faviconUrl = '';
  }

  return `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title">${headerText}</span>
        <button class="delete-btn" type="button">Delete</button>
      </div>
      
      <div class="name-input-wrapper">
        ${faviconUrl ? `<img class="bookmark-favicon" src="${faviconUrl}" alt="">` : '<div class="bookmark-favicon-placeholder"></div>'}
        <input type="text" class="bookmark-name-input" value="${escapeHtml(bookmarkModalState.title)}" placeholder="Name">
      </div>
      
      <button class="folder-picker-btn" type="button">
        <div class="folder-icon">
          ${isUnsorted ? inboxIconSvg : folderIconSvg}
        </div>
        <span class="folder-name">${escapeHtml(folderName)}</span>
        <div class="folder-chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>
    </div>
  `;
}

// Get folder picker HTML
function getFolderPickerHTML() {
  const foldersHTML = bookmarkModalState.folders.map(folder => {
    const isSelected = folder.id === bookmarkModalState.selectedFolderId;
    const isUnsorted = folder.id === 'unsorted-folder';
    const depth = folder.depth || 0;
    const paddingLeft = 0.75 + (depth * 1); // Base padding + 1rem indentation per level
    
    return `
      <button class="folder-item${isSelected ? ' selected' : ''}" data-folder-id="${folder.id}" type="button" style="padding-left: ${paddingLeft}rem;">
        <div class="folder-item-icon">
          ${isUnsorted ? inboxIconSvg : folderIconSvg}
        </div>
        <span class="folder-item-name">${escapeHtml(folder.title)}</span>
        ${isSelected ? `
          <div class="folder-item-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        ` : ''}
      </button>
    `;
  }).join('');

  return `
    <div class="modal-backdrop"></div>
    <div class="modal-content folder-picker-content">
      <div class="folder-picker-header">
        <button class="back-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span class="folder-picker-title">Choose folder</span>
        </button>
        <button class="create-folder-btn" type="button">Add folder</button>
      </div>
      <div class="folder-list">
        ${foldersHTML}
      </div>
    </div>
  `;
}

// Get create folder HTML
function getCreateFolderHTML() {
  return `
    <div class="modal-backdrop"></div>
    <div class="modal-content folder-picker-content">
      <div class="folder-picker-header">
        <button class="back-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span class="folder-picker-title">New folder</span>
        </button>
        <button class="create-btn" type="button">Create</button>
      </div>
      <div class="create-folder-form">
        <div class="name-input-wrapper">
          <div class="folder-icon">
            ${folderIconSvg}
          </div>
          <input type="text" class="folder-name-input" placeholder="Folder name" autofocus>
        </div>
      </div>
    </div>
  `;
}

// Setup event listeners for the modal
function setupModalEventListeners(shadow, modalContent) {
  // Close on backdrop click
  const backdrop = shadow.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', () => closeModal(shadow));

  // Delete button
  const deleteBtn = shadow.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (bookmarkModalState.bookmarkId) {
        chrome.runtime.sendMessage({
          type: 'DELETE_BOOKMARK',
          data: { bookmarkId: bookmarkModalState.bookmarkId }
        });
      }
      closeModal(shadow);
    });
  }

  // Name input - save on change
  const nameInput = shadow.querySelector('.bookmark-name-input');
  if (nameInput) {
    let saveTimeout;
    nameInput.addEventListener('input', (e) => {
      bookmarkModalState.title = e.target.value;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (bookmarkModalState.bookmarkId) {
          chrome.runtime.sendMessage({
            type: 'UPDATE_BOOKMARK',
            data: { 
              bookmarkId: bookmarkModalState.bookmarkId, 
              updates: { title: bookmarkModalState.title }
            }
          });
        }
      }, 300);
    });

    // Close on Enter key
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeModal(shadow);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(shadow);
      }
    });
  }

  // Folder picker button
  const folderPickerBtn = shadow.querySelector('.folder-picker-btn');
  if (folderPickerBtn) {
    folderPickerBtn.addEventListener('click', () => {
      showFolderPicker(shadow, modalContent);
    });
  }
}

// Show folder picker view
function showFolderPicker(shadow, modalContent) {
  bookmarkModalState.showFolderPicker = true;
  modalContent.innerHTML = getFolderPickerHTML();
  
  // Setup folder picker event listeners
  setupFolderPickerListeners(shadow, modalContent);
}

// Setup folder picker event listeners
function setupFolderPickerListeners(shadow, modalContent) {
  // Close on backdrop click
  const backdrop = shadow.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', () => closeModal(shadow));

  // Back button
  const backBtn = shadow.querySelector('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      bookmarkModalState.showFolderPicker = false;
      modalContent.innerHTML = getMainModalHTML();
      setupModalEventListeners(shadow, modalContent);
    });
  }

  // Create folder button
  const createFolderBtn = shadow.querySelector('.create-folder-btn');
  if (createFolderBtn) {
    createFolderBtn.addEventListener('click', () => {
      showCreateFolderView(shadow, modalContent);
    });
  }

  // Folder items
  const folderItems = shadow.querySelectorAll('.folder-item');
  folderItems.forEach(item => {
    item.addEventListener('click', () => {
      const folderId = item.dataset.folderId;
      if (folderId !== bookmarkModalState.selectedFolderId) {
        bookmarkModalState.selectedFolderId = folderId;
        
        // Update bookmark folder
        if (bookmarkModalState.bookmarkId) {
          chrome.runtime.sendMessage({
            type: 'UPDATE_BOOKMARK',
            data: { 
              bookmarkId: bookmarkModalState.bookmarkId, 
              updates: { parentId: folderId }
            }
          });
        }
      }
      
      // Go back to main view
      bookmarkModalState.showFolderPicker = false;
      modalContent.innerHTML = getMainModalHTML();
      setupModalEventListeners(shadow, modalContent);
    });
  });
}

// Show create folder view
function showCreateFolderView(shadow, modalContent) {
  modalContent.innerHTML = getCreateFolderHTML();
  setupCreateFolderListeners(shadow, modalContent);
  
  // Focus the name input
  setTimeout(() => {
    const nameInput = shadow.querySelector('.folder-name-input');
    if (nameInput) {
      nameInput.focus();
    }
  }, 50);
}

// Setup create folder event listeners
function setupCreateFolderListeners(shadow, modalContent) {
  // Close on backdrop click
  const backdrop = shadow.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', () => closeModal(shadow));

  // Back button - go back to folder picker
  const backBtn = shadow.querySelector('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      modalContent.innerHTML = getFolderPickerHTML();
      setupFolderPickerListeners(shadow, modalContent);
    });
  }

  const nameInput = shadow.querySelector('.folder-name-input');
  const createBtn = shadow.querySelector('.create-btn');

  // Create folder function
  const createFolder = () => {
    const folderName = nameInput.value.trim();
    if (!folderName) return;
    
    // Disable button while creating
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    
    // Send message to create folder
    chrome.runtime.sendMessage({
      type: 'CREATE_FOLDER',
      data: { title: folderName }
    }, (response) => {
      if (response && response.success && response.folder) {
        // Add the new folder to our state
        bookmarkModalState.folders.push(response.folder);
        bookmarkModalState.selectedFolderId = response.folder.id;
        
        // Update bookmark to use new folder
        if (bookmarkModalState.bookmarkId) {
          chrome.runtime.sendMessage({
            type: 'UPDATE_BOOKMARK',
            data: { 
              bookmarkId: bookmarkModalState.bookmarkId, 
              updates: { parentId: response.folder.id }
            }
          });
        }
        
        // Go back to main view with new folder selected
        bookmarkModalState.showFolderPicker = false;
        modalContent.innerHTML = getMainModalHTML();
        setupModalEventListeners(shadow, modalContent);
      } else {
        // Re-enable button on error
        createBtn.disabled = false;
        createBtn.textContent = 'Create';
      }
    });
  };

  // Create button click
  if (createBtn) {
    createBtn.addEventListener('click', createFolder);
  }

  // Enter key to create
  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createFolder();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Go back to folder picker
        modalContent.innerHTML = getFolderPickerHTML();
        setupFolderPickerListeners(shadow, modalContent);
      }
    });
  }
}

// Close modal
function closeModal(shadow) {
  const modal = document.getElementById('bookmarks-ext-modal');
  if (modal) {
    // Add closing animation
    const content = shadow.querySelector('.modal-content');
    if (content) {
      content.classList.add('closing');
    }
    setTimeout(() => {
      modal.remove();
    }, 150);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

} // End of initContentScript
