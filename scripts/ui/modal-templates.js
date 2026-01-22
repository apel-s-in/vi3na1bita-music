// scripts/ui/modal-templates.js
'use strict';

const esc = (s) => {
  const f = window.Utils?.escapeHtml;
  return typeof f === 'function' ? f(String(s ?? '')) : String(s ?? '');
};

export const ModalTemplates = {
  // Универсальная обёртка (если у вас где-то создаются модалки из шаблонов)
  wrap: ({ title = '', body = '' } = {}) => `
    ${title ? `<h2>${esc(title)}</h2>` : ''}
    <div class="modal-body">${body}</div>
  `,

  // Offline modal body: только структура + id/атрибуты-анкеры для offline-modal.js
  // Важно: id подобраны так, чтобы их легко биндить. Если у вас уже есть свои id — скажи, я подгоню 1:1.
  offlineBody: (s = {}) => {
    const cq = String(s.cq ?? 'hi');
    const isOff = !!s.isOff;
    const cloudN = Number(s.cloud?.n ?? 5) || 5;
    const cloudD = Number(s.cloud?.d ?? 31) || 31;
    const pol = s.policy || {};
    const limit = s.limit || { mode: 'auto', mb: 500 };
    const albums = Array.isArray(s.albums) ? s.albums : [];

    return `
      <div class="om">
        <div class="om-head">
          <div class="om-head__left">
            <span class="om-head__title">Сеть:</span>
            <b id="om-net-label" class="om-head__value">—</b>
          </div>
          <div class="om-head__right">CQ=<b id="om-cq-label">${esc(cq)}</b></div>
        </div>

        <section class="om-card">
          <div class="om-card__title">A) Offline mode</div>
          <label class="om-row">
            <input class="om-check" type="checkbox" id="om-offline-mode" ${isOff ? 'checked' : ''}>
            <span>Включить OFFLINE mode</span>
          </label>
          <div class="om-note">OFFLINE=OFF: стриминг. Кэш не удаляется автоматически.</div>
        </section>

        <section class="om-card">
          <div class="om-card__title">B) Cache quality (CQ)</div>
          <div class="om-inline">
            <select class="om-select" id="om-cq">
              <option value="hi" ${cq === 'hi' ? 'selected' : ''}>Hi</option>
              <option value="lo" ${cq === 'lo' ? 'selected' : ''}>Lo</option>
            </select>
            <button class="offline-btn om-btn-primary" id="om-cq-save">Сохранить</button>
          </div>
          <div class="om-note">Смена CQ запускает тихий re-cache pinned/cloud.</div>
        </section>

        <section class="om-card">
          <div class="om-card__title">C) Cloud settings</div>
          <div class="om-inline">
            <label class="om-field"><span class="om-field__lbl">N</span>
              <input class="om-input" type="number" id="om-cloud-n" min="1" max="50" value="${cloudN}">
            </label>
            <label class="om-field"><span class="om-field__lbl">D</span>
              <input class="om-input" type="number" id="om-cloud-d" min="1" max="365" value="${cloudD}">
            </label>
            <button class="offline-btn" id="om-cloud-save">Сохранить</button>
          </div>
        </section>

        <section class="om-card">
          <div class="om-card__title">D) Network policy</div>
          <label class="om-row"><input class="om-check" type="checkbox" id="om-pol-wifiOnly" ${pol.wifiOnly ? 'checked' : ''}><span>Wi‑Fi only</span></label>
          <label class="om-row"><input class="om-check" type="checkbox" id="om-pol-allowMobile" ${pol.allowMobile ? 'checked' : ''}><span>Разрешить mobile</span></label>
          <label class="om-row"><input class="om-check" type="checkbox" id="om-pol-confirmOnMobile" ${pol.confirmOnMobile ? 'checked' : ''}><span>Confirm на mobile</span></label>
          <label class="om-row"><input class="om-check" type="checkbox" id="om-pol-saveDataBlock" ${pol.saveDataBlock ? 'checked' : ''}><span>Блокировать при Save‑Data</span></label>
          <button class="offline-btn" id="om-pol-save">Сохранить policy</button>
        </section>

        <section class="om-card">
          <div class="om-card__title">E) Cache limit + breakdown</div>
          <div class="om-inline">
            <select class="om-select" id="om-limit-mode">
              <option value="auto" ${limit.mode === 'auto' ? 'selected' : ''}>auto</option>
              <option value="manual" ${limit.mode === 'manual' ? 'selected' : ''}>manual (MB)</option>
            </select>
            <input class="om-input" type="number" id="om-limit-mb" min="50" max="5000"
              value="${Number(limit.mb ?? 500) || 500}" ${limit.mode === 'manual' ? '' : 'disabled'}>
            <button class="offline-btn" id="om-limit-save">Сохранить</button>
          </div>

          <div class="om-kv">
            <div>audio total: <b id="om-e-audio-total">—</b></div>
            <div>pinned: <b id="om-e-pinned">—</b></div>
            <div>cloud: <b id="om-e-cloud">—</b></div>
            <div>transient window: <b id="om-e-tw">—</b></div>
            <div>transient extra: <b id="om-e-te">—</b></div>
            <div>transient unknown: <b id="om-e-tu">—</b></div>
            <div>other (SW cache): <b id="om-e-sw-total">—</b></div>
          </div>
        </section>

        <section class="om-card">
          <div class="om-card__title">F) Загрузки</div>
          <div class="om-kv">
            <div>Скачивается сейчас: <b id="om-f-downloading">—</b></div>
            <div>В очереди: <b id="om-f-queued">0</b></div>
          </div>
          <div class="om-actions om-actions--left">
            <button class="offline-btn" id="om-queue-toggle">Пауза/Возобновить</button>
          </div>
        </section>

        <section class="om-card">
          <div class="om-card__title">G) Обновления</div>
          <div class="om-kv">
            <div>needsUpdate: <b id="om-g-needsUpdate">0</b></div>
            <div>needsReCache: <b id="om-g-needsReCache">0</b></div>
          </div>
          <div class="om-actions om-actions--left">
            <button class="offline-btn" id="om-upd-all">Обновить все файлы</button>
            <button class="offline-btn" id="om-recache-all">Re-cache по CQ</button>
          </div>
        </section>

        <section class="om-card">
          <div class="om-card__title">H) Очистка кэша</div>
          <div class="om-actions om-actions--left">
            <button class="offline-btn om-btn-danger" id="om-clear-all">Очистить всё</button>
          </div>
        </section>

        <section class="om-card">
          <div class="om-card__title">I) 100% OFFLINE</div>
          <div class="om-inline">
            <select class="om-select" id="om-full-mode">
              <option value="favorites">только ИЗБРАННОЕ</option>
              <option value="albums">выбранные альбомы</option>
            </select>
            <button class="offline-btn" id="om-full-est">Оценить</button>
            <button class="offline-btn om-btn-success" id="om-full-start">Старт</button>
          </div>

          <div id="om-albums-box" class="om-albums">
            ${albums.map(a => `
              <label class="om-row om-row--tight">
                <input class="om-check om-alb" type="checkbox" data-k="${esc(a.key)}">
                <span>${esc(a.title)}</span>
              </label>
            `).join('')}
          </div>

          <div id="om-full-out" class="om-note">Оценка: —</div>
        </section>

        <section class="om-card">
          <div class="om-card__title">Статистика</div>
          <div class="om-kv">
            <div>globalTotalListenSeconds: <b id="om-stats-total">—</b></div>
          </div>
        </section>
      </div>
    `;
  }
};

// ✅ КРИТИЧЕСКИ ВАЖНО: пробрасываем шаблоны в window, потому что modals.js берёт offlineBody через window.ModalTemplates
try {
  window.ModalTemplates = ModalTemplates;
} catch {}
