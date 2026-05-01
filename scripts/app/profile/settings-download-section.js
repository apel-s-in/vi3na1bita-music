import { markDeviceSettingsDirty } from '../../analytics/sync-dirty-events.js';

const getDlFmt = () => {
  try {
    const d = JSON.parse(localStorage.getItem('dl_format_v1') || '{}');
    return { ord: d.ord || ['custom', 'band', 'album', 'num', 'title'], en: d.en || { custom: true, title: true }, cst: d.cst || '' };
  } catch {
    return { ord: ['custom', 'band', 'album', 'num', 'title'], en: { custom: true, title: true }, cst: '' };
  }
};

const setDlFmt = v => { localStorage.setItem('dl_format_v1', JSON.stringify(v)); markDeviceSettingsDirty(); };

export const renderDownloadSettingsSection = () => `<div class="settings-content active" id="set-general"><button type="button" class="set-acc-btn">СКАЧИВАНИЕ ТРЕКОВ</button><div class="set-acc-body"><div class="set-sub" style="margin-bottom:4px;padding:0 4px">Соберите формат имени файла по умолчанию.</div><div class="dl-fmt-container"><div class="dl-preview-box"><div class="dl-preview-lbl">Пример файла:</div><div class="dl-preview-val" id="dl-fmt-preview"></div></div><div id="dl-fmt-list"></div><input type="text" id="dl-fmt-custom" class="dl-inp-custom" placeholder="Свой текст или Vi3na1bita" autocomplete="off"></div></div></div>`;

export const bindDownloadSettingsSection = root => {
  let fmtSt = getDlFmt();
  const listEl = root?.querySelector('#dl-fmt-list'), custInp = root?.querySelector('#dl-fmt-custom'), prevEl = root?.querySelector('#dl-fmt-preview');
  if (!listEl || !custInp || !prevEl) return;

  const labels = { band: 'Название группы', album: 'Название альбома', num: 'Номер трека', title: 'Название песни', custom: 'Свой текст' };
  const sample = { custom: () => fmtSt.cst || 'Vi3na1bita', band: () => 'Витрина разбита', album: () => 'Название Альбома', num: () => '01', title: () => 'Название Песни' };

  const upd = () => {
    prevEl.textContent = (fmtSt.ord.filter(k => fmtSt.en[k]).map(k => sample[k]?.()).filter(Boolean).join(' - ') || 'track') + '.mp3';
    setDlFmt(fmtSt);
  };

  const render = () => {
    listEl.innerHTML = fmtSt.ord.map((k, i) => `<div class="dl-fmt-row" data-key="${k}"><button type="button" class="dl-arr up" data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲</button><div class="dl-fmt-lbl">${labels[k] || k}</div><label class="set-switch"><input type="checkbox" class="dl-chk" data-key="${k}" ${fmtSt.en[k] ? 'checked' : ''}><span class="set-slider"></span></label><button type="button" class="dl-arr down" data-dir="1" ${i === fmtSt.ord.length - 1 ? 'disabled' : ''}>▼</button></div>`).join('');
    upd();
  };

  listEl.addEventListener('click', e => {
    const arr = e.target.closest('.dl-arr');
    if (!arr || arr.disabled) return;
    const k = arr.closest('.dl-fmt-row')?.dataset.key, d = parseInt(arr.dataset.dir, 10), i = fmtSt.ord.indexOf(k);
    if (i < 0 || !fmtSt.ord[i + d]) return;
    [fmtSt.ord[i], fmtSt.ord[i + d]] = [fmtSt.ord[i + d], fmtSt.ord[i]];
    render();
  });

  listEl.addEventListener('change', e => {
    if (!e.target.classList.contains('dl-chk')) return;
    fmtSt.en[e.target.dataset.key] = e.target.checked;
    upd();
  });

  custInp.value = fmtSt.cst;
  custInp.addEventListener('input', e => {
    fmtSt.cst = e.target.value.trim();
    upd();
  });

  render();
};

export default { renderDownloadSettingsSection, bindDownloadSettingsSection };
