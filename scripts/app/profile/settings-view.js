const W = window;
const esc = s => W.Utils?.escapeHtml ? W.Utils.escapeHtml(String(s || '')) : String(s || '');

const LABELS = { band: 'Название группы', album: 'Название альбома', num: 'Номер трека', title: 'Название песни', custom: 'Свой текст' };

const getDlFmt = () => {
  try {
    const d = JSON.parse(localStorage.getItem('dl_format_v1') || '{}');
    return {
      ord: d.ord || ['custom', 'band', 'album', 'num', 'title'],
      en: d.en || { custom: true, title: true },
      cst: d.cst || ''
    };
  } catch {
    return { ord: ['custom', 'band', 'album', 'num', 'title'], en: { custom: true, title: true }, cst: '' };
  }
};

const setDlFmt = (v) => {
  localStorage.setItem('dl_format_v1', JSON.stringify(v));
};

const renderDownloadSection = () => `
  <button type="button" class="set-acc-btn">СКАЧИВАНИЕ ТРЕКОВ</button>
  <div class="set-acc-body">
    <div class="set-sub" style="margin-bottom:4px;padding:0 4px">Соберите формат имени файла по умолчанию.</div>
    <div class="dl-fmt-container">
      <div class="dl-preview-box">
        <div class="dl-preview-lbl">Пример файла:</div>
        <div class="dl-preview-val" id="dl-fmt-preview"></div>
      </div>
      <div id="dl-fmt-list"></div>
      <input type="text" id="dl-fmt-custom" class="dl-inp-custom" placeholder="Свой текст или Vi3na1bita" autocomplete="off">
    </div>
  </div>`;

const renderGeneralSection = () => `
  <div class="settings-content active" id="set-general">
    ${renderDownloadSection()}
  </div>`;

const renderPulseSection = () => `
  <button type="button" class="set-acc-btn">ПУЛЬСАЦИЯ</button>
  <div class="set-acc-body" id="set-pulse-body">
    <div class="set-preview-box">
      <img class="logo-pulse-target" id="lp-preview-logo" src="img/logo.png" alt="Логотип" style="width:70px;height:auto">
    </div>
    <div class="set-row">
      <div class="set-info"><div class="set-title">Включить пульсацию</div><div class="set-sub">Локальная реакция логотипа на музыку без сети</div></div>
      <label class="set-switch"><input type="checkbox" id="lp-enabled"><span class="set-slider"></span></label>
    </div>
    <div class="set-row">
      <div class="set-info"><div class="set-title">Режим</div><div class="set-sub">Bass / Balanced / Aggressive</div></div>
      <select id="lp-preset" style="max-width:160px">
        <option value="bass">Bass</option>
        <option value="balanced">Balanced</option>
        <option value="aggressive">Aggressive</option>
      </select>
    </div>
    <div class="set-row" style="flex-direction:column;align-items:stretch;gap:8px">
      <div class="set-info"><div class="set-title">Интенсивность</div><div class="set-sub">Авто-ослабляется на слабых устройствах</div></div>
      <div class="lp-slider-row">
        <span style="font-size:12px;color:#888">min</span>
        <input type="range" id="lp-intensity" class="lp-slider" min="0.05" max="0.3" step="0.01" value="0.12">
        <span style="font-size:12px;color:#888">max</span>
      </div>
    </div>
    <div class="set-row">
      <div class="set-info"><div class="set-title">Debug pulse</div><div class="set-sub">Показывать лёгкий индикатор raw/pulse</div></div>
      <label class="set-switch"><input type="checkbox" id="lp-debug"><span class="set-slider"></span></label>
    </div>
    <div class="set-row">
      <div class="set-info"><div class="set-title">Сценарии треков</div><div class="set-sub">В разработке. Второй слой синхронизации будет добавлен позже</div></div>
    </div>
    <button class="om-btn om-btn--outline om-fullw" id="lp-reset-btn">Сбросить по умолчанию</button>
  </div>`;

const renderCarouselSection = () => `
  <button type="button" class="set-acc-btn">КАРУСЕЛЬ</button>
  <div class="set-acc-body">
    <div class="set-preview-box">
      <div class="sc-mini-preview" id="sc-mini-preview">
        <div class="sc-mini-card"><div class="sc-mini-ic">📊</div></div>
        <div class="sc-mini-controls"><div>◀</div><div class="sel">ВЫБРАТЬ</div><div>▶</div></div>
      </div>
    </div>
    <div class="set-row">
      <div class="set-info"><div class="set-title">Кнопки карусели</div><div class="set-sub">Показывать кнопки управления под 3D-каруселью</div></div>
      <label class="set-switch"><input type="checkbox" id="set-car-controls"><span class="set-slider"></span></label>
    </div>
  </div>`;

const renderPlayerSection = () => `
  <button type="button" class="set-acc-btn">ПЛЕЕР</button>
  <div class="set-acc-body">
    <div class="pl-prev-box">
      <div class="pl-prev-lyr"><div class="pl-prev-bg" id="prev-a-bg"></div><div class="pl-prev-txt">Играет трек...</div></div>
      <div class="pl-prev-btns"><div class="pl-prev-btn">Т</div><div class="pl-prev-btn a-btn" id="prev-a-btn">A</div><div class="pl-prev-btn">≡</div><div class="pl-prev-btn">ılı</div><div class="pl-prev-btn" style="background:#e80100;color:#fff;border-color:#e80100">Я</div><div class="pl-prev-btn">🤍</div><div class="pl-prev-btn">⬇</div></div>
    </div>
    <div class="set-row">
      <div class="set-info"><div class="set-title">Кнопка Анимации (А)</div><div class="set-sub">Показывать кнопку (A) в меню управления плеера</div></div>
      <label class="set-switch"><input type="checkbox" id="set-pl-btn-anim"><span class="set-slider"></span></label>
    </div>
    <div class="set-row">
      <div class="set-info"><div class="set-title">Анимация фона</div><div class="set-sub">Цветовая пульсация фона в режиме лирики</div></div>
      <label class="set-switch"><input type="checkbox" id="set-pl-anim-play"><span class="set-slider"></span></label>
    </div>
  </div>`;

const renderInterfaceSection = () => `
  <div class="settings-content" id="set-interface">
    ${renderPlayerSection()}
    ${renderPulseSection()}
    ${renderCarouselSection()}
  </div>`;

const bindDownloadFormatLogic = (root) => {
  let fmtSt = getDlFmt();
  const listEl = root.querySelector('#dl-fmt-list'), custInp = root.querySelector('#dl-fmt-custom'), prevEl = root.querySelector('#dl-fmt-preview');
  if (!listEl || !custInp || !prevEl) return;

  const updatePreview = () => {
    const pts = [];
    fmtSt.ord.forEach(k => {
      if (!fmtSt.en[k]) return;
      if (k === 'custom') pts.push(fmtSt.cst || 'Vi3na1bita');
      if (k === 'band') pts.push('Витрина разбита');
      if (k === 'album') pts.push('Название Альбома');
      if (k === 'num') pts.push('01');
      if (k === 'title') pts.push('Название Песни');
    });
    prevEl.textContent = (pts.length ? pts.join(' - ') : 'track') + '.mp3';
    setDlFmt(fmtSt);
  };

  const renderFmtList = () => {
    listEl.innerHTML = fmtSt.ord.map((k, i) => `
      <div class="dl-fmt-row" data-key="${k}">
        <button type="button" class="dl-arr up" data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲</button>
        <div class="dl-fmt-lbl">${LABELS[k]}</div>
        <label class="set-switch"><input type="checkbox" class="dl-chk" data-key="${k}" ${fmtSt.en[k] ? 'checked' : ''}><span class="set-slider"></span></label>
        <button type="button" class="dl-arr down" data-dir="1" ${i === fmtSt.ord.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
    `).join('');
    updatePreview();
  };

  listEl.addEventListener('click', e => {
    const arr = e.target.closest('.dl-arr');
    if (arr && !arr.disabled) {
      const row = arr.closest('.dl-fmt-row'), k = row.dataset.key, dir = parseInt(arr.dataset.dir, 10);
      const i = fmtSt.ord.indexOf(k);
      [fmtSt.ord[i], fmtSt.ord[i + dir]] = [fmtSt.ord[i + dir], fmtSt.ord[i]];
      renderFmtList();
    }
  });

  listEl.addEventListener('change', e => {
    if (e.target.classList.contains('dl-chk')) {
      fmtSt.en[e.target.dataset.key] = e.target.checked;
      updatePreview();
    }
  });

  custInp.value = fmtSt.cst;
  custInp.addEventListener('input', e => {
    fmtSt.cst = e.target.value.trim();
    updatePreview();
  });

  renderFmtList();
};

export const renderProfileSettings = (root) => {
  if (!root) return;

  root.innerHTML = `
    <div class="ach-classic-tabs">
      <div class="ach-classic-tab active" data-set-tab="general">Общие</div>
      <div class="ach-classic-tab" data-set-tab="interface">Интерфейс</div>
      <div class="ach-classic-tab" data-set-tab="data">Данные</div>
      <div class="ach-classic-tab" data-set-tab="keys" id="set-tab-keys" style="display:none">Клавиатура</div>
    </div>
    ${renderGeneralSection()}
    ${renderInterfaceSection()}
    <div class="settings-content" id="set-data"><div class="fav-empty">Раздел в разработке 🛠️</div></div>
    <div class="settings-content" id="set-keys"><div class="fav-empty">Раздел в разработке 🛠️</div></div>
  `;

  if (!W.Utils?.isMobile?.()) {
    const kt = root.querySelector('#set-tab-keys');
    if (kt) kt.style.display = '';
  }

  // --- Логика Аккордеона (Интерфейс) ---
  root.querySelectorAll('.set-acc-btn').forEach(btn => {
    btn.onclick = () => {
      const isOpen = btn.classList.contains('open');
      root.querySelectorAll('.set-acc-btn').forEach(b => b.classList.remove('open'));
      if (!isOpen) btn.classList.add('open');
    };
  });

  // --- Логика Карусели (Интерфейс) ---
  const ctrlInp = root.querySelector('#set-car-controls'), scPrev = root.querySelector('#sc-mini-preview');
  if (ctrlInp && scPrev) {
    const isShow = localStorage.getItem('profileShowControls') === '1';
    ctrlInp.checked = isShow;
    if (isShow) scPrev.classList.add('show-ctrl');
    ctrlInp.addEventListener('change', e => {
      const show = e.target.checked;
      localStorage.setItem('profileShowControls', show ? '1' : '0');
      scPrev.classList.toggle('show-ctrl', show);
      const scWrap = document.querySelector('.sc-3d-wrap');
      if (scWrap) scWrap.classList.toggle('show-controls', show);
    });
  }

  // --- Логика Плеера (Интерфейс) ---
  const btnAnimShow = root.querySelector('#set-pl-btn-anim'), btnAnimPlay = root.querySelector('#set-pl-anim-play'), prevABtn = root.querySelector('#prev-a-btn'), prevABg = root.querySelector('#prev-a-bg');
  if (btnAnimShow && btnAnimPlay && prevABtn && prevABg) {
    btnAnimShow.checked = localStorage.getItem('lyricsShowAnimBtn') === '1';
    btnAnimPlay.checked = localStorage.getItem('lyricsAnimationEnabled') !== '0';

    prevABtn.style.display = btnAnimShow.checked ? '' : 'none';
    prevABtn.classList.toggle('active', btnAnimPlay.checked);
    prevABg.classList.toggle('active', btnAnimPlay.checked);

    btnAnimShow.addEventListener('change', e => {
      const v = e.target.checked;
      localStorage.setItem('lyricsShowAnimBtn', v ? '1' : '0');
      prevABtn.style.display = v ? '' : 'none';
      W.LyricsController?.restoreSettingsIntoDom?.();
    });

    btnAnimPlay.addEventListener('change', e => {
      const v = e.target.checked;
      localStorage.setItem('lyricsAnimationEnabled', v ? '1' : '0');
      prevABtn.classList.toggle('active', v);
      prevABg.classList.toggle('active', v);
      W.LyricsController?.restoreSettingsIntoDom?.();
    });
  }

  // --- Логика Пульсации (Интерфейс) ---
  const lpEnabled = root.querySelector('#lp-enabled'), lpPreset = root.querySelector('#lp-preset'), lpInt = root.querySelector('#lp-intensity'), lpDebug = root.querySelector('#lp-debug'), lpReset = root.querySelector('#lp-reset-btn');
  if (lpEnabled && lpPreset && lpInt && lpDebug && lpReset) {

    // Начальные значения
    const lpDefaults = { logoPulseEnabled: '0', logoPulsePreset: 'balanced', logoPulseIntensity: '0.12', logoPulseDebug: '0' };
    lpEnabled.checked  = (localStorage.getItem('logoPulseEnabled')  ?? lpDefaults.logoPulseEnabled)  === '1';
    lpPreset.value     =  localStorage.getItem('logoPulsePreset')   ?? lpDefaults.logoPulsePreset;
    lpInt.value        =  localStorage.getItem('logoPulseIntensity')  ?? lpDefaults.logoPulseIntensity;
    lpDebug.checked    = (localStorage.getItem('logoPulseDebug')    ?? lpDefaults.logoPulseDebug)    === '1';

    const applyLp = () => {
      localStorage.setItem('logoPulseEnabled',   lpEnabled.checked ? '1' : '0');
      localStorage.setItem('logoPulsePreset',    lpPreset.value);
      localStorage.setItem('logoPulseIntensity', lpInt.value);
      localStorage.setItem('logoPulseDebug',     lpDebug.checked ? '1' : '0');
      W.LogoPulse?.updateSettings?.();
    };

    // Единый маппинг: элемент → событие
    [
      [lpEnabled, 'change'],
      [lpPreset,  'change'],
      [lpInt,     'input'],
      [lpDebug,   'change']
    ].forEach(([el, ev]) => el.addEventListener(ev, applyLp));

    lpReset.addEventListener('click', () => {
      lpEnabled.checked = false;
      lpPreset.value    = lpDefaults.logoPulsePreset;
      lpInt.value       = lpDefaults.logoPulseIntensity;
      lpDebug.checked   = false;
      applyLp();
      W.NotificationSystem?.success('Настройки пульсации сброшены');
    });
  }

  // --- Логика Конструктора имени (Общие) ---
  bindDownloadFormatLogic(root);
};
