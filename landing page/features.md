# Bookmarks Extension - Features Documentation

A powerful Chrome extension that transforms your new tab page into a beautiful, feature-rich bookmark manager with keyboard-first navigation and modern UI.

---

## 📑 Table of Contents

- [Core Features](#core-features)
- [Bookmark Management](#bookmark-management)
- [Folder Organization](#folder-organization)
- [Search & Navigation](#search--navigation)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Quick Bookmark Modal](#quick-bookmark-modal)
- [Drag & Drop](#drag--drop)
- [Multi-Select Operations](#multi-select-operations)
- [Import & Export](#import--export)
- [Theme Customization](#theme-customization)
- [Context Menus](#context-menus)
- [Technical Features](#technical-features)

---

## Core Features

### Custom New Tab Page
- Replaces Chrome's default new tab with a clean, organized bookmark interface
- Instant access to all your bookmarks when opening a new tab
- List-based view optimized for quick scanning and navigation
- Responsive design that works across different screen sizes

### Badge Indicator
- Extension icon shows a checkmark (✓) badge on pages you've already bookmarked
- Visual confirmation that the current page is saved
- Badge updates automatically when switching tabs or navigating

---

## Bookmark Management

### Adding Bookmarks
- **Quick Add Modal**: Click the extension icon or right-click on any page to save
- **Multi-link Support**: Add multiple bookmarks at once in the add modal
- **Auto Title Fetch**: Automatically retrieves page titles when adding URLs
- **Paste to Add**: Paste a URL anywhere on the new tab page to instantly create a bookmark
- **Smart URL Handling**: Automatically adds `https://` prefix to URLs when needed

### Editing Bookmarks
- Edit bookmark names and URLs through the edit modal
- Inline folder name editing directly from the breadcrumb
- Changes save automatically

### Deleting Bookmarks
- Delete single items or multiple selected items
- Confirmation modal for folders (prevents accidental deletion)
- Instant deletion for single links (with undo support)

### Undo Functionality
- **Cmd/Ctrl + Z** to undo recent actions
- Undo stack maintains up to 20 previous states
- Works for add, edit, delete, and move operations
- Visual notification confirms when action is undone

---

## Folder Organization

### Hierarchical Structure
- Create nested folders to organize bookmarks
- Unlimited folder depth for complex organization
- Visual hierarchy with folder icons

### Special Folders
- **Unsorted Folder**: Auto-created inbox for newly saved bookmarks
- Unsorted folder appears first and auto-deletes when empty
- Quick way to triage new bookmarks before organizing

### Breadcrumb Navigation
- Click-through breadcrumb shows current location
- Navigate up the hierarchy by clicking parent folders
- Edit current folder name by clicking on it
- Drag items to breadcrumb folders to move them

---

## Search & Navigation

### Universal Search
- **Instant Activation**: Start typing anywhere to begin searching
- Searches across all bookmarks, folders, and browser history
- Real-time results as you type

### Search Sources
1. **Saved Bookmarks**: Search by title or URL
2. **Saved Folders**: Find folders by name
3. **Chrome Internal Pages**: Quick access to `chrome://` pages (settings, extensions, etc.)
4. **Browser History**: Search through your browsing history
5. **Google Suggestions**: Autocomplete suggestions from Google
6. **Search History**: Your past searches

### Smart URL Detection
- Detects when search query is a URL
- Shows direct navigation option for URLs
- Proper favicon display for URL results

### Search History
- Saves your search queries for quick re-use
- Delete individual history items
- Up to 50 recent searches stored

---

## Keyboard Shortcuts

### Navigation
| Shortcut | Action |
|----------|--------|
| `↓` / `↑` | Navigate through items |
| `→` / `Enter` | Open item or enter folder |
| `←` / `Escape` | Go back / Exit search / Navigate to parent |
| `Cmd/Ctrl + Enter` | Open in new tab |

### Actions
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo last action |
| `Cmd/Ctrl + A` | Select all items |
| `Backspace` / `Delete` | Delete focused or selected items |
| `Enter` | Open selected links |
| `Escape` | Clear selection / Exit search / Exit move mode |

### Search
| Shortcut | Action |
|----------|--------|
| Start typing | Enter search mode |
| `↓` / `↑` | Cycle through suggestions |
| `Enter` | Perform Google search or navigate |

---

## Quick Bookmark Modal

### One-Click Bookmarking
- Click extension icon on any webpage to save
- Right-click → "Bookmark" context menu option
- Modal appears on the current page (no popup)

### Modal Features
- Edit bookmark name before saving
- Choose destination folder from hierarchical list
- Create new folders directly from the modal
- Delete bookmark with one click
- Auto-saves to "Unsorted" folder by default

### Edit Existing Bookmarks
- Modal shows "Edit bookmark" for already-saved pages
- Change name or folder location
- Delete the bookmark

### Create Folders in Modal
- Create new folders without leaving the page
- New folder automatically selected for the bookmark

---

## Drag & Drop

### Reordering Items
- Drag items to reorder within the same type (folders with folders, links with links)
- Visual drop indicator shows where item will be placed
- Drag multiple selected items at once

### Moving to Folders
- Drag items onto folders to move them inside
- Drag to breadcrumb items to move to parent folders
- Visual highlight shows valid drop targets
- Prevention of circular moves (can't move folder into itself)

### Drag Preview
- Custom drag image shows item being moved
- Multi-item drag shows count badge
- Smooth animations during drag operations

---

## Multi-Select Operations

### Selection Methods
- **Shift + Click**: Toggle individual item selection
- **Cmd/Ctrl + A**: Select all items in current folder
- **Box Selection**: Click and drag on empty space to select multiple items
- Visual styling shows selection groups with rounded corners

### Bulk Actions
- **Open All**: Open all selected links in a new tab group
- **Move**: Move all selected items to another folder
- **Export**: Export selected items to HTML file
- **Delete**: Delete all selected items (with confirmation for folders)

### Tab Groups
- Opening multiple links creates a Chrome tab group
- Tab group named after folder or selection count
- Links open in background tabs

---

## Import & Export

### Export Bookmarks
- Export in standard Netscape Bookmark HTML format
- Compatible with all major browsers
- Export current folder and all subfolders
- Export selected items only
- Automatic filename with date stamp

### Import Bookmarks
- Import from any browser's exported bookmarks
- Preserves folder structure
- Merges into current folder location
- Progress notification shows import count

### Format Support
- Netscape Bookmark File format (`.html`)
- Compatible with Chrome, Firefox, Safari, Edge exports

---

## Theme Customization

### Available Themes (15 options)
| Theme | Description |
|-------|-------------|
| Frost | Cool blue-white tones |
| Default | System-adaptive neutral |
| Blue | Deep blue accents |
| Lavender | Soft purple tones |
| Slate | Dark gray professional |
| Mint | Fresh green tones |
| Sage | Muted green |
| Sand | Warm beige |
| Amber | Golden orange |
| Terra | Earthy red-brown |
| Mocha | Rich brown |
| Rose | Soft pink |
| Blush | Light coral |
| Orchid | Purple-pink |
| Violet | Deep purple |

### Theme Features
- Light and dark mode variants for each theme
- Respects system dark mode preference
- Theme persists across sessions
- Access via right-click → "Customize"

---

## Context Menus

### Item Context Menu (Right-click on bookmark/folder)
- **Open all**: Open all links in folder as tab group
- **Copy link**: Copy URL to clipboard
- **Move**: Enter move mode to relocate item
- **Export**: Export item (for multi-select)
- **Edit**: Open edit modal
- **Delete**: Delete item

### Background Context Menu (Right-click on empty space)
- **Add bookmark**: Open add modal
- **Create folder**: Create new folder
- **Open all**: Open all links in current folder
- **Import**: Import bookmarks from file
- **Export**: Export current folder
- **Customize**: Open theme picker

---

## Technical Features

### Performance Optimizations
- **In-memory Caching**: Background script caches bookmark data
- **Favicon Caching**: IndexedDB cache for favicons (7-day TTL)
- **Debounced Saves**: Rapid operations are batched
- **Event Delegation**: Efficient event handling for large lists
- **Lazy Loading**: Favicons load as needed

### Data Storage
- Uses Chrome's `chrome.storage.local` for unlimited storage
- Automatic migration from `chrome.storage.sync`
- Fallback to localStorage if Chrome storage fails
- Real-time sync across tabs via storage change listener

### Security
- Shadow DOM isolation for content script modal
- HTML escaping prevents XSS attacks
- CSP-compliant implementation

### Chrome Integration
- Tab groups API for opening multiple links
- History API for browser history search
- Context menus API for right-click options
- Scripting API for content script injection
- Tabs API for badge management

### Permissions Used
- `storage` / `unlimitedStorage`: Bookmark data
- `tabs` / `tabGroups`: Tab management
- `activeTab` / `scripting`: Content script injection
- `history`: Browser history search
- `contextMenus`: Right-click menus
- `<all_urls>`: Page bookmarking on any site

---

## Browser Compatibility

- Chrome 88+ (Manifest V3)
- Chromium-based browsers (Edge, Brave, etc.)

---

## File Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for background tasks
├── content.js             # Content script for bookmark modal
├── newtab.html           # New tab page HTML
├── main.js               # Main entry point
├── styles.css            # Main styles
├── modal-styles.css      # Content script modal styles
├── modules/
│   ├── state.js          # Global state management
│   ├── storage.js        # Data persistence
│   ├── navigation.js     # Folder navigation
│   ├── search.js         # Search functionality
│   ├── render.js         # UI rendering
│   ├── interactions.js   # User interactions
│   ├── keyboard.js       # Keyboard shortcuts
│   ├── importExport.js   # Import/export functions
│   └── utils.js          # Utility functions
└── icons/                # Extension icons
```

---

*Built with modern JavaScript (ES Modules), Chrome Extension Manifest V3, and a focus on keyboard-first productivity.*











