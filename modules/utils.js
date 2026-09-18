import { ICONS, FOLDER_ICON_NAMES } from './font-awesome.js';

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

// Show the destination compactly without changing the saved bookmark URL.
export function getBookmarkDisplayUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.host.replace(/^www\./i, '') + parsed.pathname.replace(/\/$/, '') + parsed.search + parsed.hash;
    }
  } catch {
    // Keep unusual or malformed bookmark URLs readable as-is.
  }
  return url;
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

// Keep both click and keyboard activation on the same Ask destinations.
export function openAskTarget(text, provider = 'google', openInNewTab = false) {
  const query = text.trim();
  if (!query) return;
  const url = provider === 'chatgpt'
    ? `https://chat.com/?q=${encodeURIComponent(query)}&submit=false`
    : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  navigateToUrl(url, openInNewTab);
}

// ============================================
// SVG ICONS
// ============================================

export const DEFAULT_FOLDER_ICON = 'folder-closed';
export const folderIconOptions = FOLDER_ICON_NAMES;

const ICON_ALIASES = {
  search: 'magnifying-glass',
  history: 'clock-rotate-left'
};

export function isKnownFolderIcon(name) {
  return Object.hasOwn(ICONS, name);
}

function renderIconPaths(paths) {
  return paths.map(iconPath => `<path d="${iconPath.d}"/>`).join('');
}

export function getIconSvg(name, { className = '', width = null, height = null, fill = 'currentColor', style = '' } = {}) {
  const resolvedName = ICON_ALIASES[name] || name;
  const icon = ICONS[resolvedName] || ICONS.globe;
  const paths = icon.paths;
  const viewBox = icon.viewBox;
  const classAttr = className ? ` class="${className}"` : '';
  const widthAttr = width ? ` width="${width}"` : '';
  const heightAttr = height ? ` height="${height}"` : '';
  const styleAttr = style ? ` style="${style}"` : '';
  return `<svg${classAttr}${widthAttr}${heightAttr} viewBox="${viewBox}" fill="${fill}" xmlns="http://www.w3.org/2000/svg"${styleAttr}>${renderIconPaths(paths)}</svg>`;
}

export const searchIconSvgHtml = `
  ${getIconSvg('search', { className: 'search-icon' })}
`;

export const globeIconSvgHtml = `
  ${getIconSvg('globe', { className: 'globe-icon' })}
`;

export const linkIconSvgHtml = `
  ${getIconSvg('link', { className: 'link-icon' })}
`;

export const historyIconSvgHtml = `
  ${getIconSvg('history', { className: 'history-icon' })}
`;

export function getFolderIconSvg(iconName = DEFAULT_FOLDER_ICON) {
  const resolvedName = isKnownFolderIcon(iconName) ? iconName : DEFAULT_FOLDER_ICON;
  return `
    ${getIconSvg(resolvedName, { width: 24, height: 24, fill: 'var(--text-secondary)' })}
  `;
}

// Icons for chrome:// results use the same set, encoded as self-contained data URLs.
const chromePageIconNames = {
  settings: 'gear',
  extensions: 'puzzle-piece',
  history: 'clock-rotate-left',
  downloads: 'download',
  bookmarks: 'bookmark',
  'password-manager': 'key',
  flags: 'flag',
  apps: 'table-cells-large',
  about: 'circle-info',
  newtab: 'window-maximize',
  'safe-browsing': 'shield',
  print: 'print',
  inspect: 'eye',
  accessibility: 'universal-access',
  gpu: 'microchip',
  'net-internals': 'network-wired',
  sync: 'arrows-rotate',
  autofill: 'credit-card',
  default: 'globe'
};

function getChromePageIconName(url) {
  const page = url.replace('chrome://', '').split('/')[0].toLowerCase();
  const iconName = chromePageIconNames[page] || chromePageIconNames.default;
  return Object.hasOwn(ICONS, iconName) ? iconName : chromePageIconNames.default;
}

// Standalone image callers receive the current secondary text color.
export function getChromePageIcon(url) {
  const svg = getIconSvg(getChromePageIconName(url), {
    fill: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim()
  });
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function getChromePageIconSvg(url, className = '') {
  return getIconSvg(getChromePageIconName(url), {
    className: `chrome-page-icon ${className}`.trim(),
    width: 24,
    height: 24
  });
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

// ============================================
// NOTIFICATION HELPERS
// ============================================

export function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'paste-notification';
  const label = document.createElement('span');
  label.textContent = message;
  notification.appendChild(label);
  document.body.appendChild(notification);

  requestAnimationFrame(() => notification.classList.add('show'));
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 200);
  }, 3500);
}

export function showPasteNotification(title) {
  showNotification(`Added "${title}"`);
}

export function showExportNotification(folderName = null) {
  showNotification(folderName ? `"${folderName}" exported` : 'Bookmarks exported');
}

export function showImportNotification(count, isError = false) {
  showNotification(isError ? 'Import failed' : `Imported ${count} item${count !== 1 ? 's' : ''}`);
}
