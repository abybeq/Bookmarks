# Better Bookmarks

A Chromium extension that turns each new tab into a bookmark manager. It works with the bookmarks already saved in your browser, so changes also appear in the browser's bookmark manager.

## Features

- Create, edit, move, and delete bookmarks and folders
- Search bookmarks and browsing history, or send a web search to the browser's default search provider
- Navigate folders and results with the keyboard
- Organize with drag and drop or select multiple items at once
- Import and export bookmarks as HTML
- Open a folder or selected links in a tab group
- Choose folder icons and one of 15 color themes
- Undo supported bookmark changes during the current session

## Installation

1. Clone this repository or download and extract its ZIP.
2. Open the browser's extensions page (for Chrome, `chrome://extensions/`).
3. Enable **Developer mode** and choose **Load unpacked**.
4. Select this repository's root folder, which contains `manifest.json`.

## Usage

- Open a new tab, click the extension icon, or choose **Open better bookmarks** from a page's context menu.
- Start typing to search. Use the arrow keys to move through results, **Enter** to open one, and **Escape** to leave search or return to the parent folder.
- Right-click a bookmark, folder, or empty space for actions such as editing, importing, exporting, and customizing the theme.
- Select multiple items to move, open, export, or delete them together. **Cmd/Ctrl+Z** undoes supported bookmark changes.

Import adds bookmarks to the current folder. Deleting a history result removes that URL from browser history. See [Privacy](PRIVACY.md) for how bookmark data, history, settings, and website icons are handled.

## Checks

Run `node --experimental-vm-modules scripts/check-runtime.mjs` to check module imports, DOM references, and icon search without accessing browser data. Verify extension interactions in Helium.

Run `node --experimental-vm-modules scripts/check-performance.mjs` for cache invalidation, concurrent reads, favicon startup, and selection layout checks. Run `node scripts/check-drag-landing.mjs` for drag lifecycle checks. See [PERFORMANCE.md](PERFORMANCE.md) for the audit findings and measurement limits.

## Release preparation

Run `python3 scripts/package-release.py` to create a local review ZIP in `dist/`. The script includes only runtime files and notices, checks JavaScript syntax, and excludes development assets.

Store copy and permission justifications are in [store/LISTING.md](store/LISTING.md). Publication status and remaining checks are in [store/RELEASE-CHECKLIST.md](store/RELEASE-CHECKLIST.md). Review [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before distribution.

Regenerate the Font Awesome Solid registry with `node scripts/generate-font-awesome.mjs`. Its pinned source and license live in `icon-sources/font-awesome-solid/`.

## Requirements

Use a current Chromium browser with Manifest V3 support. Test this project in Helium. The oldest compatible browser version has not been established.
