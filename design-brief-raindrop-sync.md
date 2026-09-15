# Raindrop synchronization: design context and implementation handoff

Date: 2026-09-15
Status: Product interview complete. Implementation and live account authorization have not started.

This document consolidates the conversation. Explicit later corrections override earlier answers. Proposed engineering decisions and unresolved API behavior are labeled separately from accepted requirements.

## 1. Product frame

Add bidirectional synchronization between native browser bookmarks shown by better bookmarks and one Raindrop account. A special folder looks and behaves like an ordinary folder wherever possible. Changes converge automatically; instant synchronization is unnecessary.

Scope: the entire writable account, including new collections, Unsorted and Trash. Exclude collections available only for reading. Only one account may be actively connected at a time.

## 2. Target audience

People using both better bookmarks and Raindrop who want the same bookmark organization in both applications. The user should not need to understand API tokens, synchronization databases, or collection identifiers.

## 3. Problem and opportunity

Let users work in either application without manually importing and exporting bookmarks. Preserve the extension's existing folder navigation, mixed folders and links, search, drag and drop, multi-selection and Undo.

## 4. Primary user scenarios

### Connect for the first time

1. Open the background context menu at the extension root.
2. Choose **Raindrop** in the section containing Import and Export.
3. A modal opens with integration settings.
4. The desired connection flow is a button that opens Raindrop sign-in and consent. No manual token entry in the intended user experience.
5. After successful authorization, close the modal and open the new Raindrop folder with initial loading progress.
6. Create that folder first in the extension root. Users can subsequently reorder it.
7. Initial loading temporarily blocks editing inside the integration folder. Other browser folders remain usable.
8. If loading fails or loses connectivity, allow viewing and editing downloaded items. Resume and reconcile later without losing those edits.

Canceling sign-in leaves the previous state unchanged and is not an error.

### Use synchronization

- Poll every five minutes and at browser startup. Browser scheduling and connectivity can delay a run.
- Routine synchronization permits editing throughout the run.
- Manual **Sync now** is available only while viewing the integration root, not from nested folders.
- The Raindrop settings modal is accessible from the extension root and every folder within Raindrop, including Trash.
- Show last successful synchronization time and status in the integration root. Settings may also explain status and account errors.
- Show a small indicator on the integration folder only when user action is needed, such as reconnecting an account. Connectivity failures do not cause that indicator or popup notifications.
- Retry recoverable failures automatically.

### Disconnect and reconnect

- Disconnect immediately without a confirmation dialog or local deletion.
- Keep the folder, bookmarks, chosen icon, account association and synchronization metadata.
- The folder remains special while disconnected: fixed location at the extension root, protected Unsorted and Trash, and search exclusion of Trash.
- Editing continues. Record additions, edits, moves, reordering and deletions while disconnected.
- Show last successful sync time and **Reconnect** in the integration root.
- Reconnect automatically reconciles all changes, including deletions, without a preview or approval step.
- During a healthy reconnect reconciliation, temporarily block editing and show progress. If interrupted, unlock editing and resume safely later.
- Disconnecting during initial loading stops further loading and retains whatever has downloaded.
- Loss of authorization also permits local editing and later reconciliation.

### Delete the integration folder

Explain that the local folder will be removed and synchronization disconnected, while all Raindrop data remains. Use the existing dialog patterns. Remove only the local subtree and disconnect. Never translate this action into mass remote collection deletion.

### Connect a different account

Keep the previous account's folder and create a new folder for the different account. Never merge data from the old account into the new one. The latest global rule keeps disconnected integration folders special; only one can be actively connected.

## 5. Functional scope

### Folder structure

```text
Raindrop                 # user may rename and customize its icon
  Unsorted               # always first
  Read Later             # ordinary top-level collection
  AI & Development       # may contain links and nested folders together
    Domains
    Development Tools
    Agents
  Design
  Personal
  Work & Projects
  Trash                  # always last
```

- Do not add a Collections wrapper or an All bookmarks view.
- A collection is represented as a folder and can hold both bookmarks and subcollections.
- Do not confuse sidebar group headings with parent collections. Custom sidebar groups need metadata handling, not an invented folder layer.
- The integration folder can be renamed locally. Identity must not depend on its title.
- It stays at the extension root, connected or disconnected. Reordering among root siblings is allowed.
- Unsorted and Trash cannot be renamed or deleted, including while disconnected.
- Default integration icon is Raindrop. Users can replace it with an available custom icon. Icons stay local and survive disconnecting.
- Synchronize manual order of bookmarks and collections in both directions. Unsorted and Trash retain their fixed positions.

### Bookmark and collection operations

| Operation | Accepted behavior |
| --- | --- |
| Create/edit a bookmark or collection | Synchronize both directions |
| Move within the integration | Synchronize parent changes |
| Create a bookmark at the integration root | Require a destination collection; Unsorted is an explicit folder |
| Delete an active bookmark | Move to Trash on both sides; ordinary removal has Undo |
| Drag an active bookmark into Trash | Equivalent to deletion |
| Create a bookmark within Trash | Disallowed |
| Drag a bookmark out of Trash | Move to the destination collection; no separate Restore command |
| Delete a collection | Confirm, remove the collection/subtree on both sides, move contained bookmarks to Trash |
| Delete from Trash | Confirm permanent deletion, then delay irreversible remote work until Undo expires |
| Undo deletion from Trash | Keep/restore the item in Trash before remote permanent deletion is dispatched |
| Empty Trash | No bulk Clear Trash command in this version; selected-item deletion remains available |
| Add a URL that already exists only in Trash | Create a new active bookmark; retain the old Trash item |

Reuse existing confirmation dialogs with Raindrop-specific consequences. Earlier answers explicitly made single active-bookmark deletion immediate; do not introduce a new confirmation there. Preserve the existing normal Undo duration unless implementation evidence requires a documented adjustment.

### Transfers between normal folders and Raindrop

- Transfer whole folders and their contents across the boundary.
- Inbound transfer creates the corresponding remote collections and bookmarks.
- Outbound bookmark transfer leaves the local bookmark outside the integration and sends its remote counterpart to Trash.
- Outbound folder transfer requires confirmation. Remove the remote collection tree and send its bookmarks to Trash; keep the transferred local tree.
- Undo must reverse outbound folder transfer and any associated remote work.
- Matching folder names at the destination trigger a merge confirmation. Merge corresponding nested folders recursively.
- Canceling a merge restores the original state with no transfer or partial merge.
- If outbound transfer and folder merge both need confirmation, describe both in one dialog.
- In the same destination folder, equal URLs merge into one bookmark. Preserve the incoming bookmark's title.
- Equal URLs in different folders remain separate bookmarks.
- Unsupported links cannot enter the integration. When transferring a mixed folder, move supported items and retain unsupported items in the original hierarchy. Explain the partial transfer.
- A temporarily unreachable HTTP website is not an unsupported bookmark. Do not probe website availability as a condition of synchronization.

### Reconciliation rules

- Previously linked items match by persistent identity, even after title, URL or parent changes.
- Previously unrelated items match by equal URL within the corresponding folder. Equal folder names merge recursively during reconnect without a separate approval step.
- For conflicting edits, the latest action by time wins. The same rule applies to edit-versus-delete conflicts.
- Local deletions made during intentional disconnection must propagate after reconnecting. This explicitly replaces the earlier decision to restore all remotely surviving bookmarks.
- Do not resurrect a locally deleted bookmark merely because its remote version still exists unchanged.
- Additions and independent edits from both sides must survive reconciliation.

### Search

- Include active Raindrop bookmarks in existing global bookmark search, connected or disconnected.
- Exclude all descendants of the integration Trash folder, based on identity rather than title.
- No folder-specific search is introduced.
- Proposed narrow interpretation: filtering concerns bookmark results, not unrelated browser-history results with the same URL. Preserve the existing history-search feature unless explicitly changed later.

## 6. Content and data needs

- Account identity and connection status; local integration, Unsorted and Trash IDs.
- Bidirectional bookmark and collection ID mapping, preserved across local recreation by Undo.
- Last agreed item state and durable pending operations, including deletion records and ordering changes.
- Source action times where available, local observation times, and unresolved conflict metadata.
- Last successful complete sync time, progress, error category and retry state.
- Account association for disconnected folders; no cross-account reuse of mapping.
- Independent folder icons.
- Raindrop-only fields such as tags, notes and highlights must be preserved remotely. Their editing UI is outside this version.
- Exact required entry-point label: **Raindrop**. Other proposed English copy should follow existing extension copy conventions.

## 7. UX states and edge cases

| State | Editing | Root feedback |
| --- | --- | --- |
| Never connected | Normal extension behavior | Connect in settings |
| Initial loading | Integration editing blocked | Progress |
| Initial loading interrupted | Downloaded content editable | Failure/retry status |
| Connected, idle | Enabled | Last successful sync |
| Routine synchronization | Enabled | Synchronizing |
| Offline/recoverable failure | Enabled | Retry status, no popup |
| Authorization required | Enabled | Reconnect and folder indicator |
| Intentionally disconnected | Enabled; special rules remain | Last sync and Reconnect |
| Reconnect reconciliation | Temporarily blocked | Progress |
| Reconnect interrupted | Enabled | Retry status |

Use existing modal focus management, Escape behavior, keyboard navigation and selection behavior. Blocking integration edits must not block unrelated folders. A canceled destructive dialog changes neither local nor remote state.

## 8. Strategy, positioning and constraints

- Extend the current folder interface; avoid a separate Raindrop client UI.
- Keep native bookmarks as the current storage model where feasible.
- Application registration is explicitly deferred. Do not register, deploy an authorization service, or connect a live account as part of this documentation task.
- OAuth remains the intended UX. A token-entry shortcut is not the accepted product flow.
- Without registration and authentication infrastructure, use clearly identified development fixtures to prepare and test behavior. Never present fixture connection as a successful real connection.
- Work locally and preserve unrelated changes. Current working tree already contains UI/module edits.
- Verify runtime behavior in Helium, as required by project instructions.

## 9. Visual and interaction direction

Use existing list items, context-menu section styling, modal layout, confirmations and icon picker. Default to the Raindrop icon but retain customization. Integration status belongs in its root; avoid repeating it in every collection. The root-list indicator is reserved for required user action.

No new sidebar, Collections wrapper, All bookmarks screen, dedicated Restore command, folder search, or Trash-clearing command.

## 10. Success criteria and acceptance scenarios

1. Connect creates exactly one account-bound folder, first at the extension root, and opens loading progress.
2. Titles, URLs, nested structure and supported order changes converge after a sync in either direction.
3. New writable remote collections appear automatically; read-only collections are excluded.
4. Routine sync permits simultaneous local edits without losing them or echoing changes indefinitely.
5. Offline/reconnect/worker restart preserves pending operations without duplicate remote creates.
6. Disconnect, edit, move, reorder and delete locally; reconnect converges including deletions.
7. Latest-action conflict behavior is tested with edits and deletions; unavailable timestamps are never silently treated as proof of recency.
8. Trash remains outside bookmark search after disconnect and integration-root rename.
9. Drag into Trash deletes; drag out activates; direct creation is unavailable.
10. Permanent removal waits through the Undo interval and survives worker interruption without early deletion.
11. Outbound folder transfer confirms consequences; Undo and canceled merge restore the previous tree.
12. Inbound mixed supported/unsupported transfer leaves unsupported content in place and reports partial completion.
13. Same-folder duplicate URLs merge using the incoming title; different-folder duplicates remain.
14. Deleting the integration root performs no remote deletion, even if native bookmark events fire for its descendants.
15. Canceling login is quiet; changing accounts never exports the previous account's folder into the new account.
16. Unsorted/Trash protection and root placement survive disconnect and browser restart.
17. Loading/reconciliation failures unlock available content and resume without overwriting edits made during interruption.

## 11. Assumptions and technical verification gates

These are implementation investigations, not additional interview questions. Do not claim full compatibility before checking them.

### Exact latest-action ordering

Chrome's bookmark data does not provide a complete per-item edit/delete history. Record actions locally, including while deliberately disconnected. Raindrop timestamps must be tested for bookmark moves, deletes, folder changes and ordering. A record's last-update time is not automatically the timestamp of each field or deletion. Clock skew and changes while the extension was not running complicate exact comparisons. If exact ordering cannot be recovered, document that limitation and retain recovery data rather than silently inventing a timestamp.

### Native browser edits and protected folders

The extension cannot make arbitrary native bookmark folders immutable in the browser's own manager. It can enforce restrictions in its UI and observe native events afterward. Establish recovery for external deletion, rename and movement of protected nodes. Integration-root deletion must detach the entire subtree before processing child deletion events. This limitation must be visible in the implementation assessment.

### Order and sidebar groups

Raindrop stores root collection membership/order in user groups, while nested collections and bookmarks have separate ordering mechanisms. Verify the write contract. Preserve unseen group membership; do not collapse or delete groups remotely. There may be no representation for the extension's arbitrary interleaving of folders and links. Verify and document the attainable ordering before claiming exact cross-application parity.

### Trash and Undo identity

Test moving an existing Trash item back into a collection, remote deletion metadata, and collection deletion behavior. Existing extension Undo recreates some native nodes with new IDs. Synchronization mappings must follow recreated nodes. Prefer delaying destructive remote collection work until Undo expires; once irreversible work has run, do not pretend to restore the original remote identity.

### Duplicates and retries

Test Raindrop's duplicate-URL handling, multiple matches in a folder, title updates, URL normalization and create retries after an uncertain response. Do not strip query parameters/fragments or merge across collections by default. Plan operations before applying a recursive merge so cancellation has no effects and Undo has enough original data.

### Completeness, permissions and inaccessible records

Paginate remote reads completely. Failed requests, missing pages, excluded collections and permission loss are not evidence of deletion. Distinguish an item moved to a read-only collection from a confirmed deletion. A partially downloaded tree is not a complete reconciliation baseline.

### Registration and account infrastructure

Documented OAuth uses a registered application, client secret and token refresh. Keep the secret outside the distributed extension. Server design/deployment and live registration remain deferred. Confirm the smallest supported authorization architecture before implementation of real sign-in.

### Multiple browser profiles and removed local metadata

Native browser sync may copy bookmarks without this extension's ID mapping. First scope is the current profile; verify behavior before enabling multiple active profiles against the same account. If local mapping or deletion history is lost, do not infer remote deletion from an empty local store. Safe recovery requires a fresh baseline and must be distinguished from ordinary reconnect.

## 12. Recommended next artifacts and implementation sequence

### Phase 1: local design and behavior preparation, no registration

- Derive settings modal and root-status states from the existing UI.
- Add development fixtures for account tree, Trash, conflicts, interrupted loading and reconnect.
- Implement a small account-bound metadata store and a pure reconciliation planner against fixtures.
- Verify native folder policy, search exclusion and command/Undo integration locally.
- Keep fixture controls out of production user flows; do not ship a fake working connection.

### Phase 2: API capability verification when credentials become available

- Register the application only when the deferred work resumes.
- Use a disposable collection to verify Trash transitions, timestamps, duplicates, ordering, permission transitions and retry behavior.
- Resolve the verification gates above and record any unavoidable changes to the promised behavior before enabling account-wide writes.

### Phase 3: real synchronization

- Implement OAuth and refresh, a narrow API adapter, durable queue, serialized synchronization and startup/five-minute scheduling.
- Connect the planner to native bookmark events and API operations; suppress expected echo events through operation identity/state.
- Reconcile reconnect and offline changes from the last agreed baseline, including explicit deletion records.
- Handle interruptions, rate limits, account changes and root deletion.

### Phase 4: verification and release preparation

- Run focused reconciliation/queue/Undo tests covering the acceptance scenarios.
- Run `node --experimental-vm-modules scripts/check-runtime.mjs`.
- Verify pointer, keyboard, context menu, confirmations and asynchronous states in Helium.
- Verify both directions with a disposable live collection before claiming end-to-end completion.
- Update permissions documentation, privacy information and release notes for account/network access. Do not publish as part of this plan.

### Existing integration points

| File | Relevant responsibility |
| --- | --- |
| `background.js` | Existing service worker; proposed scheduler and native-event orchestration |
| `manifest.json` | Future minimal host permissions and scheduling/auth permissions |
| `modules/storage.js` | Native mutations, bookmark search snapshot, icons, Undo recreation |
| `modules/interactions.js` | Context menus, dialogs, drag/drop and transfer confirmation |
| `modules/keyboard.js` | Apply the same protected-folder and deletion rules to keyboard commands |
| `modules/importExport.js` | Ensure import cannot bypass integration rules |
| `modules/search.js` | Consume Trash-filtered bookmark results without adding folder search |
| `modules/render.js`, `modules/navigation.js`, `main.js` | Root status, indicator, loading locks and updates |
| `newtab.html`, `styles.css` | Existing menu section and modal/status presentation |
| `scripts/check-runtime.mjs` | Existing project validation |

Proposed additions should remain narrow: a Raindrop API adapter, durable synchronization state/queue, and a reconciliation planner. Avoid rewriting general bookmark storage or unrelated UI.

## 13. Interview notes and source answers

The conversation is authoritative. Major corrections, in order:

1. The integration folder looks ordinary but is a special account-bound folder.
2. Sync the whole writable account; no collection picker. Unsorted first, Trash last.
3. Keep disconnected content without prompting. Later clarification preserves special-folder restrictions while disconnected.
4. Initial reconnect proposal restored local deletions. **Superseded:** synchronize all changes, explicitly including deletions after intentional disconnection.
5. No Restore command, but dragging out of Trash is allowed. **Latest correction:** dragging into Trash is also allowed; creating inside Trash is not.
6. Both bookmark and collection ordering synchronize.
7. No Collections wrapper: screenshot folders are collections, including parent collections that also hold links. No All bookmarks view.
8. Default Raindrop icon is customizable and retained while disconnected.
9. Healthy initial load/reconnect block editing. Interrupted load/reconnect unlock downloaded content.
10. Only one actively connected account. Read-only collections are excluded.
11. Real OAuth registration was deferred. The user ended the interview and requested the next preparation materials.

### Evidence reviewed

- Current repository: manifest, background worker, README checks, native bookmark storage, Undo recreation, search and menu markup. No implementation changes made for this brief.
- [Raindrop OAuth](https://developer.raindrop.io/v1/authentication/token): registered app, secret-based exchange and refresh.
- [Raindrop single bookmark API](https://developer.raindrop.io/v1/raindrops/single): bookmark CRUD and Trash deletion semantics.
- [Raindrop multiple bookmark API](https://developer.raindrop.io/v1/raindrops/multiple): pagination and bulk operations.
- [Raindrop collection methods](https://developer.raindrop.io/v1/collections/methods): hierarchy and collection deletion.
- [Raindrop nested structure](https://developer.raindrop.io/v1/collections/nested-structure): sidebar groups and separate root/nested ordering.
- [Raindrop API overview](https://developer.raindrop.io/): request limits and API conventions.
- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks): native tree properties/events and browser-protected roots.

Public documentation supports feasibility, not a tested promise of exact reconciliation. Live authorization, timestamp behavior and destructive operation semantics remain unverified in this project.
