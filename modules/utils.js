// ============================================
// UTILITY FUNCTIONS
// ============================================

export function debounce(func, wait) {
  let timeoutId = null;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), wait);
  };
}

// Escape HTML to prevent XSS
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Generate unique ID using crypto.randomUUID()
export function generateId() {
  return crypto.randomUUID();
}

// Format visit time for browser history items
export function formatVisitTime(timestamp) {
  const visitDate = new Date(timestamp);
  const now = new Date();
  
  const isToday = visitDate.toDateString() === now.toDateString();
  
  if (isToday) {
    return visitDate.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  } else {
    return visitDate.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric'
    });
  }
}

// ============================================
// URL UTILITIES
// ============================================

// Check if a string looks like a URL
export function isUrl(str) {
  const trimmed = str.trim();
  if (!trimmed) return false;
  
  if (/^https?:\/\//i.test(trimmed) || /^chrome:\/\//i.test(trimmed)) {
    return true;
  }
  
  const urlPattern = /^(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/\S*)?$/i;
  return urlPattern.test(trimmed);
}

// Normalize URL (add protocol if missing)
export function normalizeUrl(url) {
  const trimmed = url.trim();
  if (/^chrome:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return 'https://' + trimmed;
}

// Check if text is a valid URL
export function isValidUrl(text) {
  const trimmed = text.trim();
  if (/^chrome:\/\/[a-zA-Z0-9-]+(\/[^\s]*)?$/.test(trimmed)) {
    return true;
  }
  const urlPattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?$/;
  return urlPattern.test(trimmed);
}

// Extract title from URL (domain name)
export function getTitleFromUrl(url) {
  try {
    if (url.startsWith('chrome://')) {
      const path = url.replace('chrome://', '').replace(/\/$/, '');
      return path.charAt(0).toUpperCase() + path.slice(1) || 'Chrome';
    }
    const normalizedUrl = url.match(/^https?:\/\//) ? url : 'https://' + url;
    return new URL(normalizedUrl).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Navigate to URL (handles chrome:// URLs specially)
export function navigateToUrl(url, openInNewTab = false) {
  if (!url) return;
  
  if (url.startsWith('chrome://')) {
    if (openInNewTab) {
      chrome.tabs.create({ url: url });
    } else {
      chrome.tabs.update({ url: url });
    }
  } else {
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  }
}

// ============================================
// SVG ICONS
// ============================================

export const searchIconSvgHtml = `
  <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="11" cy="11" r="8"/>
    <path d="M21 21l-4.35-4.35"/>
  </svg>
`;

export const googleIconSvgHtml = `
  <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
`;

export const globeIconSvgHtml = `
  <svg class="globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
`;

export const linkIconSvgHtml = `
  <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
`;

export const historyIconSvgHtml = `
  <svg class="history-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
`;

// Folder icon SVG
export function getFolderIconSvg() {
  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.76 22H18.24C20.2562 22 21.2643 22 22.0344 21.6136C22.7117 21.2737 23.2625 20.7313 23.6076 20.0641C24 19.3057 24 18.3129 24 16.3273V16.3273V9H0V16.3273C0 18.3129 0 19.3057 0.392377 20.0641C0.737521 20.7313 1.28825 21.2737 1.96563 21.6136C2.73572 22 3.74381 22 5.76 22Z" fill="#9A9A9A"/>
      <path d="M0 5.73333V9H24V8.06667C24 6.75988 24 6.10648 23.7384 5.60736C23.5083 5.16831 23.1412 4.81136 22.6896 4.58765C22.1762 4.33333 21.5041 4.33333 20.16 4.33333H11.7906C11.2036 4.33333 10.9101 4.33333 10.6338 4.26886C10.389 4.2117 10.1549 4.11743 9.94012 3.98949C9.69792 3.8452 9.49037 3.64342 9.07529 3.23987L8.92471 3.09347C8.50963 2.68991 8.30208 2.48814 8.05988 2.34384C7.84515 2.21591 7.61104 2.12163 7.36616 2.06447C7.08995 2 6.79644 2 6.20942 2H3.84C2.49587 2 1.82381 2 1.31042 2.25432C0.858834 2.47802 0.49168 2.83498 0.261584 3.27402C0 3.77315 0 4.42654 0 5.73333Z" fill="#808080"/>
    </svg>
  `;
}

// Inbox icon SVG - for Unsorted folder
export function getInboxIconSvg() {
  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_3988_6252)">
        <path d="M15.4971 2C16.5285 1.99941 17.2806 1.99886 17.9639 2.23926C18.5655 2.45105 19.1137 2.79747 19.5684 3.25195C20.0848 3.7682 20.421 4.45456 20.8818 5.39648L20.9521 5.54004L23.3643 10.4639C23.5466 10.8359 23.6796 11.108 23.7754 11.3984C23.8601 11.6554 23.9222 11.92 23.959 12.1885C24.0006 12.4919 24.0001 12.796 24 13.2119V15.6377C24 16.5455 24.0004 17.2882 23.9521 17.8916C23.9021 18.5162 23.7952 19.0806 23.5322 19.6074C23.1206 20.4319 22.4632 21.1023 21.6553 21.5225C21.1392 21.7908 20.5865 21.9001 19.9746 21.9512C19.3834 22.0005 18.656 22 17.7666 22H6.2334C5.344 22 4.61657 22.0005 4.02539 21.9512C3.41349 21.9001 2.86085 21.7908 2.34473 21.5225C1.53684 21.1023 0.879412 20.4319 0.467773 19.6074C0.204794 19.0806 0.0978515 18.5162 0.0478516 17.8916C-0.000434011 17.2882 -1.15472e-05 16.5455 0 15.6377V13.2119C-9.49703e-05 12.796 -0.00058704 12.4919 0.0410156 12.1885C0.0778423 11.92 0.139908 11.6554 0.224609 11.3984C0.320379 11.108 0.453378 10.8359 0.635742 10.4639L3.11816 5.39648C3.57899 4.45453 3.9152 3.76822 4.43164 3.25195C4.88631 2.79747 5.4345 2.45105 6.03613 2.23926C6.71942 1.99885 7.47153 1.99941 8.50293 2H15.4971ZM8.66016 4.02344C7.40289 4.02344 7.01048 4.0366 6.68164 4.15234C6.35768 4.26639 6.0622 4.45254 5.81738 4.69727C5.56893 4.94568 5.38251 5.29873 4.82031 6.44629L2.59375 10.9902H5.26465C6.394 10.9904 7.42642 11.641 7.93164 12.6719C8.10116 13.0179 8.44809 13.2373 8.82715 13.2373H15.1729C15.5518 13.2372 15.8979 13.0178 16.0674 12.6719C16.5726 11.6408 17.6058 10.9902 18.7354 10.9902H21.4053L19.1797 6.44629C18.6174 5.2985 18.4302 4.94569 18.1816 4.69727C17.9368 4.45258 17.6413 4.26637 17.3174 4.15234C16.9886 4.03673 16.5956 4.02344 15.3389 4.02344H8.66016Z" fill="#9A9A9A"/>
      </g>
      <defs>
        <clipPath id="clip0_3988_6252">
          <rect width="24" height="24" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  `;
}

// Edit icon SVG
export function getEditIconSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  `;
}

// Delete icon SVG
export function getDeleteIconSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  `;
}

// ============================================
// CHROME PAGE ICONS
// ============================================

export const chromePageIcons = {
  settings: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`),
  extensions: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>`),
  history: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`),
  downloads: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`),
  bookmarks: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`),
  'password-manager': 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`),
  flags: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>`),
  apps: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>`),
  about: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`),
  newtab: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10z"/></svg>`),
  'safe-browsing': 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>`),
  print: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`),
  inspect: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`),
  accessibility: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"/></svg>`),
  gpu: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14zM6 13h5v4H6zm6-6h4v3h-4zM6 7h5v5H6zm6 4h4v6h-4z"/></svg>`),
  'net-internals': 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>`),
  sync: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`),
  autofill: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>`),
  default: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9A9A9A" style="mix-blend-mode:luminosity;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`)
};

// Get the icon for a chrome:// URL based on its path
export function getChromePageIcon(url) {
  const path = url.replace('chrome://', '').split('/')[0].toLowerCase();
  return chromePageIcons[path] || chromePageIcons.default;
}

// Searchable Chrome internal pages
export const chromeInternalPages = [
  { title: 'Extensions', url: 'chrome://extensions/', keywords: ['extensions', 'addons', 'plugins', 'manage extensions'] },
  { title: 'Settings', url: 'chrome://settings/', keywords: ['settings', 'preferences', 'options', 'config', 'configuration'] },
  { title: 'History', url: 'chrome://history/', keywords: ['history', 'browsing history', 'visited pages'] },
  { title: 'Downloads', url: 'chrome://downloads/', keywords: ['downloads', 'downloaded files'] },
  { title: 'Bookmarks', url: 'chrome://bookmarks/', keywords: ['bookmarks', 'favorites', 'saved pages'] },
  { title: 'Password Manager', url: 'chrome://password-manager/', keywords: ['passwords', 'password manager', 'saved passwords', 'credentials', 'login'] },
  { title: 'Flags', url: 'chrome://flags/', keywords: ['flags', 'experiments', 'experimental features', 'chrome flags'] },
  { title: 'Apps', url: 'chrome://apps/', keywords: ['apps', 'applications', 'chrome apps'] },
  { title: 'About Chrome', url: 'chrome://settings/help', keywords: ['about', 'version', 'chrome version', 'update', 'about chrome'] },
  { title: 'Privacy & Security', url: 'chrome://settings/privacy', keywords: ['privacy', 'security', 'safe browsing', 'cookies', 'clear data'] },
  { title: 'Appearance', url: 'chrome://settings/appearance', keywords: ['appearance', 'theme', 'dark mode', 'fonts', 'customize'] },
  { title: 'Search Engine', url: 'chrome://settings/search', keywords: ['search engine', 'default search', 'google', 'bing'] },
  { title: 'On Startup', url: 'chrome://settings/onStartup', keywords: ['startup', 'on startup', 'start page', 'homepage'] },
  { title: 'Autofill', url: 'chrome://settings/autofill', keywords: ['autofill', 'addresses', 'payment methods', 'credit cards'] },
  { title: 'Languages', url: 'chrome://settings/languages', keywords: ['languages', 'translate', 'spell check'] },
  { title: 'Accessibility', url: 'chrome://settings/accessibility', keywords: ['accessibility', 'a11y', 'screen reader'] },
  { title: 'System', url: 'chrome://settings/system', keywords: ['system', 'proxy', 'hardware acceleration'] },
  { title: 'Reset Settings', url: 'chrome://settings/reset', keywords: ['reset', 'restore', 'default settings'] },
  { title: 'Site Settings', url: 'chrome://settings/content', keywords: ['site settings', 'permissions', 'notifications', 'location', 'camera', 'microphone'] },
  { title: 'Sync', url: 'chrome://settings/syncSetup', keywords: ['sync', 'google account', 'sync data'] },
  { title: 'GPU Info', url: 'chrome://gpu/', keywords: ['gpu', 'graphics', 'hardware acceleration', 'webgl'] },
  { title: 'Network Internals', url: 'chrome://net-internals/', keywords: ['network', 'net internals', 'dns', 'sockets', 'proxy'] },
  { title: 'Inspect Devices', url: 'chrome://inspect/', keywords: ['inspect', 'devtools', 'debug', 'developer tools'] },
  { title: 'Print', url: 'chrome://print/', keywords: ['print', 'printer'] },
  { title: 'New Tab', url: 'chrome://newtab/', keywords: ['new tab', 'newtab'] },
  { title: 'Components', url: 'chrome://components/', keywords: ['components', 'update components'] },
  { title: 'Version', url: 'chrome://version/', keywords: ['version', 'chrome version', 'build'] },
  { title: 'Memory', url: 'chrome://memory-internals/', keywords: ['memory', 'ram', 'memory usage'] },
  { title: 'Crashes', url: 'chrome://crashes/', keywords: ['crashes', 'crash reports'] },
  { title: 'Credits', url: 'chrome://credits/', keywords: ['credits', 'licenses', 'open source'] }
];

// Search Chrome internal pages
export function searchChromePages(query) {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];
  
  return chromeInternalPages.filter(page => {
    const titleMatch = page.title.toLowerCase().includes(normalizedQuery);
    const urlMatch = page.url.toLowerCase().includes(normalizedQuery);
    const keywordMatch = page.keywords.some(kw => kw.toLowerCase().includes(normalizedQuery));
    return titleMatch || urlMatch || keywordMatch;
  }).map(page => ({
    id: 'chrome-page-' + page.url,
    type: 'chrome-page',
    title: page.title,
    url: page.url
  }));
}

// Highlight matching text (currently just returns escaped text)
export function highlightMatch(text, query) {
  return escapeHtml(text);
}

// ============================================
// NOTIFICATION HELPERS
// ============================================

export function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  notification.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 200);
  }, 3500);
}

export function showPasteNotification(title) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  notification.innerHTML = `
    <span>Added "${escapeHtml(title)}"</span>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 200);
  }, 3500);
}

export function showCopyNotification(message = 'Link copied') {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  notification.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 200);
  }, 3500);
}

export function showUndoNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  notification.innerHTML = `
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 200);
  }, 3500);
}

export function showExportNotification(folderName = null) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  const message = folderName ? `"${escapeHtml(folderName)}" exported` : 'Bookmarks exported';
  notification.innerHTML = `
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 200);
  }, 3500);
}

export function showImportNotification(count, isError = false) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  
  if (isError) {
    notification.innerHTML = `
      <span>Import failed</span>
    `;
  } else {
    notification.innerHTML = `
      <span>Imported ${count} item${count !== 1 ? 's' : ''}</span>
    `;
  }
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 200);
  }, 3500);
}

