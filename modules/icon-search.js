import { FOLDER_ICON_NAMES, SEARCH_TERMS } from './font-awesome.js';

const tokenize = text => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
let searchWords;

export function searchFolderIcons(query) {
  const words = tokenize(query);
  if (words.length === 0) return [...FOLDER_ICON_NAMES];
  // Build the picker index only when the user searches for an icon.
  if (!searchWords) {
    searchWords = new Map(FOLDER_ICON_NAMES.map(name => [
      name, tokenize([name, ...(SEARCH_TERMS[name] || [])].join(' '))
    ]));
  }
  return FOLDER_ICON_NAMES.filter(name =>
    words.every(word => searchWords.get(name).some(term => term.startsWith(word)))
  );
}

export function getIconOptionScrollDelta(
  optionRect,
  viewportRect,
  bottomInset = 8,
  topInset = 48
) {
  const bottomBoundary = viewportRect.bottom - bottomInset;
  if (optionRect.bottom > bottomBoundary) {
    return optionRect.bottom - bottomBoundary;
  }
  const topBoundary = viewportRect.top + topInset;
  if (optionRect.top < topBoundary) {
    return optionRect.top - topBoundary;
  }
  return 0;
}
