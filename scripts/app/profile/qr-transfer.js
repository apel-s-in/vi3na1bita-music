// scripts/app/profile/qr-transfer.js
// QR-перенос данных между устройствами без облака.
// Логотип Витрина Разбита встроен в центр QR-кода.

const LOGO_URL = './img/logo.png';
const QR_CDN = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';

// ─── Экспорт через QR ──────────────────────────────────────────────────────
export async function openQrExportModal() {
  const { BackupVault } = await import('../../analytics/backup-vault.js');

  const m = window.Modals?.open?.({
    title: '📱 QR-перенос данных',
    maxWidth: 400,
    bodyHtml: `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:13px;color:#9db7dd;margin-bottom:16px;line-height:1.5">
          Отсканируйте QR-код на новом устройстве для переноса профиля.
          Код действителен <b>5 минут</b>.
        </div>
        <div id="qr-container" style="display:flex;align-items:center;justify-content:center;min-height:240px">
          <div style="color:#888;font-size:13px">Генерируем QR-код...</div>
        </div>
        <div id="qr-timer" style="margin-top:12px;font-size:12px;color:#ff9800;font-weight:700"></div>
        <div style="margin-top:16px;font-size:11px;color:#666;line-height:1.4">
          QR-код содержит ваши избранные треки, плейлисты и настройки.<br>
          Статистика переносится отдельно через облако Яндекса.
        </div>
        <div class="om-actions" style="margin-top:16px">
          <button class="modal-action-btn online" id="qr-import-btn">📷 Сканировать (получить)</button>
        </div>
      </div>`
  });

  if (!m) return;

  // Кнопка переключения на режим получения
  m.querySelector('#qr-import-btn')?.addEventListener('click', () => {
    m.remove();
    openQrImportModal();
  });

  try {
    // Собираем только профильные данные (без статистики — она большая)
    const profileData = _buildProfilePayload();
    const json = JSON.stringify(profileData);

    // Проверяем размер — QR не может содержать больше ~2KB надёжно
    if (json.length > 2048) {
      _showQrFallback(m.querySelector('#qr-container'), profileData);
      return;
    }

    await _renderQrWithLogo(m.querySelector('#qr-container'), json);

    // Таймер 5 минут
    let seconds = 5 * 60;
    const timerEl = m.querySelector('#qr-timer');
    const interval = setInterval(() => {
      seconds--;
      if (!m.isConnected) { clearInterval(interval); return; }
      if (seconds <= 0) {
        clearInterval(interval);
        timerEl && (timerEl.textContent = '⏱ QR-код истёк — обновите страницу');
        m.querySelector('#qr-container').innerHTML = '<div style="color:#ff6b6b;font-size:13px">QR устарел. Закройте и откройте снова.</div>';
        return;
      }
      const min = Math.floor(seconds / 60);
      const sec = seconds % 60;
      timerEl && (timerEl.textContent = `⏱ Действителен: ${min}:${String(sec).padStart(2, '0')}`);
    }, 1000);

    // Очищаем при закрытии
    const orig = m.remove.bind(m);
    m.remove = () => { clearInterval(interval); orig(); };

  } catch (e) {
    const container = m.querySelector('#qr-container');
    if (container) container.innerHTML = `<div style="color:#ff6b6b;font-size:13px">Ошибка генерации QR: ${window.Utils?.escapeHtml?.(String(e?.message || ''))}</div>`;
  }
}

// ─── Импорт через ручной ввод (QR-камера недоступна из браузера напрямую) ──
export function openQrImportModal() {
  const m = window.Modals?.open?.({
    title: '📷 Получить данные через QR',
    maxWidth: 400,
    bodyHtml: `
      <div style="font-size:13px;color:#9db7dd;margin-bottom:16px;line-height:1.5">
        Отсканируйте QR-код с другого устройства любым QR-сканером
        (камера телефона, Google Lens и т.п.).<br><br>
        Скопируйте полученный текст и вставьте сюда:
      </div>
      <textarea id="qr-paste-area"
        style="width:100%;height:100px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.15);
               border-radius:10px;color:#fff;padding:10px;font-size:11px;font-family:monospace;
               resize:vertical;outline:none"
        placeholder="Вставьте QR-данные сюда..."></textarea>
      <div id="qr-import-status" style="margin-top:8px;font-size:12px;min-height:18px"></div>
      <div class="om-actions" style="margin-top:12px">
        <button class="modal-action-btn" id="qr-cancel">Отмена</button>
        <button class="modal-action-btn online" id="qr-apply">Применить</button>
      </div>`
  });

  if (!m) return;

  m.querySelector('#qr-cancel')?.addEventListener('click', () => m.remove());
  m.querySelector('#qr-apply')?.addEventListener('click', async () => {
    const raw = m.querySelector('#qr-paste-area')?.value?.trim();
    const status = m.querySelector('#qr-import-status');
    if (!raw) { if (status) status.textContent = '⚠️ Вставьте данные из QR-кода'; return; }

    try {
      const data = JSON.parse(raw);
      if (data?.type !== 'vi3na1bita_qr_v1') {
        if (status) status.textContent = '❌ Неверный формат данных';
        return;
      }

      if (status) status.textContent = '⏳ Применяем...';
      _applyProfilePayload(data);
      m.remove();
      window.NotificationSystem?.success('Профиль перенесён! Обновляем...');
      setTimeout(() => window.location.reload(), 1200);

    } catch (e) {
      if (status) status.textContent = '❌ Ошибка: ' + String(e?.message || 'неверный формат');
    }
  });
}

// ─── Сборка профильного payload (только лёгкие данные) ─────────────────────
function _buildProfilePayload() {
  const favRaw = (() => {
    try { return JSON.parse(localStorage.getItem('__favorites_v2__') || '[]'); } catch { return []; }
  })();

  // Только активные избранные — без inactiveAt
  const favorites = favRaw.filter(f => !f.inactiveAt).map(f => ({
    id: f.id,
    t: f.title,
    a: f.artist,
    s: f.src,
    src2: f.src2,
    cover: f.cover,
    dur: f.duration,
    lrc: f.lyricsUrl,
    ts: f.addedAt || f.ts
  }));

  const playlists = (() => {
    try { return JSON.parse(localStorage.getItem('sc3:playlists') || '[]'); } catch { return []; }
  })();

  const settings = {};
  const settingKeys = [
    'sourcePref', 'favoritesOnlyMode', 'qualityMode:v1',
    'lyricsViewMode', 'lyricsAnimationEnabled', 'logoPulseEnabled',
    'dl_format_v1', 'sc3:ui_v2', 'sc3:activeId'
  ];
  settingKeys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) settings[k] = v;
  });

  const profile = (() => {
    try {
      return {
        name: localStorage.getItem('user:displayName') || '',
        avatar: localStorage.getItem('user:avatarUrl') || ''
      };
    } catch { return {}; }
  })();

  return {
    type: 'vi3na1bita_qr_v1',
    version: 1,
    exportedAt: Date.now(),
    ttl: 5 * 60 * 1000, // 5 минут
    profile,
    favorites,
    playlists,
    settings
  };
}

// ─── Применить payload на новом устройстве ──────────────────────────────────
function _applyProfilePayload(data) {
  // Проверяем TTL
  if (data.exportedAt && Date.now() - data.exportedAt > (data.ttl || 5 * 60 * 1000)) {
    throw new Error('QR-код устарел (более 5 минут)');
  }

  // Имя профиля
  if (data.profile?.name) {
    localStorage.setItem('user:displayName', data.profile.name);
  }

  // Избранное — мерджим с существующими
  if (Array.isArray(data.favorites) && data.favorites.length > 0) {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem('__favorites_v2__') || '[]'); } catch { return []; }
    })();

    const existingIds = new Set(existing.map(f => f.id));
    const incoming = data.favorites.map(f => ({
      id: f.id,
      title: f.t,
      artist: f.a,
      src: f.s,
      src2: f.src2,
      cover: f.cover,
      duration: f.dur,
      lyricsUrl: f.lrc,
      addedAt: f.ts || Date.now()
    }));

    const merged = [
      ...existing,
      ...incoming.filter(f => !existingIds.has(f.id))
    ];

    try {
      localStorage.setItem('__favorites_v2__', JSON.stringify(merged));
    } catch (e) {
      console.warn('[QrTransfer] favorites save error:', e);
    }
  }

  // Плейлисты — мерджим по id
  if (Array.isArray(data.playlists) && data.playlists.length > 0) {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem('sc3:playlists') || '[]'); } catch { return []; }
    })();
    const existingIds = new Set(existing.map(p => p.id));
    const merged = [
      ...existing,
      ...data.playlists.filter(p => !existingIds.has(p.id))
    ];
    try {
      localStorage.setItem('sc3:playlists', JSON.stringify(merged));
    } catch (e) {
      console.warn('[QrTransfer] playlists save error:', e);
    }
  }

  // Настройки — применяем если ключ ещё не задан на новом устройстве
  if (data.settings && typeof data.settings === 'object') {
    Object.entries(data.settings).forEach(([k, v]) => {
      if (localStorage.getItem(k) === null) {
        try { localStorage.setItem(k, v); } catch {}
      }
    });
  }
}

// ─── Рендер QR с логотипом в центре ────────────────────────────────────────
async function _renderQrWithLogo(container, text) {
  if (!container) return;

  // Ленивая загрузка библиотеки qrcode
  await _loadQrLib();

  return new Promise((resolve, reject) => {
    // Создаём canvas через QRCode
    const tempDiv = document.createElement('div');
    document.body.appendChild(tempDiv);

    try {
      /* global QRCode */
      new QRCode(tempDiv, {
        text,
        width: 240,
        height: 240,
        colorDark: '#0a0f1c',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H // Высокая коррекция для логотипа в центре
      });

      const canvas = tempDiv.querySelector('canvas');
      if (!canvas) {
        tempDiv.remove();
        container.innerHTML = '<div style="color:#ff6b6b;font-size:13px">Ошибка генерации QR</div>';
        reject(new Error('no canvas'));
        return;
      }

      // Добавляем логотип поверх
      _overlayLogo(canvas, LOGO_URL).then(finalCanvas => {
        tempDiv.remove();

        // Стилизованная обёртка
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          display: inline-block;
          padding: 16px;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 0 40px rgba(77,170,255,.3), 0 0 0 1px rgba(77,170,255,.2);
        `;
        wrapper.appendChild(finalCanvas);
        container.innerHTML = '';
        container.appendChild(wrapper);

        // Кнопка скачивания
        const dlBtn = document.createElement('button');
        dlBtn.className = 'modal-action-btn';
        dlBtn.style.cssText = 'margin-top:12px;font-size:11px';
        dlBtn.textContent = '💾 Сохранить как картинку';
        dlBtn.addEventListener('click', () => {
          const a = document.createElement('a');
          a.download = `vitrina-razb-qr-${Date.now()}.png`;
          a.href = finalCanvas.toDataURL('image/png');
          a.click();
        });
        container.appendChild(document.createElement('br'));
        container.appendChild(dlBtn);

        resolve();
      }).catch(() => {
        // Логотип не загрузился — показываем без него
        tempDiv.remove();
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          display: inline-block; padding: 16px; background: #fff;
          border-radius: 16px; box-shadow: 0 0 40px rgba(77,170,255,.3);
        `;
        wrapper.appendChild(canvas);
        container.innerHTML = '';
        container.appendChild(wrapper);
        resolve();
      });

    } catch (e) {
      tempDiv.remove();
      container.innerHTML = `<div style="color:#ff6b6b;font-size:13px">Ошибка: ${String(e?.message || '')}</div>`;
      reject(e);
    }
  });
}

// ─── Накладываем логотип в центр QR ────────────────────────────────────────
function _overlayLogo(canvas, logoUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      const size = canvas.width;

      // Размер логотипа — 18% от QR (оставляем место для корректирующих блоков)
      const logoSize = Math.round(size * 0.18);
      const logoX = (size - logoSize) / 2;
      const logoY = (size - logoSize) / 2;

      // Белый фон под логотипом с закруглением
      const pad = 6;
      ctx.save();
      ctx.beginPath();
      const r = 10;
      const rx = logoX - pad, ry = logoY - pad;
      const rw = logoSize + pad * 2, rh = logoSize + pad * 2;
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + rw - r, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
      ctx.lineTo(rx + rw, ry + rh - r);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
      ctx.lineTo(rx + r, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
      ctx.lineTo(rx, ry + r);
      ctx.quadraticCurveTo(rx, ry, rx + r, ry);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // Рисуем логотип
      ctx.drawImage(img, logoX, logoY, logoSize, logoSize);

      resolve(canvas);
    };

    img.onerror = () => {
      // Пробуем fallback SVG-иконку
      const svgFallback = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
        <circle cx='50' cy='50' r='45' fill='%230d1523'/>
        <text x='50' y='66' text-anchor='middle' font-size='52' font-family='serif'>🎵</text>
      </svg>`;
      const img2 = new Image();
      img2.onload = () => {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const logoSize = Math.round(size * 0.18);
        ctx.drawImage(img2, (size - logoSize) / 2, (size - logoSize) / 2, logoSize, logoSize);
        resolve(canvas);
      };
      img2.onerror = () => reject(new Error('logo_load_failed'));
      img2.src = svgFallback;
    };

    img.src = logoUrl;
    // Таймаут загрузки логотипа
    setTimeout(() => reject(new Error('logo_timeout')), 3000);
  });
}

// ─── Fallback: данные слишком большие для QR ────────────────────────────────
function _showQrFallback(container, data) {
  if (!container) return;

  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  container.innerHTML = `
    <div style="text-align:center;padding:16px">
      <div style="font-size:32px;margin-bottom:12px">⚠️</div>
      <div style="font-size:13px;color:#ffb74d;margin-bottom:16px;line-height:1.5">
        Данных слишком много для QR-кода.<br>
        Используйте экспорт в файл:
      </div>
      <a href="${url}" download="vitrina-razb-transfer.json"
         style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#4d82ff,#7c4dff);
                color:#fff;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">
        💾 Скачать файл переноса
      </a>
      <div style="margin-top:12px;font-size:11px;color:#666">
        На новом устройстве используйте «📂 Из файла»
      </div>
    </div>`;
}

// ─── Ленивая загрузка библиотеки qrcode ────────────────────────────────────
let _qrLibLoaded = false;
function _loadQrLib() {
  if (_qrLibLoaded || typeof QRCode !== 'undefined') {
    _qrLibLoaded = true;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_CDN;
    s.onload = () => { _qrLibLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('QRCode library load failed'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('QRCode library timeout')), 8000);
  });
}

export default { openQrExportModal, openQrImportModal };
