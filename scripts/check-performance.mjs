// Run: node --experimental-vm-modules scripts/check-performance.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const events = new Map();
const counts = { tree: 0, children: 0, get: 0, fetch: 0, open: 0 };
let tree = [{ id: '0', children: [{ id: '2', title: 'Root', children: [
  { id: 'a', parentId: '2', title: 'A', children: [
    { id: 'b', parentId: 'a', title: 'B', children: [] },
    { id: 'link', parentId: 'a', title: 'Link', url: 'https://example.com' }
  ] }
] }] }];
let readTree = async () => structuredClone(tree);
let databaseRequest;
const selectors = [];
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, URL, setTimeout, clearTimeout,
  CSS: { escape: value => value },
  document: { getElementById: () => ({}), querySelectorAll: selector => { selectors.push(selector); return []; } },
  indexedDB: { open() { counts.open++; return databaseRequest = {}; } },
  fetch: async () => { counts.fetch++; return { status: 404 }; },
  chrome: { bookmarks: new Proxy({
    getTree: () => { counts.tree++; return readTree(); },
    getChildren: async () => { counts.children++; return [{ id: 'fresh', title: 'Fresh' }]; },
    get: async id => { counts.get++; return [{ id, title: 'Fresh' }]; }
  }, { get(target, key) {
    if (key in target) return target[key];
    return { addListener(listener) {
      if (!events.has(key)) events.set(key, []);
      events.get(key).push(listener);
    } };
  } }) }
});
const modules = new Map();
function load(url) {
  const id = url.href;
  if (!modules.has(id)) modules.set(id, new vm.SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: id }));
  return modules.get(id);
}
const search = load(new URL('modules/search.js', root));
await search.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
await search.evaluate();
const storage = load(new URL('modules/storage.js', root)).namespace;
const utils = load(new URL('modules/utils.js', root)).namespace;
const emit = name => events.get(name).forEach(listener => listener());
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

await Promise.all([storage.loadBookmarkSearchEntries(), storage.getLinkCountInFolder('2')]);
assert.equal(counts.tree, 1, 'Concurrent readers share a single tree request');
assert.equal(await storage.getFolderDescendantCount('2'), 2);
const children = await storage.getBookmarks('a');
assert.equal(children.length, 2);
assert(!('children' in children[0]), 'Keep native getChildren item shape');
children[0].title = 'Changed by caller';
children.pop();
assert.equal((await storage.getBookmarkById('b')).title, 'B', 'Do not expose cached objects for mutation');
assert.equal((await storage.getBookmarks('a')).length, 2);
assert(await storage.isFolderOrDescendant('a', 'b'));
assert(await storage.isFolderOrDescendant('a', 'a'));
assert.equal(await storage.isFolderOrDescendant('b', 'a'), false);
assert.equal(await storage.isFolderOrDescendant('link', 'b'), false);
assert.equal(counts.children + counts.get, 0, 'Cached navigation and ancestry need no per-node API reads');

for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
  emit(event);
  assert.equal(storage.getCachedBookmarkSearchEntries(), null);
  assert.equal((await storage.getBookmarkById('b')).title, 'Fresh', 'Invalidated cache must not hide native changes');
  await storage.loadBookmarkSearchEntries();
  assert.equal((await storage.getBookmarkById('b')).title, 'B');
}

// A delayed response from before a mutation must never become the current cache.
emit('onChanged');
let finishStale;
readTree = () => new Promise(resolve => { finishStale = resolve; });
const pending = storage.loadBookmarkSearchEntries();
emit('onChanged');
tree[0].children[0].children[0].title = 'Renamed';
readTree = async () => structuredClone(tree);
finishStale([{ id: '0', children: [] }]);
await pending;
assert.equal((await storage.getBookmarkById('a')).title, 'Renamed');

search.namespace.initSearchElements();
await flush();
const readsBefore = counts.tree;
for (let i = 0; i < 30; i++) emit('onMoved');
await flush();
assert.equal(counts.tree, readsBefore, 'Closed search does not fetch a tree per mutation');
assert.equal((await storage.getBookmarks('a'))[0].id, 'fresh', 'Cold reads retain the direct API fallback');

readTree = async () => { throw new Error('Offline API'); };
await assert.rejects(storage.isFolderOrDescendant('a', 'b'), /Cannot validate/);
readTree = async () => structuredClone(tree);
await storage.loadBookmarkSearchEntries();
assert.equal((await storage.getBookmarkById('a')).title, 'Renamed', 'Tree reads recover after failure');

// Initial icon requests must wait for persisted cache, not duplicate the network fetch.
const opening = storage.initFaviconCache();
const openingAgain = storage.initFaviconCache();
const icon = storage.fetchAndCacheFavicon('https://example.com/page');
await flush();
assert.equal(counts.open, 1);
assert.equal(counts.fetch, 0);
databaseRequest.onsuccess({ target: { result: {
  transaction() { return { objectStore() { return {
    get() {
      const request = { result: { timestamp: Date.now(), dataUrl: 'data:image/png;base64,cached' } };
      queueMicrotask(() => request.onsuccess());
      return request;
    }
  }; } }; }
} } });
await Promise.all([opening, openingAgain]);
assert.equal(await icon, 'data:image/png;base64,cached');
assert.equal(counts.fetch, 0, 'Persisted icon avoids a network request');
assert(selectors.every(selector => selector.includes('example.com')), 'Only visit placeholders for the resolved domain');
assert.equal(utils.escapeHtml('<a title="x">&\'</a>'), '&lt;a title=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
assert.equal(utils.escapeHtml(null), '');
console.log('Passed: shared reads, cache isolation, six invalidation events, mutation during read, cold fallback, closed-search batches, ancestry failure/recovery, persisted favicon startup and HTML escaping.');

// Selection must read every row before changing any geometry or selection class.
{
  const source = readFileSync(new URL('modules/interactions.js', root), 'utf8');
  const selectionSource = source.slice(source.indexOf('export function elementIntersectsBox'),
    source.indexOf('export function endBoxSelection')).replaceAll('export ', '');
  const operations = [];
  let bookmarkReads = 0;
  const rows = Array.from({ length: 200 }, (_, i) => ({
    dataset: { itemId: String(i) },
    getBoundingClientRect() { operations.push('read'); return { left: 0, right: 100, top: i * 40, bottom: i * 40 + 40 }; }
  }));
  const selectionContext = vm.createContext({
    isSearchMode: false, isBoxSelecting: true,
    selectionBox: { startX: 0, startY: 0 },
    selectionBoxElement: { style: new Proxy({}, { set() { operations.push('write'); return true; } }) },
    setSelectionBox(value) { selectionContext.selectionBox = value; },
    document: { querySelectorAll: () => rows },
    selectItem() { operations.push('write'); }, deselectItem() { operations.push('write'); },
    updateSelectionStyling() {}, getTotalBookmarkCount() { bookmarkReads++; return 1; }
  });
  vm.runInContext(selectionSource + '\nthis.update = updateBoxSelection; this.start = startBoxSelection;', selectionContext);
  selectionContext.update({ clientX: 100, clientY: 500, shiftKey: false });
  assert.equal(operations.filter(op => op === 'read').length, 200);
  assert(operations.lastIndexOf('read') < operations.indexOf('write'));
  await selectionContext.start({ button: 0, target: { closest: () => ({}) } });
  await selectionContext.start({ button: 2 });
  assert.equal(bookmarkReads, 0, 'Row and secondary clicks must not read bookmark data for selection');
}
console.log('Passed: 200-row box-selection read/write batching and click early exits.');
