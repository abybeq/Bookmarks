# Chrome Web Store copy

Status: prepared locally; not submitted.

## Name

better bookmarks

## Summary

A new tab page for your bookmarks. Organize folders, search bookmarks and browsing history, and navigate with your keyboard.

## Full description

better bookmarks replaces your new tab page with a bookmark manager built around folders, search and keyboard navigation.

Work with your browser's existing bookmarks:

- Create, rename and organize bookmarks and folders.
- Move items with drag and drop or work with multiple selections.
- Search bookmarks and browsing history from your new tab.
- Navigate folders with your keyboard.
- Give folders their own icons and choose a color theme.
- Import and export bookmarks.
- Open a folder's links together in a tab group.
- Undo supported bookmark changes during your session.

Click the toolbar icon to open better bookmarks. Your bookmarks remain in the browser's bookmark system.

Settings are stored on your device. Search queries are not saved by the extension. Website icons are requested from Favicon.im, which receives website domain names. Adding a link may request the destination page to retrieve its title. Web searches use your browser's default search provider. See the privacy policy for details.

Support: dima@hamayunau.com

## Listing setup

- Primary language: English.
- Suggested category: Productivity; choose the closest available category in the dashboard.
- Support email: dima@hamayunau.com.
- Privacy policy URL: pending hosting of `PRIVACY.md`.
- Distribution, countries and free/paid declaration: confirm before submission.
- Required images: 128 × 128 icon, 440 × 280 promotional image, at least one 1280 × 800 or 640 × 400 screenshot.

## Single purpose

Provide a new tab bookmark manager for organizing, finding and opening saved websites, with related browsing-history search and keyboard navigation.

## Permission justifications

| Permission | Explanation for reviewers |
| --- | --- |
| bookmarks | Read, create, edit, move and delete bookmarks and folders when the user manages them in the new tab page. |
| history | Search browsing history and display matching titles, URLs and visit times alongside bookmark search results. |
| storage | Save theme preferences and folder-icon selections on the user's device. |
| tabGroups | Name and configure a tab group when the user chooses to open a folder or selected links together. |
| contextMenus | Add an Open better bookmarks item to the browser's page context menu. |
| search | Run a user-selected web search through the browser's default search provider. |
| https://a.favicon.im/* | Retrieve website favicon images from Favicon.im using website domain names. |

All six API permissions have call sites in the active code. Host match patterns grant access at the origin level; narrowing their path does not meaningfully limit host access. No broad access to all websites has been added.

## Privacy practices draft

- Remote code: No. JavaScript is bundled; fetched HTML is read for its title and is not executed.
- Data handled: bookmarks and URLs, browsing-history matches, settings, user-supplied import/paste content, cached favicons and domains.
- External transmission: domain names to Favicon.im for icons, requests to added URLs for page titles, user-selected searches to the default search provider.
- No developer analytics, advertising or data-collection backend found in the active package.
- Do not declare that no data is handled or transmitted. Select the dashboard's applicable website-content / web-history categories based on the exact wording shown at submission.
- Privacy policy and disclosures must match this behavior. Review whether favicon-domain transmission needs a prominent in-product disclosure before release.

## Reviewer test instructions

No login, subscription or external credentials are required.

Use a test browser profile with disposable bookmarks. Open a new tab after installation. Add a bookmark and a folder; edit and move them. Enter a folder and navigate back with the keyboard. Type to search bookmark titles and browsing history. Open the context menu to change a folder icon and use the theme picker to change colors. Reload the page and confirm saved settings. Test import/export and open links as a group using only disposable sample data. The toolbar icon and page context menu should open the extension.

Network access is used for favicons and automatic page titles. Website CORS restrictions or offline mode may prevent those resources from loading; bookmark storage is provided by the browser.
