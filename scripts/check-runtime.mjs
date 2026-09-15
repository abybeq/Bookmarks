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
const rows = ['google', 'chatgpt'].map(provider => {
  const element = fakeElement();
  element.dataset = { type: provider === 'google' ? 'suggestion' : 'chatgpt', provider, suggestion: query };
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
const scrolls = [];
context.window = {
  location: { href: '' }, innerHeight: 900,
  open: (url, target) => opened.push({ url, target }),
  scrollBy() {}, scrollTo: options => scrolls.push(options.top)
};
context.chrome = { bookmarks: new Proxy({ getTree: async () => [] }, {
  get: (target, key) => target[key] || { addListener() {} }
}) };
const keyboard = load(path.join(root, 'modules/keyboard.js'));
await keyboard.evaluate();
const searchUI = load(path.join(root, 'modules/search.js')).namespace;
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
  ['focusPreviousItem', -1, 'Google'],
  ['focusPreviousItem', -2, 'ChatGPT'],
  ['focusPreviousItem', -2, 'ChatGPT'],
  ['focusNextItem', -1, 'Google'],
  ['focusNextItem', 0, 'Google'],
  ['focusNextItem', 1, 'ChatGPT']
]) {
  keyboard.namespace[move]();
  assert.equal(state.focusedItemIndex, expectedIndex);
  assert.equal(elements.get('search-result-type').textContent, expectedLabel);
  assert.equal(elements.get('search-input').value, query);
}
assert(scrolls.length >= 3 && scrolls.every(top => top === 0));
function verifyDestination(href, provider) {
  const url = new URL(href);
  assert.equal(url.hostname, provider === 'chatgpt' ? 'chat.com' : 'www.google.com');
  assert.equal(url.searchParams.get('q'), query);
  if (provider === 'chatgpt') assert.equal(url.searchParams.get('submit'), 'false');
}
await keyboard.namespace.activateFocusedItem();
verifyDestination(context.window.location.href, 'chatgpt');
keyboard.namespace.focusItem(0);
await keyboard.namespace.activateFocusedItem(true);
verifyDestination(opened.at(-1).url, 'google');
keyboard.namespace.focusPreviousItem();
keyboard.namespace.focusPreviousItem();
await listeners.get('keydown')({ key: 'Enter', preventDefault() {}, metaKey: true });
verifyDestination(opened.at(-1).url, 'chatgpt');
assert.equal(opened.at(-1).target, '_blank');
for (const provider of ['google', 'chatgpt']) {
  utils.openAskTarget(query, provider);
  verifyDestination(context.window.location.href, provider);
}
console.log('Passed: Ask target order, labels, return navigation, scroll-to-top, Enter, new tabs and Unicode URL encoding.');

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
