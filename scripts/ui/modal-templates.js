// scripts/ui/modal-templates.js
const esc = (s) => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s??'')) : String(s??'');
const attr = (k, v) => v ? ` ${k}` : '';

export const ModalTemplates = {
  offlineBody: (s={}) => {
    const { 
        cq='hi', foq='hi', mode='R0', 
        cloud={n:5,d:31}, 
        bd={}, qst={}, est={}, 
        isSpaceOk=true 
    } = s;
    
    const n = (v) => Number(v)||0; 
    const sec = (t, c) => `<section class="om-card"><div class="om-card__title">${esc(t)}</div>${c}</section>`;
    const btn = (id, t, c='') => `<button class="offline-btn ${c}" id="${id}">${esc(t)}</button>`;
    const kv = (l, id, v='—') => `<div>${l}: <b id="${id}">${v}</b></div>`;

    return `<div class="om">
      <div class="om-head">
        <div class="om-head__left">Mode: <b id="om-mode-val">${mode}</b></div>
        <div class="om-head__right">Queue: <b id="om-q-val">${qst.queued||0}</b></div>
      </div>

      ${!isSpaceOk ? `<div class="om-alert">⚠️ Недостаточно места (нужно 60MB)</div>` : ''}

      ${sec('A) Режимы', `
        <div class="om-modes">
          <label class="om-row"><input type="radio" name="om-mode" value="R0" ${attr('checked', mode==='R0')}> R0 Streaming</label>
          <label class="om-row"><input type="radio" name="om-mode" value="R1" ${attr('checked', mode==='R1')} ${attr('disabled', !isSpaceOk)}> R1 PlaybackCache</label>
          <label class="om-row"><input type="radio" name="om-mode" value="R2" ${attr('checked', mode==='R2')} ${attr('disabled', !isSpaceOk)}> R2 Dynamic</label>
          <label class="om-row"><input type="radio" name="om-mode" value="R3" ${attr('checked', mode==='R3')} disabled> R3 100% OFFLINE (Включить в секции I)</label>
        </div>
      `)}

      ${sec('B) Cache Quality (CQ)', `
        <div class="om-inline">
          <select class="om-select" id="om-cq">
            <option value="hi" ${attr('selected', cq==='hi')}>Hi</option>
            <option value="lo" ${attr('selected', cq==='lo')}>Lo</option>
          </select>
          ${btn('om-cq-save', 'Сохранить')}
        </div>
        <div class="om-note">Для Pinned, Cloud и R2. Запускает замену.</div>
      `)}

      ${sec('C) Cloud Settings', `
        <div class="om-inline">
          <label>N: <input class="om-input-sm" id="om-cloud-n" type="number" value="${n(cloud.n)}"></label>
          <label>D: <input class="om-input-sm" id="om-cloud-d" type="number" value="${n(cloud.d)}"></label>
          ${btn('om-cloud-save', 'Сохранить')}
        </div>
      `)}

      ${sec('E) Limit & Breakdown', `
        <div class="om-kv">
          ${kv('Pinned', 'om-bd-pinned', U.fmt.bytes(bd.pinnedBytes))}
          ${kv('Cloud', 'om-bd-cloud', U.fmt.bytes(bd.cloudBytes))}
          ${kv('Dynamic', 'om-bd-dynamic', U.fmt.bytes(bd.dynamicBytes))}
          ${kv('Transient', 'om-bd-transient', U.fmt.bytes(bd.transientWindowBytes))}
          ${kv('100% Offline', 'om-bd-full', U.fmt.bytes(bd.fullOfflineBytes))}
        </div>
        <div class="om-actions--left">${btn('om-clear-all', 'Очистить Кэш', 'om-btn-danger')}</div>
      `)}

      ${sec('I) 100% OFFLINE (R3)', `
        <div class="om-inline">
          <select class="om-select" id="om-full-type">
            <option value="fav">Только Избранное</option>
            <option value="all">Всё (оценка)</option>
          </select>
          <select class="om-select" id="om-foq">
            <option value="hi" ${attr('selected', foq==='hi')}>Qual: Hi</option>
            <option value="lo" ${attr('selected', foq==='lo')}>Qual: Lo</option>
          </select>
        </div>
        <div class="om-actions--left">
           ${btn('om-full-est', 'Оценить')}
           ${btn('om-full-start', 'Скачать и Включить', 'om-btn-success')}
        </div>
        <div id="om-full-res" class="om-note"></div>
      `)}
    </div>`;
  }
};
