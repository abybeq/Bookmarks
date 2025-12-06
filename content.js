// Content script for showing bookmark modal and toast notifications on web pages

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
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.76 22H18.24C20.2562 22 21.2643 22 22.0344 21.6136C22.7117 21.2737 23.2625 20.7313 23.6076 20.0641C24 19.3057 24 18.3129 24 16.3273V16.3273V9H0V16.3273C0 18.3129 0 19.3057 0.392377 20.0641C0.737521 20.7313 1.28825 21.2737 1.96563 21.6136C2.73572 22 3.74381 22 5.76 22Z" fill="currentColor" opacity="0.6"/>
    <path d="M0 5.73333V9H24V8.06667C24 6.75988 24 6.10648 23.7384 5.60736C23.5083 5.16831 23.1412 4.81136 22.6896 4.58765C22.1762 4.33333 21.5041 4.33333 20.16 4.33333H11.7906C11.2036 4.33333 10.9101 4.33333 10.6338 4.26886C10.389 4.2117 10.1549 4.11743 9.94012 3.98949C9.69792 3.8452 9.49037 3.64342 9.07529 3.23987L8.92471 3.09347C8.50963 2.68991 8.30208 2.48814 8.05988 2.34384C7.84515 2.21591 7.61104 2.12163 7.36616 2.06447C7.08995 2 6.79644 2 6.20942 2H3.84C2.49587 2 1.82381 2 1.31042 2.25432C0.858834 2.47802 0.49168 2.83498 0.261584 3.27402C0 3.77315 0 4.42654 0 5.73333Z" fill="currentColor" opacity="0.8"/>
  </svg>
`;

const inboxIconSvg = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_inbox)">
      <path d="M15.4971 2C16.5285 1.99941 17.2806 1.99886 17.9639 2.23926C18.5655 2.45105 19.1137 2.79747 19.5684 3.25195C20.0848 3.7682 20.421 4.45456 20.8818 5.39648L20.9521 5.54004L23.3643 10.4639C23.5466 10.8359 23.6796 11.108 23.7754 11.3984C23.8601 11.6554 23.9222 11.92 23.959 12.1885C24.0006 12.4919 24.0001 12.796 24 13.2119V15.6377C24 16.5455 24.0004 17.2882 23.9521 17.8916C23.9021 18.5162 23.7952 19.0806 23.5322 19.6074C23.1206 20.4319 22.4632 21.1023 21.6553 21.5225C21.1392 21.7908 20.5865 21.9001 19.9746 21.9512C19.3834 22.0005 18.656 22 17.7666 22H6.2334C5.344 22 4.61657 22.0005 4.02539 21.9512C3.41349 21.9001 2.86085 21.7908 2.34473 21.5225C1.53684 21.1023 0.879412 20.4319 0.467773 19.6074C0.204794 19.0806 0.0978515 18.5162 0.0478516 17.8916C-0.000434011 17.2882 -1.15472e-05 16.5455 0 15.6377V13.2119C-9.49703e-05 12.796 -0.00058704 12.4919 0.0410156 12.1885C0.0778423 11.92 0.139908 11.6554 0.224609 11.3984C0.320379 11.108 0.453378 10.8359 0.635742 10.4639L3.11816 5.39648C3.57899 4.45453 3.9152 3.76822 4.43164 3.25195C4.88631 2.79747 5.4345 2.45105 6.03613 2.23926C6.71942 1.99885 7.47153 1.99941 8.50293 2H15.4971ZM8.66016 4.02344C7.40289 4.02344 7.01048 4.0366 6.68164 4.15234C6.35768 4.26639 6.0622 4.45254 5.81738 4.69727C5.56893 4.94568 5.38251 5.29873 4.82031 6.44629L2.59375 10.9902H5.26465C6.394 10.9904 7.42642 11.641 7.93164 12.6719C8.10116 13.0179 8.44809 13.2373 8.82715 13.2373H15.1729C15.5518 13.2372 15.8979 13.0178 16.0674 12.6719C16.5726 11.6408 17.6058 10.9902 18.7354 10.9902H21.4053L19.1797 6.44629C18.6174 5.2985 18.4302 4.94569 18.1816 4.69727C17.9368 4.45258 17.6413 4.26637 17.3174 4.15234C16.9886 4.03673 16.5956 4.02344 15.3389 4.02344H8.66016Z" fill="currentColor" opacity="0.7"/>
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
  if (message.type === 'SHOW_SAVED_TOAST') {
    showSavedToast();
  }
  if (message.type === 'SHOW_BOOKMARK_MODAL') {
    showBookmarkModal(message.data);
  }
});

// Show the bookmark modal
function showBookmarkModal(data) {
  // Remove any existing modal first
  const existingModal = document.getElementById('bookmarks-ext-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Update state
  bookmarkModalState = {
    url: data.url,
    title: data.title,
    folders: data.folders || [],
    selectedFolderId: data.defaultFolderId || 'unsorted-folder',
    bookmarkId: null,
    showFolderPicker: false
  };

  // Save the bookmark immediately
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

  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'bookmarks-ext-modal';
  
  // Create shadow root for style isolation
  const shadow = modal.attachShadow({ mode: 'closed' });
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = getModalStyles();
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-container';
  modalContent.innerHTML = getMainModalHTML();
  
  shadow.appendChild(style);
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
        <span class="modal-title">Bookmark saved</span>
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
        </button>
        <span class="folder-picker-title">Choose folder</span>
      </div>
      <div class="folder-list">
        ${foldersHTML}
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

// Get modal styles
function getModalStyles() {
  return `
    * {
      box-sizing: border-box;
    }
    
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 2147483646;
    }
    
    .modal-content {
      position: fixed;
      top: 8px;
      right: 8px;
      width: 320px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      padding: 20px;
      animation: modalSlideIn 0.2s ease;
    }
    
    .modal-content.closing {
      animation: modalSlideOut 0.15s ease forwards;
    }
    
    @keyframes modalSlideIn {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    @keyframes modalSlideOut {
      to {
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
      }
    }
    
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    
    .modal-title {
      font-size: 1rem;
      font-weight: 600;
      color: #1a1a1a;
    }
    
    .delete-btn {
      background: none;
      border: none;
      font-size: 1rem;
      font-weight: 500;
      color: #1a1a1a;
      cursor: pointer;
      padding: 0;
    }
    
    .delete-btn:hover {
      opacity: 0.7;
    }
    
    .name-input-wrapper {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 12px 16px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 12px;
      margin-bottom: 12px;
    }
    
    .name-input-wrapper:focus-within {
      border-color: #1a1a1a;
    }
    
    .bookmark-favicon {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    
    .bookmark-favicon-placeholder {
      width: 24px;
      height: 24px;
      background: #e0e0e0;
      border-radius: 4px;
      flex-shrink: 0;
    }
    
    .bookmark-name-input {
      flex: 1;
      border: none;
      background: none;
      font-size: 1rem;
      font-weight: 500;
      color: #1a1a1a;
      outline: none;
      font-family: inherit;
      min-width: 0;
    }
    
    .bookmark-name-input::selection {
      background: #b3d9ff;
    }
    
    .bookmark-name-input::placeholder {
      color: #9a9a9a;
    }
    
    .folder-picker-btn {
      display: flex;
      align-items: center;
      gap: 1rem;
      width: 100%;
      padding: 12px 16px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 12px;
      cursor: pointer;
      font-family: inherit;
    }
    
    .folder-picker-btn:hover {
      border-color: rgba(0, 0, 0, 0.25);
    }
    
    .folder-icon {
      width: 24px;
      height: 24px;
      color: #9a9a9a;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .folder-icon svg {
      width: 24px;
      height: 24px;
    }
    
    .folder-name {
      flex: 1;
      text-align: left;
      font-size: 1rem;
      font-weight: 500;
      color: #1a1a1a;
    }
    
    .folder-chevron {
      width: 20px;
      height: 20px;
      color: #9a9a9a;
      flex-shrink: 0;
    }
    
    .folder-chevron svg {
      width: 20px;
      height: 20px;
    }
    
    /* Folder picker view */
    .folder-picker-content {
      padding: 16px;
    }
    
    .folder-picker-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .back-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      color: #1a1a1a;
      padding: 0;
    }
    
    .back-btn:hover {
      background: #f0f0f0;
    }
    
    .back-btn svg {
      width: 20px;
      height: 20px;
    }
    
    .folder-picker-title {
      font-size: 1rem;
      font-weight: 600;
      color: #1a1a1a;
    }
    
    .folder-list {
      display: flex;
      flex-direction: column;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .folder-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.25rem 0.75rem;
      background: none;
      border: none;
      border-radius: 9999px;
      cursor: pointer;
      font-family: inherit;
      width: 100%;
      text-align: left;
    }
    
    .folder-item:hover {
      background: #f5f5f5;
    }
    
    .folder-item.selected {
      background: #f0f0f0;
    }
    
    .folder-item-icon {
      width: 24px;
      height: 24px;
      color: #9a9a9a;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .folder-item-icon svg {
      width: 24px;
      height: 24px;
    }
    
    .folder-item-name {
      flex: 1;
      font-size: 1rem;
      font-weight: 500;
      color: #1a1a1a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .folder-item-check {
      width: 20px;
      height: 20px;
      color: #1a1a1a;
      flex-shrink: 0;
    }
    
    .folder-item-check svg {
      width: 20px;
      height: 20px;
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .modal-content {
        background: #3c3c3c;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3);
      }
      
      .modal-title {
        color: #f5f5f5;
      }
      
      .delete-btn {
        color: #f5f5f5;
      }
      
      .delete-btn:hover {
        opacity: 0.7;
      }
      
      .name-input-wrapper {
        background: #3c3c3c;
        border-color: rgba(255, 255, 255, 0.15);
      }
      
      .name-input-wrapper:focus-within {
        border-color: #f5f5f5;
      }
      
      .bookmark-name-input {
        color: #f5f5f5;
      }
      
      .bookmark-name-input::selection {
        background: #3a7abd;
        color: #ffffff;
      }
      
      .bookmark-name-input::placeholder {
        color: #808080;
      }
      
      .bookmark-favicon-placeholder {
        background: #505050;
      }
      
      .folder-picker-btn {
        background: #3c3c3c;
        border-color: rgba(255, 255, 255, 0.15);
      }
      
      .folder-picker-btn:hover {
        border-color: rgba(255, 255, 255, 0.25);
      }
      
      .folder-name {
        color: #f5f5f5;
      }
      
      .folder-icon {
        color: #a0a0a0;
      }
      
      .folder-chevron {
        color: #a0a0a0;
      }
      
      .back-btn {
        color: #f5f5f5;
      }
      
      .back-btn:hover {
        background: #505050;
      }
      
      .folder-picker-title {
        color: #f5f5f5;
      }
      
      .folder-item:hover {
        background: #282828;
      }
      
      .folder-item.selected {
        background: #505050;
      }
      
      .folder-item-icon {
        color: #a0a0a0;
      }
      
      .folder-item-name {
        color: #f5f5f5;
      }
      
      .folder-item-check {
        color: #f5f5f5;
      }
    }
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show the "Saved" toast notification (legacy function, kept for compatibility)
function showSavedToast() {
  // Remove any existing toast first
  const existingToast = document.getElementById('bookmarks-ext-saved-toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast container
  const toast = document.createElement('div');
  toast.id = 'bookmarks-ext-saved-toast';
  
  // Create shadow root for style isolation
  const shadow = toast.attachShadow({ mode: 'closed' });
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 20px;
      background: #ffffff;
      color: #1a1a1a;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 15px;
      font-weight: 500;
      z-index: 2147483647;
      opacity: 0;
      transform: translateY(-10px);
      animation: toastSlideIn 0.3s ease forwards;
    }
    
    .toast-icon svg {
      stroke: #1a1a1a;
    }
    
    @keyframes toastSlideIn {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .toast-container.hiding {
      animation: toastSlideOut 0.3s ease forwards;
    }
    
    @keyframes toastSlideOut {
      to {
        opacity: 0;
        transform: translateY(-10px);
      }
    }
    
    .toast-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    .toast-icon svg {
      width: 20px;
      height: 20px;
    }
    
    .toast-text {
      line-height: 1;
    }
    
    @media (prefers-color-scheme: light) {
      .toast-container {
        background: #1a1a1a;
        color: #ffffff;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
      }
      
      .toast-icon svg {
        stroke: #ffffff;
      }
    }
  `;
  
  // Create toast content
  const toastContent = document.createElement('div');
  toastContent.className = 'toast-container';
  toastContent.innerHTML = `
    <div class="toast-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    </div>
    <span class="toast-text">Saved</span>
  `;
  
  shadow.appendChild(style);
  shadow.appendChild(toastContent);
  document.body.appendChild(toast);
  
  // Remove toast after 5 seconds
  setTimeout(() => {
    toastContent.classList.add('hiding');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 5000);
}
