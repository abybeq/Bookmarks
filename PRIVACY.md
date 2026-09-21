# Privacy policy for better bookmarks

Last updated: September 21, 2026

better bookmarks is a browser extension maintained by Dima Hamayunau. It replaces the new tab page with a bookmark manager. Contact: dima@hamayunau.com.

## Data used by the extension

The extension reads your bookmark titles, URLs and folder structure to display, search and organize them. When you add, edit, move, import or delete bookmarks, it changes the browser's own bookmarks. Those changes can also be synchronized by your browser if you have enabled its bookmark synchronization.

The extension reads matching browsing-history entries, including page titles, URLs and visit times, to display search results. When you explicitly choose Delete on a history result, the extension removes that URL from your browser history. It does not send your browser history to the developer.

Theme preferences and folder-icon selections are saved in extension storage on your device. Favicon images and their domain names are cached locally in IndexedDB; cached entries are treated as expired after seven days. Temporary navigation, selection and undo state is held in memory. Search queries are not saved by the extension; queries saved by an earlier version are removed when the extension page next opens.

When you use paste, import or export, the extension processes the links or bookmark files you provide. Exported files are saved to the location selected through your browser. The extension does not upload those files to the developer.

## External requests

To display website icons, the extension sends website domain names to Favicon.im at https://favicon.im. The favicon request uses the domain name, rather than the bookmark's full path or title, and is sent without a referrer. Favicon.im receives the domain and ordinary network-request information, including your IP address. Its favicon API is documented at https://favicon.im/api.

When you add a link, the extension may request that URL to read its page title. The destination website receives the request and ordinary network information, including your IP address. Some websites block these requests; the extension can fall back to a title derived from the URL.

When you choose Search, Chrome sends your query to the browser's default search provider. When you choose ChatGPT, the extension opens chat.com with your text in the URL to prefill the ChatGPT input without automatically submitting the message. When you open a bookmark, the browser connects to the destination website. These services have their own privacy policies.

## Developer access and use

The extension contains no developer-operated data collection endpoint, analytics SDK or advertising SDK. The developer does not receive your bookmarks, browsing history, search queries or imported files through the extension. Data is not sold or used for personalized advertising.

The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements. Data is used only to provide the extension's stated features.

## Your controls

You can manage browser history and bookmarks through your browser. Uninstalling the extension removes its extension-local storage; it does not delete your browser's bookmarks, browsing history or exported files. Browser synchronization and backups are controlled by your browser settings.

If you email the developer, your email address and the information you choose to provide will be used to respond to your request. Avoid including private bookmarks or browsing history unless needed to explain the issue.

## Changes and contact

This policy will be updated when the extension's data practices change. Questions about privacy can be sent to dima@hamayunau.com.
