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

  // === 3D CAROUSEL PROTOTYPE (ISOLATED MODULE) ===
  window.Utils?.dom?.createStyleOnce?.('sc-3d-carousel-styles', `
    .sc-3d-wrap { margin: 20px 0; overflow: hidden; touch-action: pan-y; }
    .sc-3d-scene { perspective: 1200px; height: 260px; display: flex; align-items: center; justify-content: center; }
    .sc-3d-car { width: 140px; height: 200px; position: relative; transform-style: preserve-3d; transition: transform .45s cubic-bezier(.25,1,.4,1); }
    .sc-3d-card { position: absolute; inset: 0; background: rgba(20,25,35,.45); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(77,170,255,.3); border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; transform-style: preserve-3d; backface-visibility: visible; box-shadow: inset 0 0 20px rgba(255,255,255,.05), 0 15px 35px rgba(0,0,0,.6); user-select: none; }
    /* Толщина стекла */
    .sc-3d-card::before { content: ''; position: absolute; inset: -1px; border: 2px solid rgba(255,255,255,.1); border-radius: 17px; transform: translateZ(-5px); box-shadow: 0 0 10px rgba(77,170,255,.2); pointer-events: none; }
    /* Эффект стилизованных трещин / бликов */
    .sc-3d-card::after { content: ''; position: absolute; inset: 0; border-radius: 16px; background: linear-gradient(115deg, transparent 48%, rgba(255,255,255,.4) 49%, transparent 50%), linear-gradient(60deg, transparent 65%, rgba(255,255,255,.25) 66%, transparent 67%); pointer-events: none; opacity: .6; transform: translateZ(1px); }
    /* Контент карточки */
    .sc-3d-ic { font-size: 50px; transform: translateZ(35px); margin-bottom: 12px; filter: drop-shadow(0 4px 10px rgba(0,0,0,.6)); pointer-events: none; }
    .sc-3d-tit { font-size: 13px; font-weight: 900; color: #eaf2ff; transform: translateZ(30px); text-shadow: 0 2px 8px #000; letter-spacing: 1px; text-transform: uppercase; text-align: center; pointer-events: none; }
    /* Матирование текста на обратной стороне для реализма */
    .sc-3d-card.is-back .sc-3d-ic, .sc-3d-card.is-back .sc-3d-tit { opacity: 0.15; filter: blur(2px); }
    /* Нижние кнопки управления */
    .sc-3d-controls { display: flex; gap: 10px; justify-content: center; padding: 0 10px 20px; }
    .sc-3d-btn { flex: 1; max-width: 110px; background: rgba(77,170,255,.08); border: 1px solid rgba(77,170,255,.3); color: var(--secondary-color); padding: 12px 10px; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer; transition: .2s; }
    .sc-3d-btn:active { transform: scale(.95); background: rgba(77,170,255,.2); }
    .sc-3d-btn.active { background: linear-gradient(135deg,#4daaff,#357ac9); color: #fff; box-shadow: 0 4px 12px rgba(77,170,255,.3); border: none; }
  `);

  const cardsData = [
    { id: 'stats', tit: 'Статистика', ic: '📊' },
    { id: 'achievements', tit: 'Достижения', ic: '🏆' },
    { id: 'recs', tit: 'Рекомендации', ic: '💡' },
    { id: 'logs', tit: 'Журнал', ic: '📜' },
    { id: 'settings', tit: 'Настройки', ic: '⚙️' },
    { id: 'account', tit: 'Аккаунт', ic: '👤' }
  ];

  // Создаем DOM 3D сцены
  const radius = 135; // Радиус окружности для 6 карточек
  const cardsHtml = cardsData.map((d, i) => {
    const angle = i * 60;
    return `<div class="sc-3d-card" style="transform: rotateY(${angle}deg) translateZ(${radius}px);" data-id="${d.id}">
              <div class="sc-3d-ic">${d.ic}</div><div class="sc-3d-tit">${d.tit}</div>
            </div>`;
  }).join('');

  const protoWrap = document.createElement('div');
  protoWrap.className = 'sc-3d-wrap';
  protoWrap.innerHTML = `
    <div class="sc-3d-scene"><div class="sc-3d-car" id="sc-3d-car">${cardsHtml}</div></div>
    <div class="sc-3d-controls">
      <button class="sc-3d-btn" id="sc-3d-prev">◄ Пред</button>
      <button class="sc-3d-btn active" id="sc-3d-sel">Выбрать</button>
      <button class="sc-3d-btn" id="sc-3d-next">След ►</button>
    </div>
  `;

  // Заменяем плоские вкладки на 3D карусель
  const oldTabs = tpl.querySelector('.profile-tabs');
  if (oldTabs) oldTabs.replaceWith(protoWrap);

  // Физика и логика
  let currIdx = 0, startX = 0, isDrag = false;
  
  // Дождемся монтирования в DOM для навешивания событий
  setTimeout(() => {
    const car = c.querySelector('#sc-3d-car');
    if (!car) return;

    const updateCar = () => {
      car.style.transform = `rotateY(${currIdx * -60}deg)`;
      const normalizedIdx = ((currIdx % 6) + 6) % 6;
      
      // Логика визуального затуманивания "задней" стороны карточек
      c.querySelectorAll('.sc-3d-card').forEach((card, i) => {
        const diff = Math.abs((i - normalizedIdx + 3) % 6 - 3);
        card.classList.toggle('is-back', diff >= 2); // Если карточка сзади - мутнеет
      });
    };

    const swipeEnd = (delta) => {
      car.style.transition = 'transform .45s cubic-bezier(.25,1,.4,1)';
      if (Math.abs(delta) > 30) {
        if (delta > 0) currIdx--; else currIdx++; // Пошаговый сдвиг
      }
      updateCar();
    };

    // Обработчики кнопок
    c.querySelector('#sc-3d-prev').onclick = () => { currIdx--; updateCar(); };
    c.querySelector('#sc-3d-next').onclick = () => { currIdx++; updateCar(); };
    c.querySelector('#sc-3d-sel').onclick = () => {
      const activeId = cardsData[((currIdx % 6) + 6) % 6].id;
      // Связываем с вашими старыми вкладками профиля
      c.querySelectorAll('.profile-tab-content').forEach(x => x.classList.remove('active'));
      const activeTab = c.querySelector(`#tab-${activeId}`);
      if (activeTab) activeTab.classList.add('active');
      else window.NotificationSystem?.info(`Секция "${activeId}" в разработке`);
    };

    // Обработчики свайпов (Mobile)
    const scene = c.querySelector('.sc-3d-scene');
    scene.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      isDrag = true;
      car.style.transition = 'none'; // Отключаем плавность для прилипания к пальцу
    }, { passive: true });

    scene.addEventListener('touchmove', e => {
      if (!isDrag) return;
      const deltaX = e.touches[0].clientX - startX;
      // Чуть-чуть крутим за пальцем для физической отдачи
      car.style.transform = `rotateY(${currIdx * -60 + (deltaX / 4)}deg)`;
    }, { passive: true });

    scene.addEventListener('touchend', e => {
      if (!isDrag) return;
      isDrag = false;
      swipeEnd(e.changedTouches[0].clientX - startX);
    }, { passive: true });

    updateCar();
  }, 50);
  // === END 3D CAROUSEL PROTOTYPE ===

  c.appendChild(tpl); return c;
};
export default { renderProfileShell };
