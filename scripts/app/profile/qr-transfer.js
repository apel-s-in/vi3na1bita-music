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

// 
