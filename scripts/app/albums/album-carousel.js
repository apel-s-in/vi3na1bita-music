// UID.001_(Playback safety invariant)_(карусель не управляет playback)_(только визуально фокусирует существующие album-icon)
// UID.094_(No-paralysis rule)_(ошибка карусели не ломает выбор альбома)_(AlbumsManager остаётся владельцем загрузки)
// UID.096_(Helper-first anti-duplication policy)_(вся pointer/wheel/keyboard физика альбомов живёт в одном модуле)

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

const slotFor = (index, center, length) => {
  const distance = mod(index - center, length);
  if (distance === 0) return 0;
  const rank = Math.ceil(distance / 2);
  if (rank > 3) return null;
  return distance % 2 ? rank : -rank;
};

const slotClass = slot => {
  if (slot == null) return 'album-carousel-hidden';
  if (slot === 0) return 'album-carousel-slot-0';
  return `album-carousel-slot-${slot < 0 ? `m${Math.abs(slot)}` : `p${slot}`}`;
};

export const mountAlbumCarousel = ({
  root,
  itemSelector = '.album-icon'
} = {}) => {
  if (!root) return null;

  const items = [...root.querySelectorAll(itemSelector)]
    .filter(item => !String(item.dataset.album || '').startsWith('__'));

  if (!items.length) return null;

  let center = 0;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragX = 0;
  let horizontalDrag = false;
  let suppressClickUntil = 0;
  let wheelLockedUntil = 0;

  const render = () => {
    items.forEach((item, index) => {
      const slot = slotFor(index, center, items.length);
      item.classList.remove(...SLOT_CLASSES);
      item.classList.add(slotClass(slot));
      item.dataset.carouselCenter = slot === 0 ? '1' : '0';
      item.tabIndex = slot === 0 ? 0 : -1;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-hidden', slot == null ? 'true' : 'false');
    });

    const current = items[center];
    root.dataset.centerAlbum = String(current?.dataset.album || '');
    root.setAttribute('aria-label', `Альбомы. В центре: ${current?.title || current?.dataset.album || ''}`);
  };

  const setCurrent = (keyOrIndex, { animate = true } = {}) => {
    const index = typeof keyOrIndex === 'number'
      ? mod(keyOrIndex, items.length)
      : items.findIndex(item => item.dataset.album === String(keyOrIndex || ''));

    if (index < 0) return false;

    root.classList.toggle('album-carousel-no-animation', !animate);
    center = index;
    render();

    if (!animate) {
      requestAnimationFrame(() => root.classList.remove('album-carousel-no-animation'));
    }

    return true;
  };

  const step = direction => setCurrent(center + direction);

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
    setCurrent(index);
    item.focus({ preventScroll: true });
  };

  const onPointerDown = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragX = 0;
    horizontalDrag = false;
    root.classList.add('album-carousel-dragging');
    root.setPointerCapture?.(pointerId);
  };

  const onPointerMove = event => {
    if (event.pointerId !== pointerId) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!horizontalDrag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 6) {
      horizontalDrag = true;
    }

    if (!horizontalDrag) return;

    dragX = dx;
    root.style.transform = `translateX(${Math.max(-24, Math.min(24, dx * 0.12))}px)`;
  };

  const finishPointer = event => {
    if (event.pointerId !== pointerId) return;

    try {
      root.releasePointerCapture?.(pointerId);
    } catch {}

    root.classList.remove('album-carousel-dragging');
    root.style.transform = '';

    if (horizontalDrag && Math.abs(dragX) >= 38) {
      suppressClickUntil = Date.now() + 320;
      step(dragX < 0 ? 1 : -1);
    }

    pointerId = null;
    dragX = 0;
    horizontalDrag = false;
  };

  const onWheel = event => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

    if (Math.abs(delta) < 2 || Date.now() < wheelLockedUntil) return;

    event.preventDefault();
    wheelLockedUntil = Date.now() + 180;
    step(delta > 0 ? 1 : -1);
  };

  const onKeyDown = event => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setCurrent(0);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      items[center]?.click();
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

  setCurrent(0, { animate: false });

  return {
    setCurrent,
    step,
    getCurrentKey: () => String(items[center]?.dataset.album || ''),
    destroy() {
      root.classList.remove('album-carousel', 'album-carousel-dragging');
      root.style.transform = '';
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
        item.removeAttribute('aria-hidden');
        item.removeAttribute('role');
        item.removeAttribute('tabindex');
      });
    }
  };
};

export default { mountAlbumCarousel };
