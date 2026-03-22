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

export const renderProfileSettings = (root) => {
  if (!root) return;

  W.Utils?.dom?.createStyleOnce?.('profile-settings-styles', `
    .settings-content{display:none;flex-direction:column;gap:12px;animation:fadeIn .3s}
    .settings-content.active{display:flex}
    .set-acc-btn{width:100%;text-align:left;padding:16px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#fff;font-size:14px;font-weight:900;border-radius:12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:.2s;letter-spacing:1px}
    .set-acc-btn:hover{background:rgba(77,170,255,0.1);border-color:rgba(77,170,255,0.3)}
    .set-acc-btn::after{content:'▼';font-size:12px;transition:.3s;color:var(--secondary-color)}
    .set-acc-btn.open{background:rgba(77,170,255,0.15);border-color:var(--secondary-color);border-radius:12px 12px 0 0}
    .set-acc-btn.open::after{transform:rotate(180deg)}
    .set-acc-body{display:none;padding:12px 0 6px;flex-direction:column;gap:12px}
    .set-acc-btn.open + .set-acc-body{display:flex;animation:slideDown .3s ease}
    @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
    .set-row{display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.03);padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.05)}
    .set-info{flex:1;padding-right:12px}
    .set-title{font-size:14px;font-weight:bold;color:#fff;margin-bottom:4px}
    .set-sub{font-size:11px;color:#888;line-height:1.3}
    .set-switch{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0}
    .set-switch input{opacity:0;width:0;height:0}
    .set-slider{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.1);border-radius:24px;transition:.3s}
    .set-slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#888;border-radius:50%;transition:.3s}
    input:checked + .set-slider{background:var(--secondary-color)}
    input:checked + .set-slider:before{transform:translateX(20px);background:#fff}
    
    .set-preview-box{background:linear-gradient(180deg,#1a1d24,#11141a);border-radius:12px;padding:20px;display:flex;justify-content:center;border:1px solid rgba(77,170,255,.15);margin-bottom:2px}
    
    /* Carousel Mini */
    .sc-mini-preview{display:flex;flex-direction:column;align-items:center;gap:10px;transition:.3s}
    .sc-mini-card{width:64px;height:95px;border-radius:12px;background:linear-gradient(180deg,rgba(26,49,82,.8),rgba(8,16,30,.9));border:1px solid rgba(168,225,255,.5);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(77,170,255,.2)}
    .sc-mini-ic{font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
    .sc-mini-controls{display:flex;gap:6px;opacity:0;transform:scale(0.9);transition:.3s;pointer-events:none}
    .sc-mini-preview.show-ctrl .sc-mini-controls{opacity:1;transform:scale(1)}
    .sc-mini-controls div{background:linear-gradient(180deg,#0d1828,#070d16);border:1px solid rgba(77,170,255,.3);color:#7ab4f5;border-radius:4px;height:18px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900}
    .sc-mini-controls div:not(.sel){width:18px}
    .sc-mini-controls .sel{width:56px}
    
    /* Player Mini */
    .pl-prev-box{background:linear-gradient(180deg,rgba(30,34,45,.95),rgba(15,18,24,.98));border-radius:12px;padding:12px;border:1px solid rgba(77,170,255,.15);margin-bottom:2px;box-shadow:0 4px 15px rgba(0,0,0,.4)}
    .pl-prev-lyr{height:60px;background:#0f1218;border-radius:8px 8px 0 0;position:relative;overflow:hidden;margin-bottom:12px;display:flex;align-items:center;justify-content:center}
    .pl-prev-bg{position:absolute;inset:0;opacity:0;background:linear-gradient(45deg,rgba(232,1,0,.15),rgba(77,170,255,.15),rgba(232,1,0,.15));background-size:400% 400%;transition:.5s;pointer-events:none}
    .pl-prev-bg.active{opacity:1;animation:lyricsGradient 10s ease infinite}
    .pl-prev-txt{position:relative;z-index:1;color:var(--primary-color);font-size:16px;font-weight:900;text-shadow:0 1px 7px rgba(115,22,22,.27)}
    .pl-prev-btns{display:flex;gap:6px;justify-content:space-between;padding:0 4px}
    .pl-prev-btn{width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;background:rgba(77,170,255,.12);border:1px solid rgba(77,170,255,.25);color:var(--secondary-color);transition:.2s}
    .pl-prev-btn.a-btn{background:linear-gradient(135deg,#4a1a7a,#2a0a4a);border-color:rgba(138,43,226,.3);color:#c8a2ff}
    .pl-prev-btn.a-btn.active{background:linear-gradient(135deg,#5a2a8a,#3a1a5a);box-shadow:0 0 8px rgba(138,43,226,.4)}

    /* Range Slider */
    .lp-slider-row{display:flex;align-items:center;margin-top:4px;gap:12px}
    .lp-slider{flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px;outline:none;-webkit-appearance:none}
    .lp-slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;background:var(--secondary-color);border-radius:50%;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.5)}

    /* Name Constructor */
    .dl-fmt-container{display:flex;flex-direction:column;gap:10px}
    .dl-fmt-row{display:flex;align-items:center;background:rgba(0,0,0,.2);border-radius:12px;padding:6px;gap:10px;border:1px solid rgba(255,255,255,.05)}
    .dl-arr{all:unset;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#888;border-radius:8px;transition:.2s;flex-shrink:0}
    .dl-arr:hover:not(:disabled){color:#fff;background:rgba(255,255,255,.05)}
    .dl-arr:disabled{opacity:0.15;cursor:default}
    .dl-fmt-lbl{flex:1;font-size:14px;font-weight:600;color:#eaf2ff;padding-left:4px}
    .dl-inp-custom{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#fff;padding:12px 14px;font-size:16px!important;outline:none;transition:.2s}
    .dl-inp-custom:focus{border-color:var(--secondary-color)}
    .dl-preview-box{background:#11141a;border-radius:12px;padding:14px;border:1px dashed rgba(77,170,255,.3);margin-bottom:6px;text-align:center}
    .dl-preview-lbl{font-size:11px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px}
    .dl-preview-val{font-size:14px;color:var(--secondary-color);font-weight:800;word-break:break-all}
  `);

  root.innerHTML = `
    <div class="ach-classic-tabs">
      <div class="ach-classic-tab active" data-set-tab="general">Общие</div>
      <div class="ach-classic-tab" data-set-tab="interface">Интерфейс</div>
      <div class="ach-classic-tab" data-set-tab="data">Данные</div>
      <div class="ach-classic-tab" data-set-tab="keys" id="set-tab-keys" style="display:none">Клавиатура</div>
    </div>
    
    <div class="settings-content active" id="set-general">
      <button type="button" class="set-acc-btn open">СКАЧИВАНИЕ ТРЕКОВ</button>
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
      </div>
    </div>

    <div class="settings-content" id="set-interface">
      <button type="button" class="set-acc-btn open">ПЛЕЕР</button>
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
      </div>

      <button type="button" class="set-acc-btn">ПУЛЬСАЦИЯ</button>
      <div class="set-acc-body" id="set-pulse-body">
        <div class="set-preview-box">
          <img class="logo-pulse-target" id="lp-preview-logo" src="img/logo.png" alt="Логотип" style="width:70px;height:auto">
        </div>
        <div class="set-row" style="flex-direction:column;align-items:stretch;gap:8px">
          <div class="set-info"><div class="set-title">Интенсивность бита</div></div>
          <div class="lp-slider-row">
            <span style="font-size:12px;color:#888">min</span>
            <input type="range" id="lp-intensity" class="lp-slider" min="0" max="0.5" step="0.05" value="0.15">
            <span style="font-size:12px;color:#888">max</span>
          </div>
        </div>
        <div class="set-row">
          <div class="set-info"><div class="set-title">Глитч эффект</div><div class="set-sub">Неоновые искажения при ударах</div></div>
          <label class="set-switch"><input type="checkbox" id="lp-glitch"><span class="set-slider"></span></label>
        </div>
        <button class="om-btn om-btn--outline om-fullw" id="lp-reset-btn">Сбросить по умолчанию</button>
      </div>

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
      </div>
    </div>

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
  const lpInt = root.querySelector('#lp-intensity'), lpGlitch = root.querySelector('#lp-glitch'), lpReset = root.querySelector('#lp-reset-btn');
  if (lpInt && lpGlitch && lpReset) {
    lpInt.value = localStorage.getItem('logoPulseIntensity') || '0.15';
    lpGlitch.checked = localStorage.getItem('logoPulseGlitch') === '1';

    const applyLp = () => {
      localStorage.setItem('logoPulseIntensity', lpInt.value);
      localStorage.setItem('logoPulseGlitch', lpGlitch.checked ? '1' : '0');
      W.LogoPulse?.updateSettings?.();
    };

    lpInt.addEventListener('input', applyLp);
    lpGlitch.addEventListener('change', applyLp);
    lpReset.addEventListener('click', () => {
      lpInt.value = '0.15';
      lpGlitch.checked = false;
      applyLp();
      W.NotificationSystem?.success?.('Настройки пульсации сброшены');
    });
  }

  // --- Логика Конструктора имени (Общие) ---
  let fmtSt = getDlFmt();
  const listEl = root.querySelector('#dl-fmt-list'), custInp = root.querySelector('#dl-fmt-custom'), prevEl = root.querySelector('#dl-fmt-preview');

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
