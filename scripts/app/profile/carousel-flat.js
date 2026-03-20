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
  'top-right':     { x: 8,  y: -20, w: 164, h: 206, r: 8,   o: .98 },
  'left-center':   { x: -18,y: 8,   w: 156, h: 196, r: -10, o: .96 },
  'center-spread': { x: -2, y: 42,  w: 168, h: 132, r: -2,  o: .97 },
  'right-center':  { x: 34, y: -2,  w: 134, h: 188, r: 12,  o: .97 },
  'top-left':      { x: -18,y: -18, w: 156, h: 204, r: -14, o: .97 },
  'top-cross':     { x: 0,  y: -18, w: 166, h: 208, r: 4,   o: .99 }
};

const makeCrack = kind => {
  const c = crackCfg[kind] || crackCfg['center-spread'];
  return `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><image href="img/vitrina-crack-01.svg" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" transform="rotate(${c.r},${c.x + c.w / 2},${c.y + c.h / 2})" preserveAspectRatio="xMidYMid meet" style="mix-blend-mode:screen;opacity:${c.o}"/></svg>`;
};

const ensureStyles = () => {
  W.Utils?.dom?.createStyleOnce?.('sc-3d-carousel-flat-styles', `
    .sc-3d-wrap{margin:14px 0 18px;padding:0 2px;touch-action:pan-y;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;overflow:visible}
    .sc-3d-scene{perspective:1080px;perspective-origin:50% 40%;height:264px;display:flex;align-items:center;justify-content:center;overflow:visible;padding-top:10px}
    .sc-3d-car{width:128px;height:190px;position:relative;transform-style:preserve-3d;transition:transform .64s cubic-bezier(.16,.84,.28,1);will-change:transform}
    .sc-3d-card{position:absolute;inset:0;cursor:pointer;will-change:transform;transition:opacity .22s ease,filter .22s ease;overflow:visible}
    .glass-halo{position:absolute;left:-22%;right:-22%;top:-22%;height:86px;z-index:0;pointer-events:none;opacity:.92;background:radial-gradient(ellipse at center,rgba(170,225,255,.24) 0%,rgba(115,190,255,.12) 34%,rgba(77,170,255,.06) 52%,transparent 78%);filter:blur(18px)}
    .glass-face{
      position:absolute;inset:0;border-radius:24px;overflow:hidden;
      background:
        linear-gradient(180deg,rgba(26,49,82,.88),rgba(8,16,30,.985)),
        radial-gradient(circle at 50% 18%,rgba(238,248,255,.08),transparent 42%),
        linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,0) 26%,rgba(255,255,255,.03) 58%,rgba(0,0,0,.08));
      border:1px solid rgba(168,225,255,.72);
      box-shadow:
        inset 0 0 0 1px rgba(245,250,255,.10),
        inset 0 1px 0 rgba(255,255,255,.12),
        inset 0 0 28px rgba(164,224,255,.10),
        inset 0 -24px 36px rgba(16,38,68,.42),
        0 0 18px rgba(77,170,255,.14);
      backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
    }
    .glass-face::before{
      content:'';position:absolute;left:6px;right:6px;top:6px;bottom:6px;border-radius:20px;
      box-shadow:
        inset 0 0 0 1px rgba(236,247,255,.11),
        inset 0 10px 16px rgba(255,255,255,.04),
        inset 0 -12px 18px rgba(13,31,56,.22);
      pointer-events:none;z-index:0
    }
    .glass-face::after{
      content:'';position:absolute;inset:-1px;border-radius:24px;pointer-events:none;z-index:0;
      box-shadow:
        inset 0 0 0 1px rgba(120,196,255,.24),
        0 0 0 1px rgba(108,190,255,.20),
        0 0 14px rgba(77,170,255,.18);
    }
    .glass-bevel{
      position:absolute;inset:0;border-radius:24px;z-index:0;pointer-events:none;
      background:
        linear-gradient(180deg,rgba(255,255,255,.10),transparent 18%,transparent 78%,rgba(70,130,190,.12)),
        linear-gradient(90deg,rgba(255,255,255,.08),transparent 16%,transparent 84%,rgba(90,150,210,.10));
      mix-blend-mode:screen;opacity:.72
    }
    .glass-noise{
      position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.34;mix-blend-mode:screen;
      background:
        radial-gradient(circle at 8% 14%,rgba(255,255,255,.09) 0 1px,transparent 1.45px),
        radial-gradient(circle at 28% 24%,rgba(255,255,255,.05) 0 1px,transparent 1.35px),
        radial-gradient(circle at 74% 18%,rgba(255,255,255,.07) 0 1px,transparent 1.45px),
        radial-gradient(circle at 66% 54%,rgba(255,255,255,.05) 0 1px,transparent 1.55px),
        radial-gradient(circle at 34% 76%,rgba(255,255,255,.05) 0 1px,transparent 1.45px),
        radial-gradient(circle at 82% 82%,rgba(255,255,255,.04) 0 1px,transparent 1.65px),
        linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,0));
      background-size:42px 42px,56px 56px,64px 64px,72px 72px,82px 82px,94px 94px,100% 100%;
    }
    .surface-content{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 12px 24px;pointer-events:none}
    .surface-content::before{
      content:'';position:absolute;left:50%;top:47%;width:104px;height:104px;transform:translate(-50%,-50%);
      border-radius:50%;background:radial-gradient(circle,rgba(188,233,255,.54) 0%,rgba(102,182,255,.20) 30%,rgba(50,102,170,.08) 56%,transparent 78%);
      filter:blur(13px);pointer-events:none
    }
    .sc-3d-ic{position:relative;z-index:1;font-size:48px;line-height:1;margin:0 0 12px;filter:drop-shadow(0 0 12px rgba(172,231,255,.78)) drop-shadow(0 0 4px rgba(255,255,255,.46))}
    .sc-3d-tit{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;min-height:34px;font-size:11px;font-weight:900;color:#fff;letter-spacing:1px;text-transform:uppercase;text-align:center;text-shadow:0 0 13px rgba(150,220,255,.98),0 0 4px rgba(255,255,255,.38),0 2px 8px rgba(0,0,0,.84);line-height:1.18;max-width:100%;padding:0 12px;word-break:break-word}
    .sc-3d-tit.compact{font-size:9.5px;letter-spacing:.4px;padding:0 14px;line-height:1.14}
    .crack-layer{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;opacity:.98}
    .crack-layer svg{width:100%;height:100%;display:block}
    .crack-layer image{mix-blend-mode:screen;filter:contrast(1.35) brightness(1.22) drop-shadow(0 0 2px rgba(210,240,255,.55)) drop-shadow(0 0 7px rgba(160,220,255,.16))}
    .sc-3d-card.is-active .glass-halo{opacity:1;filter:blur(20px)}
    .sc-3d-card.is-active .glass-face{
      border-color:rgba(184,233,255,.96);
      box-shadow:
        inset 0 0 0 1px rgba(246,251,255,.11),
        inset 0 1px 0 rgba(255,255,255,.15),
        inset 0 0 34px rgba(180,232,255,.14),
        inset 0 -26px 38px rgba(16,39,68,.46),
        0 0 30px rgba(77,170,255,.22)
    }
    .sc-3d-card.is-active .surface-content::before{width:118px;height:118px}
    .sc-3d-card.is-active .sc-3d-tit{text-shadow:0 0 16px rgba(160,226,255,1),0 0 6px rgba(255,255,255,.8),0 2px 8px rgba(0,0,0,.84)}
    .sc-3d-card.is-back{opacity:.58;filter:saturate(.88) brightness(.94)}
    .sc-3d-card.is-back .surface-content{opacity:.54}
    .sc-3d-card.is-back .crack-layer{opacity:.44}
    .sc-3d-card.is-side .glass-face::before{
      box-shadow:
        inset 0 0 0 1px rgba(228,245,255,.07),
        inset 30px 0 24px rgba(255,255,255,.03),
        inset -18px 0 18px rgba(77,170,255,.04),
        inset 0 -10px 14px rgba(13,31,56,.16)
    }
    .sc-3d-card.is-side .glass-face .glass-reflection{opacity:.28}
    .glass-reflection{
      position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0;
      background:
        linear-gradient(100deg,transparent 10%,rgba(255,255,255,.08) 26%,rgba(180,228,255,.10) 34%,transparent 56%),
        linear-gradient(180deg,rgba(255,255,255,.02),transparent 50%,rgba(255,255,255,.015));
      transform:translateX(-5%);
      transition:opacity .24s ease
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
    return `<div class="sc-3d-card" data-idx="${i}" data-id="${d.id}" style="transform:rotateY(${angle}deg) translateZ(${RADIUS}px)"><div class="glass-halo"></div><div class="glass-face"><div class="glass-reflection"></div><div class="glass-bevel"></div><div class="glass-noise"></div><div class="surface-content"><div class="sc-3d-ic">${d.ic}</div><div class="sc-3d-tit ${d.compact ? 'compact' : ''}">${d.tit}</div></div><div class="crack-layer">${makeCrack(d.crack)}</div></div></div>`;
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
      car.style.transition = animated ? 'transform .64s cubic-bezier(.16,.84,.28,1)' : 'none';
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
      const rawDx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(rawDx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(rawDx) + 14) { isDrag = false; update(true); return; }
      dragDelta = Math.max(-78, Math.min(78, rawDx));
      car.style.transform = `rotateY(${currIdx * -STEP + dragDelta / 4.8}deg)`;
    }, { passive: true });

    scene.addEventListener('touchend', () => {
      if (!isDrag) return;
      isDrag = false;
      if (Math.abs(dragDelta) > 42) currIdx += dragDelta > 0 ? -1 : 1;
      dragDelta = 0;
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
