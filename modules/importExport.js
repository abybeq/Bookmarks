// ============================================
// IMPORT/EXPORT MODULE
// ============================================

import {
  items, currentFolderId, UNSORTED_FOLDER_ID,
  selectedItemIds, getSelectedIdsArray
} from './state.js';
import { escapeHtml, generateId, showExportNotification, showImportNotification } from './utils.js';
import { saveItems, saveStateForUndo } from './storage.js';
import { getItemsForFolder, getFolderById } from './navigation.js';

// Callbacks
let renderItemsCallback = null;

export function setImportExportCallbacks(renderItems) {
  renderItemsCallback = renderItems;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

// Export bookmarks to HTML file (Netscape Bookmark format)
export function exportBookmarks() {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const isInRoot = currentFolderId === 'root';
  const currentFolder = isInRoot ? null : getFolderById(currentFolderId);
  const folderName = currentFolder ? currentFolder.title : 'Bookmarks Bar';
  
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}"${isInRoot ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''}>${escapeHtml(folderName)}</H3>
    <DL><p>
`;

  html += exportFolderContents(currentFolderId, 2);
  
  html += `    </DL><p>
</DL><p>
`;

  // Create and download file
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date();
  const dateStr = `${date.getMonth() + 1}_${date.getDate()}_${String(date.getFullYear()).slice(-2)}`;
  const folderSlug = isInRoot ? '' : `_${folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  a.download = `bookmarks${folderSlug}_${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showExportNotification(isInRoot ? null : folderName);
}

// Export folder contents recursively
export function exportFolderContents(folderId, indentLevel) {
  const folderItems = getItemsForFolder(folderId);
  const indent = '    '.repeat(indentLevel);
  let html = '';
  
  for (const item of folderItems) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    if (item.type === 'folder') {
      html += `${indent}<DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(item.title)}</H3>\n`;
      html += `${indent}<DL><p>\n`;
      html += exportFolderContents(item.id, indentLevel + 1);
      html += `${indent}</DL><p>\n`;
    } else if (item.type === 'link') {
      html += `${indent}<DT><A HREF="${escapeHtml(item.url)}" ADD_DATE="${timestamp}">${escapeHtml(item.title)}</A>\n`;
    }
  }
  
  return html;
}

// Export selected items
export function exportSelectedItems() {
  const selectedIds = Array.from(selectedItemIds);
  const selectedItems = items.filter(item => selectedIds.includes(item.id));
  
  if (selectedItems.length === 0) return;
  
  const selectedLinks = selectedItems.filter(item => item.type === 'link');
  const selectedFolders = selectedItems.filter(item => item.type === 'folder');
  
  const timestamp = Math.floor(Date.now() / 1000);
  
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">Selected Bookmarks</H3>
    <DL><p>
`;

  // Export selected folders (with their contents)
  for (const folder of selectedFolders) {
    html += `        <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(folder.title)}</H3>\n`;
    html += `        <DL><p>\n`;
    html += exportFolderContents(folder.id, 3);
    html += `        </DL><p>\n`;
  }

  // Export selected links
  for (const link of selectedLinks) {
    html += `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${timestamp}">${escapeHtml(link.title)}</A>\n`;
  }
  
  html += `    </DL><p>
</DL><p>
`;

  // Create and download file
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date();
  const dateStr = `${date.getMonth() + 1}_${date.getDate()}_${String(date.getFullYear()).slice(-2)}`;
  a.download = `bookmarks_selected_${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  // Build notification message
  let notificationMsg = '';
  if (selectedFolders.length > 0 && selectedLinks.length > 0) {
    notificationMsg = `${selectedFolders.length} folder${selectedFolders.length > 1 ? 's' : ''} and ${selectedLinks.length} link${selectedLinks.length > 1 ? 's' : ''}`;
  } else if (selectedFolders.length > 0) {
    notificationMsg = `${selectedFolders.length} folder${selectedFolders.length > 1 ? 's' : ''}`;
  } else {
    notificationMsg = `${selectedLinks.length} link${selectedLinks.length > 1 ? 's' : ''}`;
  }
  showExportNotification(notificationMsg);
}

// ============================================
// IMPORT FUNCTIONS
// ============================================

// Handle import file selection
export async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  e.target.value = '';
  
  try {
    const text = await file.text();
    const importedCount = await importBookmarks(text);
    showImportNotification(importedCount);
  } catch (error) {
    console.error('Error importing bookmarks:', error);
    showImportNotification(0, true);
  }
}

// Import bookmarks from HTML content
export async function importBookmarks(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  const mainDL = doc.querySelector('DL');
  if (!mainDL) {
    throw new Error('No bookmark data found');
  }
  
  saveStateForUndo();
  
  let importedCount = 0;
  
  importedCount = await parseAndImportItems(mainDL, currentFolderId);
  
  await saveItems();
  if (renderItemsCallback) renderItemsCallback();
  
  return importedCount;
}

// Parse DL element and import its contents
async function parseAndImportItems(dlElement, parentId) {
  let count = 0;
  const dtElements = dlElement.querySelectorAll(':scope > DT');
  
  for (const dt of dtElements) {
    const h3 = dt.querySelector(':scope > H3');
    const a = dt.querySelector(':scope > A');
    
    if (h3) {
      // It's a folder
      const folderTitle = h3.textContent.trim();
      
      const isBookmarksBar = h3.hasAttribute('PERSONAL_TOOLBAR_FOLDER');
      const nestedDL = dt.querySelector(':scope > DL');
      
      if (isBookmarksBar && nestedDL) {
        count += await parseAndImportItems(nestedDL, parentId);
      } else if (folderTitle) {
        const folderItems = getItemsForFolder(parentId);
        const folderTypeItems = folderItems.filter(item => item.type === 'folder');
        const maxFolderOrder = folderTypeItems.length > 0 
          ? Math.max(...folderTypeItems.map(item => item.order ?? 0))
          : -1;
        
        const newFolder = {
          id: generateId(),
          type: 'folder',
          title: folderTitle,
          parentId: parentId,
          order: maxFolderOrder + 1
        };
        
        items.push(newFolder);
        count++;
        
        if (nestedDL) {
          count += await parseAndImportItems(nestedDL, newFolder.id);
        }
      }
    } else if (a) {
      // It's a link
      const url = a.getAttribute('HREF');
      const title = a.textContent.trim();
      
      if (url && !url.startsWith('javascript:')) {
        const folderItems = getItemsForFolder(parentId);
        const linkItems = folderItems.filter(item => item.type === 'link');
        const maxLinkOrder = linkItems.length > 0 
          ? Math.max(...linkItems.map(item => item.order ?? 0))
          : -1;
        
        const newLink = {
          id: generateId(),
          type: 'link',
          title: title || url,
          url: url,
          parentId: parentId,
          order: maxLinkOrder + 1
        };
        
        items.push(newLink);
        count++;
      }
    }
  }
  
  return count;
}

// ============================================
// FILE INPUT HANDLER SETUP
// ============================================

export function initImportExport() {
  const importFileInput = document.getElementById('import-file-input');
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportFile);
  }
  
  // Listen for export events
  document.addEventListener('exportBookmarks', () => {
    exportBookmarks();
  });
  
  document.addEventListener('exportSelected', () => {
    exportSelectedItems();
  });
}

