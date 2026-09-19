# Performance audit

Reviewed on 2026-09-19: startup, storage, folder rendering/navigation, search/history, icons, selection, import/export, and background worker. Existing local changes were preserved.

## Changes and evidence

| Area | Change | Verification |
| --- | --- | --- |
| Folder reads and export | Reuse the current bookmark snapshot for individual items and children; return copies to keep callers from changing the cache. Fall back to native reads after invalidation. | In Helium, rendering the current folder and breadcrumb and preparing the export each made zero additional bookmark API reads with a warm snapshot. The equivalent native recursive traversal required 58 reads for the collection of 418 bookmarks. |
| Move validation | Walk destination ancestors in the shared snapshot instead of reading every descendant folder. Reject validation when the tree is unavailable. | Ancestry, API failure/recovery, and browser rejection of self/descendant moves passed. |
| Search | Stop eagerly rebuilding the index after mutations while search is closed. Reuse the saved-URL set between history filtering passes until the snapshot changes. | A 30-event closed-search batch caused no search-triggered tree reads. Live bookmark/history search, Show more availability, Escape, and return navigation worked in Helium. |
| Favicons | Share database initialization, wait for persisted icons before fetching, and update only placeholders for the resolved hostname. | Delayed IndexedDB initialization returned a persisted icon with zero network requests. Blocked/failed initialization retains the existing fallback path. |
| Icon picker | Update only the previous and next active button. | Helium observed two changed buttons among 1,402 options, one selected option, and focus on that option. |
| Selection | Ignore ordinary row/menu/secondary clicks before reading bookmarks. Read all row bounds before writing selection styles. | The 200-row check verified that every geometry read precedes the first style write. |
| HTML generation | Escape text directly instead of allocating a DOM element for each value. Also escape quotes used in HTML attributes. | Special-character and null-input checks passed. |

## Regression checks

All three checks passed:

```sh
node --experimental-vm-modules scripts/check-runtime.mjs
node --experimental-vm-modules scripts/check-performance.mjs
node scripts/check-drag-landing.mjs
```

The existing `scripts/check-drag-browser.js` also passed all ten scenarios in Helium, including a deliberately failed move. Its temporary bookmarks were removed and the original folder restored. That injected error is expected in the console.

## Limits and retained behavior

These results measure redundant work, not an overall FPS or startup-speed improvement. Native pointer box selection was not separately verified; its layout ordering was checked in isolation. Import writes, downloads, and background menu actions were reviewed in code rather than exercised end to end.

The existing single tree snapshot, stale-render guards, keyed search rows, deferred secondary startup work, and favicon request deduplication were retained. The full icon catalog is still loaded at startup, about 1.10 MB of local JavaScript. Deferring it would also require loading saved custom folder icons before rendering; that loading behavior was not changed in this pass. No general list virtualization was introduced.
