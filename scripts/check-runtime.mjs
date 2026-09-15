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
const { searchFolderIcons } = search.namespace;
const { FOLDER_ICON_NAMES } = load(path.join(root, 'modules/font-awesome.js')).namespace;
assert.deepEqual([...searchFolderIcons('')], [...FOLDER_ICON_NAMES]);
assert.deepEqual([...searchFolderIcons('!!!')], [...FOLDER_ICON_NAMES]);
assert.deepEqual([...searchFolderIcons('FOLDER CLOSED')], [...searchFolderIcons('folder-closed')]);
assert(searchFolderIcons('fold clos').includes('folder-closed'));
assert.equal(searchFolderIcons('notaniconxyz').length, 0);
console.log(`Passed: ${modules.size} linked modules, DOM references and icon search.`);
