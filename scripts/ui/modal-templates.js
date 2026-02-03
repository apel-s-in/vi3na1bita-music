// scripts/ui/modal-templates.js
// Optimized Modal Templates v2.1
const esc = (s) => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s??'')) : String(s??'');
const attr = (k, v) => v ? ` ${k}` : '';

export const ModalTemplates = {
  wrap: ({ title='', body='' }={}) => `${title?`<h2>${esc(title)}</h2>`:''}<div class="modal-body">${body}</div>`,

  offlineBody: (s={}) => {
    const { cq='hi', isOff, cloud={n:5,d:31}, pol={}, limit={mode:'auto',mb:500}, albums=[], bd={}, qst={}, needs={}, totalSec=0, selMode='favorites' } = s;
    const n = (v) => Number(v)||0; 
    
    // UI Components Helpers
    const sec = (t, c) => `<section class="om-card"><div class="om-card__title">${esc(t)}</div>${c}</section>`;
    const chk = (id, l, v) => `<label class="om-row"><input class="om-check" type="checkbox" id="${id}"${attr('checked',v)}><span>${esc(l)}</span></label>`;
    const btn = (id, t, c='') => `<button class="offline-btn ${c}" id="${id}">${esc(t)}</button>`;
    const inp = (id, v, min, max, d) => `<input class="om-input" type="number" id="${id}" value="${v}" min="${min}" max="${max}"${attr('disabled',d)}>`;
    const kv = (l, id, v='—') => `<div>${l}: <b id="${id}">${v}</b></div>`;

    return `<div class="om">
      <div class="om-head">
        <div class="om-head__left"><span class="om-head__title">Сеть:</span> <b id="om-net-label" class="om-head__value">—</b></div>
        <div class="om-head__right">CQ=<b id="om-cq-label">${esc(cq)}</b></div>
      </div>

      ${sec('A) Offline mode', `
        ${chk('om-offline-mode', 'Включить OFFLINE mode', isOff)}
        <div class="om-note">OFFLINE=OFF: стриминг. Кэш не удаляется автоматически.</div>
      `)}

      ${sec('B) Cache quality (CQ)', `
        <div class="om-inline">
          <select class="om-select" id="om-cq">
            <option value="hi"${attr('selected', cq==='hi')}>Hi</option>
            <option value="lo"${attr('selected', cq==='lo')}>Lo</option>
          </select>
          ${btn('om-cq-save', 'Сохранить', 'om-btn-primary')}
        </div>
        <div class="om-note">Смена CQ запускает тихий re-cache pinned/cloud.</div>
      `)}

      ${sec('C) Cloud settings', `
        <div class="om-inline">
          <label class="om-field"><span class="om-field__lbl">N</span>${inp('om-cloud-n', n(cloud.n), 1, 50)}</label>
          <label class="om-field"><span class="om-field__lbl">D</span>${inp('om-cloud-d', n(cloud.d), 1, 365)}</label>
          ${btn('om-cloud-save', 'Сохранить')}
        </div>
      `)}

      ${sec('D) Network policy', `
        ${chk('om-pol-wifiOnly', 'Wi‑Fi only', pol.wifiOnly)}
        ${chk('om-pol-allowMobile', 'Разрешить mobile', pol.allowMobile)}
        ${chk('om-pol-confirmOnMobile', 'Confirm на mobile', pol.confirmOnMobile)}
        ${chk('om-pol-saveDataBlock', 'Блокировать при Save‑Data', pol.saveDataBlock)}
        ${btn('om-pol-save', 'Сохранить policy')}
      `)}

      ${sec('E) Cache limit + breakdown', `
        <div class="om-inline">
          <select class="om-select" id="om-limit-mode">
            <option value="auto"${attr('selected', limit.mode==='auto')}>auto</option>
            <option value="manual"${attr('selected', limit.mode==='manual')}>manual (MB)</option>
          </select>
          ${inp('om-limit-mb', n(limit.mb), 50, 5000, limit.mode!=='manual')}
          ${btn('om-limit-save', 'Сохранить')}
        </div>
        <div class="om-kv">
          ${kv('audio total', 'om-e-audio-total')}${kv('pinned', 'om-e-pinned')}
          ${kv('cloud', 'om-e-cloud')}${kv('transient window', 'om-e-tw')}
          ${kv('transient extra', 'om-e-te')}${kv('transient unknown', 'om-e-tu')}
          ${kv('other (SW cache)', 'om-e-sw-total')}
        </div>
      `)}

      ${sec('F) Загрузки', `
        <div class="om-kv">${kv('Скачивается сейчас', 'om-f-downloading')}${kv('В очереди', 'om-f-queued', '0')}</div>
        <div class="om-actions om-actions--left">${btn('om-queue-toggle', 'Пауза/Возобновить')}</div>
      `)}

      ${sec('G) Обновления', `
        <div class="om-kv">${kv('needsUpdate', 'om-g-needsUpdate', '0')}${kv('needsReCache', 'om-g-needsReCache', '0')}</div>
        <div class="om-actions om-actions--left">
          ${btn('om-upd-all', 'Обновить все файлы')}
          ${btn('om-recache-all', 'Re-cache по CQ')}
        </div>
      `)}

      ${sec('H) Очистка кэша', `
        <div class="om-actions om-actions--left">${btn('om-clear-all', 'Очистить всё', 'om-btn-danger')}</div>
      `)}

      ${sec('I) 100% OFFLINE', `
        <div class="om-inline">
          <select class="om-select" id="om-full-mode">
            <option value="favorites"${attr('selected', selMode==='favorites')}>только ИЗБРАННОЕ</option>
            <option value="albums"${attr('selected', selMode==='albums')}>выбранные альбомы</option>
          </select>
          ${btn('om-full-est', 'Оценить')}
          ${btn('om-full-start', 'Старт', 'om-btn-success')}
        </div>
        <div id="om-albums-box" class="om-albums" style="display:${selMode==='albums'?'':'none'}">
          ${albums.map(a => `<label class="om-row om-row--tight"><input class="om-check om-alb" type="checkbox" data-k="${esc(a.key)}"><span>${esc(a.title)}</span></label>`).join('')}
        </div>
        <div id="om-full-out" class="om-note">Оценка: —</div>
      `)}

      ${sec('Статистика', `<div class="om-kv">${kv('globalTotalListenSeconds', 'om-stats-total')}</div>`)}
    </div>`;
  }
};

try { window.ModalTemplates = ModalTemplates; } catch {}
