# Chrome Web Store copy

Status: version 1.0.0 was rejected on September 21, 2026 because the `search` permission had no active API call. Version 1.0.1 fixes that issue and is being prepared for resubmission. Item ID: `japemljmgniakiecpfjnhlchkplmcien`. Manual publishing is selected.

## Name

Better Bookmarks

## Summary

Turn every new tab into a bookmark manager. Organize folders, search bookmarks and browsing history, and use your keyboard.

## Full description

Better Bookmarks turns your new tab into a focused workspace for the bookmarks already saved in your browser. Find a saved page, reorganize a folder or open a set of links without leaving the tab.

What you can do:

- Search bookmarks and matching browsing history in one place, and remove individual history results when you choose.
- Create, rename, move and delete bookmarks and folders.
- Organize items with drag and drop or select several items at once.
- Navigate folders and search results with your keyboard.
- Import and export bookmarks.
- Open a folder or selected links together in a tab group.
- Choose folder icons and a color theme.
- Undo supported bookmark changes made during the current session.

Better Bookmarks works with Chrome's existing bookmark system. Changes made in the extension also appear in Chrome's bookmark manager and may sync through Chrome if bookmark sync is enabled. You can open the extension from a new tab, its toolbar icon or the page context menu.

No account or subscription is required. The extension has no ads or developer analytics. Settings are stored on your device, and search queries are not saved by the extension.

To display website icons, Better Bookmarks sends website domain names to Favicon.im. When you add a link, the extension may request that page to retrieve its title. Web searches you choose to run use Chrome's default search provider. See the privacy policy for details.

Support: dima@hamayunau.com

## Listing setup

- Primary language: English.
- Category: Workflow & Planning.
- Support email: dima@hamayunau.com.
- Privacy policy URL: https://bookmarks.hamayunau.com/privacy/.
- Distribution: free of charge, public, all regions.
- Prepared images: `store/assets/icon128.png`, `store/assets/promo-440x280.png` and three 1280 × 800 screenshots in `store/assets/`.

## Single purpose

Provide a new tab bookmark manager for organizing, finding and opening saved websites, with related browsing-history search and keyboard navigation.

## Permission justifications

| Permission | Explanation for reviewers |
| --- | --- |
| bookmarks | Read, create, edit, move and delete bookmarks and folders when the user manages them in the new tab page. |
| history | Search browsing history, display matching titles, URLs and visit times alongside bookmark results, and remove an individual history URL only when the user explicitly chooses Delete. |
| storage | Save theme preferences and folder-icon selections on the user's device. |
| tabGroups | Name and configure a tab group when the user chooses to open a folder or selected links together. |
| contextMenus | Add an Open Better Bookmarks item to the browser's page context menu. |
| search | Run a user-selected web search through the browser's default search provider. |
| https://a.favicon.im/* | Retrieve website favicon images from Favicon.im using website domain names. |

All six API permissions have call sites in the active code. Host match patterns grant access at the origin level; narrowing their path does not meaningfully limit host access. No broad access to all websites has been added.

## Privacy practices draft

- Remote code: No. JavaScript is bundled; fetched HTML is read for its title and is not executed.
- Data handled: bookmarks and URLs, browsing-history matches and user-requested deletion of individual history URLs, settings, user-supplied import/paste content, cached favicons and domains.
- External transmission: domain names to Favicon.im for icons, requests to added URLs for page titles, user-selected searches to the default search provider.
- No developer analytics, advertising or data-collection backend found in the active package.
- Do not declare that no data is handled or transmitted. Select the dashboard's applicable website-content / web-history categories based on the exact wording shown at submission.
- Privacy policy and dashboard disclosures must match this behavior. Favicon-domain transmission is directly tied to the visible favicon feature and is disclosed in the Store copy and privacy policy; keep those disclosures prominent and consistent.

## Reviewer test instructions

No login, subscription or external credentials are required.

Use a test browser profile with disposable bookmarks and browsing history. Open a new tab after installation. Add a bookmark and a folder; edit and move them. Enter a folder and navigate back with the keyboard. Type to search bookmark titles and browsing history; use the context menu on a disposable history result to verify Delete from history. Open the context menu to change a folder icon and use the theme picker to change colors. Reload the page and confirm saved settings. Test import/export and open links as a group using only disposable sample data. The toolbar icon and page context menu should open the extension.

Network access is used for favicons and automatic page titles. Website CORS restrictions or offline mode may prevent those resources from loading; bookmark storage is provided by the browser.
