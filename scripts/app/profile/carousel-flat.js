const W = window;

const cardsData = [
  { id: 'stats', tit: 'Статистика', ic: '📊' },
  { id: 'achievements', tit: 'Достижения', ic: '🏆' },
  { id: 'recs', tit: 'Рекомендации', ic: '💡' },
  { id: 'logs', tit: 'Журнал', ic: '📜' },
  { id: 'settings', tit: 'Настройки', ic: '⚙️' },
  { id: 'account', tit: 'Аккаунт', ic: '👤' }
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

const ensureStyles = () => {
  W.Utils?.dom?.createStyleOnce?.('sc-3d-carousel-flat-styles', `
    .sc-3d-wrap{margin:8px 0 12px;padding:0 2px;touch-action:pan-y;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;overflow:visible}
    .sc-3d-scene{perspective:1080px;perspective-origin:50% 40%;height:210px;display:flex;align-items:center;justify-content:center;overflow:visible;padding-top:0}
    .sc-3d-car{width:128px;height:190px;position:relative;transform-style:preserve-3d;transition:transform .75s cubic-bezier(.22,1,.36,1);will-change:transform}
    
    /* Кинетический эффект (разлет карточек при вращении) */
    .sc-3d-card{position:absolute;inset:0;cursor:pointer;will-change:transform;transition:opacity .25s ease,filter .25s ease,transform .55s cubic-bezier(.2,.8,.3,1);overflow:visible;transform-style:preserve-3d;transform:rotateY(var(--a)) translateZ(158px)}
    .sc-3d-wrap.is-settled .sc-3d-card{transform:rotateY(var(--a)) translateZ(142px)}
    
    /* 0. Halo (Внешнее свечение позади) - ВКЛЮЧАЕТСЯ ТОЛЬКО ПРИ ОСТАНОВКЕ */
    .glass-halo{position:absolute;left:-20%;right:-20%;top:-20%;bottom:-20%;z-index:0;pointer-events:none;opacity:0;background:radial-gradient(circle at center,rgba(77,170,255,.25) 0%,transparent 60%);filter:blur(20px);transition:opacity .4s ease}
    
    /* 1. Base Glass */
    .glass-face{position:absolute;inset:0;border-radius:22px;background:linear-gradient(180deg,rgba(26,49,82,.85),rgba(8,16,30,.98));box-shadow:inset 0 0 20px rgba(164,224,255,.1),inset 0 -20px 30px rgba(16,38,68,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow:hidden;transition:box-shadow .4s ease, border-color .4s ease}
    
    /* 2. Контент (Четкий, без блюра под ним) */
    .surface-content{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;pointer-events:none}
    .sc-3d-ic{font-size:46px;line-height:1;margin:0 0 14px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.6))}
    .sc-3d-tit{font-size:9.5px;font-weight:900;color:#fff;letter-spacing:0.5px;text-transform:uppercase;text-align:center;text-shadow:0 2px 6px rgba(0,0,0,.8);line-height:1;width:100%;white-space:nowrap}
    
    /* 3. Шум (Шероховатость поверх контента) */
    .glass-noise{position:absolute;inset:0;z-index:3;pointer-events:none;opacity:.35;mix-blend-mode:screen;background:radial-gradient(circle at 10% 20%,rgba(255,255,255,.1) 0 1px,transparent 1.5px),radial-gradient(circle at 80% 40%,rgba(255,255,255,.08) 0 1px,transparent 1.5px),radial-gradient(circle at 40% 80%,rgba(255,255,255,.07) 0 1px,transparent 1.5px);background-size:40px 40px, 60px 60px, 80px 80px}
    
    /* 4. Трещины (Поверх всего) */
    .crack-layer{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden;opacity:.95}
    .crack-layer svg{width:100%;height:100%;display:block}
    .crack-layer image{mix-blend-mode:screen;filter:contrast(1.4) brightness(1.2) drop-shadow(0 0 3px rgba(210,240,255,.6))}
    
    /* 5. 3D Окантовка (Выступает вперед) */
    .glass-3d-edge{position:absolute;inset:0;z-index:5;border-radius:22px;border:1px solid rgba(168,225,255,.4);transform:translateZ(4px);pointer-events:none;box-shadow:inset 0 0 8px rgba(255,255,255,.1);transition:border-color .4s ease}

    /* Состояния Карточек */
    .sc-3d-card.is-back{opacity:.4;filter:saturate(.7) brightness(.8)}
    
    /* Свечение центральной карточки (ТОЛЬКО КОГДА ОСТАНОВИЛАСЬ - is-settled) */
    .sc-3d-wrap.is-settled .sc-3d-card.is-active .glass-halo {opacity: 1}
    .sc-3d-wrap.is-settled .sc-3d-card.is-active .glass-face {box-shadow: inset 0 0 30px rgba(180,232,255,.15), inset 0 -26px 38px rgba(16,39,68,.5), 0 0 20px rgba(77,170,255,.15)}
    .sc-3d-wrap.is-settled .sc-3d-card.is-active .glass-3d-edge {border-color: rgba(184,233,255,.9)}

    /* Кнопки внизу (По умолчанию скрыты, управляются настройками) */
    .sc-3d-controls{display:none;gap:14px;justify-content:center;padding:20px 16px 12px}
    .sc-3d-wrap.show-controls .sc-3d-controls{display:flex}
    .sc-3d-btn{position:relative;background:linear-gradient(180deg,#0d1828,#070d16);border:1px solid rgba(77,170,255,.3);color:#7ab4f5;border-radius:12px;font-weight:900;cursor:pointer;transition:all .3s cubic-bezier(.4,0,.2,1);overflow:hidden;box-shadow:0 6px 15px rgba(0,0,0,.6);height:44px}
    .sc-3d-btn::before{content:'';position:absolute;top:0;left:0;right:0;height:45%;background:linear-gradient(180deg,rgba(255,255,255,.1),transparent);border-radius:12px 12px 0 0;pointer-events:none}
    .sc-3d-btn:active{transform:translateY(2px) scale(.96);box-shadow:0 3px 8px rgba(0,0,0,.7)}
    
    /* Боковые кнопки (Квадратные со стрелками) */
    .sc-3d-btn-sq{flex:0 0 44px;width:44px;padding:0;font-size:18px;display:flex;align-items:center;justify-content:center}
    
    /* Центральная кнопка Выбрать */
    .sc-3d-btn-sel{flex:1;max-width:140px;font-size:13px;text-transform:uppercase;letter-spacing:1px}
    
    /* Синхронное свечение кнопки Выбрать при остановке */
    .sc-3d-wrap.is-settled .sc-3d-btn-sel {
      color:#fff;
      background:linear-gradient(180deg,#0e2040,#071020);
      border-color:rgba(77,170,255,.5);
      box-shadow:0 0 12px rgba(77,170,255,.15),0 6px 15px rgba(0,0,0,.6);
      text-shadow:0 0 6px rgba(255,255,255,.4);
    }
  `);
};

export function mountProfileCarouselFlat({ root }) {
  ensureStyles();

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

  const oldTabs = root.querySelector('.profile-tabs');
  if (!oldTabs) return;
  oldTabs.replaceWith(wrap);

  let currIdx = 0, startX = 0, startY = 0, isDrag = false, dragDelta = 0;

  setTimeout(() => {
    const car = root.querySelector('#sc-3d-car');
    const prev = root.querySelector('#sc-3d-prev');
    const next = root.querySelector('#sc-3d-next');
    const sel = root.querySelector('#sc-3d-sel');
    const scene = root.querySelector('.sc-3d-scene');
    if (!car || !scene) return;

    let _selectDebounce = null;
    const doSelect = () => {
      clearTimeout(_selectDebounce);
      _selectDebounce = setTimeout(() => {
        clearTimeout(wrap._tAuto);
        const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
        const activeId = cardsData[norm].id;
        const tab = root.querySelector(`#tab-${activeId}`);
        if (!tab) { W.NotificationSystem?.info(`Раздел «${cardsData[norm].tit}» открывается...`); return; }
        if (tab.classList.contains('active')) return;

        // Уводим старый контент с opacity перед удалением active
        const prev = root.querySelector('.profile-tab-content.active');
        if (prev && prev !== tab) {
          prev.style.opacity = '0';
          prev.style.transform = 'translateY(-8px)';
          prev.style.transition = 'opacity .15s ease, transform .15s ease';
          setTimeout(() => {
            prev.classList.remove('active');
            prev.style.cssText = '';
            // Даём браузеру один тик перед появлением нового
            requestAnimationFrame(() => requestAnimationFrame(() => tab.classList.add('active')));
          }, 150);
        } else {
          root.querySelectorAll('.profile-tab-content').forEach(x => { x.classList.remove('active'); x.style.cssText = ''; });
          requestAnimationFrame(() => requestAnimationFrame(() => tab.classList.add('active')));
        }
      }, 80); // debounce 80ms — нормально для листания
    };

    const update = (animated = true) => {
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
          doSelect();
        }, 500); // Мгновенное открытие контента синхронно с подсветкой
      } else {
        wrap.classList.add('is-settled');
        doSelect();
      }
    };

    const step = dir => { currIdx += dir; update(true); };

    prev?.addEventListener('click', () => step(-1));
    next?.addEventListener('click', () => step(1));
    sel?.addEventListener('click', doSelect);

    // Плавно применяем translateY к активному контент-блоку пропорционально прогрессу свайпа
    const getActiveTab = () => root.querySelector('.profile-tab-content.active');
    
    const setContentDrift = (progress, instant = false) => {
      const tab = getActiveTab();
      if (!tab) return;
      // progress: 0 = на месте, 1 = улетел вниз (100vh)
      const clampedP = Math.max(0, Math.min(1, Math.abs(progress)));
      const eased = clampedP < 0.5
        ? 2 * clampedP * clampedP                      // разгон: медленно начинает
        : 1 - Math.pow(-2 * clampedP + 2, 2) / 2;     // торможение: замедляется к концу
      const yPx = eased * 60; // максимальное смещение 60px (не весь экран — мягче)
      if (instant) {
        tab.style.transition = 'none';
        tab.style.transform = `translateY(${yPx}px)`;
        tab.style.opacity = String(1 - eased * 0.45);
      } else {
        tab.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1), opacity .35s ease';
        tab.style.transform = `translateY(${yPx}px)`;
        tab.style.opacity = String(1 - eased * 0.45);
      }
    };

    const resetContentDrift = (fast = false) => {
      const tab = getActiveTab();
      if (!tab) return;
      tab.style.transition = fast
        ? 'transform .18s cubic-bezier(.4,0,.2,1), opacity .18s ease'
        : 'transform .4s cubic-bezier(.22,1,.36,1), opacity .4s ease';
      tab.style.transform = '';
      tab.style.opacity = '';
      // Убираем инлайн-стили после завершения анимации
      const cleanup = () => { tab.style.transition = ''; tab.removeEventListener('transitionend', cleanup); };
      tab.addEventListener('transitionend', cleanup, { once: true });
    };

    let _swipeCommitted = false; // true когда палец прошёл порог — возврат невозможен

    scene.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      isDrag = true; dragDelta = 0; _swipeCommitted = false;
      car.style.transition = 'none';
      wrap.classList.remove('is-settled'); clearTimeout(wrap._tS);
    }, { passive: true });

    scene.addEventListener('touchmove', e => {
      if (!isDrag) return;
      const rawDx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
      if (Math.abs(rawDx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(rawDx) + 14) { isDrag = false; resetContentDrift(true); update(true); return; }

      dragDelta = rawDx;
      _swipeCommitted = Math.abs(rawDx) > 40;

      // Карусель следует за пальцем
      const visualDelta = Math.max(-140, Math.min(140, rawDx));
      car.style.transform = `rotateY(${currIdx * -STEP + visualDelta * 0.45}deg)`;

      // Контент отлетает вниз пропорционально ходу пальца (0..1 от 0 до 120px хода)
      const swipeProgress = Math.min(1, Math.abs(rawDx) / 120);
      setContentDrift(swipeProgress, true);
    }, { passive: true });

    scene.addEventListener('touchend', e => {
      if (!isDrag) return;
      isDrag = false;

      const committed = Math.abs(dragDelta) > 40;

      if (committed) {
        // Безвозвратный свайп: контент улетает окончательно, затем появляется новый
        const tab = getActiveTab();
        if (tab) {
          tab.style.transition = 'transform .22s cubic-bezier(.55,0,1,.45), opacity .18s ease';
          tab.style.transform = 'translateY(80px)';
          tab.style.opacity = '0';
          tab.addEventListener('transitionend', () => {
            // Сброс — новый контент появится через doSelect() с анимацией tabContentIn
            tab.style.cssText = '';
          }, { once: true });
        }
        if (dragDelta > 40) currIdx--;
        else if (dragDelta < -40) currIdx++;
      } else {
        // Передумал — контент мягко возвращается на место
        resetContentDrift(false);
      }

      // Тап без движения
      if (Math.abs(dragDelta) < 10) {
        const card = e.target.closest('.sc-3d-card');
        if (card) {
          const idx = parseInt(card.dataset.idx, 10);
          const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
          if (idx === norm && wrap.classList.contains('is-settled')) doSelect();
        }
      }

      dragDelta = 0; update(true);
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
        doSelect();
      }
    });

    update(false);
    W.Intel_CarouselFlat = {
      jumpTo: (targetIdx) => {
        const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
        let diff = targetIdx - norm;
        if (diff > TOTAL / 2) diff -= TOTAL;
        if (diff < -TOTAL / 2) diff += TOTAL;
        currIdx += diff; update(true);
      },
      selectCurrent: () => doSelect()
    };
  }, 60);
}

export default { mountProfileCarouselFlat };
