// UID.096_(Helper-first anti-duplication policy)_(единая круговая физика горизонтальных вкладок)_(без длинного scrollTo в начало/конец)
// UID.112_(Profile command center)_(tab strip как плоская круговая карусель)_(после последней идёт первая, активная центрируется)

const qsa = (root, sel) => [...(root?.querySelectorAll?.(sel) || [])];

const itemsOf = (strip, itemSelector) => qsa(strip, itemSelector).filter(x => x.offsetParent !== null);

const centerItem = (strip, item, behavior = 'smooth') => {
  if (!strip || !item) return;
  const left = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
  strip.scrollTo({ left: Math.max(0, left), behavior });
};

const activeIndex = (strip, itemSelector) => {
  const items = itemsOf(strip, itemSelector);
  const active = strip.querySelector(`${itemSelector}.active`);
  const i = items.indexOf(active);
  if (i >= 0) return i;
  const mid = strip.scrollLeft + strip.clientWidth / 2;
  return Math.max(0, items.reduce((best, el, idx) => Math.abs((el.offsetLeft + el.offsetWidth / 2) - mid) < Math.abs((items[best].offsetLeft + items[best].offsetWidth / 2) - mid) ? idx : best, 0));
};

const activateCircular = (strip, dir, itemSelector) => {
  const items = itemsOf(strip, itemSelector);
  if (!items.length) return;
  const cur = activeIndex(strip, itemSelector);
  const next = (cur + dir + items.length) % items.length;
  const item = items[next];
  if (!item) return;
  item.click();
  requestAnimationFrame(() => centerItem(strip, item));
};

export const bindTabStripPhysics = (root = document, { selector = '.ach-classic-tabs', itemSelector = '.ach-classic-tab' } = {}) => {
  const strips = root?.matches?.(selector) ? [root] : qsa(root, selector);
  strips.forEach(strip => {
    if (!strip || strip._tabPhysicsBound) return;
    strip._tabPhysicsBound = true;
    strip.classList.add('physics-tabs');

    strip.addEventListener('click', e => {
      const item = e.target.closest(itemSelector);
      if (item) setTimeout(() => centerItem(strip, item), 20);
    });

    strip.addEventListener('wheel', e => {
      const items = itemsOf(strip, itemSelector);
      if (items.length < 2) return;
      e.preventDefault();
      const now = Date.now();
      if (strip._tabWheelLock && now - strip._tabWheelLock < 170) return;
      strip._tabWheelLock = now;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      activateCircular(strip, delta > 0 ? 1 : -1, itemSelector);
    }, { passive: false });

    let sx = 0, sy = 0;
    strip.addEventListener('touchstart', e => {
      sx = e.touches?.[0]?.clientX || 0;
      sy = e.touches?.[0]?.clientY || 0;
    }, { passive: true });

    strip.addEventListener('touchend', e => {
      const x = e.changedTouches?.[0]?.clientX || 0, y = e.changedTouches?.[0]?.clientY || 0;
      const dx = x - sx, dy = y - sy;
      if (Math.abs(dx) < 34 || Math.abs(dx) < Math.abs(dy) + 10) return;
      activateCircular(strip, dx < 0 ? 1 : -1, itemSelector);
    }, { passive: true });

    requestAnimationFrame(() => centerItem(strip, strip.querySelector(`${itemSelector}.active`) || strip.querySelector(itemSelector), 'auto'));
  });
};

export default { bindTabStripPhysics };
