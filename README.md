# better bookmarks

A Chrome extension that replaces your new tab page with a bookmark manager. It uses your browser's existing bookmarks and supports folder organization, search and keyboard navigation.

## Features

- Custom new tab page with bookmark management
- Keyboard-first navigation
- Search across bookmarks and browser history
- Drag & drop organization
- Import/Export functionality
- Theme customization (15 themes available)
- Multi-select operations
- Undo functionality

## Installation

1. Clone this repository or download as ZIP
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the folder containing this extension

## Usage

- Click the extension icon to open better bookmarks
- Open a new tab to see your bookmarks
- Use keyboard shortcuts for quick navigation
- Right-click for context menus

## Checks

Run `node --experimental-vm-modules scripts/check-runtime.mjs` to check module imports, DOM references and icon search without accessing browser data. Verify UI interactions in Helium.

## Release preparation

Run `python3 scripts/package-release.py` to create a local review ZIP in `dist/`. The script includes only runtime files and notices, checks JavaScript syntax, and excludes development assets.

Store copy and permission justifications are in `store/LISTING.md`. Publication status and remaining checks are in `store/RELEASE-CHECKLIST.md`. The privacy policy is in `PRIVACY.md`; it still needs a public URL. Review `THIRD_PARTY_NOTICES.md` before distribution.

Regenerate the Font Awesome Solid registry with `node scripts/generate-font-awesome.mjs`. Its pinned source and license live in `icon-sources/font-awesome-solid/`.

## Requirements

Use a current Chromium browser with Manifest V3 support. Test this project in Helium. The oldest compatible browser version has not been established.
