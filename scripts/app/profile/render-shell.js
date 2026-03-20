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
    .sc-3d-wrap{margin:20px 0;touch-action:pan-y;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;overflow:visible}
    .sc-3d-scene{perspective:1100px;perspective-origin:50% 42%;height:320px;display:flex;align-items:center;justify-content:center;overflow:visible}
    .sc-3d-car{width:160px;height:230px;position:relative;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.15,.85,.35,1);will-change:transform}

    /* ── КАРТОЧКА (контейнер слоёв) ── */
    .sc-3d-card{position:absolute;inset:0;transform-style:preserve-3d;cursor:pointer;will-change:transform}

    /* ── ЛИЦЕВАЯ ГРАНЬ ── */
    .glass-front{position:absolute;inset:0;border-radius:20px;background:linear-gradient(145deg,rgba(20,40,70,.6),rgba(8,14,25,.75));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(100,180,255,.55);box-shadow:inset 0 0 40px rgba(77,170,255,.1),0 0 0 .5px rgba(255,255,255,.2) inset;transform:translateZ(7px);overflow:hidden}
    /* верхний блик — имитация каустики */
    .glass-front::before{content:'';position:absolute;top:-40%;left:-30%;width:160%;height:65%;background:linear-gradient(155deg,rgba(255,255,255,.18) 0%,rgba(100,180,255,.08) 40%,transparent 65%);border-radius:50%;pointer-events:none}
    /* нижний блик + левый боковой */
    .glass-front::after{content:'';position:absolute;bottom:0;left:5%;right:5%;height:1px;background:linear-gradient(90deg,transparent,rgba(100,180,255,.8),transparent);box-shadow:0 0 8px rgba(77,170,255,.4);pointer-events:none}

    /* ── ЗАДНЯЯ ГРАНЬ ── */
    .glass-back{position:absolute;inset:0;border-radius:20px;background:rgba(3,8,18,.9);border:1px solid rgba(77,170,255,.25);transform:translateZ(-7px);box-shadow:inset 0 0 20px rgba(0,0,0,.5)}

    /* ── ТОРЦЫ (боковые грани — толщина стекла) ── */
    .glass-side{position:absolute;background:linear-gradient(180deg,rgba(100,190,255,.45),rgba(40,80,130,.55));backdrop-filter:blur(6px)}
    .glass-side-top{top:0;left:4px;right:4px;height:14px;transform:rotateX(90deg) translateZ(7px);transform-origin:top center;border-top:1px solid rgba(255,255,255,.5)}
    .glass-side-bottom{bottom:0;left:4px;right:4px;height:14px;transform:rotateX(-90deg) translateZ(7px);transform-origin:bottom center;border-bottom:1px solid rgba(255,255,255,.25)}
    .glass-side-left{left:0;top:4px;bottom:4px;width:14px;transform:rotateY(-90deg) translateZ(7px);transform-origin:left center;border-left:1px solid rgba(255,255,255,.4)}
    .glass-side-right{right:0;top:4px;bottom:4px;width:14px;transform:rotateY(90deg) translateZ(7px);transform-origin:right center;border-right:1px solid rgba(255,255,255,.35)}

    /* ── ТРЕЩИНЫ ── */
    .crack-layer{position:absolute;inset:0;border-radius:20px;pointer-events:none;overflow:hidden}
    .crack-layer svg{width:100%;height:100%}
    .crack-layer image{mix-blend-mode:screen}
    /* трещины на задней грани — темнее и тусклее */
    .crack-back{position:absolute;inset:0;border-radius:20px;pointer-events:none;overflow:hidden;transform:translateZ(-4px);opacity:.3}
    .crack-back svg{width:100%;height:100%}
    .crack-back image{mix-blend-mode:screen;filter:hue-rotate(180deg) brightness(0.5)}

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

  // ── Трещины через файл img/vitrina-crack-01.svg ──
  // Каждая карточка использует одну трещину, но с уникальным transform
  // чтобы на каждой карточке она выглядела по-разному
  const crackTransforms = [
    'translate(0,0)   scale(1,1)    rotate(0,80,115)',   // 0 — оригинал
    'translate(0,0)   scale(-1,1)   rotate(15,80,115)',  // 1 — зеркал + поворот
    'translate(0,0)   scale(1,-1)   rotate(0,80,115)',   // 2 — вертикальный флип
    'translate(0,0)   scale(-1,-1)  rotate(10,80,115)',  // 3 — двойной флип
    'translate(0,0)   scale(1,1)    rotate(45,80,115)',  // 4 — поворот 45°
    'translate(0,0)   scale(-1,1)   rotate(-20,80,115)', // 5 — зеркал + поворот -20°
  ];

  // Генерируем HTML для слоя трещины каждой карточки
  const makeCrack = (idx) => `
    <svg viewBox="0 0 160 230"
         xmlns="http://www.w3.org/2000/svg"
         style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">
      <image href="img/vitrina-crack-01.svg"
             x="0" y="0" width="160" height="230"
             transform="${crackTransforms[idx]}"
             preserveAspectRatio="xMidYMid meet"
             style="mix-blend-mode:screen;opacity:0.85"/>
    </svg>`;

  // Массив для совместимости с остальным кодом карточек
  const cracks = crackTransforms.map((_, i) => makeCrack(i));

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
  const RADIUS  = 195;

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
