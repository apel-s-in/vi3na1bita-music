// scripts/ui/modal-templates.js
'use strict';

// Важно: этот файл — ESM, подключается в index.html как type="module".
// Задача: держать шаблоны компактными и структурированными.

const esc = (s) => {
  const f = window.Utils?.escapeHtml;
  return typeof f === 'function' ? f(String(s ?? '')) : String(s ?? '');
};

function section(title, body) {
  return `
    <section class="om-card">
      <div class="om-card__title">${esc(title)}</div>
      ${body}
    </section>
  `;
}

function rowCheck({ id, label, checked }) {
  return `
    <label class="om-row">
      <input class="om-check" type="checkbox" id="${esc(id)}" ${checked ? 'checked' : ''}>
      <span>${esc(label)}</span>
    </label>
  `;
}

function btn({ id, text, className = '' }) {
  return `<button class="offline-btn ${esc(className)}" id="${esc(id)}">${esc(text)}</button>`;
}

function select({ id, options, value }) {
  const v = String(value ?? '');
  return `
    <select class="om-select" id="${esc(id)}">
      ${options.map((o) => {
        const ov = String(o.value);
        const ot = String(o.text);
        return `<option value="${esc(ov)}" ${ov === v ? 'selected' : ''}>${esc(ot)}</option>`;
      }).join('')}
    </select>
  `;
}

function inputNumber({ id, min, max, value, disabled }) {
  return `
    <input class="om-input"
           type="number"
           id="${esc(id)}"
           min="${esc(min)}"
           max="${esc(max)}"
           value="${esc(value)}"
           ${disabled ? 'disabled' : ''}>
  `;
}

export const ModalTemplates = {
  wrap: ({ title = '', body = '' } = {}) => `
    ${title ? `<h2>${esc(title)}</h2>` : ''}
    <div class="modal-body">${body}</div>
  `,

  inactiveFavoriteBody: ({ title = '' } = {}) => `
    <div style="color:#9db7dd; line-height:1.45; margin-bottom:14px;">
      <div style="margin-bottom:8px;"><strong>Трек:</strong> ${esc(title || 'Трек')}</div>
      <div style="opacity:.9;">
        Трек неактивен в «ИЗБРАННОЕ». Вы можете вернуть его в ⭐ или удалить строку окончательно.
      </div>
    </div>
  `,

  feedbackBody: ({ supportEmail = '', githubUrl = '' } = {}) => `
    <p style="margin-bottom:20px; color:#8ab8fd; text-align:center;">
      Есть предложения или нашли ошибку?<br>Напишите нам!
    </p>
    <div style="display:flex; flex-direction:column; gap:15px; max-width:300px; margin:0 auto;">
      <a href="https://t.me/vitrina_razbita" target="_blank" rel="noopener noreferrer"
         style="background:#0088cc; color:#fff; padding:15px; border-radius:8px; text-decoration:none; text-align:center;">
        Telegram
      </a>
      <a href="mailto:${esc(supportEmail || 'support@vitrina-razbita.ru')}" target="_blank" rel="noopener noreferrer"
         style="background:#4daaff; color:#fff; padding:15px; border-radius:8px; text-decoration:none; text-align:center;">
        Email
      </a>
      <a href="${esc(githubUrl || 'https://github.com/apel-s-in/vi3na1bita-music')}" target="_blank" rel="noopener noreferrer"
         style="background:#333; color:#fff; padding:15px; border-radius:8px; text-decoration:none; text-align:center;">
        GitHub
      </a>
    </div>
  `,

  hotkeysBody: () => `
    <div class="hotkeys-section">
      <h3 style="color:#8ab8fd; margin-bottom:12px;">Воспроизведение</h3>
      <div class="hotkey-item"><span class="hotkey-combo">K / Пробел</span><span class="hotkey-desc">Воспроизведение/Пауза</span></div>
      <div class="hotkey-item"><span class="hotkey-combo">X</span><span class="hotkey-desc">Стоп</span></div>
      <div class="hotkey-item"><span class="hotkey-combo">N / P</span><span class="hotkey-desc">Следующий/Предыдущий</span></div>
    </div>
    <div class="hotkeys-section">
      <h3 style="color:#8ab8fd; margin-bottom:12px;">Режимы</h3>
      <div class="hotkey-item"><span class="hotkey-combo">R</span><span class="hotkey-desc">Повтор</span></div>
      <div class="hotkey-item"><span class="hotkey-combo">U</span><span class="hotkey-desc">Случайный порядок</span></div>
      <div class="hotkey-item"><span class="hotkey-combo">F</span><span class="hotkey-desc">Только избранные</span></div>
      <div class="hotkey-item"><span class="hotkey-combo">T</span><span class="hotkey-desc">Таймер сна</span></div>
    </div>
  `,

  offlineBody: (s = {}) => {
    const cq = String(s.cq ?? 'hi');
    const isOff = !!s.isOff;

    const cloudN = Number(s.cloud?.n ?? 5) || 5;
    const cloudD = Number(s.cloud?.d ?? 31) || 31;

    const pol = s.policy || {};
    const limit = s.limit || { mode: 'auto', mb: 500 };

    const albums = Array.isArray(s.albums) ? s.albums : [];

    const head = `
      <div class="om-head">
        <div class="om-head__left">
          <span class="om-head__title">Сеть:</span>
          <b id="om-net-label" class="om-head__value">—</b>
        </div>
        <div class="om-head__right">CQ=<b id="om-cq-label">${esc(cq)}</b></div>
      </div>
    `;

    const secA = section('A) Offline mode', `
      ${rowCheck({ id: 'om-offline-mode', label: 'Включить OFFLINE mode', checked: isOff })}
      <div class="om-note">OFFLINE=OFF: стриминг. Кэш не удаляется автоматически.</div>
    `);

    const secB = section('B) Cache quality (CQ)', `
      <div class="om-inline">
        ${select({
          id: 'om-cq',
          value: cq,
          options: [{ value: 'hi', text: 'Hi' }, { value: 'lo', text: 'Lo' }]
        })}
        ${btn({ id: 'om-cq-save', text: 'Сохранить', className: 'om-btn-primary' })}
      </div>
      <div class="om-note">Смена CQ запускает тихий re-cache pinned/cloud.</div>
    `);

    const secC = section('C) Cloud settings', `
      <div class="om-inline">
        <label class="om-field"><span class="om-field__lbl">N</span>${inputNumber({ id: 'om-cloud-n', min: 1, max: 50, value: cloudN })}</label>
        <label class="om-field"><span class="om-field__lbl">D</span>${inputNumber({ id: 'om-cloud-d', min: 1, max: 365, value: cloudD })}</label>
        ${btn({ id: 'om-cloud-save', text: 'Сохранить' })}
      </div>
    `);

    const secD = section('D) Network policy', `
      ${rowCheck({ id: 'om-pol-wifiOnly', label: 'Wi‑Fi only', checked: !!pol.wifiOnly })}
      ${rowCheck({ id: 'om-pol-allowMobile', label: 'Разрешить mobile', checked: !!pol.allowMobile })}
      ${rowCheck({ id: 'om-pol-confirmOnMobile', label: 'Confirm на mobile', checked: !!pol.confirmOnMobile })}
      ${rowCheck({ id: 'om-pol-saveDataBlock', label: 'Блокировать при Save‑Data', checked: !!pol.saveDataBlock })}
      ${btn({ id: 'om-pol-save', text: 'Сохранить policy' })}
    `);

    const secE = section('E) Cache limit + breakdown', `
      <div class="om-inline">
        ${select({
          id: 'om-limit-mode',
          value: limit.mode,
          options: [
            { value: 'auto', text: 'auto' },
            { value: 'manual', text: 'manual (MB)' }
          ]
        })}
        ${inputNumber({ id: 'om-limit-mb', min: 50, max: 5000, value: Number(limit.mb ?? 500) || 500, disabled: limit.mode !== 'manual' })}
        ${btn({ id: 'om-limit-save', text: 'Сохранить' })}
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
    `);

    const secF = section('F) Загрузки', `
      <div class="om-kv">
        <div>Скачивается сейчас: <b id="om-f-downloading">—</b></div>
        <div>В очереди: <b id="om-f-queued">0</b></div>
      </div>
      <div class="om-actions om-actions--left">
        ${btn({ id: 'om-queue-toggle', text: 'Пауза/Возобновить' })}
      </div>
    `);

    const secG = section('G) Обновления', `
      <div class="om-kv">
        <div>needsUpdate: <b id="om-g-needsUpdate">0</b></div>
        <div>needsReCache: <b id="om-g-needsReCache">0</b></div>
      </div>
      <div class="om-actions om-actions--left">
        ${btn({ id: 'om-upd-all', text: 'Обновить все файлы' })}
        ${btn({ id: 'om-recache-all', text: 'Re-cache по CQ' })}
      </div>
    `);

    const secH = section('H) Очистка кэша', `
      <div class="om-actions om-actions--left">
        ${btn({ id: 'om-clear-all', text: 'Очистить всё', className: 'om-btn-danger' })}
      </div>
    `);

    const albumsBox = `
      <div id="om-albums-box" class="om-albums">
        ${albums.map((a) => `
          <label class="om-row om-row--tight">
            <input class="om-check om-alb" type="checkbox" data-k="${esc(a.key)}">
            <span>${esc(a.title)}</span>
          </label>
        `).join('')}
      </div>
    `;

    const secI = section('I) 100% OFFLINE', `
      <div class="om-inline">
        ${select({
          id: 'om-full-mode',
          value: 'favorites',
          options: [
            { value: 'favorites', text: 'только ИЗБРАННОЕ' },
            { value: 'albums', text: 'выбранные альбомы' }
          ]
        })}
        ${btn({ id: 'om-full-est', text: 'Оценить' })}
        ${btn({ id: 'om-full-start', text: 'Старт', className: 'om-btn-success' })}
      </div>
      ${albumsBox}
      <div id="om-full-out" class="om-note">Оценка: —</div>
    `);

    const secStats = section('Статистика', `
      <div class="om-kv">
        <div>globalTotalListenSeconds: <b id="om-stats-total">—</b></div>
      </div>
    `);

    return `<div class="om">${head}${secA}${secB}${secC}${secD}${secE}${secF}${secG}${secH}${secI}${secStats}</div>`;
  }
};

try {
  window.ModalTemplates = ModalTemplates;
} catch {}
