// scripts/ui/modal-templates.js

const U = window.Utils;
const esc = (s) => U?.escapeHtml ? U.escapeHtml(String(s ?? '')) : String(s ?? '');
const attr = (k, v) => v ? ` ${k}` : '';

export const ModalTemplates = {
  /**
   * Генерация тела модалки OFFLINE
   * @param {Object} s - State object from OfflineManager
   */
  offlineBody: (s = {}) => {
    const {
      mode = 'R0',        // R0, R1, R2, R3
      cq = 'hi',          // Cache Quality
      foq = 'hi',         // Full Offline Quality
      cloud = { n: 5, d: 31 },
      bd = {},            // Breakdown stats
      qst = {},           // Queue stats
      isSpaceOk = true    // >60MB free
    } = s;

    // Helper for bytes formatting if Utils not avail immediately
    const fmtBytes = (b) => U?.fmt?.bytes ? U.fmt.bytes(b) : `${(b/1048576).toFixed(1)} MB`;
    const n = (v) => Number(v) || 0;

    const btn = (id, txt, cls = '') => `<button class="offline-btn ${cls}" id="${id}">${esc(txt)}</button>`;
    const section = (title, content) => `
      <section class="om-card">
        <div class="om-card__title">${esc(title)}</div>
        <div class="om-card__body">${content}</div>
      </section>`;
    
    const kv = (label, valId, val) => `<div class="om-kv-row"><span>${label}:</span> <b id="${valId}">${val}</b></div>`;

    // Alert if space is low
    const spaceAlert = !isSpaceOk 
      ? `<div class="om-alert om-alert--error">⚠️ Мало места (<60MB). Режимы R1/R2/R3 недоступны.</div>` 
      : '';

    // R3 Info (if active)
    const isR3 = mode === 'R3';

    return `
      <div class="om-container">
        <div class="om-header-stat">
          <div>Текущий режим: <b class="om-mode-badge">${mode}</b></div>
          <div>Очередь: <b id="om-q-val">${qst.queued || 0}</b></div>
        </div>

        ${spaceAlert}

        <!-- SECTION A: MODES -->
        ${section('A) Режим работы', `
          <div class="om-modes-list">
            <label class="om-radio-row ${isR3 ? 'disabled' : ''}">
              <input type="radio" name="om-mode" value="R0" ${attr('checked', mode === 'R0')} ${attr('disabled', isR3)}>
              <div class="om-radio-label">
                <strong>R0 Streaming</strong>
                <span>Только сеть. Без кэша (кроме 🔒).</span>
              </div>
            </label>

            <label class="om-radio-row ${(!isSpaceOk || isR3) ? 'disabled' : ''}">
              <input type="radio" name="om-mode" value="R1" ${attr('checked', mode === 'R1')} ${attr('disabled', !isSpaceOk || isR3)}>
              <div class="om-radio-label">
                <strong>R1 PlaybackCache</strong>
                <span>Кэш только окна (3 трека).</span>
              </div>
            </label>

            <label class="om-radio-row ${(!isSpaceOk || isR3) ? 'disabled' : ''}">
              <input type="radio" name="om-mode" value="R2" ${attr('checked', mode === 'R2')} ${attr('disabled', !isSpaceOk || isR3)}>
              <div class="om-radio-label">
                <strong>R2 Dynamic</strong>
                <span>Умный кэш частого + окно.</span>
              </div>
            </label>
            
            <div class="om-r3-info ${isR3 ? 'active' : ''}">
              <strong>R3 100% OFFLINE</strong>
              <span>${isR3 ? 'Включен. Сеть запрещена.' : 'Включается в секции I.'}</span>
            </div>
          </div>
        `)}

        <!-- SECTION B: CACHE QUALITY -->
        ${!isR3 ? section('B) Качество кэша (CQ)', `
          <div class="om-inline-controls">
            <select id="om-cq" class="om-select">
              <option value="hi" ${attr('selected', cq === 'hi')}>High Quality</option>
              <option value="lo" ${attr('selected', cq === 'lo')}>Low Quality</option>
            </select>
            ${btn('om-save-cq', 'Применить', 'om-btn-primary')}
          </div>
          <p class="om-hint">Для Pinned, Cloud и R2. Смена запустит перекачивание.</p>
        `) : ''}

        <!-- SECTION C: CLOUD SETTINGS -->
        ${!isR3 ? section('C) Настройки Облачка (Cloud)', `
          <div class="om-inline-inputs">
            <label>N (прослушиваний): <input type="number" id="om-cloud-n" value="${n(cloud.n)}" min="1"></label>
            <label>D (дней хранения): <input type="number" id="om-cloud-d" value="${n(cloud.d)}" min="1"></label>
            ${btn('om-save-cloud', 'OK', 'om-btn-sm')}
          </div>
        `) : ''}

        <!-- SECTION E: LIMIT & BREAKDOWN -->
        ${section('E) Хранилище', `
          <div class="om-breakdown">
            ${kv('Pinned (🔒)', 'om-bd-pinned', fmtBytes(bd.pinnedBytes))}
            ${kv('Cloud (☁)', 'om-bd-cloud', fmtBytes(bd.cloudBytes))}
            ${kv('Dynamic (R2)', 'om-bd-dynamic', fmtBytes(bd.dynamicBytes))}
            ${kv('Playback Window', 'om-bd-win', fmtBytes(bd.transientWindowBytes))}
            ${kv('100% Offline', 'om-bd-full', fmtBytes(bd.fullOfflineBytes))}
            <div class="om-kv-total">Всего аудио: <b>${fmtBytes(bd.audioTotalBytes)}</b></div>
          </div>
          <div class="om-storage-actions">
             ${btn('om-clear-cache', 'Очистить кэш', 'om-btn-danger')}
          </div>
        `)}

        <!-- SECTION I: 100% OFFLINE (R3) -->
        ${section('I) 100% OFFLINE (R3)', `
          <div class="om-full-offline-ui">
            ${isR3 ? `
               <div class="om-success-box">Режим активен. Сеть отключена.</div>
               ${btn('om-stop-r3', 'Выключить R3 (Вернуться в Онлайн)', 'om-btn-warning')}
            ` : `
               <div class="om-inline-controls">
                 <select id="om-full-target" class="om-select">
                   <option value="fav">Только ИЗБРАННОЕ</option>
                   <option value="all">Все треки (Альбомы)</option>
                 </select>
                 <select id="om-foq" class="om-select">
                   <option value="hi" ${attr('selected', foq === 'hi')}>Qual: Hi</option>
                   <option value="lo" ${attr('selected', foq === 'lo')}>Qual: Lo</option>
                 </select>
               </div>
               
               <div class="om-full-actions">
                 ${btn('om-est-full', 'Оценить размер')}
                 ${btn('om-start-full', 'Скачать набор', 'om-btn-success')}
               </div>
               <div id="om-est-result" class="om-est-result"></div>
               
               <p class="om-hint">
                 Режим включится <b>только после 100% загрузки</b> выбранного набора.<br>
                 ${!isSpaceOk ? '<span class="error">Недоступно из-за нехватки места.</span>' : ''}
               </p>
            `}
          </div>
        `)}
      </div>
    `;
  },

  /**
   * Шаблон модалки статистики (Section 17)
   */
  statsBody: (data) => {
    // data: { tracks: [{uid, fullListens, seconds}], totalSeconds, totalFullListens }
    const U = window.Utils;
    const fmtDur = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}ч ${m}м` : `${m} мин`;
    };

    const rows = data.tracks.map((t, i) => `
      <div class="st-row">
        <span class="st-num">${i + 1}.</span>
        <span class="st-uid">${t.title || t.uid}</span>
        <span class="st-vals">${t.fullListens} просл. / ${fmtDur(t.seconds)}</span>
      </div>
    `).join('');

    return `
      <div class="st-container">
        <div class="st-total">
          <div>Всего времени: <b>${fmtDur(data.totalSeconds)}</b></div>
          <div>Полных прослушиваний: <b>${data.totalFullListens}</b></div>
        </div>
        <div class="st-list-header">Топ треков (>3 прослушиваний):</div>
        <div class="st-list">
          ${rows || '<div class="st-empty">Нет данных</div>'}
        </div>
        <div class="st-note">Эта статистика (Global) никогда не сбрасывается.</div>
      </div>
    `;
  }
};
