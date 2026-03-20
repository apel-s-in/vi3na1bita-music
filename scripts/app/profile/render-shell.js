// UID.044_(ListenerProfile core)_(подготовить профиль к встраиванию user-intelligence блоков)_(render-shell остаётся legacy host, принимающим optional intel fragments)
// UID.056_(Recommendation reasons)_(позже принимать explainable rec fragments без knowledge об их расчёте)_(shell только размещает future blocks, но не считает причины)
// UID.070_(Linked providers)_(показывать provider shell-поверхность без владения identity truth)_(render-shell рендерит auth/provider area, но данные linked accounts приходят извне)
// UID.072_(Provider consents)_(shell должен уметь принять consent UI блоки)_(но не хранить и не вычислять consent state самостоятельно)
// UID.073_(Hybrid sync orchestrator)_(shell станет host для sync-role/status block)_(но orchestration logic останется в intel/providers layer)
// UID.082_(Local truth vs external telemetry split)_(shell не должен экспортировать profile/raw insights сам)_(это только layout/render host)
// UID.094_(No-paralysis rule)_(profile shell обязан работать без intel fragments)_(если intelligent blocks отсутствуют, legacy profile UI остаётся полноценным)
// UID.095_(Ownership boundary: legacy vs intel)_(жёстко закрепить render-shell как legacy-shell, принимающий optional intel fragments)_(layout/profile navigation/stat shell здесь, а listener/recs/providers/community insights приходят как надстройка)
const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');
export const renderProfileShell = ({ container: c, profile: p, tokens: tk, totalFull: tF, totalSec: tS, streak: strk, achCount: aC }) => {
  if (!c) return null; c.innerHTML = '';
  const ab = (id, n, ic) => `<button class="auth-btn ${id} ${tk[id] ? 'connected' : ''}" data-auth="${id}"><span>${ic}</span> ${tk[id] ? 'Подключено' : n}</button>`;
  const tpl = document.getElementById('profile-template').content.cloneNode(true);
  tpl.querySelector('#prof-avatar-btn').textContent = p.avatar; tpl.querySelector('#prof-name-inp').value = esc(p.name);
  tpl.querySelector('#prof-auth-grid').innerHTML = ab('yandex', 'Яндекс', '💽') + ab('google', 'Google', '☁️') + ab('vk', 'VK ID', '🔵');
  const ps = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  window.Utils?.dom?.createStyleOnce?.('profile-source-pref-styles', `.prof-src-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:10px}.prof-src-title{font-size:13px;font-weight:bold;color:#fff}.prof-src-sub{font-size:11px;color:#888}.prof-src-switch{display:flex;background:rgba(0,0,0,0.3);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)}.prof-src-btn{all:unset;cursor:pointer;padding:6px 12px;font-size:12px;font-weight:bold;transition:.2s}.prof-src-btn--yandex.prof-src-btn--active{color:#fff;background:radial-gradient(circle,#cc0000 0%,#880000 100%)}.prof-src-btn--github.prof-src-btn--active{color:#fff;background:radial-gradient(circle,#444 0%,#000 100%)}.prof-src-btn:not(.prof-src-btn--active){color:#666}`);
  tpl.querySelector('.profile-header').insertAdjacentHTML('afterend', `<div class="prof-src-box"><div><div class="prof-src-title">Приоритет источника</div><div class="prof-src-sub">Моментальный резерв включен всегда</div></div><div class="prof-src-switch"><button data-src="yandex" class="prof-src-btn prof-src-btn--yandex ${ps==='yandex'?'prof-src-btn--active':''}">Yandex</button><button data-src="github" class="prof-src-btn prof-src-btn--github ${ps==='github'?'prof-src-btn--active':''}">GitHub</button></div></div>`);
  tpl.querySelector('#prof-stat-tracks').textContent = tF;
  tpl.querySelector('#prof-stat-time').textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(tS) : `${Math.floor(tS/60)}м`;
  tpl.querySelector('#prof-stat-streak').textContent = strk; tpl.querySelector('#prof-stat-ach').textContent = aC;

  // === 3D CAROUSEL v4 — PHYSICAL GLASS ===
  window.Utils?.dom?.createStyleOnce?.('sc-3d-carousel-styles', `
    .sc-3d-wrap{margin:14px 0 18px;padding:0 4px;touch-action:pan-y;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;overflow:hidden}
    .sc-3d-scene{perspective:1120px;perspective-origin:50% 41%;height:258px;display:flex;align-items:center;justify-content:center;overflow:visible}
    .sc-3d-car{width:124px;height:184px;position:relative;transform-style:preserve-3d;transition:transform .56s cubic-bezier(.15,.85,.35,1);will-change:transform;--sc3d-th:10px;--sc3d-r:23px;overflow:visible}

    .sc-3d-card{position:absolute;inset:0;transform-style:preserve-3d;cursor:pointer;will-change:transform;overflow:visible}
    .glass-front,.glass-back{position:absolute;inset:0;border-radius:var(--sc3d-r);overflow:hidden}

    .glass-front{
      transform:translateZ(calc(var(--sc3d-th)/2));
      background:linear-gradient(180deg,rgba(24,46,77,.80),rgba(8,17,31,.95));
      border:1px solid rgba(136,208,255,.54);
      box-shadow:
        inset 0 0 0 1px rgba(224,244,255,.08),
        inset 0 0 18px rgba(180,228,255,.07),
        inset 0 -20px 30px rgba(15,38,70,.38),
        0 0 16px rgba(77,170,255,.14);
    }
    .glass-front::before{
      content:'';
      position:absolute;
      left:-22%;
      right:-22%;
      top:-22%;
      height:44%;
      border-radius:50%;
      background:radial-gradient(ellipse at center,rgba(220,245,255,.30) 0%,rgba(170,220,255,.12) 34%,rgba(120,190,255,.05) 52%,transparent 76%);
      filter:blur(12px);
      pointer-events:none;
    }
    .glass-front::after{
      content:'';
      position:absolute;
      left:-18%;
      right:-18%;
      bottom:-16%;
      height:36%;
      border-radius:50%;
      background:radial-gradient(ellipse at center,rgba(125,205,255,.20) 0%,rgba(77,170,255,.10) 34%,rgba(77,170,255,.04) 56%,transparent 78%);
      filter:blur(14px);
      pointer-events:none;
    }

    .glass-back{
      transform:translateZ(calc(var(--sc3d-th)/-2));
      background:linear-gradient(180deg,rgba(7,13,23,.94),rgba(2,5,11,.995));
      border:1px solid rgba(77,170,255,.10);
      box-shadow:inset 0 0 14px rgba(0,0,0,.56);
    }

    .glass-shell,
    .glass-shell-inner{
      position:absolute;
      inset:0;
      border-radius:var(--sc3d-r);
      pointer-events:none;
      transform-style:preserve-3d;
    }
    .glass-shell{
      transform:translateZ(0);
      box-shadow:
        inset 0 0 0 calc(var(--sc3d-th) * .52) rgba(116,192,255,.18),
        inset 0 0 0 calc(var(--sc3d-th) * .60) rgba(220,244,255,.08),
        inset 0 0 18px rgba(150,214,255,.08),
        0 0 12px rgba(77,170,255,.06);
      background:
        linear-gradient(180deg,rgba(166,221,255,.10),rgba(57,99,150,.12)),
        radial-gradient(120% 30% at 50% 0%,rgba(255,255,255,.18),transparent 58%),
        radial-gradient(120% 32% at 50% 100%,rgba(120,190,255,.14),transparent 62%);
    }
    .glass-shell-inner{
      inset:calc(var(--sc3d-th) * .52);
      border-radius:calc(var(--sc3d-r) - (var(--sc3d-th) * .52));
      box-shadow:
        inset 0 0 0 1px rgba(232,246,255,.08),
        inset 0 12px 16px rgba(255,255,255,.05),
        inset 0 -10px 18px rgba(19,40,74,.18);
    }

    .glass-side,
    .glass-side-top,
    .glass-side-bottom,
    .glass-side-left,
    .glass-side-right{display:none!important}

    .surface-content{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 12px 18px;transform:translateZ(.25px);pointer-events:none}
    .surface-content::before{
      content:'';
      position:absolute;
      left:50%;
      top:47%;
      width:94px;
      height:94px;
      transform:translate(-50%,-50%);
      border-radius:50%;
      background:radial-gradient(circle,rgba(183,231,255,.54) 0%,rgba(98,181,255,.18) 30%,rgba(52,104,173,.08) 54%,transparent 76%);
      filter:blur(12px);
      pointer-events:none;
    }
    .sc-3d-ic{position:relative;z-index:1;font-size:48px;line-height:1;margin-bottom:10px;filter:drop-shadow(0 0 11px rgba(169,226,255,.75)) drop-shadow(0 0 4px rgba(255,255,255,.42))}
    .sc-3d-tit{position:relative;z-index:1;font-size:11px;font-weight:900;color:#fff;letter-spacing:1.4px;text-transform:uppercase;text-align:center;text-shadow:0 0 12px rgba(145,214,255,.98),0 0 4px rgba(255,255,255,.35),0 2px 8px rgba(0,0,0,.82);line-height:1.25}

    .crack-layer,.crack-back{position:absolute;inset:0;pointer-events:none;overflow:hidden}
    .crack-layer{z-index:3;opacity:.98}
    .crack-back{z-index:0;transform:translateZ(calc(var(--sc3d-th)/-2 + 1px));opacity:.20;filter:blur(.2px)}
    .crack-layer svg,.crack-back svg{width:100%;height:100%;display:block;overflow:visible}
    .crack-layer image,.crack-back image{mix-blend-mode:screen}

    .sc-3d-card.is-active .glass-front{
      border-color:rgba(154,221,255,.88);
      box-shadow:
        inset 0 0 0 1px rgba(235,248,255,.10),
        inset 0 0 26px rgba(166,226,255,.12),
        inset 0 -28px 38px rgba(17,42,76,.44),
        0 0 26px rgba(77,170,255,.24);
    }
    .sc-3d-card.is-active .surface-content::before{width:108px;height:108px}
    .sc-3d-card.is-active .sc-3d-tit{text-shadow:0 0 14px rgba(142,218,255,1),0 0 5px rgba(255,255,255,.78),0 2px 8px rgba(0,0,0,.82)}

    .sc-3d-card.is-back .glass-front,.sc-3d-card.is-back .glass-back,.sc-3d-card.is-back .glass-side{opacity:.54}
    .sc-3d-card.is-back .surface-content{opacity:.42}
    .sc-3d-card.is-back .crack-layer{opacity:.38}

    .sc-3d-controls{display:flex;gap:14px;justify-content:center;padding:2px 16px 24px}
    .sc-3d-btn{position:relative;flex:1;max-width:125px;height:52px;background:linear-gradient(180deg,#0d1828,#070d16);border:1px solid rgba(77,170,255,.35);color:#7ab4f5;border-radius:16px;font-weight:900;font-size:14px;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08)}
    .sc-3d-btn::before{content:'';position:absolute;top:0;left:0;right:0;height:48%;background:linear-gradient(180deg,rgba(255,255,255,.1),transparent);border-radius:16px 16px 0 0;pointer-events:none}
    .sc-3d-btn::after{content:'';position:absolute;bottom:0;left:15%;right:15%;height:1px;background:linear-gradient(90deg,transparent,rgba(77,170,255,.5),transparent);pointer-events:none}
    .sc-3d-btn:active{transform:translateY(2px) scale(.96);box-shadow:0 4px 10px rgba(0,0,0,.7)}
    .sc-3d-btn.is-select{background:linear-gradient(180deg,#0e2040,#071020);border-color:rgba(77,170,255,.9);color:#fff;box-shadow:0 0 24px rgba(77,170,255,.45),0 8px 20px rgba(0,0,0,.6),inset 0 0 16px rgba(77,170,255,.12);text-shadow:0 0 10px rgba(77,170,255,1),0 0 4px #fff}
  `);

  // ── Один и тот же crack-файл, но 6 разных композиций ──
  const crackCfg = [
    { x: -338, y: -246, w: 840, h: 840, r: -14, o: .90 },
    { x: -120, y: -292, w: 780, h: 780, r: 18,  o: .96 },
    { x: -404, y: -92,  w: 900, h: 900, r: 164, o: .88 },
    { x: -210, y: -356, w: 860, h: 860, r: 32,  o: .94 },
    { x: -470, y: -40,  w: 920, h: 920, r: -36, o: .86 },
    { x: -6,   y: -210, w: 760, h: 760, r: 10,  o: .92 }
  ];

  const makeCrack = (idx, back = false) => {
    const c = crackCfg[idx] || crackCfg[0], x = c.x + (back ? (idx % 2 ? 10 : -10) : 0), y = c.y + (back ? ((idx % 3) * 6 - 6) : 0), w = c.w + (back ? 24 : 0), h = c.h + (back ? 24 : 0), r = c.r + (back ? -7 : 0), o = back ? Math.max(.12, c.o * .22) : c.o;
    return `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><image href="img/vitrina-crack-01.svg" x="${x}" y="${y}" width="${w}" height="${h}" transform="rotate(${r},${x + w / 2},${y + h / 2})" preserveAspectRatio="xMidYMid meet" style="mix-blend-mode:screen;opacity:${o}"/></svg>`;
  };

  const cracks = crackCfg.map((_, i) => makeCrack(i));
  const cracksBack = crackCfg.map((_, i) => makeCrack(i, true));

  const cardsData = [
    { id: 'stats',        tit: 'Статистика',    ic: '📊' },
    { id: 'achievements', tit: 'Достижения',     ic: '🏆' },
    { id: 'recs',         tit: 'Рекомендации',   ic: '💡' },
    { id: 'logs',         tit: 'Журнал',         ic: '📜' },
    { id: 'settings',     tit: 'Настройки',      ic: '⚙️' },
    { id: 'account',      tit: 'Аккаунт',        ic: '👤' }
  ];

  const TOTAL   = cardsData.length;   // 6
  const STEP    = 360 / TOTAL;        // 60°
  const RADIUS  = 142;

  const cardsHtml = cardsData.map((d, i) => {
    const angle = i * STEP;
    return `
      <div class="sc-3d-card" data-idx="${i}" data-id="${d.id}" style="transform:rotateY(${angle}deg) translateZ(${RADIUS}px)">
        <div class="glass-back"></div>
        <div class="crack-back">${cracksBack[i]}</div>
        <div class="glass-shell"></div>
        <div class="glass-shell-inner"></div>
        <div class="glass-side glass-side-top"></div>
        <div class="glass-side glass-side-bottom"></div>
        <div class="glass-side glass-side-left"></div>
        <div class="glass-side glass-side-right"></div>
        <div class="glass-front">
          <div class="surface-content">
            <div class="sc-3d-ic">${d.ic}</div>
            <div class="sc-3d-tit">${d.tit}</div>
          </div>
          <div class="crack-layer">${cracks[i]}</div>
        </div>
      </div>`;
  }).join('');

  const protoWrap = document.createElement('div');
  protoWrap.className = 'sc-3d-wrap';
  protoWrap.innerHTML = `
    <div class="sc-3d-scene">
      <div class="sc-3d-car" id="sc-3d-car">${cardsHtml}</div>
    </div>
    <div class="sc-3d-controls">
      <button class="sc-3d-btn" id="sc-3d-prev">◄ Пред</button>
      <button class="sc-3d-btn is-select" id="sc-3d-sel">Выбрать</button>
      <button class="sc-3d-btn" id="sc-3d-next">След ►</button>
    </div>`;

  const oldTabs = tpl.querySelector('.profile-tabs');
  if (oldTabs) oldTabs.replaceWith(protoWrap);

  // ── ЛОГИКА И ФИЗИКА ──
  let currIdx = 0;
  let startX = 0, startY = 0, isDrag = false, dragDelta = 0;

  setTimeout(() => {
    const car  = c.querySelector('#sc-3d-car');
    const prev = c.querySelector('#sc-3d-prev');
    const next = c.querySelector('#sc-3d-next');
    const sel  = c.querySelector('#sc-3d-sel');
    if (!car) return;

    // Обновить положение карусели + классы карточек
    const update = (animated = true) => {
      car.style.transition = animated
        ? 'transform .6s cubic-bezier(.15,.85,.35,1)'
        : 'none';
      car.style.transform = `rotateY(${currIdx * -STEP}deg)`;

      const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      car.querySelectorAll('.sc-3d-card').forEach((card, i) => {
        const diff = Math.min(
          Math.abs(i - norm),
          TOTAL - Math.abs(i - norm)
        );
        card.classList.toggle('is-active', diff === 0);
        card.classList.toggle('is-back',   diff >= 2);
      });
    };

    // Один шаг карусели
    const step = (dir) => { currIdx += dir; update(); };

    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(+1));

    sel.addEventListener('click', () => {
      const norm     = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      const activeId = cardsData[norm].id;
      // Подсветить активную карточку
      car.querySelectorAll('.sc-3d-card').forEach(x =>
        x.classList.remove('is-selecting'));
      car.querySelector(`[data-idx="${norm}"]`)
         ?.classList.add('is-selecting');
      // Переключить вкладку профиля (совместимость со старыми вкладками)
      c.querySelectorAll('.profile-tab-content')
       .forEach(x => x.classList.remove('active'));
      const tab = c.querySelector(`#tab-${activeId}`);
      if (tab) tab.classList.add('active');
      else W.NotificationSystem?.info(
        `Раздел «${cardsData[norm].tit}» открывается...`);
    });

    // ── СВАЙП (Touch) ──
    const scene = c.querySelector('.sc-3d-scene');

    scene.addEventListener('touchstart', e => {
      startX   = e.touches[0].clientX;
      startY   = e.touches[0].clientY;
      isDrag   = true;
      dragDelta = 0;
      car.style.transition = 'none';
    }, { passive: true });

    scene.addEventListener('touchmove', e => {
      if (!isDrag) return;
      dragDelta = e.touches[0].clientX - startX;
      const dy  = e.touches[0].clientY - startY;
      // Если жест скорее вертикальный — не перехватываем
      if (Math.abs(dy) > Math.abs(dragDelta) + 10) { isDrag = false; return; }
      // Прилипание к пальцу (делим на 3 для инерции)
      car.style.transform =
        `rotateY(${currIdx * -STEP + dragDelta / 3}deg)`;
    }, { passive: true });

    scene.addEventListener('touchend', () => {
      if (!isDrag) return;
      isDrag = false;
      if (Math.abs(dragDelta) > 35) {
        currIdx += dragDelta > 0 ? -1 : 1;
      }
      update(true);
    }, { passive: true });

    // ── КОЛЕСО МЫШИ (Desktop) ──
    scene.addEventListener('wheel', e => {
      e.preventDefault();
      step(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    // ── КЛИК ПО БОКОВОЙ КАРТОЧКЕ ──
    car.addEventListener('click', e => {
      const card = e.target.closest('.sc-3d-card');
      if (!card) return;
      const idx  = parseInt(card.dataset.idx, 10);
      const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      if (idx !== norm) {
        // Кратчайший путь к карточке
        let diff = idx - norm;
        if (diff >  TOTAL / 2) diff -= TOTAL;
        if (diff < -TOTAL / 2) diff += TOTAL;
        currIdx += diff;
        update(true);
      }
    });

    // Начальное состояние
    update(false);
  }, 60);
  // === END 3D CAROUSEL v4 ===

  c.appendChild(tpl); return c;
};
export default { renderProfileShell };
