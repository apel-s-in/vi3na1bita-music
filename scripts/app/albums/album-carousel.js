const STORAGE_KEY = 'albumCarouselCenter:v1';
const SETTLE_MS = 520;
const SWIPE_DISTANCE = 34;
const FLICK_VELOCITY = 0.22;

const SLOT_CLASSES = [
  'album-carousel-slot-m3',
  'album-carousel-slot-m2',
  'album-carousel-slot-m1',
  'album-carousel-slot-0',
  'album-carousel-slot-p1',
  'album-carousel-slot-p2',
  'album-carousel-slot-p3',
  'album-carousel-hidden'
];

const mod = (value, length) => ((value % length) + length) % length;

const buildCircularOrder = items => {
  if (items.length < 2) return [...items];
  const right = items.filter((_, index) => index > 0 && index % 2 === 0);
  const left = items.filter((_, index) => index % 2 === 1).reverse();
  return [items[0], ...right, ...left];
};

const signedDistance = (index, center, length) => {
  let distance = mod(index - center, length);
  if (distance > Math.floor(length / 2)) distance -= length;
  return distance;
};

const slotClass = slot => {
  if (slot == null || Math.abs(slot) > 3) return 'album-carousel-hidden';
  if (slot === 0) return 'album-carousel-slot-0';
  return `album-carousel-slot-${slot < 0 ? `m${Math.abs(slot)}` : `p${slot}`}`;
};

export const mountAlbumCarousel = ({
  root,
  itemSelector = '.album-icon',
  onSettled
} = {}) => {
  if (!root) return null;

  const sourceItems = [...root.querySelectorAll(itemSelector)]
    .filter(item => !String(item.dataset.album || '').startsWith('__'));

  if (!sourceItems.length) return null;

  const items = buildCircularOrder(sourceItems);
  let center = 0;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastAt = 0;
  let velocityX = 0;
  let dragX = 0;
  let horizontalDrag = false;
  let suppressClickUntil = 0;
  let wheelLockedUntil = 0;
  let settleTimer = 0;
  let destroyed = false;

  const getCurrentItem = () => items[center] || null;
  const getCurrentKey = () => String(getCurrentItem()?.dataset.album || '');

  const render = () => {
    items.forEach((item, index) => {
      const slot = signedDistance(index, center, items.length);
      item.classList.remove(...SLOT_CLASSES);
      item.classList.add(slotClass(slot));
      item.dataset.carouselCenter = slot === 0 ? '1' : '0';
      item.dataset.carouselSlot = String(slot);
      item.tabIndex = slot === 0 ? 0 : -1;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-hidden', Math.abs(slot) > 3 ? 'true' : 'false');
    });

    const current = getCurrentItem();
    root.dataset.centerAlbum = getCurrentKey();
    root.setAttribute(
      'aria-label',
      `Альбомы. В центре: ${current?.title || getCurrentKey()}`
    );
  };

  const cancelPendingSelection = () => {
    clearTimeout(settleTimer);
    settleTimer = 0;
  };

  const scheduleSettled = ({ notify = true, reason = 'interaction' } = {}) => {
    cancelPendingSelection();
    if (!notify) return;

    settleTimer = setTimeout(() => {
      settleTimer = 0;
      if (destroyed) return;
      const key = getCurrentKey();
      if (key) onSettled?.(key, { reason });
    }, SETTLE_MS);
  };

  const setCurrent = (keyOrIndex, {
    animate = true,
    notify = false,
    persist = true,
    reason = 'programmatic'
  } = {}) => {
    const index = typeof keyOrIndex === 'number'
      ? mod(keyOrIndex, items.length)
      : items.findIndex(item =>
        item.dataset.album === String(keyOrIndex || '')
      );

    if (index < 0) return false;

    root.classList.toggle('album-carousel-no-animation', !animate);
    center = index;
    render();

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, getCurrentKey());
      } catch {}
    }

    if (!animate) {
      requestAnimationFrame(() => {
        root.classList.remove('album-carousel-no-animation');
      });
    }

    scheduleSettled({ notify, reason });
    return true;
  };

  const step = (direction, reason = 'step') =>
    setCurrent(center + direction, {
      animate: true,
      notify: true,
      persist: true,
      reason
    });

  const onClickCapture = event => {
    const item = event.target.closest(itemSelector);
    if (!item || !root.contains(item)) return;

    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const index = items.indexOf(item);
    if (index < 0 || index === center) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    setCurrent(index, {
      animate: true,
      notify: true,
      persist: true,
      reason: 'item_click'
    });

    item.focus({ preventScroll: true });
  };

  const onPointerDown = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    cancelPendingSelection();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    lastAt = performance.now();
    velocityX = 0;
    dragX = 0;
    horizontalDrag = false;

    root.classList.add('album-carousel-dragging');
  };

  const onPointerMove = event => {
    if (event.pointerId !== pointerId) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!horizontalDrag && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) + 5) {
      horizontalDrag = true;
      try {
        root.setPointerCapture?.(event.pointerId);
      } catch {}
    }

    if (!horizontalDrag) return;

    const now = performance.now();
    const elapsed = Math.max(1, now - lastAt);
    velocityX = (event.clientX - lastX) / elapsed;
    lastX = event.clientX;
    lastAt = now;
    dragX = dx;

    root.style.setProperty(
      '--album-carousel-drag-x',
      `${Math.max(-72, Math.min(72, dx * 0.42))}px`
    );
  };

  const finishPointer = event => {
    if (event.pointerId !== pointerId) return;

    try {
      root.releasePointerCapture?.(pointerId);
    } catch {}

    root.classList.remove('album-carousel-dragging');
    root.style.removeProperty('--album-carousel-drag-x');

    const shouldMove =
      horizontalDrag &&
      (Math.abs(dragX) >= SWIPE_DISTANCE || Math.abs(velocityX) >= FLICK_VELOCITY);

    if (shouldMove) {
      suppressClickUntil = Date.now() + 360;
      step(dragX < 0 || velocityX < -FLICK_VELOCITY ? 1 : -1, 'swipe');
    }

    pointerId = null;
    dragX = 0;
    velocityX = 0;
    horizontalDrag = false;
  };

  const onWheel = event => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

    if (Math.abs(delta) < 2 || Date.now() < wheelLockedUntil) return;

    event.preventDefault();
    wheelLockedUntil = Date.now() + 190;
    step(delta > 0 ? 1 : -1, 'wheel');
  };

  const onKeyDown = event => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1, 'keyboard');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1, 'keyboard');
    } else if (event.key === 'Home') {
      event.preventDefault();
      setCurrent(0, {
        animate: true,
        notify: true,
        persist: true,
        reason: 'keyboard_home'
      });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      getCurrentItem()?.click();
    }
  };

  root.classList.add('album-carousel');
  root.addEventListener('click', onClickCapture, true);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', finishPointer);
  root.addEventListener('pointercancel', finishPointer);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKeyDown);

  let savedKey = '';
  try {
    savedKey = localStorage.getItem(STORAGE_KEY) || '';
  } catch {}

  setCurrent(savedKey || 0, {
    animate: false,
    notify: false,
    persist: false,
    reason: 'restore'
  });

  return {
    setCurrent,
    step,
    cancelPendingSelection,
    getCurrentKey,
    destroy() {
      destroyed = true;
      cancelPendingSelection();
      root.classList.remove(
        'album-carousel',
        'album-carousel-dragging',
        'album-carousel-no-animation'
      );
      root.style.removeProperty('--album-carousel-drag-x');
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', finishPointer);
      root.removeEventListener('pointercancel', finishPointer);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('keydown', onKeyDown);

      items.forEach(item => {
        item.classList.remove(...SLOT_CLASSES);
        item.removeAttribute('data-carousel-center');
        item.removeAttribute('data-carousel-slot');
        item.removeAttribute('aria-hidden');
        item.removeAttribute('role');
        item.removeAttribute('tabindex');
      });
    }
  };
};

export default { mountAlbumCarousel };
