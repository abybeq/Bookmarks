// Moves one shared background within each bookmark or folder group.

const HOVER_ITEM_SELECTOR = '.list-item[data-item-id]:not(.selected)';
const HIDE_DELAY_MS = 60;
const MOVE_DURATION_MS = 70;
const MOVE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function initHoverIndicator() {
  const itemsGrid = document.getElementById('items-grid');
  if (!itemsGrid) return;

  let activeIndicator = null;
  let activeItem = null;
  let pointerItem = null;
  let keyboardItem = null;
  let activeSource = null;
  let hideTimer = null;
  const movementAnimations = new WeakMap();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const ensureIndicator = (section) => {
    const existingIndicator = section.querySelector(':scope > .list-hover-indicator');
    if (existingIndicator) return existingIndicator;

    const indicator = document.createElement('div');
    indicator.className = 'list-hover-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    section.prepend(indicator);
    return indicator;
  };

  const clearHideTimer = () => {
    if (hideTimer === null) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  };

  const moveIndicator = (item, animateMovement = true) => {
    clearHideTimer();

    const section = item.closest('.list-section');
    if (!section) return;

    const hoverIndicator = ensureIndicator(section);
    const sectionRect = section.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const continuesWithinGroup = activeIndicator === hoverIndicator && hoverIndicator.classList.contains('is-visible');

    let startRect = null;
    if (animateMovement && continuesWithinGroup && !reduceMotion.matches) {
      const renderedRect = hoverIndicator.getBoundingClientRect();
      startRect = {
        x: renderedRect.left - sectionRect.left,
        y: renderedRect.top - sectionRect.top
      };
    }

    if (activeIndicator && activeIndicator !== hoverIndicator) {
      movementAnimations.get(activeIndicator)?.cancel();
      activeIndicator.classList.remove('is-visible');
    }

    movementAnimations.get(hoverIndicator)?.cancel();

    const targetRect = {
      x: itemRect.left - sectionRect.left,
      y: itemRect.top - sectionRect.top,
      width: itemRect.width,
      height: itemRect.height
    };

    hoverIndicator.style.width = `${targetRect.width}px`;
    hoverIndicator.style.height = `${targetRect.height}px`;
    hoverIndicator.style.transform = `translate3d(${targetRect.x}px, ${targetRect.y}px, 0)`;

    hoverIndicator.classList.add('is-visible');

    if (startRect && (Math.abs(startRect.x - targetRect.x) > 0.5 || Math.abs(startRect.y - targetRect.y) > 0.5)) {
      const animation = hoverIndicator.animate([
        {
          transform: `translate3d(${startRect.x}px, ${startRect.y}px, 0)`
        },
        {
          transform: `translate3d(${targetRect.x}px, ${targetRect.y}px, 0)`
        }
      ], {
        duration: MOVE_DURATION_MS,
        easing: MOVE_EASING,
        fill: 'none'
      });

      movementAnimations.set(hoverIndicator, animation);
    }

    activeIndicator = hoverIndicator;
    activeItem = item;
  };

  const hideIndicator = () => {
    clearHideTimer();
    if (activeIndicator) movementAnimations.get(activeIndicator)?.cancel();
    activeIndicator?.classList.remove('is-visible');
    activeIndicator = null;
    activeItem = null;
  };

  const showPreferredItem = () => {
    let preferredItem = null;
    let animateMovement = false;

    if (activeSource === 'pointer' && pointerItem?.isConnected) {
      preferredItem = pointerItem;
      animateMovement = true;
    } else if (keyboardItem?.isConnected) {
      preferredItem = keyboardItem;
    } else if (pointerItem?.isConnected) {
      preferredItem = pointerItem;
      animateMovement = true;
    }

    if (preferredItem?.isConnected) {
      moveIndicator(preferredItem, animateMovement);
    } else {
      hideIndicator();
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer = window.setTimeout(showPreferredItem, HIDE_DELAY_MS);
  };

  itemsGrid.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;

    const item = event.target.closest(HOVER_ITEM_SELECTOR);
    if (!item || item === activeItem) return;
    pointerItem = item;
    activeSource = 'pointer';
    moveIndicator(item);
  });

  itemsGrid.addEventListener('pointerout', (event) => {
    const item = event.target.closest(HOVER_ITEM_SELECTOR);
    if (!item || item !== pointerItem) return;

    const nextItem = event.relatedTarget?.closest?.(HOVER_ITEM_SELECTOR);
    if (nextItem) return;
    pointerItem = null;
    scheduleHide();
  });

  itemsGrid.addEventListener('pointerleave', () => {
    pointerItem = null;
    activeSource = keyboardItem?.isConnected ? 'keyboard' : null;
    showPreferredItem();
  });

  const keyboardFocusObserver = new MutationObserver(() => {
    const nextKeyboardItem = itemsGrid.querySelector(`${HOVER_ITEM_SELECTOR}.keyboard-focused`);
    if (nextKeyboardItem === keyboardItem) return;

    keyboardItem = nextKeyboardItem;
    activeSource = keyboardItem ? 'keyboard' : pointerItem ? 'pointer' : null;
    showPreferredItem();
  });

  keyboardFocusObserver.observe(itemsGrid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('resize', () => {
    if (activeItem?.isConnected) moveIndicator(activeItem);
  });
}
