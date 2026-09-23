// Run with: node --experimental-vm-modules scripts/check-runtime.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({});
const modules = new Map();
function load(filename) {
  if (!modules.has(filename)) {
    modules.set(filename, new vm.SourceTextModule(readFileSync(filename, 'utf8'), {
      context, identifier: filename
    }));
  }
  return modules.get(filename);
}

// Link every reachable module without running the app or accessing browser data.
const main = load(path.join(root, 'main.js'));
await main.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));

const html = readFileSync(path.join(root, 'newtab.html'), 'utf8');
const mainSource = readFileSync(path.join(root, 'main.js'), 'utf8');
const storageSource = readFileSync(path.join(root, 'modules/storage.js'), 'utf8');
assert.match(storageSource, /addEventListener\('mouseenter',[\s\S]*?renderTheme\(option\.getAttribute\('data-theme'\)\)/);
assert.match(storageSource, /addEventListener\('mouseleave',[\s\S]*?renderTheme\(currentTheme\)/);
assert.match(storageSource, /export function hideThemePicker\(\) \{[\s\S]*?renderTheme\(currentTheme\)/);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
for (const module of modules.values()) {
  const source = readFileSync(module.identifier, 'utf8');
  for (const [, id] of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
    assert(ids.has(id), `${path.basename(module.identifier)} references missing #${id}`);
  }
}

const search = load(path.join(root, 'modules/icon-search.js'));
await search.evaluate();
const { getIconOptionScrollDelta, searchFolderIcons } = search.namespace;
const { FOLDER_ICON_NAMES } = load(path.join(root, 'modules/font-awesome.js')).namespace;
assert.deepEqual([...searchFolderIcons('')], [...FOLDER_ICON_NAMES]);
assert.deepEqual([...searchFolderIcons('!!!')], [...FOLDER_ICON_NAMES]);
assert.deepEqual([...searchFolderIcons('FOLDER CLOSED')], [...searchFolderIcons('folder-closed')]);
assert(searchFolderIcons('fold clos').includes('folder-closed'));
assert.equal(searchFolderIcons('notaniconxyz').length, 0);
assert.equal(
  getIconOptionScrollDelta({ top: 188, bottom: 220 }, { top: 48, bottom: 228 }),
  0
);
assert.equal(
  getIconOptionScrollDelta({ top: 192, bottom: 224 }, { top: 48, bottom: 228 }),
  4
);
assert.equal(
  getIconOptionScrollDelta({ top: 92, bottom: 124 }, { top: 48, bottom: 228 }),
  -4
);
console.log(`Passed: ${modules.size} linked modules, DOM references and icon search.`);

// Verify the input targets above results, both list actions, and URL encoding.
const elements = new Map();
const listeners = new Map();
function fakeElement(tagName = 'DIV') {
  const classes = new Set();
  return {
    tagName, dataset: {}, value: '', textContent: '', innerHTML: '',
    classList: {
      add: value => classes.add(value), remove: value => classes.delete(value),
      contains: value => classes.has(value)
    },
    focus() { context.document.activeElement = this; },
    getBoundingClientRect: () => ({ top: 160, bottom: 200 })
  };
}
for (const id of ids) elements.set(id, fakeElement(id === 'search-input' ? 'INPUT' : 'DIV'));
const query = 'Что такое love? & + # / 😀';
const rows = ['search', 'chatgpt'].map(provider => {
  const element = fakeElement();
  element.dataset = { type: provider === 'search' ? 'suggestion' : 'chatgpt', provider, suggestion: query };
  element.classList.add('suggestion-item');
  return element;
});
elements.get('items-grid').querySelectorAll = selector => selector.includes('keyboard-focused')
  ? rows.filter(row => row.classList.contains('keyboard-focused')) : rows;
context.document = {
  getElementById: id => elements.get(id),
  createElement: tagName => fakeElement(tagName.toUpperCase()),
  addEventListener: (event, listener) => listeners.set(event, listener)
};
const opened = [];
const webSearches = [];
const scrolls = [];
context.window = {
  location: { href: '' }, innerHeight: 900,
  open: (url, target) => opened.push({ url, target }),
  scrollBy() {}, scrollTo: options => scrolls.push(options.top)
};
context.navigator = { clipboard: { writeText: async value => { context.copiedText = value; } } };
context.chrome = {
  bookmarks: new Proxy({
    getTree: async () => [],
    get: async id => [{
      id: String(id),
      title: `Bookmark ${id}`,
      url: String(id) === '1' ? undefined : `https://${id}.test`
    }]
  }, {
    get: (target, key) => target[key] || { addListener() {} }
  }),
  search: { query: async info => { webSearches.push(info); } }
};
const keyboard = load(path.join(root, 'modules/keyboard.js'));
await keyboard.evaluate();
const searchUI = load(path.join(root, 'modules/search.js')).namespace;
const candidates = [
  ['url', 'Unrelated', 'https://figma-design.example'],
  ['middle', 'My Figma Design', 'https://example.com'],
  ['prefix', 'Figma Design System', 'https://example.com'],
  ['exact', 'Figma Design', 'https://example.com'],
  ['mixed', 'Figma', 'https://design.example'],
  ['miss', 'Figma', 'https://example.com']
].map(([id, title, url]) => ({ item: { id, title, url }, title: title.toLowerCase(), url: url.toLowerCase() }));
assert.deepEqual(
  Array.from(searchUI.rankBookmarkEntries(candidates, 'design figma'), entry => entry.item.id),
  ['exact', 'prefix', 'middle', 'mixed', 'url']
);
assert.deepEqual(
  Array.from(searchUI.rankBookmarkEntries(candidates, 'figma design'), entry => entry.item.id),
  ['exact', 'prefix', 'middle', 'mixed', 'url']
);
assert.deepEqual(Array.from(searchUI.highlightRanges('Figma Design', ['figma', 'design']), range => Array.from(range)), [[0, 5], [6, 12]]);
assert.deepEqual(Array.from(searchUI.highlightRanges('foobar', ['foo', 'oob']), range => Array.from(range)), [[0, 4]]);
searchUI.initSearchElements();
await new Promise(resolve => setImmediate(resolve));
const state = load(path.join(root, 'modules/state.js')).namespace;
const utils = load(path.join(root, 'modules/utils.js')).namespace;
state.setIsSearchMode(true);
state.setSearchQuery(query);
state.setOriginalSearchQuery(query);
keyboard.namespace.initKeyboardElements();
keyboard.namespace.initKeyboardShortcuts();
keyboard.namespace.focusItem(0);
for (const [move, expectedIndex, expectedLabel] of [
  ['focusPreviousItem', -1, 'Search'],
  ['focusPreviousItem', -2, 'ChatGPT'],
  ['focusPreviousItem', -2, 'ChatGPT'],
  ['focusNextItem', -1, 'Search'],
  ['focusNextItem', 0, 'Search'],
  ['focusNextItem', 1, 'ChatGPT']
]) {
  keyboard.namespace[move]();
  assert.equal(state.focusedItemIndex, expectedIndex);
  assert.equal(elements.get('search-result-type').textContent, expectedLabel);
  assert.equal(elements.get('search-input').value, query);
}
assert(scrolls.length >= 3 && scrolls.every(top => top === 0));
function verifyChatGPTDestination(href) {
  const url = new URL(href);
  assert.equal(url.hostname, 'chat.com');
  assert.equal(url.searchParams.get('q'), query);
  assert.equal(url.searchParams.get('submit'), 'false');
}
await keyboard.namespace.activateFocusedItem();
verifyChatGPTDestination(context.window.location.href);
keyboard.namespace.focusItem(0);
await keyboard.namespace.activateFocusedItem(true);
assert.equal(webSearches.at(-1).text, query);
assert.equal(webSearches.at(-1).disposition, 'NEW_TAB');
keyboard.namespace.focusPreviousItem();
keyboard.namespace.focusPreviousItem();
await listeners.get('keydown')({ key: 'Enter', preventDefault() {}, metaKey: true });
verifyChatGPTDestination(opened.at(-1).url);
assert.equal(opened.at(-1).target, '_blank');
await utils.openAskTarget(query, 'search');
assert.equal(webSearches.at(-1).text, query);
assert.equal(webSearches.at(-1).disposition, 'CURRENT_TAB');
utils.openAskTarget(query, 'chatgpt');
verifyChatGPTDestination(context.window.location.href);
console.log('Passed: Search target order, labels, default-provider API, return navigation, scroll-to-top, Enter, new tabs and Unicode URL encoding.');

state.setIsSearchMode(false);
state.setSearchQuery('');
state.setCurrentFolderId(state.ROOT_FOLDER_ID);
rows.forEach((row, index) => {
  row.dataset = { type: index === 0 ? 'folder' : 'link', itemId: String(index + 1) };
  row.classList.remove('suggestion-item');
});
const thirdKeyboardRow = fakeElement();
thirdKeyboardRow.dataset = { type: 'link', itemId: '3' };
rows.push(thirdKeyboardRow);
let themePickerOpen = false;
const themePickerMoves = [];
let themePickerConfirmations = 0;
const keyboardSelectedIds = new Set();
const keyboardMoveDirections = [];
const cutBookmarkIds = [];
keyboard.namespace.setKeyboardCallbacks({
  isThemePickerOpen: () => themePickerOpen,
  hideThemePicker: () => { themePickerOpen = false; },
  moveThemePickerSelection: key => { themePickerMoves.push(key); },
  confirmThemePickerSelection: () => {
    themePickerConfirmations++;
    themePickerOpen = false;
  },
  getSelectionSize: () => keyboardSelectedIds.size,
  getSelectedIds: () => [...keyboardSelectedIds],
  cutBookmarks: async idsToCut => { cutBookmarkIds.push(...idsToCut); },
  setItemSelection: idsToSelect => {
    keyboardSelectedIds.clear();
    idsToSelect.forEach(id => keyboardSelectedIds.add(id));
    rows.forEach(item => {
      if (keyboardSelectedIds.has(item.dataset.itemId)) item.classList.add('selected');
      else item.classList.remove('selected');
    });
  },
  moveFocusedItems: async (direction, focusedIds) => {
    keyboardMoveDirections.push({ direction, focusedIds });
    return true;
  }
});
keyboard.namespace.focusItem(0);
let rootEscapePrevented = false;
await listeners.get('keydown')({
  key: 'Escape',
  preventDefault() { rootEscapePrevented = true; }
});
assert(rootEscapePrevented);
assert.equal(state.focusedItemIndex, -1);
assert(rows.every(row => !row.classList.contains('keyboard-focused')));
console.log('Passed: Escape clears keyboard focus in the root folder.');

keyboard.namespace.focusItem(0);
themePickerOpen = true;
for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
  let prevented = false;
  let stopped = false;
  await listeners.get('keydown')({
    key,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  });
  assert(prevented);
  assert(stopped);
  assert.equal(themePickerMoves.at(-1), key);
}
assert.equal(state.focusedItemIndex, 0);
console.log('Passed: arrows, Home and End change the Customize theme without navigating the item list.');

for (const key of ['Enter', ' ']) {
  themePickerOpen = true;
  let prevented = false;
  let stopped = false;
  await listeners.get('keydown')({
    key,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  });
  assert(prevented);
  assert(stopped);
  assert.equal(themePickerOpen, false);
}
assert.equal(themePickerConfirmations, 2);
assert.equal(state.focusedItemIndex, 0);
console.log('Passed: Enter and Space confirm the theme, close Customize and stay out of the item list.');

themePickerOpen = true;
let customizeEscapePrevented = false;
await listeners.get('keydown')({
  key: 'Escape',
  preventDefault() { customizeEscapePrevented = true; }
});
assert(customizeEscapePrevented);
assert.equal(themePickerOpen, false);
assert.equal(state.focusedItemIndex, 0);
console.log('Passed: Escape closes Customize before changing list focus.');

context.document.activeElement = elements.get('items-grid');
keyboard.namespace.focusItem(0);
let shiftArrowPrevented = false;
await listeners.get('keydown')({
  key: 'ArrowDown', shiftKey: true,
  preventDefault() { shiftArrowPrevented = true; }
});
assert(shiftArrowPrevented);
assert.deepEqual([...keyboardSelectedIds], ['1', '2']);
assert.equal(state.focusedItemIndex, 1);
await listeners.get('keydown')({ key: 'ArrowDown', shiftKey: true, preventDefault() {} });
assert.deepEqual([...keyboardSelectedIds], ['1', '2', '3']);
assert.equal(state.focusedItemIndex, 2);
await listeners.get('keydown')({ key: 'ArrowUp', shiftKey: true, preventDefault() {} });
assert.deepEqual([...keyboardSelectedIds], ['1', '2']);
assert.equal(state.focusedItemIndex, 1);
console.log('Passed: Shift+arrows grow and shrink selection around the original anchor.');

keyboardSelectedIds.clear();
rows.forEach(item => item.classList.remove('selected'));
keyboard.namespace.focusItem(1);
let optionArrowPrevented = false;
await listeners.get('keydown')({
  key: 'ArrowDown', altKey: true,
  preventDefault() { optionArrowPrevented = true; }
});
assert(optionArrowPrevented);
assert.deepEqual([...keyboardSelectedIds], []);
assert.equal(keyboardMoveDirections.length, 1);
assert.equal(keyboardMoveDirections[0].direction, 1);
assert.deepEqual([...keyboardMoveDirections[0].focusedIds], ['2']);
assert.equal(state.focusedItemIndex, 1);
console.log('Passed: Option+Down moves the focused item without creating separate selection state.');

keyboardSelectedIds.clear();
keyboard.namespace.focusItem(1);
let cutPrevented = false;
await listeners.get('keydown')({
  key: 'x', metaKey: true,
  preventDefault() { cutPrevented = true; }
});
assert(cutPrevented);
assert.equal(context.copiedText, 'https://2.test');
assert.deepEqual(cutBookmarkIds, ['2']);
console.log('Passed: Cmd+X copies and cuts the focused bookmark.');

const interactionsModule = load(path.join(root, 'modules/interactions.js'));
await interactionsModule.evaluate();
const reorderSelectedForKeyboard = interactionsModule.namespace.reorderSelectedForKeyboard;
const ordered = [
  { id: 'f1' }, { id: 'l1', url: 'https://1.test' },
  { id: 'f2' }, { id: 'l2', url: 'https://2.test' },
  { id: 'f3' }, { id: 'l3', url: 'https://3.test' }
];
assert.deepEqual(
  [...reorderSelectedForKeyboard(ordered, ['f2', 'l2'], -1)].map(item => item.id),
  ['f2', 'l2', 'f1', 'l1', 'f3', 'l3']
);
assert.deepEqual(
  [...reorderSelectedForKeyboard(ordered, ['f1', 'f2', 'l1', 'l2'], 1)].map(item => item.id),
  ['f3', 'l3', 'f1', 'l1', 'f2', 'l2']
);
console.log('Passed: keyboard reordering preserves selected order within folder and bookmark sections.');

const interactionsSource = readFileSync(path.join(root, 'modules/interactions.js'), 'utf8');
const keyboardContextMenuSource = interactionsSource.slice(
  interactionsSource.indexOf('export async function showContextMenuFromKeyboard()'),
  interactionsSource.indexOf('\nfunction updateVisibleFolderIcons')
);
assert(keyboardContextMenuSource.includes('const x = rect.left + rect.width / 2'));
assert(keyboardContextMenuSource.includes('const y = rect.top + rect.height / 2'));
assert(keyboardContextMenuSource.includes('x - menuRect.width / 2'));
assert(keyboardContextMenuSource.includes('contextMenu.style.left = `${centeredLeft}px`'));
console.log('Passed: keyboard context menu is horizontally centered over its item.');

const menuKeydownSource = interactionsSource.slice(
  interactionsSource.indexOf('function handleContextMenuKeydown('),
  interactionsSource.indexOf('\nexport async function showContextMenuFromKeyboard')
);
const activeMenuItem = { clicks: 0, click() { this.clicks++; } };
const activeMenu = {
  classList: { contains: value => value === 'active' },
  contains: item => item === activeMenuItem
};
let menuHidden = false;
const handleContextMenuKeydown = vm.runInNewContext(`(${menuKeydownSource})`, {
  document: { activeElement: { closest: () => activeMenuItem } },
  hideContextMenu: () => { menuHidden = true; },
  getVisibleContextMenuItems: () => [activeMenuItem],
  focusContextMenuItem() {}
});
for (const key of ['Enter', ' ']) {
  let prevented = false;
  let stopped = false;
  handleContextMenuKeydown({
    currentTarget: activeMenu,
    key,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  });
  assert(prevented && stopped);
}
assert.equal(activeMenuItem.clicks, 2);
handleContextMenuKeydown({
  currentTarget: activeMenu,
  key: 'Escape',
  preventDefault() {},
  stopPropagation() {}
});
assert(menuHidden);
console.log('Passed: context-menu Enter, Space and Escape stay inside the menu.');

const folderIconMenuSource = interactionsSource.slice(
  interactionsSource.indexOf('function showFolderIconMenu('),
  interactionsSource.indexOf('\nfunction renderFolderIconOptions')
);
assert(folderIconMenuSource.includes('searchInput.focus({ preventScroll: true })'));
assert(!folderIconMenuSource.includes('setTimeout'));

const bookmarkMoveListenerSource = mainSource.slice(
  mainSource.indexOf('chrome.bookmarks.onMoved.addListener'),
  mainSource.indexOf('// ============================================\n// INITIALIZATION')
);
assert(bookmarkMoveListenerSource.includes('if (isDragging || isKeyboardReorderActive()) return;'));
console.log('Passed: native bookmark move events cannot interrupt drag settlement rendering.');
console.log('Passed: Change icon focuses its search field immediately.');

const renderSource = readFileSync(path.join(root, 'modules/render.js'), 'utf8');
const inlineBookmarkHandlersSource = renderSource.slice(
  renderSource.indexOf('function attachInlineBookmarkInputHandlers()'),
  renderSource.indexOf('\nfunction updateInlineBookmarkFavicon')
);
assert(inlineBookmarkHandlersSource.includes("e.key === 'Tab' && mode === 'edit'"));
assert(inlineBookmarkHandlersSource.includes('inputs[nextIndex].focus({ preventScroll: true })'));
console.log('Passed: bookmark edit cycles Tab focus between name and URL.');

// Async history should replace automatic focus, but retain keyboard navigation.
const searchSource = readFileSync(path.join(root, 'modules/search.js'), 'utf8');
const historyRenderer = searchSource.slice(
  searchSource.indexOf('function renderHistory('),
  searchSource.indexOf('\nexport async function deleteHistoryUrl')
);
for (const navigated of [false, true]) {
  const selected = { dataset: { searchKey: 'query' } };
  const firstHistory = { dataset: { searchKey: 'history:example' } };
  const focusCalls = [];
  const indexCalls = [];
  const grid = { querySelector: () => selected };
  const render = vm.runInNewContext(`(${historyRenderer})`, {
    itemsGrid: grid,
    searchFocusWasNavigated: navigated,
    updateSection: () => ({ parentNode: grid }),
    historyRows: value => value,
    renderSearchCount() {},
    historyLimit: 8,
    getNavigableItems: () => [firstHistory, selected],
    setFocusedItemIndex: index => indexCalls.push(index)
  });
  render({ folders: [], links: [], chromePages: [] }, [{}], index => focusCalls.push(index));
  assert.deepEqual(focusCalls, navigated ? [] : [0]);
  assert.deepEqual(indexCalls, navigated ? [1] : []);
}
console.log('Passed: async history selects the first result and preserves explicit navigation.');
