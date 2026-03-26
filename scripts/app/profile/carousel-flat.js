const W = window;

const cardsData = [
  { id: 'account', tit: 'Аккаунт', ic: '👤' },
  { id: 'stats', tit: 'Статистика', ic: '📊' },
  { id: 'achievements', tit: 'Достижения', ic: '🏆' },
  { id: 'recs', tit: 'Рекомендации', ic: '💡' },
  { id: 'logs', tit: 'Журнал', ic: '📜' },
  { id: 'settings', tit: 'Настройки', ic: '⚙️' }
];

// Трещины теперь огромные, перекрывают всю карточку
const crackCfg = [
  { x: -50, y: -60, w: 260, h: 320, r: 15,  o: .95 },
  { x: -70, y: -20, w: 280, h: 300, r: -10, o: .90 },
  { x: -40, y: -30, w: 250, h: 320, r: 175, o: .92 },
  { x: -30, y: -80, w: 270, h: 350, r: -25, o: .96 },
  { x: -80, y: -50, w: 300, h: 300, r: 45,  o: .88 },
  { x: -20, y: -30, w: 240, h: 320, r: -5,  o: .94 }
];

const makeCrack = idx => {
  const c = crackCfg[idx] || crackCfg[0];
  return `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><image href="img/vitrina-crack-01.svg" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" transform="rotate(${c.r},${c.x + c.w / 2},${c.y + c.h / 2})" preserveAspectRatio="xMidYMid meet" style="mix-blend-mode:screen;opacity:${c.o}"/></svg>`;
};

export function mountProfileCarouselFlat({ root }) {
  const TOTAL = cardsData.length;
  const STEP = 360 / TOTAL;

  const cardsHtml = cardsData.map((d, i) => {
    const angle = i * STEP;
    return `
      <div class="sc-3d-card" data-idx="${i}" data-id="${d.id}" style="--a:${angle}deg">
        <div class="glass-halo"></div>
        <div class="glass-face">
          <div class="surface-content">
            <div class="sc-3d-ic">${d.ic}</div>
            <div class="sc-3d-tit">${d.tit}</div>
          </div>
          <div class="glass-noise"></div>
          <div class="crack-layer">${makeCrack(i)}</div>
          <div class="glass-3d-edge"></div>
        </div>
      </div>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'sc-3d-wrap' + (localStorage.getItem('profileShowControls') === '1' ? ' show-controls' : '');
  wrap.innerHTML = `
    <div class="sc-3d-scene">
      <div class="sc-3d-car" id="sc-3d-car">${cardsHtml}</div>
    </div>
    <div class="sc-3d-controls">
      <button class="sc-3d-btn sc-3d-btn-sq" id="sc-3d-prev">◀</button>
      <button class="sc-3d-btn sc-3d-btn-sel" id="sc-3d-sel">ВЫБРАТЬ</button>
      <button class="sc-3d-btn sc-3d-btn-sq" id="sc-3d-next">▶</button>
    </div>`;

  // Карусель монтируется либо вместо .profile-tabs, либо в начало .profile-wrap
  const oldTabs = root.querySelector('.profile-tabs');
  const mountTarget = oldTabs || root.querySelector('.profile-wrap');
  if (!mountTarget) return;

  if (oldTabs) {
    oldTabs.replaceWith(wrap);
  } else {
    mountTarget.insertBefore(wrap, mountTarget.firstChild);
  }

  let currIdx = 0, startX = 0, startY = 0, isDrag = false, dragDelta = 0;

  setTimeout(() => {
    const car = root.querySelector('#sc-3d-car');
    const prev = root.querySelector('#sc-3d-prev');
    const next = root.querySelector('#sc-3d-next');
    const sel = root.querySelector('#sc-3d-sel');
    const scene = root.querySelector('.sc-3d-scene');
    if (!car || !scene) return;

    let _selectDebounce = null;
    const doSelect = (instantExit = false) => {
      clearTimeout(_selectDebounce);
      _selectDebounce = setTimeout(() => {
        clearTimeout(wrap._tAuto);
        const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
        const activeId = cardsData[norm].id;
        const tab = root.querySelector(`#tab-${activeId}`);
        if (!tab) return;
        if (tab.classList.contains('active')) { tab.style.cssText = ''; return; }

        const prev = root.querySelector('.profile-tab-content.active');
        const enterNew = () => {
          root.querySelectorAll('.profile-tab-content').forEach(x => { x.classList.remove('active'); x.style.cssText = ''; });
          requestAnimationFrame(() => requestAnimationFrame(() => tab.classList.add('active')));
        };

        if (prev && prev !== tab && !instantExit) {
          prev.style.transition = 'opacity .18s ease, transform .18s cubic-bezier(.22,1,.36,1)';
          prev.style.opacity = '0';
          prev.style.transform = 'translateY(26px) scale(.965)';
          setTimeout(enterNew, 180);
        } else {
          enterNew();
        }
      }, 80);
    };

    const update = (animated = true, instantExit = false) => {
      car.style.transition = animated ? 'transform .75s cubic-bezier(.22,1,.36,1)' : 'none';
      car.style.transform = `rotateY(${currIdx * -STEP}deg)`;
      
      const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      car.querySelectorAll('.sc-3d-card').forEach((card, i) => {
        const diff = Math.min(Math.abs(i - norm), TOTAL - Math.abs(i - norm));
        card.classList.toggle('is-active', diff === 0);
        card.classList.toggle('is-back', diff >= 2);
      });

      wrap.classList.remove('is-settled');
      clearTimeout(wrap._tS);
      if (animated) {
        wrap._tS = setTimeout(() => {
          wrap.classList.add('is-settled');
          doSelect(instantExit);
        }, 500); 
      } else {
        wrap.classList.add('is-settled');
        doSelect(instantExit);
      }
    };

    const step = dir => { currIdx += dir; update(true); };

    prev?.addEventListener('click', () => step(-1));
    next?.addEventListener('click', () => step(1));
    sel?.addEventListener('click', () => doSelect(false));

    const getActiveTab = () => root.querySelector('.profile-tab-content.active');
    const clearTabFx = tab => {
      if (!tab) return;
      tab.style.transition = '';
      tab.style.transform = '';
      tab.style.opacity = '';
      tab.style.willChange = '';
    };

    const setTabPhysics = (mode, rawDx = 0) => {
      const tab = getActiveTab();
      if (!tab) return;

      if (mode === 'drag') {
        const p = Math.min(1, Math.abs(rawDx) / 135);
        const dy = Math.round(p * 132);
        const sc = 1 - p * 0.065;
        const op = Math.max(0.12, 1 - p * 0.72);
        tab.style.willChange = 'transform, opacity';
        tab.style.transition = 'none';
        tab.style.transform = `translateY(${dy}px) scale(${sc.toFixed(3)})`;
        tab.style.opacity = String(op);
        return;
      }

      if (mode === 'restore') {
        tab.style.willChange = 'transform, opacity';
        tab.style.transition = 'transform .28s cubic-bezier(.16,1,.3,1), opacity .24s ease';
        tab.style.transform = 'translateY(0px) scale(1)';
        tab.style.opacity = '1';
        tab.addEventListener('transitionend', () => clearTabFx(tab), { once: true });
        return;
      }

      if (mode === 'commit') {
        tab.style.willChange = 'transform, opacity';
        tab.style.transition = 'transform .20s cubic-bezier(.55,0,.85,.25), opacity .16s ease';
        tab.style.transform = 'translateY(168px) scale(.92)';
        tab.style.opacity = '0';
        tab.addEventListener('transitionend', () => clearTabFx(tab), { once: true });
      }
    };

    scene.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      isDrag = true; dragDelta = 0;
      car.style.transition = 'none';
      wrap.classList.remove('is-settled'); clearTimeout(wrap._tS);
      clearTimeout(_selectDebounce);
    }, { passive: true });

    scene.addEventListener('touchmove', e => {
      if (!isDrag) return;
      const rawDx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
      if (Math.abs(rawDx) < 8 && Math.abs(dy) < 8) return;

      if (Math.abs(dy) > Math.abs(rawDx) + 14) {
        isDrag = false;
        setTabPhysics('restore');
        update(true, false);
        return;
      }

      dragDelta = rawDx;
      const visualDelta = Math.max(-150, Math.min(150, rawDx));
      car.style.transform = `rotateY(${currIdx * -STEP + visualDelta * 0.52}deg)`;
      setTabPhysics('drag', rawDx);
    }, { passive: true });

    scene.addEventListener('touchend', e => {
      if (!isDrag) return;
      isDrag = false;

      const committed = Math.abs(dragDelta) > 40;

      if (committed) {
        setTabPhysics('commit');
        if (dragDelta > 40) currIdx--;
        else if (dragDelta < -40) currIdx++;
        dragDelta = 0;
        update(true, true);
        return;
      }

      if (Math.abs(dragDelta) < 10) {
        const card = e.target.closest('.sc-3d-card');
        if (card) {
          const idx = parseInt(card.dataset.idx, 10);
          const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
          if (idx === norm && wrap.classList.contains('is-settled')) doSelect(false);
        }
      }

      dragDelta = 0;
      setTabPhysics('restore');
      update(true, false);
    }, { passive: true });

    scene.addEventListener('wheel', e => {
      e.preventDefault(); step(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    car.addEventListener('click', e => {
      const card = e.target.closest('.sc-3d-card'); if (!card) return;
      const idx = parseInt(card.dataset.idx, 10), norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      if (idx !== norm) {
        let diff = idx - norm;
        if (diff > TOTAL / 2) diff -= TOTAL;
        if (diff < -TOTAL / 2) diff += TOTAL;
        currIdx += diff; update(true);
      } else if (wrap.classList.contains('is-settled')) {
        doSelect(false);
      }
    });

    root.querySelectorAll('.profile-tab-content').forEach(x => {
      x.classList.remove('active');
      x.style.animation = 'none';
    });
    const initTab = root.querySelector(`#tab-${cardsData[0].id}`);
    if (initTab) {
      initTab.classList.add('active');
      setTimeout(() => {
        root.querySelectorAll('.profile-tab-content').forEach(x => x.style.animation = '');
      }, 50);
    }
    update(false);
    W.Intel_CarouselFlat = {
      jumpTo: (targetIdx) => {
        const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
        let diff = targetIdx - norm;
        if (diff > TOTAL / 2) diff -= TOTAL;
        if (diff < -TOTAL / 2) diff += TOTAL;
        currIdx += diff; update(true);
      },
      selectCurrent: () => doSelect(false)
    };
  }, 60);
}

export default { mountProfileCarouselFlat };
