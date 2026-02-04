// scripts/ui/modal-templates.js
const U = window.Utils;
const esc = (s) => U?.escapeHtml ? U.escapeHtml(String(s ?? '')) : String(s ?? '');
const attr = (k, v) => v ? ` ${k}` : '';

export const ModalTemplates = {
  offlineBody: (s = {}) => {
    const { mode='R0', cq='hi', foq='hi', cloud={n:5,d:31}, bd={}, qst={}, isSpaceOk=true } = s;
    const fmtBytes = (b) => U?.fmt?.bytes ? U.fmt.bytes(b) : `${(b/1048576).toFixed(1)} MB`;
    const n = (v) => Number(v) || 0;
    const btn = (id, txt, cls='') => `<button class="offline-btn ${cls}" id="${id}">${esc(txt)}</button>`;
    const section = (title, content) => `<section class="om-card"><div class="om-card__title">${esc(title)}</div><div class="om-card__body">${content}</div></section>`;
    const kv = (label, valId, val) => `<div class="om-kv-row"><span>${label}:</span> <b id="${valId}">${val}</b></div>`;
    const isR3 = mode === 'R3';

    // Album list for Full Offline
    const albums = window.albumsIndex || [];
    const albumsHtml = albums.map(a => 
        `<label class="om-row om-row--tight"><input type="checkbox" class="om-check full-album-check" value="${a.key}"> ${esc(a.title)}</label>`
    ).join('');

    return `
      <div class="om-container">
        <div class="om-header-stat">
          <div>Режим: <b class="om-mode-badge">${mode}</b></div>
          <div>Очередь: <b id="om-q-val">${qst.queued || 0}</b></div>
        </div>
        ${!isSpaceOk ? `<div class="om-alert om-alert--error">⚠️ Мало места (<60MB).</div>` : ''}

        ${section('A) Режим', `
          <div class="om-modes-list">
            <label class="om-radio-row ${isR3 ? 'disabled' : ''}"><input type="radio" name="om-mode" value="R0" ${attr('checked', mode==='R0')} ${attr('disabled', isR3)}> <strong>R0 Streaming</strong></label>
            <label class="om-radio-row ${(!isSpaceOk||isR3) ? 'disabled' : ''}"><input type="radio" name="om-mode" value="R1" ${attr('checked', mode==='R1')} ${attr('disabled', !isSpaceOk||isR3)}> <strong>R1 PlaybackCache</strong></label>
            <label class="om-radio-row ${(!isSpaceOk||isR3) ? 'disabled' : ''}"><input type="radio" name="om-mode" value="R2" ${attr('checked', mode==='R2')} ${attr('disabled', !isSpaceOk||isR3)}> <strong>R2 Dynamic</strong></label>
            <div class="om-r3-info ${isR3 ? 'active' : ''}"><strong>R3 100% OFFLINE</strong> ${isR3 ? 'ВКЛЮЧЕН' : '(см. секцию I)'}</div>
          </div>
        `)}

        ${!isR3 ? section('B) Качество (CQ)', `
          <div class="om-inline-controls">
            <select id="om-cq" class="om-select"><option value="hi" ${attr('selected', cq==='hi')}>Hi</option><option value="lo" ${attr('selected', cq==='lo')}>Lo</option></select>
            ${btn('om-save-cq', 'Применить')}
          </div>
        `) : ''}

        ${!isR3 ? section('C) Облачко', `
          <div class="om-inline-inputs"><label>N: <input type="number" id="om-cloud-n" value="${n(cloud.n)}" style="width:50px"></label><label>D: <input type="number" id="om-cloud-d" value="${n(cloud.d)}" style="width:50px"></label>${btn('om-save-cloud', 'OK')}</div>
        `) : ''}

        ${section('E) Хранилище', `
          <div class="om-breakdown">
            ${kv('Pinned', 'om-bd-pinned', fmtBytes(bd.pinnedBytes))}
            ${kv('Cloud', 'om-bd-cloud', fmtBytes(bd.cloudBytes))}
            ${kv('Dynamic', 'om-bd-dynamic', fmtBytes(bd.dynamicBytes))}
            ${kv('Window', 'om-bd-win', fmtBytes(bd.transientWindowBytes))}
            ${kv('100% Offline', 'om-bd-full', fmtBytes(bd.fullOfflineBytes))}
            <div class="om-kv-total">Всего: <b>${fmtBytes(bd.audioTotalBytes)}</b></div>
          </div>
          <div class="om-storage-actions">${btn('om-clear-cache', 'Очистить кэш', 'om-btn-danger')}</div>
        `)}

        ${section('I) 100% OFFLINE (R3)', `
          <div class="om-full-offline-ui">
            ${isR3 ? `
               <div class="om-success-box">Режим R3 активен. Сеть отключена.</div>
               ${btn('om-stop-r3', 'Выключить R3 (Вернуться в Онлайн)', 'om-btn-warning')}
            ` : `
               <div class="om-full-select">
                 <label><input type="checkbox" id="om-full-fav" checked> Избранное</label>
                 <div class="om-albums">${albumsHtml}</div>
               </div>
               <div class="om-inline-controls">
                 <span>Качество:</span>
                 <select id="om-foq" class="om-select"><option value="hi" ${attr('selected', foq==='hi')}>Hi</option><option value="lo" ${attr('selected', foq==='lo')}>Lo</option></select>
               </div>
               <div class="om-full-actions">${btn('om-est-full', 'Оценить')} ${btn('om-start-full', 'Скачать набор', 'om-btn-success')}</div>
               <div id="om-est-result" class="om-est-result"></div>
               <p class="om-hint">R3 включится только после 100% загрузки и вашего подтверждения.</p>
            `}
          </div>
        `)}
      </div>
    `;
  }
};
