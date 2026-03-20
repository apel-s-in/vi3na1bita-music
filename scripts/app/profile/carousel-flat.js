const W = window;

const cardsData = [
  { id: 'stats', tit: 'Статистика', ic: '📊', crack: 'top-right' },
  { id: 'achievements', tit: 'Достижения', ic: '🏆', crack: 'left-center' },
  { id: 'recs', tit: 'Рекомендации', ic: '💡', crack: 'center-spread', compact: true },
  { id: 'logs', tit: 'Журнал', ic: '📜', crack: 'right-center' },
  { id: 'settings', tit: 'Настройки', ic: '⚙️', crack: 'top-left' },
  { id: 'account', tit: 'Аккаунт', ic: '👤', crack: 'top-cross' }
];

const crackCfg = {
  'top-right':     { x: 18, y: -8, w: 146, h: 188, r: 8,   o: .92 },
  'left-center':   { x: -8, y: 22, w: 138, h: 178, r: -10, o: .88 },
  'center-spread': { x: 10, y: 58, w: 144, h: 114, r: -2,  o: .82 },
  'right-center':  { x: 46, y: 10, w: 112, h: 168, r: 12,  o: .9 },
  'top-left':      { x: -6, y: -6, w: 138, h: 184, r: -14, o: .9 },
  'top-cross':     { x: 14, y: -4, w: 142, h: 190, r: 4,   o: .94 }
};

const makeCrack = kind => {
  const c = crackCfg[kind] || crackCfg['center-spread'];
  return `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><image href="img/vitrina-crack-01.svg" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" transform="rotate(${c.r},${c.x + c.w / 2},${c.y + c.h / 2})" preserveAspectRatio="xMidYMid meet" style="mix-blend-mode:screen;opacity:${c.o}"/></svg>`;
};

const ensureStyles = () => {
  W.Utils?.dom?.createStyleOnce?.('sc-3d-carousel-flat-styles', `
    .sc-3d-wrap{margin:14px 0 18px;padding:0 2px;touch-action:pan-y;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;overflow:hidden}
    .sc-3d-scene{perspective:1080px;perspective-origin:50% 41%;height:252px;display:flex;align-items:center;justify-content:center;overflow:visible}
    .sc-3d-car{width:126px;height:186px;position:relative;transform-style:preserve-3d;transition:transform .56s cubic-bezier(.15,.85,.35,1);will-change:transform}
    .sc-3d-card{position:absolute;inset:0;cursor:pointer;will-change:transform;transition:opacity .2s ease,filter .2s ease}
    .glass-face{
      position:absolute;inset:0;border-radius:24px;overflow:hidden;
      background:
        linear-gradient(180deg,rgba(34,62,102,.74),rgba(10,18,32,.95)),
        radial-gradient(circle at 50% 18%,rgba(235,246,255,.08),transparent 40%),
        linear-gradient(145deg,rgba(255,255,255,.03),rgba(255,255,255,0) 30%,rgba(255,255,255,.02) 60%,rgba(0,0,0,.05));
      border:1px solid rgba(144,214,255,.62);
      box-shadow:
        inset 0 0 0 1px rgba(230,246,255,.08),
        inset 0 0 24px rgba(164,224,255,.08),
        inset 0 -18px 28px rgba(17,40,70,.32),
        0 0 18px rgba(77,170,255,.16);
      backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
    }
    .glass-face::before{
      content:'';position:absolute;left:8px;right:8px;top:8px;bottom:8px;border-radius:20px;
      box-shadow:inset 0 0 0 1px rgba(228,245,255,.08);
      pointer-events:none;z-index:0
    }
    .glass-face::after{
      content:'';position:absolute;left:-14%;right:-14%;top:-18%;height:52%;
      background:radial-gradient(ellipse at center,rgba(236,247,255,.22) 0%,rgba(150,214,255,.1) 40%,transparent 74%);
      border-radius:50%;filter:blur(14px);pointer-events:none;z-index:0
    }
    .glass-noise{
      position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.22;mix-blend-mode:screen;
      background:
        radial-gradient(circle at 12% 18%,rgba(255,255,255,.08) 0 1px,transparent 1.4px),
        radial-gradient(circle at 76% 34%,rgba(255,255,255,.06) 0 1px,transparent 1.4px),
        radial-gradient(circle at 42% 76%,rgba(255,255,255,.05) 0 1px,transparent 1.5px),
        radial-gradient(circle at 82% 68%,rgba(255,255,255,.04) 0 1px,transparent 1.6px),
        linear-gradient(180deg,rgba(255,255,255,.018),rgba(255,255,255,0));
      background-size:64px 64px,72px 72px,80px 80px,92px 92px,100% 100%;
    }
    .surface-content{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 14px 20px;pointer-events:none}
    .surface-content::before{
      content:'';position:absolute;left:50%;top:48%;width:96px;height:96px;transform:translate(-50%,-50%);
      border-radius:50%;background:radial-gradient(circle,rgba(180,230,255,.50) 0%,rgba(96,180,255,.18) 30%,rgba(50,102,170,.08) 54%,transparent 76%);
      filter:blur(11px);pointer-events:none
    }
    .sc-3d-ic{position:relative;z-index:1;font-size:48px;line-height:1;margin-bottom:10px;filter:drop-shadow(0 0 10px rgba(160,224,255,.72)) drop-shadow(0 0 4px rgba(255,255,255,.40))}
    .sc-3d-tit{position:relative;z-index:1;font-size:10px;font-weight:900;color:#fff;letter-spacing:1.15px;text-transform:uppercase;text-align:center;text-shadow:0 0 11px rgba(145,214,255,.96),0 0 4px rgba(255,255,255,.34),0 2px 7px rgba(0,0,0,.82);line-height:1.2;max-width:100%;padding:0 10px}
    .sc-3d-tit.compact{font-size:9px;letter-spacing:.65px;padding:0 16px}
    .crack-layer{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;opacity:.9}
    .crack-layer svg{width:100%;height:100%;display:block}
    .crack-layer image{mix-blend-mode:screen}
    .sc-3d-card.is-active .glass-face{
      border-color:rgba(164,226,255,.92);
      box-shadow:
        inset 0 0 0 1px rgba(240,249,255,.1),
        inset 0 0 32px rgba(174,229,255,.13),
        inset 0 -20px 30px rgba(17,40,70,.36),
        0 0 28px rgba(77,170,255,.24)
    }
    .sc-3d-card.is-active .surface-content::before{width:110px;height:110px}
    .sc-3d-card.is-active .sc-3d-tit{text-shadow:0 0 14px rgba(150,220,255,1),0 0 5px rgba(255,255,255,.76),0 2px 8px rgba(0,0,0,.82)}
    .sc-3d-card.is-back{opacity:.46;filter:saturate(.86)}
    .sc-3d-card.is-back .surface-content{opacity:.48}
    .sc-3d-card.is-back .crack-layer{opacity:.34}
    .sc-3d-card.is-side .glass-face::before{
      box-shadow:
        inset 0 0 0 1px rgba(228,245,255,.06),
        inset 28px 0 22px rgba(255,255,255,.025),
        inset -18px 0 18px rgba(77,170,255,.035)
    }
    .sc-3d-card.is-side .glass-face .glass-reflection{
      opacity:.22
    }
    .glass-reflection{
      position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0;
      background:linear-gradient(100deg,transparent 12%,rgba(255,255,255,.06) 28%,rgba(160,220,255,.08) 36%,transparent 54%);
      transform:translateX(-6%);
      transition:opacity .2s ease
    }
    .sc-3d-controls{display:flex;gap:14px;justify-content:center;padding:2px 16px 24px}
    .sc-3d-btn{position:relative;flex:1;max-width:125px;height:52px;background:linear-gradient(180deg,#0d1828,#070d16);border:1px solid rgba(77,170,255,.35);color:#7ab4f5;border-radius:16px;font-weight:900;font-size:14px;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08)}
    .sc-3d-btn::before{content:'';position:absolute;top:0;left:0;right:0;height:48%;background:linear-gradient(180deg,rgba(255,255,255,.1),transparent);border-radius:16px 16px 0 0;pointer-events:none}
    .sc-3d-btn::after{content:'';position:absolute;bottom:0;left:15%;right:15%;height:1px;background:linear-gradient(90deg,transparent,rgba(77,170,255,.5),transparent);pointer-events:none}
    .sc-3d-btn:active{transform:translateY(2px) scale(.96);box-shadow:0 4px 10px rgba(0,0,0,.7)}
    .sc-3d-btn.is-select{background:linear-gradient(180deg,#0e2040,#071020);border-color:rgba(77,170,255,.9);color:#fff;box-shadow:0 0 24px rgba(77,170,255,.45),0 8px 20px rgba(0,0,0,.6),inset 0 0 16px rgba(77,170,255,.12);text-shadow:0 0 10px rgba(77,170,255,1),0 0 4px #fff}
  `);
};

export function mountProfileCarouselFlat({ root, tpl }) {
  ensureStyles();

  const TOTAL = cardsData.length;
  const STEP = 360 / TOTAL;
  const RADIUS = 142;

  const cardsHtml = cardsData.map((d, i) => {
    const angle = i * STEP;
    return `<div class="sc-3d-card" data-idx="${i}" data-id="${d.id}" style="transform:rotateY(${angle}deg) translateZ(${RADIUS}px)"><div class="glass-face"><div class="glass-reflection"></div><div class="glass-noise"></div><div class="surface-content"><div class="sc-3d-ic">${d.ic}</div><div class="sc-3d-tit ${d.compact ? 'compact' : ''}">${d.tit}</div></div><div class="crack-layer">${makeCrack(d.crack)}</div></div></div>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'sc-3d-wrap';
  wrap.innerHTML = `<div class="sc-3d-scene"><div class="sc-3d-car" id="sc-3d-car">${cardsHtml}</div></div><div class="sc-3d-controls"><button class="sc-3d-btn" id="sc-3d-prev">◄ Пред</button><button class="sc-3d-btn is-select" id="sc-3d-sel">Выбрать</button><button class="sc-3d-btn" id="sc-3d-next">След ►</button></div>`;

  const oldTabs = tpl.querySelector('.profile-tabs');
  if (oldTabs) oldTabs.replaceWith(wrap);

  let currIdx = 0;
  let startX = 0;
  let startY = 0;
  let isDrag = false;
  let dragDelta = 0;

  setTimeout(() => {
    const car = root.querySelector('#sc-3d-car');
    const prev = root.querySelector('#sc-3d-prev');
    const next = root.querySelector('#sc-3d-next');
    const sel = root.querySelector('#sc-3d-sel');
    const scene = root.querySelector('.sc-3d-scene');
    if (!car || !scene) return;

    const update = (animated = true) => {
      car.style.transition = animated ? 'transform .56s cubic-bezier(.15,.85,.35,1)' : 'none';
      car.style.transform = `rotateY(${currIdx * -STEP}deg)`;
      const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      car.querySelectorAll('.sc-3d-card').forEach((card, i) => {
        const diff = Math.min(Math.abs(i - norm), TOTAL - Math.abs(i - norm));
        card.classList.toggle('is-active', diff === 0);
        card.classList.toggle('is-back', diff >= 2);
        card.classList.toggle('is-side', diff === 1);
      });
    };

    const step = dir => { currIdx += dir; update(true); };

    prev?.addEventListener('click', () => step(-1));
    next?.addEventListener('click', () => step(1));

    sel?.addEventListener('click', () => {
      const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      const activeId = cardsData[norm].id;
      root.querySelectorAll('.profile-tab-content').forEach(x => x.classList.remove('active'));
      const tab = root.querySelector(`#tab-${activeId}`);
      if (tab) tab.classList.add('active');
      else W.NotificationSystem?.info(`Раздел «${cardsData[norm].tit}» открывается...`);
    });

    scene.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDrag = true;
      dragDelta = 0;
      car.style.transition = 'none';
    }, { passive: true });

    scene.addEventListener('touchmove', e => {
      if (!isDrag) return;
      dragDelta = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dragDelta) + 10) { isDrag = false; return; }
      car.style.transform = `rotateY(${currIdx * -STEP + dragDelta / 3}deg)`;
    }, { passive: true });

    scene.addEventListener('touchend', () => {
      if (!isDrag) return;
      isDrag = false;
      if (Math.abs(dragDelta) > 35) currIdx += dragDelta > 0 ? -1 : 1;
      update(true);
    }, { passive: true });

    scene.addEventListener('wheel', e => {
      e.preventDefault();
      step(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    car.addEventListener('click', e => {
      const card = e.target.closest('.sc-3d-card');
      if (!card) return;
      const idx = parseInt(card.dataset.idx, 10);
      const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      if (idx !== norm) {
        let diff = idx - norm;
        if (diff > TOTAL / 2) diff -= TOTAL;
        if (diff < -TOTAL / 2) diff += TOTAL;
        currIdx += diff;
        update(true);
      }
    });

    update(false);
  }, 60);
}

export default { mountProfileCarouselFlat };
