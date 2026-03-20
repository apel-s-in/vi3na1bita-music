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
    .sc-3d-wrap{margin:20px 0;overflow:hidden;touch-action:pan-y;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
    .sc-3d-scene{perspective:900px;perspective-origin:50% 45%;height:310px;display:flex;align-items:center;justify-content:center}
    .sc-3d-car{width:160px;height:230px;position:relative;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.15,.85,.35,1);will-change:transform}

    /* ── КАРТОЧКА (контейнер слоёв) ── */
    .sc-3d-card{position:absolute;inset:0;transform-style:preserve-3d;cursor:pointer;will-change:transform}

    /* ── ЛИЦЕВАЯ ГРАНЬ ── */
    .glass-front{position:absolute;inset:0;border-radius:20px;background:linear-gradient(145deg,rgba(30,50,80,.55),rgba(10,18,30,.7));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(77,170,255,.5);box-shadow:inset 0 0 30px rgba(77,170,255,.08),0 0 0 .5px rgba(255,255,255,.15) inset;transform:translateZ(5px);overflow:hidden}
    /* верхний блик — имитация каустики */
    .glass-front::before{content:'';position:absolute;top:-30%;left:-20%;width:140%;height:60%;background:linear-gradient(160deg,rgba(255,255,255,.13) 0%,transparent 60%);border-radius:50%;pointer-events:none}
    /* нижний блик */
    .glass-front::after{content:'';position:absolute;bottom:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,rgba(77,170,255,.6),transparent);pointer-events:none}

    /* ── ЗАДНЯЯ ГРАНЬ ── */
    .glass-back{position:absolute;inset:0;border-radius:20px;background:rgba(5,12,22,.8);border:1px solid rgba(77,170,255,.2);transform:translateZ(-5px)}

    /* ── ТОРЦЫ (боковые грани — толщина стекла) ── */
    .glass-side{position:absolute;background:linear-gradient(180deg,rgba(77,170,255,.3),rgba(30,60,100,.4));backdrop-filter:blur(4px)}
    .glass-side-top{top:0;left:4px;right:4px;height:10px;transform:rotateX(90deg) translateZ(5px);transform-origin:top center;border-top:1px solid rgba(255,255,255,.3)}
    .glass-side-bottom{bottom:0;left:4px;right:4px;height:10px;transform:rotateX(-90deg) translateZ(5px);transform-origin:bottom center;border-bottom:1px solid rgba(255,255,255,.15)}
    .glass-side-left{left:0;top:4px;bottom:4px;width:10px;transform:rotateY(-90deg) translateZ(5px);transform-origin:left center;border-left:1px solid rgba(255,255,255,.2)}
    .glass-side-right{right:0;top:4px;bottom:4px;width:10px;transform:rotateY(90deg) translateZ(5px);transform-origin:right center;border-right:1px solid rgba(255,255,255,.2)}

    /* ── ТРЕЩИНЫ ── */
    .crack-layer{position:absolute;inset:0;border-radius:20px;pointer-events:none;overflow:hidden}
    .crack-layer svg{width:100%;height:100%;filter:drop-shadow(0 0 2px rgba(180,220,255,.9))}
    /* трещины на задней грани — чуть темнее */
    .crack-back{position:absolute;inset:0;border-radius:20px;pointer-events:none;overflow:hidden;transform:translateZ(-4px);opacity:.4}
    .crack-back svg{width:100%;height:100%}

    /* ── КОНТЕНТ (парит над стеклом) ── */
    .card-content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateZ(28px);pointer-events:none;z-index:10}
    .sc-3d-ic{font-size:56px;line-height:1;margin-bottom:14px;filter:drop-shadow(0 0 18px rgba(77,170,255,1)) drop-shadow(0 0 6px rgba(255,255,255,.8)) drop-shadow(0 2px 8px rgba(0,0,0,.9));transition:filter .3s}
    .sc-3d-tit{font-size:13px;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase;text-align:center;text-shadow:0 0 14px rgba(77,170,255,1),0 0 6px rgba(255,255,255,.7),0 2px 4px rgba(0,0,0,.9);line-height:1.3}

    /* ── СОСТОЯНИЯ КАРТОЧЕК ── */
    /* активная (центральная) */
    .sc-3d-card.is-active .glass-front{border-color:rgba(77,170,255,.9);box-shadow:inset 0 0 40px rgba(77,170,255,.15),0 0 30px rgba(77,170,255,.4)}
    .sc-3d-card.is-active .sc-3d-ic{filter:drop-shadow(0 0 22px rgba(77,170,255,1)) drop-shadow(0 0 10px rgba(255,255,255,.9)) drop-shadow(0 0 40px rgba(77,170,255,.6))}
    /* задние карточки — затухание */
    .sc-3d-card.is-back .glass-front{opacity:.35;border-color:rgba(77,170,255,.15)}
    .sc-3d-card.is-back .card-content{opacity:.2}
    .sc-3d-card.is-back .crack-layer{opacity:.15}

    /* ── КНОПКИ УПРАВЛЕНИЯ ── */
    .sc-3d-controls{display:flex;gap:14px;justify-content:center;padding:4px 16px 28px}
    .sc-3d-btn{position:relative;flex:1;max-width:125px;height:52px;background:linear-gradient(180deg,#0d1828,#070d16);border:1px solid rgba(77,170,255,.35);color:#7ab4f5;border-radius:16px;font-weight:900;font-size:14px;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08)}
    /* верхний блик кнопки */
    .sc-3d-btn::before{content:'';position:absolute;top:0;left:0;right:0;height:48%;background:linear-gradient(180deg,rgba(255,255,255,.1),transparent);border-radius:16px 16px 0 0;pointer-events:none}
    /* нижняя окантовка кнопки */
    .sc-3d-btn::after{content:'';position:absolute;bottom:0;left:15%;right:15%;height:1px;background:linear-gradient(90deg,transparent,rgba(77,170,255,.5),transparent);pointer-events:none}
    .sc-3d-btn:active{transform:translateY(2px) scale(.96);box-shadow:0 4px 10px rgba(0,0,0,.7)}
    .sc-3d-btn.is-select{background:linear-gradient(180deg,#0e2040,#071020);border-color:rgba(77,170,255,.9);color:#fff;box-shadow:0 0 24px rgba(77,170,255,.45),0 8px 20px rgba(0,0,0,.6),inset 0 0 16px rgba(77,170,255,.12);text-shadow:0 0 10px rgba(77,170,255,1),0 0 4px #fff}
  `);

  // ── Уникальные трещины для каждой карточки (SVG inline) ──
  const cracks = [
    // Карточка 0 — удар сверху-слева
    `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg"><g stroke="rgba(180,220,255,0.55)" stroke-width="0.8" fill="none" stroke-linecap="round">
      <path d="M45,30 L20,0 M45,30 L0,55 M45,30 L30,110 M45,30 L90,80 M45,30 L70,0"/>
      <path d="M45,30 L160,140 M45,30 L50,230"/>
      <path d="M30,18 L50,45 M20,65 L45,50 M55,90 L80,75" stroke-width="0.5" stroke="rgba(180,220,255,0.3)"/>
      <circle cx="45" cy="30" r="3" fill="rgba(200,230,255,0.6)" stroke="none"/>
    </g></svg>`,
    // Карточка 1 — удар по центру
    `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg"><g stroke="rgba(180,220,255,0.55)" stroke-width="0.8" fill="none" stroke-linecap="round">
      <path d="M80,100 L10,0 M80,100 L0,80 M80,100 L0,160 M80,100 L40,230"/>
      <path d="M80,100 L160,20 M80,100 L160,90 M80,100 L160,180 M80,100 L110,230"/>
      <path d="M55,65 L75,90 M40,120 L70,105 M100,60 L85,85 M110,130 L90,110" stroke-width="0.5" stroke="rgba(180,220,255,0.3)"/>
      <circle cx="80" cy="100" r="4" fill="rgba(200,230,255,0.7)" stroke="none"/>
    </g></svg>`,
    // Карточка 2 — удар снизу-справа
    `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg"><g stroke="rgba(180,220,255,0.55)" stroke-width="0.8" fill="none" stroke-linecap="round">
      <path d="M120,190 L160,230 M120,190 L160,160 M120,190 L80,230 M120,190 L160,100"/>
      <path d="M120,190 L0,230 M120,190 L30,120 M120,190 L90,0"/>
      <path d="M130,170 L115,185 M145,200 L125,190 M100,210 L115,195" stroke-width="0.5" stroke="rgba(180,220,255,0.3)"/>
      <circle cx="120" cy="190" r="3" fill="rgba(200,230,255,0.6)" stroke="none"/>
    </g></svg>`,
    // Карточка 3 — удар сверху по центру
    `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg"><g stroke="rgba(180,220,255,0.55)" stroke-width="0.8" fill="none" stroke-linecap="round">
      <path d="M80,25 L50,0 M80,25 L110,0 M80,25 L0,70 M80,25 L160,60"/>
      <path d="M80,25 L20,230 M80,25 L80,230 M80,25 L140,230"/>
      <path d="M60,15 L78,28 M100,15 L82,28 M50,50 L72,35 M110,50 L88,35" stroke-width="0.5" stroke="rgba(180,220,255,0.3)"/>
      <circle cx="80" cy="25" r="3.5" fill="rgba(200,230,255,0.65)" stroke="none"/>
    </g></svg>`,
    // Карточка 4 — удар снизу-слева
    `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg"><g stroke="rgba(180,220,255,0.55)" stroke-width="0.8" fill="none" stroke-linecap="round">
      <path d="M35,195 L0,230 M35,195 L0,180 M35,195 L0,130 M35,195 L60,230"/>
      <path d="M35,195 L160,230 M35,195 L110,140 M35,195 L70,0"/>
      <path d="M20,210 L38,196 M50,220 L36,200 M15,170 L32,188" stroke-width="0.5" stroke="rgba(180,220,255,0.3)"/>
      <circle cx="35" cy="195" r="3" fill="rgba(200,230,255,0.6)" stroke="none"/>
    </g></svg>`,
    // Карточка 5 — удар справа по центру
    `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg"><g stroke="rgba(180,220,255,0.55)" stroke-width="0.8" fill="none" stroke-linecap="round">
      <path d="M140,115 L160,80 M140,115 L160,130 M140,115 L160,40 M140,115 L160,200"/>
      <path d="M140,115 L0,30 M140,115 L0,115 M140,115 L0,200 M140,115 L60,230"/>
      <path d="M150,95 L138,112 M155,135 L141,118 M125,90 L136,108 M125,140 L137,122" stroke-width="0.5" stroke="rgba(180,220,255,0.3)"/>
      <circle cx="140" cy="115" r="3" fill="rgba(200,230,255,0.6)" stroke="none"/>
    </g></svg>`
  ];

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
  const RADIUS  = 145;

  const cardsHtml = cardsData.map((d, i) => {
    const angle = i * STEP;
    return `
      <div class="sc-3d-card" data-idx="${i}" data-id="${d.id}"
           style="transform:rotateY(${angle}deg) translateZ(${RADIUS}px)">
        <div class="glass-back"></div>
        <div class="crack-back">${cracks[i]}</div>
        <div class="glass-side glass-side-top"></div>
        <div class="glass-side glass-side-bottom"></div>
        <div class="glass-side glass-side-left"></div>
        <div class="glass-side glass-side-right"></div>
        <div class="glass-front">
          <div class="crack-layer">${cracks[i]}</div>
        </div>
        <div class="card-content">
          <div class="sc-3d-ic">${d.ic}</div>
          <div class="sc-3d-tit">${d.tit}</div>
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
