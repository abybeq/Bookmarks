// Run from the extension's DevTools console in Helium:
// await (await import('./scripts/check-drag-browser.js')).runDragChecks()
// Uses an isolated temporary bookmark folder; restores navigation and removes it.
export async function runDragChecks() {
  const state = await import('../modules/state.js');
  const interactions = await import('../modules/interactions.js');
  const navigation = await import('../modules/navigation.js');
  const { renderItems } = await import('../modules/render.js');
  const previousFolder = state.currentFolderId;
  const previousUndo = [...state.undoStack];
  const root = await chrome.bookmarks.create({ parentId: '1', title: 'Drag automated QA' });
  const results = [];
  const wait = () => new Promise(resolve => setTimeout(resolve, 250));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const navigate = async id => {
    await navigation.navigateToFolder(id, false, false, {
      renderItems, renderBreadcrumb: navigation.renderBreadcrumb, restoreFullPath: true
    });
    await wait();
  };
  const row = id => document.querySelector(`.list-item[data-item-id="${id}"]`);
  let transfer;
  function event(type, target, fraction = .5) {
    const rect = target.getBoundingClientRect();
    const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer,
      clientX: rect.left + 50, clientY: rect.top + rect.height * fraction });
    target.dispatchEvent(e);
    return e;
  }
  async function start(id) {
    transfer = new DataTransfer();
    event('dragstart', row(id));
    await wait();
    assert(document.querySelector('.drag-placeholder'), 'Missing placeholder');
  }
  async function over(target, fraction = .5) {
    event('dragover', target, fraction);
    await wait();
  }
  async function drop(target) {
    event('drop', target);
    for (let i = 0; i < 20 && state.isDragging; i++) await wait();
    assert(!state.isDragging, 'Landing did not finish');
  }
  const children = async id => (await chrome.bookmarks.getChildren(id)).map(item => item.id);
  try {
    const a = await chrome.bookmarks.create({ parentId: root.id, title: 'Folder A' });
    const b = await chrome.bookmarks.create({ parentId: root.id, title: 'Folder B' });
    const c = await chrome.bookmarks.create({ parentId: root.id, title: 'Folder C' });
    const links = [];
    for (const title of ['One', 'Two', 'Three']) links.push(await chrome.bookmarks.create({
      parentId: root.id, title, url: 'https://example.com/' + title
    }));
    await navigate(root.id);
    await start(c.id);
    const preview = document.querySelector('.drag-preview');
    assert(getComputedStyle(preview).backgroundColor === getComputedStyle(document.body).backgroundColor, 'Primary background');
    assert(getComputedStyle(preview).boxShadow !== 'none', 'Missing menu shadow');
    assert(!preview.querySelector('.list-item-meta'), 'Metadata leaked into preview');
    await over(row(a.id), .05);
    assert(!document.querySelector('.folder-drop-target'), 'Reorder also highlights folder');
    await drop(document.querySelector('.drag-placeholder'));
    assert((await children(root.id)).slice(0, 3).join() === [c.id, a.id, b.id].join(), 'Folder reorder up');
    results.push('folder reorder up / primary / shadow / metadata');
    await start(c.id);
    await over(row(b.id), .95);
    await drop(document.querySelector('.drag-placeholder'));
    assert((await children(root.id)).slice(0, 3).join() === [a.id, b.id, c.id].join(), 'Folder reorder down');
    results.push('folder reorder down');
    await start(links[2].id);
    await over(row(links[0].id), .2);
    await drop(document.querySelector('.drag-placeholder'));
    assert((await children(root.id)).slice(3).join() === [links[2].id, links[0].id, links[1].id].join(), 'Link reorder');
    results.push('link reorder');
    await start(a.id);
    event('dragover', row(b.id));
    assert(!document.querySelector('.folder-drop-target'), 'Folder activated without dwell');
    await wait();
    assert(row(b.id).classList.contains('folder-drop-target'), 'No folder target');
    assert(document.querySelector('.drag-preview.is-compact'), 'Preview did not shrink');
    await over(row(c.id), .05);
    assert(!document.querySelector('.drag-preview.is-compact'), 'Preview did not expand');
    await over(row(b.id));
    await drop(row(b.id));
    assert((await chrome.bookmarks.get(a.id))[0].parentId === b.id, 'Folder nesting');
    assert(state.currentFolderId === root.id, 'Folder auto-opened');
    results.push('dwell / shrink / expand / nesting without navigation');
    await navigate(b.id);
    await start(a.id);
    const crumb = document.querySelector(`.breadcrumb-item[data-folder-id="${root.id}"]`);
    assert(crumb, 'Missing parent breadcrumb');
    await over(crumb);
    assert(crumb.classList.contains('breadcrumb-drop-target'), 'Breadcrumb not highlighted');
    await drop(crumb);
    assert((await chrome.bookmarks.get(a.id))[0].parentId === root.id, 'Breadcrumb move');
    results.push('move folder to parent breadcrumb');
    await navigate(root.id);
    state.addToSelection(links[0].id);
    state.addToSelection(links[1].id);
    await start(links[0].id);
    await over(row(b.id));
    assert(document.querySelector('.drag-preview-count').textContent === '2', 'Multi count');
    await drop(row(b.id));
    assert((await children(b.id)).join() === [links[0].id, links[1].id].join(), 'Multi move');
    results.push('multiple bookmarks into folder');
    await start(a.id);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait();
    assert(!document.querySelector('.drag-preview') && !state.isDragging, 'Escape cleanup');
    assert(state.currentFolderId === root.id, 'Escape navigated');
    results.push('Escape cancels without navigation');
    // A visible descendant can occur in search results. Use the real folder IDs.
    await chrome.bookmarks.move(a.id, { parentId: b.id });
    await navigate(root.id);
    const descendant = row(c.id);
    descendant.dataset.itemId = a.id;
    await start(b.id);
    await over(descendant);
    assert(!descendant.classList.contains('folder-drop-target'), 'Descendant accepted');
    await drop(descendant);
    assert((await chrome.bookmarks.get(b.id))[0].parentId === root.id, 'Invalid move changed parent');
    results.push('descendant rejected');
    await navigate(root.id);
    await start(c.id);
    const invalidTarget = document.createElement('span');
    invalidTarget.className = 'breadcrumb-item';
    invalidTarget.dataset.folderId = c.id;
    document.getElementById('breadcrumb').appendChild(invalidTarget);
    invalidTarget.textContent = 'Self';
    await over(invalidTarget);
    assert(!invalidTarget.classList.contains('breadcrumb-drop-target'), 'Self accepted');
    await drop(invalidTarget);
    invalidTarget.remove();
    results.push('self rejected');
    await navigate(root.id);
    const originalMove = chrome.bookmarks.move;
    await start(c.id);
    await over(row(b.id));
    chrome.bookmarks.move = async () => { throw new Error('Intentional QA failure'); };
    try { await drop(row(b.id)); } finally { chrome.bookmarks.move = originalMove; }
    assert((await chrome.bookmarks.get(c.id))[0].parentId === root.id, 'Failure moved data');
    assert(!state.isDragging && !document.querySelector('.drag-placeholder'), 'Failure cleanup');
    results.push('move failure restores UI');
    return results;
  } finally {
    interactions.cleanupDragState();
    state.clearSelectionState();
    state.undoStack.splice(0, state.undoStack.length, ...previousUndo);
    await navigate(previousFolder);
    await chrome.bookmarks.removeTree(root.id);
  }
}
