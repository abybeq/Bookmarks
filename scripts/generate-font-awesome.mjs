import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('icon-sources/font-awesome-solid/metadata.json', root), 'utf8'));
const icons = {};
const searchTerms = {};
for (const [name, icon] of Object.entries(metadata)) {
  if (!icon.styles.includes('solid')) continue;
  const { width, height, path } = icon.svg.solid;
  // Match the old set's 48/64 optical area and center narrow/wide glyphs.
  const size = Math.max(width, height) * 4 / 3;
  icons[name] = {
    viewBox: `${(width - size) / 2} ${(height - size) / 2} ${size} ${size}`,
    paths: (Array.isArray(path) ? path : [path]).map(d => ({ d }))
  };
  searchTerms[name] = [...new Set([...(icon.search?.terms || []), ...(icon.aliases?.names || [])])];
}
const priority = ['folder-closed', 'folder', 'folder-plus', 'inbox', 'box-archive', 'bookmark', 'paperclip', 'tag', 'thumbtack', 'briefcase', 'calendar', 'list-check', 'clock', 'bullseye', 'file-lines', 'book', 'graduation-cap', 'code', 'laptop', 'palette', 'pen', 'camera', 'layer-group', 'envelope', 'comment', 'users', 'music', 'headphones', 'gamepad', 'cart-shopping', 'plane', 'map', 'house', 'heart', 'star'];
const names = [...priority, ...Object.keys(icons).filter(name => !priority.includes(name))];
const output = new URL('modules/font-awesome.js', root);
await writeFile(output, `// Generated from Font Awesome Free 6.7.2 (CC BY 4.0). See THIRD_PARTY_NOTICES.md.\n// Run node scripts/generate-font-awesome.mjs to regenerate.\nexport const ICONS = ${JSON.stringify(icons)};\nexport const FOLDER_ICON_NAMES = ${JSON.stringify(names)};\nexport const SEARCH_TERMS = ${JSON.stringify(searchTerms)};\n`);
console.log(`Generated ${names.length} Font Awesome Solid icons: ${fileURLToPath(output)}`);
