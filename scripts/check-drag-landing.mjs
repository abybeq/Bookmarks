// Isolated lifecycle checks against the actual drag controller, without browser data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../modules/interactions.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
assert.match(styles, /\.multi-drop-expansion\s*\{[^}]*border-radius:\s*1\.25rem;/s,
  'The expanding group must keep rounded outer corners from its first frame');
const controller = source.slice(source.indexOf('let dragSession = null;'), source.indexOf('// GETTERS FOR MODAL')).replaceAll('export ', '');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

{
  const context = vm.createContext({
    getFolderIconSvg: () => 'default-folder',
    getIconSvg: name => `default-${name}`
  });
  vm.runInContext(controller + '\nthis.iconFor = getMultiDragIconSvg; this.titleFor = getMultiDragTitle;', context);
  assert.equal(context.iconFor(new Set(['folder'])), 'default-folder');
  assert.equal(context.iconFor(new Set(['link'])), 'default-bookmark');
  assert.equal(context.iconFor(new Set(['folder', 'link'])), 'default-folder');
  const rows = types => types.map(type => ({ dataset: { type } }));
  assert.equal(context.titleFor(rows(['folder', 'folder'])), '2 folders');
  assert.equal(context.titleFor(rows(['link', 'link', 'link'])), '3 bookmarks');
  assert.equal(context.titleFor(rows(['folder', 'folder', 'link', 'link', 'link'])),
    '2 folders and 3 bookmarks');
  assert.equal(context.titleFor(rows(['folder', 'link'])), '1 folder and 1 bookmark');
}
console.log('Passed: multi-drag icons and titles describe folder, bookmark and mixed groups.');
for (const reduced of [false, true]) {
  const saved = deferred();
  const animationDone = deferred();
  const rect = { left: 10, top: 40, width: 300, height: 40, right: 310, bottom: 80 };
  const row = id => ({ dataset: { itemId: id, type: 'link' }, style: {}, isConnected: true,
    classList: { remove() {} }, getAnimations: () => [], getBoundingClientRect: () => rect });
  const target = row('b');
  const original = row('a');
  const rendered = row('a');
  let renderFinished = false;
  let removed = false;
  let aborted = false;
  let duration;
  let landingBackgroundRemoved = false;
  const preview = { style: {}, classList: { remove() {} }, getBoundingClientRect: () => rect,
    remove() { removed = true; }, getAnimations: () => [],
    animate(frames, options) {
      assert(frames.every(frame => !('boxShadow' in frame)), 'Keep shadow throughout landing');
      duration = options.duration; return { finished: animationDone.promise }; } };
  const session = { ids: ['a'], rows: [original], sources: [original], primaryId: 'a',
    target, mode: 'before', folderId: 'root', preview,
    slot: { remove() {}, getBoundingClientRect: () => rect }, ghost: { remove() {} },
    controller: { abort() { aborted = true; } } };
  const context = vm.createContext({
    console, clearTimeout, cancelAnimationFrame() {},
    window: { innerWidth: 1200, innerHeight: 900, matchMedia: () => ({ matches: reduced }) },
    document: { body: { classList: { add() {}, remove() {} }, appendChild() {} },
      createElement: () => ({ style: {}, setAttribute() {}, remove() { landingBackgroundRemoved = true; } }),
      addEventListener() {}, removeEventListener() {}, elementFromPoint: () => null },
    itemsGrid: { getBoundingClientRect: () => ({ left: 10, right: 310, width: 300 }), querySelectorAll: () => [rendered] },
    getBookmarks: async () => [{ id: 'b' }, { id: 'a' }],
    saveMoveForUndo: async () => {},
    chrome: { bookmarks: { move: () => saved.promise } },
    renderItemsCallback: async () => { renderFinished = true; },
    setIsDragging() {}, setDraggedElement() {}, setDraggedItemType() {}, setDraggedItemIds() {},
    setDropPosition() {}, setDropTargetElement() {}, clearSelection() {},
    showNotification() {}
  });
  vm.runInContext(controller + '\nthis.start = value => { dragSession = value; }; this.finish = finishDrag; this.cancel = returnDraggedItem; this.update = updateDrag;', context);
  context.start(session);
  const finishing = context.finish({ preventDefault() {}, stopImmediatePropagation() {} });
  await flush();
  assert(aborted, 'Native dragend must not tear down the landing');
  assert.equal(duration, reduced ? 0 : 200);
  assert.equal(preview.style.translate, 'none', 'Landing resets pointer translation');
  assert(!removed && !renderFinished, 'Preview must survive a slow save');
  saved.resolve();
  await flush();
  assert(renderFinished && !removed, 'Fast render must not cut off the animation');
  assert(session.landingSlot && !landingBackgroundRemoved, 'Background survives list render');
  assert.equal(rendered.style.visibility, 'hidden', 'Avoid duplicate row beneath preview');
  animationDone.resolve();
  await finishing;
  assert(removed, 'Remove preview only after render and animation');
  assert(landingBackgroundRemoved, 'Remove background together with preview');
  assert.equal(rendered.style.visibility, '', 'Reveal real row at handoff');
  removed = false;
  const returning = deferred();
  preview.animate = () => ({ finished: returning.promise });
  session.settling = false;
  context.start(session);
  const cancelling = context.cancel();
  await flush();
  assert(!removed, 'Cancellation must animate rather than remove preview');
  assert.equal(original.style.visibility, 'hidden', 'Hide duplicate during return');
  returning.resolve();
  await cancelling;
  assert(removed);
  assert.equal(original.style.visibility, '', 'Cancellation restores original row');
  removed = false;
  session.settling = false;
  session.mode = 'before';
  session.target = target;
  session.offsetX = session.offsetY = 0;
  preview.style.setProperty = () => {};
  context.start(session);
  const dataTransfer = { dropEffect: 'none' };
  context.update({ clientX: 200, clientY: 600, dataTransfer, preventDefault() {} });
  assert.equal(dataTransfer.dropEffect, 'move', 'Empty space must receive native drop immediately');
  assert.equal(session.mode, null, 'Accepting the event must not accept an invalid destination');
  session.mode = 'after';
  session.target = target;
  session.rows = [original, target];
  context.update({ clientX: 200, clientY: 600, dataTransfer, preventDefault() {} });
  assert.equal(session.mode, 'after', 'Keep last insertion slot active below the list');
  assert.equal(session.target, target);
  context.update({ clientX: 500, clientY: 600, dataTransfer, preventDefault() {} });
  assert.equal(session.mode, 'after', 'Last slot stays active outside the list column');
  context.update({ clientX: 1300, clientY: 600, dataTransfer, preventDefault() {} });
  assert.equal(session.mode, null, 'Leaving the window cancels the target');

  const emptyReturn = deferred();
  preview.animate = () => ({ finished: emptyReturn.promise });
  const dropping = context.finish({ preventDefault() {}, stopImmediatePropagation() {} });
  assert(session.settling, 'Return must start on drop, without waiting for dragend');
  assert(!removed, 'Preview stays visible on invalid drop');
  emptyReturn.resolve();
  await dropping;
  assert(removed);

}
console.log('Passed: slow save, fast render, dragend isolation, seamless handoff, cancellation, empty-space drop and reduced motion.');

// A long list must finish its geometry reads before writing animation styles.
{
  const operations = [];
  let moved = false;
  const rows = Array.from({ length: 200 }, (_, i) => ({
    classList: { contains: () => false },
    getBoundingClientRect() { operations.push('read'); return { top: i * 40 + (moved ? 40 : 0) }; },
    getAnimations: () => [],
    animate() { operations.push('animate'); }
  }));
  const parent = { insertBefore() { moved = true; operations.push('insert'); } };
  const style = {};
  const session = { rows, slot: {}, preview: { style }, offsetX: 12, offsetY: 8 };
  const context = vm.createContext({ window: { matchMedia: () => ({ matches: false }) } });
  vm.runInContext(controller + '\nthis.start = value => { dragSession = value; }; this.move = moveSlot; this.position = positionPreview;', context);
  context.start(session);
  context.move({ parentNode: parent });
  assert.equal(operations.filter(op => op === 'animate').length, rows.length);
  assert(operations.lastIndexOf('read') < operations.indexOf('animate'), 'Batch all destination reads before animations');
  context.position({ clientX: 100, clientY: 80 });
  assert.equal(style.translate, '88px 72px');
  assert(!('left' in style) && !('top' in style), 'Pointer movement does not write layout coordinates');
}
console.log('Passed: 200-row animation read/write batching and preview translation.');

// A successful multi-item reorder wraps the real rendered rows at one-row
// height, then expands that wrapper to their combined height.
{
  const heightFrames = [];
  const transformFrames = [];
  const parent = {
    children: [],
    insertBefore(node, reference) {
      node.parentNode?.children?.splice(node.parentNode.children.indexOf(node), 1);
      const index = this.children.indexOf(reference);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parentNode = this;
    }
  };
  const animatedTarget = () => ({
    style: {},
    parentNode: parent,
    getBoundingClientRect: () => ({ height: 40 }),
    animate(frames, options) {
      if ('height' in frames[0]) heightFrames.push({ frames, options });
      if ('transform' in frames[0]) transformFrames.push({ frames, options });
      return { finished: Promise.resolve() };
    }
  });
  const rows = [animatedTarget(), animatedTarget(), animatedTarget()];
  parent.children.push(...rows);
  const landingSlot = animatedTarget();
  landingSlot.parentNode = null;
  let landingSlotRemoved = false;
  landingSlot.remove = () => { landingSlotRemoved = true; };
  const preview = { style: {} };
  const session = { landingSlot, preview };
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: false }) },
    document: { createElement() {
      return {
        style: {}, children: [], parentNode: null,
        appendChild(node) {
          node.parentNode?.children?.splice(node.parentNode.children.indexOf(node), 1);
          this.children.push(node);
          node.parentNode = this;
        },
        animate(frames, options) {
          heightFrames.push({ frames, options });
          return { finished: Promise.resolve() };
        },
        remove() {
          this.parentNode?.children?.splice(this.parentNode.children.indexOf(this), 1);
          this.parentNode = null;
        }
      };
    } }
  });
  vm.runInContext(controller + '\nthis.expand = expandRenderedRows;', context);
  rows.forEach(row => { row.style.visibility = 'hidden'; });
  await context.expand(session, rows);
  assert.equal(heightFrames.length, 1);
  assert(heightFrames.every(({ frames, options }) =>
    frames[0].height === '40px' && frames[1].height === '120px' && options.duration === 220));
  assert.deepEqual(transformFrames.map(({ frames }) => frames[0].transform), [
    'translateY(-40px)', 'translateY(-80px)'
  ]);
  assert(transformFrames.every(({ frames, options }) =>
    frames[1].transform === 'translateY(0)' && options.duration === 220));
  assert.equal(preview.style.visibility, 'hidden');
  assert(landingSlotRemoved && session.landingSlot === null);
  assert(rows.every(row => row.style.visibility === ''));
  assert.deepEqual(parent.children, rows);
  assert(rows.every(row => !row.style.position && !row.style.zIndex && !row.style.backgroundColor));
}
console.log('Passed: stacked rows spread downward while their block expands to its combined height.');

// Dropping a group back into its existing position does not persist a new
// bookmark order, but it must still use the same stacked-row expansion.
{
  const animationDone = deferred();
  let heightAnimations = 0;
  let rowAnimations = 0;
  const rect = { left: 10, top: 40, width: 300, height: 40, right: 310, bottom: 80 };
  const parent = {
    children: [],
    insertBefore(node, reference) {
      node.parentNode?.children?.splice(node.parentNode.children.indexOf(node), 1);
      const index = this.children.indexOf(reference);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parentNode = this;
    }
  };
  const row = id => ({
    dataset: { itemId: id, type: 'link' }, style: {}, isConnected: true,
    parentNode: parent, classList: { remove() {} }, getAnimations: () => [],
    getBoundingClientRect: () => rect,
    animate: () => { rowAnimations++; return { finished: Promise.resolve() }; }
  });
  const first = row('a');
  const second = row('b');
  const preceding = row('x');
  parent.children.push(preceding, first, second);
  let moveCalls = 0;
  let removed = false;
  let retainedSelection;
  const preview = {
    style: {}, classList: { remove() {} }, getAnimations: () => [],
    getBoundingClientRect: () => rect,
    animate: () => ({ finished: animationDone.promise }),
    remove() { removed = true; }
  };
  const slot = { getBoundingClientRect: () => rect, remove() {} };
  const session = {
    ids: ['a', 'b'], rows: [first, second], sources: [first, second], primaryId: 'a',
    target: preceding, mode: 'after', folderId: 'root', preview, slot, retainSelection: true,
    ghost: { remove() {} }, controller: { abort() {} }
  };
  const context = vm.createContext({
    console, clearTimeout, cancelAnimationFrame() {},
    window: { innerWidth: 1200, innerHeight: 900, matchMedia: () => ({ matches: false }) },
    document: {
      body: { classList: { add() {}, remove() {} }, appendChild() {} },
      createElement: () => ({
        style: {}, children: [], setAttribute() {}, parentNode: null,
        appendChild(node) {
          node.parentNode?.children?.splice(node.parentNode.children.indexOf(node), 1);
          this.children.push(node);
          node.parentNode = this;
        },
        animate: () => { heightAnimations++; return { finished: Promise.resolve() }; },
        remove() { this.parentNode?.children?.splice(this.parentNode.children.indexOf(this), 1); }
      }),
      addEventListener() {}, removeEventListener() {}, elementFromPoint: () => null
    },
    itemsGrid: { querySelectorAll: () => [first, second] },
    getBookmarks: async () => [{ id: 'x' }, { id: 'a' }, { id: 'b' }],
    saveMoveForUndo: async () => {},
    chrome: { bookmarks: { move: async () => { moveCalls++; } } },
    renderItemsCallback: async () => {},
    setIsDragging() {}, setDraggedElement() {}, setDraggedItemType() {}, setDraggedItemIds() {},
    setDropPosition() {}, setDropTargetElement() {}, clearSelection() {},
    setItemSelection(ids) { retainedSelection = [...ids]; }, showNotification() {}
  });
  vm.runInContext(controller + '\nthis.start = value => { dragSession = value; }; this.finish = finishDrag;', context);
  context.start(session);
  const finishing = context.finish({ preventDefault() {}, stopImmediatePropagation() {} });
  await flush();
  assert.equal(moveCalls, 0, 'Returning to the same position must not write bookmark order');
  animationDone.resolve();
  await finishing;
  assert.equal(heightAnimations, 1, 'Returning group must expand from one row to its full height');
  assert.equal(rowAnimations, 3,
    'Lower rows must spread out while both rows continue the selection-color animation');
  assert.deepEqual(retainedSelection, ['a', 'b'], 'Moved rows must remain selected after render');
  assert.equal(preview.style.backgroundColor,
    'color-mix(in srgb, var(--bg-primary) 52.4%, var(--bg-secondary) 47.6%)',
    'Selection color must be midway through its transition when the stacked row lands');
  assert(removed);
  assert.equal(first.style.visibility, '');
  assert.equal(second.style.visibility, '');
  assert.deepEqual(parent.children, [preceding, first, second]);
}
console.log('Passed: a group returned to its original position lands stacked, then expands.');

// Native dragend and invalid drops use returnDraggedItem rather than the
// successful-drop path. A returning group must expand there as well.
{
  const landingDone = deferred();
  let heightAnimations = 0;
  let rowAnimations = 0;
  let landingTop;
  const parent = {
    children: [],
    insertBefore(node, reference) {
      node.parentNode?.children?.splice(node.parentNode.children.indexOf(node), 1);
      const index = this.children.indexOf(reference);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parentNode = this;
    }
  };
  const makeRow = (id, top) => ({
    dataset: { itemId: id }, style: {}, isConnected: true, parentNode: parent,
    classList: { remove() {} }, getAnimations: () => [],
    getBoundingClientRect: () => ({ left: 10, top, width: 300, height: 40 }),
    animate: () => { rowAnimations++; return { finished: Promise.resolve() }; }
  });
  const first = makeRow('a', 40);
  const second = makeRow('b', 80);
  parent.children.push(first, second);
  const preview = {
    style: {}, classList: { remove() {} }, getAnimations: () => [],
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 300, height: 40 }),
    animate(frames) {
      landingTop = frames[1].top;
      return { finished: landingDone.promise };
    },
    remove() {}
  };
  const session = {
    ids: ['a', 'b'], sources: [first, second], rows: [first, second], primaryId: 'b', preview,
    slot: { remove() {} }, ghost: { remove() {} }, controller: { abort() {} }, retainSelection: true
  };
  const context = vm.createContext({
    console, clearTimeout, cancelAnimationFrame() {},
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      body: { classList: { add() {}, remove() {} }, appendChild() {} },
      createElement: () => ({
        style: {}, children: [], parentNode: null, setAttribute() {},
        appendChild(node) {
          node.parentNode?.children?.splice(node.parentNode.children.indexOf(node), 1);
          this.children.push(node);
          node.parentNode = this;
        },
        animate: () => { heightAnimations++; return { finished: Promise.resolve() }; },
        remove() { this.parentNode?.children?.splice(this.parentNode.children.indexOf(this), 1); }
      }),
      addEventListener() {}, removeEventListener() {}
    },
    setIsDragging() {}, setDraggedElement() {}, setDraggedItemType() {}, setDraggedItemIds() {},
    setDropPosition() {}, setDropTargetElement() {}
  });
  vm.runInContext(controller + '\nthis.start = value => { dragSession = value; }; this.cancel = returnDraggedItem;', context);
  context.start(session);
  const returning = context.cancel();
  await flush();
  assert.equal(landingTop, '40px', 'A returning group must land at its first row');
  landingDone.resolve();
  await returning;
  assert.equal(heightAnimations, 1);
  assert.equal(rowAnimations, 3);
  assert.equal(preview.style.backgroundColor,
    'color-mix(in srgb, var(--bg-primary) 52.4%, var(--bg-secondary) 47.6%)');
  assert.deepEqual(parent.children, [first, second]);
}
console.log('Passed: native group return lands at the first row and expands.');
