// UID.096_(Helper-first anti-duplication policy)_(единая физика горизонтальных вкладок)_(логи/ачивки/настройки не дублируют wheel handlers)
// UID.112_(Profile command center)_(tab strip должен быть mobile-friendly)_(активный пункт центрируется, wheel/touch по шагам)

const qsa = (root, sel) => [...(root?.querySelectorAll?.(sel) || [])];

const centerItem = (strip, item, behavior = 'smooth') => {
  if (!strip || !item) return;
  const left = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
  strip.scrollTo({ left: Math.max(0, left), behavior });
};

const stepSize = strip => {
  const first = strip.querySelector('.ach-classic-tab');
  return Math.max(88, Math.round((first?.offsetWidth || 90) + 12));
};

export const bindTabStripPhysics = (root = document, { selector = '.ach-classic-tabs', itemSelector = '.ach-classic-tab' } = {}) => {
  const strips = root?.matches?.(selector) ? [root] : qsa(root, selector);
  strips.forEach(strip => {
    if (!strip || strip._tabPhysicsBound) return;
    strip._tabPhysicsBound = true;
    strip.classList.add('physics-tabs');

    const centerActive = (behavior = 'smooth') => centerItem(strip, strip.querySelector(`${itemSelector}.active`) || strip.querySelector(itemSelector), behavior);

    strip.addEventListener('click', e => {
      const item = e.target.closest(itemSelector);
      if (item) setTimeout(() => centerItem(strip, item), 30);
    });

    strip.addEventListener('wheel', e => {
      if (strip.scrollWidth <= strip.clientWidth) return;
      e.preventDefault();
      const dir = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1;
      const max = strip.scrollWidth - strip.clientWidth;
      const atStart = strip.scrollLeft <= 2, atEnd = strip.scrollLeft >= max - 2;
      if (dir < 0 && atStart) return strip.scrollTo({ left: max, behavior: 'smooth' });
      if (dir > 0 && atEnd) return strip.scrollTo({ left: 0, behavior: 'smooth' });
      const mult = Math.min(3, Math.max(1, Math.ceil(Math.abs(e.deltaY || e.deltaX) / 90)));
      strip.scrollBy({ left: dir * stepSize(strip) * mult, behavior: 'smooth' });
    }, { passive: false });

    requestAnimationFrame(() => centerActive('auto'));
  });
};

export default { bindTabStripPhysics };
