const W = window;
const getDlFmt = () => { try { const d = JSON.parse(localStorage.getItem('dl_format_v1') || '{}'); return { ord: d.ord || ['custom', 'band', 'album', 'num', 'title'], en: d.en || { custom: true, title: true }, cst: d.cst || '' }; } catch { return { ord: ['custom', 'band', 'album', 'num', 'title'], en: { custom: true, title: true }, cst: '' }; } };
const setDlFmt = v => localStorage.setItem('dl_format_v1', JSON.stringify(v));

const renderGeneralSection = () => `<div class="settings-content active" id="set-general"><button type="button" class="set-acc-btn">СКАЧИВАНИЕ ТРЕКОВ</button><div class="set-acc-body"><div class="set-sub" style="margin-bottom:4px;padding:0 4px">Соберите формат имени файла по умолчанию.</div><div class="dl-fmt-container"><div class="dl-preview-box"><div class="dl-preview-lbl">Пример файла:</div><div class="dl-preview-val" id="dl-fmt-preview"></div></div><div id="dl-fmt-list"></div><input type="text" id="dl-fmt-custom" class="dl-inp-custom" placeholder="Свой текст или Vi3na1bita" autocomplete="off"></div></div></div>`;
const renderInterfaceSection = () => `<div class="settings-content" id="set-interface"><button type="button" class="set-acc-btn">ПЛЕЕР</button><div class="set-acc-body"><div class="pl-prev-box"><div class="pl-prev-lyr"><div class="pl-prev-bg" id="prev-a-bg"></div><div class="pl-prev-txt">Играет трек...</div></div><div class="pl-prev-btns"><div class="pl-prev-btn">Т</div><div class="pl-prev-btn a-btn" id="prev-a-btn">A</div><div class="pl-prev-btn">≡</div><div class="pl-prev-btn">ılı</div><div class="pl-prev-btn" style="background:#e80100;color:#fff;border-color:#e80100">Я</div><div class="pl-prev-btn">🤍</div><div class="pl-prev-btn">⬇</div></div></div><div class="set-row"><div class="set-info"><div class="set-title">Кнопка Анимации (А)</div><div class="set-sub">Показывать кнопку (A) в меню управления плеера</div></div><label class="set-switch"><input type="checkbox" id="set-pl-btn-anim"><span class="set-slider"></span></label></div><div class="set-row"><div class="set-info"><div class="set-title">Анимация фона</div><div class="set-sub">Цветовая пульсация фона в режиме лирики</div></div><label class="set-switch"><input type="checkbox" id="set-pl-anim-play"><span class="set-slider"></span></label></div></div><button type="button" class="set-acc-btn">ПУЛЬСАЦИЯ</button><div class="set-acc-body" id="set-pulse-body"><div class="set-preview-box"><img class="logo-pulse-target" id="lp-preview-logo" src="img/logo.png" alt="Логотип" style="width:70px;height:auto"></div><div class="set-row"><div class="set-info"><div class="set-title">Включить пульсацию</div><div class="set-sub">Локальная реакция логотипа на музыку без сети</div></div><label class="set-switch"><input type="checkbox" id="lp-enabled"><span class="set-slider"></span></label></div><div class="set-row"><div class="set-info"><div class="set-title">Режим</div><div class="set-sub">Bass / Balanced / Aggressive</div></div><select id="lp-preset" style="max-width:160px"><option value="bass">Bass</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></div><div class="set-row" style="flex-direction:column;align-items:stretch;gap:8px"><div class="set-info"><div class="set-title">Интенсивность</div><div class="set-sub">Авто-ослабляется на слабых устройствах</div></div><div class="lp-slider-row"><span style="font-size:12px;color:#888">min</span><input type="range" id="lp-intensity" class="lp-slider" min="0.05" max="0.3" step="0.01" value="0.12"><span style="font-size:12px;color:#888">max</span></div></div><div class="set-row"><div class="set-info"><div class="set-title">Debug pulse</div><div class="set-sub">Показывать лёгкий индикатор raw/pulse</div></div><label class="set-switch"><input type="checkbox" id="lp-debug"><span class="set-slider"></span></label></div><button class="om-btn om-btn--outline om-fullw" id="lp-reset-btn">Сбросить по умолчанию</button></div><button type="button" class="set-acc-btn">КАРУСЕЛЬ</button><div class="set-acc-body"><div class="set-preview-box"><div class="sc-mini-preview" id="sc-mini-preview"><div class="sc-mini-card"><div class="sc-mini-ic">📊</div></div><div class="sc-mini-controls"><div>◀</div><div class="sel">ВЫБРАТЬ</div><div>▶</div></div></div></div><div class="set-row"><div class="set-info"><div class="set-title">Кнопки карусели</div><div class="set-sub">Показывать кнопки управления под 3D-каруселью</div></div><label class="set-switch"><input type="checkbox" id="set-car-controls"><span class="set-slider"></span></label></div></div></div>`;

const bindDownloadFormatLogic = r => {
  let fmtSt = getDlFmt();
  const listEl = r.querySelector('#dl-fmt-list'), custInp = r.querySelector('#dl-fmt-custom'), prevEl = r.querySelector('#dl-fmt-preview');
  if (!listEl || !custInp || !prevEl) return;
  const upd = () => { prevEl.textContent = (fmtSt.ord.filter(k => fmtSt.en[k]).map(k => ({ custom: fmtSt.cst || 'Vi3na1bita', band: 'Витрина разбита', album: 'Название Альбома', num: '01', title: 'Название Песни' })[k]).join(' - ') || 'track') + '.mp3'; setDlFmt(fmtSt); };
  const render = () => { listEl.innerHTML = fmtSt.ord.map((k, i) => `<div class="dl-fmt-row" data-key="${k}"><button type="button" class="dl-arr up" data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲</button><div class="dl-fmt-lbl">${{ band: 'Название группы', album: 'Название альбома', num: 'Номер трека', title: 'Название песни', custom: 'Свой текст' }[k]}</div><label class="set-switch"><input type="checkbox" class="dl-chk" data-key="${k}" ${fmtSt.en[k] ? 'checked' : ''}><span class="set-slider"></span></label><button type="button" class="dl-arr down" data-dir="1" ${i === fmtSt.ord.length - 1 ? 'disabled' : ''}>▼</button></div>`).join(''); upd(); };
  listEl.addEventListener('click', e => { const arr = e.target.closest('.dl-arr'); if (arr && !arr.disabled) { const k = arr.closest('.dl-fmt-row').dataset.key, d = parseInt(arr.dataset.dir, 10), i = fmtSt.ord.indexOf(k); [fmtSt.ord[i], fmtSt.ord[i + d]] = [fmtSt.ord[i + d], fmtSt.ord[i]]; render(); } });
  listEl.addEventListener('change', e => { if (e.target.classList.contains('dl-chk')) { fmtSt.en[e.target.dataset.key] = e.target.checked; upd(); } });
  custInp.value = fmtSt.cst; custInp.addEventListener('input', e => { fmtSt.cst = e.target.value.trim(); upd(); });
  render();
};

export const renderProfileSettings = root => {
  if (!root) return;
  root.innerHTML = `<div class="ach-classic-tabs"><div class="ach-classic-tab active" data-set-tab="general">Общие</div><div class="ach-classic-tab" data-set-tab="interface">Интерфейс</div><div class="ach-classic-tab" data-set-tab="data">Данные</div><div class="ach-classic-tab" data-set-tab="keys" id="set-tab-keys" style="display:none">Клавиатура</div></div>${renderGeneralSection()}${renderInterfaceSection()}<div class="settings-content" id="set-data"><div class="fav-empty">Раздел в разработке 🛠️</div></div><div class="settings-content" id="set-keys"><div class="fav-empty">Раздел в разработке 🛠️</div></div>`;
  if (!W.Utils?.isMobile?.()) root.querySelector('#set-tab-keys').style.display = '';

  root.querySelectorAll('.set-acc-btn').forEach(b => b.onclick = () => { const o = b.classList.contains('open'); root.querySelectorAll('.set-acc-btn').forEach(x => x.classList.remove('open')); if (!o) b.classList.add('open'); });

  const $ = s => root.querySelector(s);
  const ctrlInp = $('#set-car-controls'), scPrev = $('#sc-mini-preview');
  if (ctrlInp && scPrev) {
    const isShow = localStorage.getItem('profileShowControls') === '1'; ctrlInp.checked = isShow; scPrev.classList.toggle('show-ctrl', isShow);
    ctrlInp.addEventListener('change', e => { localStorage.setItem('profileShowControls', e.target.checked ? '1' : '0'); scPrev.classList.toggle('show-ctrl', e.target.checked); document.querySelector('.sc-3d-wrap')?.classList.toggle('show-controls', e.target.checked); });
  }

  const baS = $('#set-pl-btn-anim'), baP = $('#set-pl-anim-play'), pABtn = $('#prev-a-btn'), pABg = $('#prev-a-bg');
  if (baS && baP && pABtn && pABg) {
    baS.checked = localStorage.getItem('lyricsShowAnimBtn') === '1'; baP.checked = localStorage.getItem('lyricsAnimationEnabled') !== '0';
    pABtn.style.display = baS.checked ? '' : 'none'; pABtn.classList.toggle('active', baP.checked); pABg.classList.toggle('active', baP.checked);
    baS.addEventListener('change', e => { localStorage.setItem('lyricsShowAnimBtn', e.target.checked ? '1' : '0'); pABtn.style.display = e.target.checked ? '' : 'none'; W.LyricsController?.restoreSettingsIntoDom?.(); });
    baP.addEventListener('change', e => { localStorage.setItem('lyricsAnimationEnabled', e.target.checked ? '1' : '0'); pABtn.classList.toggle('active', e.target.checked); pABg.classList.toggle('active', e.target.checked); W.LyricsController?.restoreSettingsIntoDom?.(); });
  }

  const lE = $('#lp-enabled'), lP = $('#lp-preset'), lI = $('#lp-intensity'), lD = $('#lp-debug'), lR = $('#lp-reset-btn');
  if (lE && lP && lI && lD && lR) {
    const d = { e: '0', p: 'balanced', i: '0.12', d: '0' }, s = k => localStorage.getItem(k);
    lE.checked = (s('logoPulseEnabled') ?? d.e) === '1'; lP.value = s('logoPulsePreset') ?? d.p; lI.value = s('logoPulseIntensity') ?? d.i; lD.checked = (s('logoPulseDebug') ?? d.d) === '1';
    const app = () => { localStorage.setItem('logoPulseEnabled', lE.checked ? '1' : '0'); localStorage.setItem('logoPulsePreset', lP.value); localStorage.setItem('logoPulseIntensity', lI.value); localStorage.setItem('logoPulseDebug', lD.checked ? '1' : '0'); W.LogoPulse?.updateSettings?.(); };
    [[lE,'change'], [lP,'change'], [lI,'input'], [lD,'change']].forEach(([el, ev]) => el.addEventListener(ev, app));
    lR.addEventListener('click', () => { lE.checked = false; lP.value = d.p; lI.value = d.i; lD.checked = false; app(); W.NotificationSystem?.success('Настройки пульсации сброшены'); });
  }

  bindDownloadFormatLogic(root);
};
