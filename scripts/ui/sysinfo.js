// scripts/ui/sysinfo.js (ESM)
// Кнопка «О СИСТЕМЕ»: запрашивает у SW инфо и показывает модал.

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B','KB','MB','GB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

function buildModal(info) {
  const m = document.createElement('div');
  m.className = 'modal-bg active';
  const cfg = info?.config || {};
  const net = info?.net || {};
  const media = info?.media || {};
  const offline = info?.offline || {};
  const ver = info?.version || '(нет)';
  const prof = offline?.profile || info?.profile || 'default';

  m.innerHTML = `
    <div class="modal-feedback" style="max-width: 520px;">
      <button class="bigclose" onclick="this.closest('.modal-bg').remove()" title="Закрыть">
        <svg viewBox="0 0 48 48"><line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>
      </button>
      <div style="font-weight:800; font-size:1.1em; margin-bottom:10px;">О системе</div>
      <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.95em; line-height:1.5;">
        <div><b>SW версия:</b> ${ver}</div>
        <div><b>Оффлайн профиль:</b> ${prof}</div>
        <div><b>Оффлайн файлов:</b> ${offline?.count ?? 0}</div>
        <div><b>MediaCache:</b> ${formatBytes(media?.totalBytes || 0)} (${media?.items || 0} объектов)</div>
        <hr style="border-color:#333; margin:8px 0;">
        <div><b>Сеть:</b> saveData=${net?.saveData ? '1' : '0'}, downlink=${net?.downlink ?? '—'}Mb/s, type=${net?.effectiveType ?? '—'}</div>
        <hr style="border-color:#333; margin:8px 0;">
        <div><b>SW лимиты:</b> mediaMax=${cfg?.mediaMaxCacheMB ?? '-'}MB; nonRange=${cfg?.nonRangeMaxStoreMB ?? '-'}MB; slow=${cfg?.nonRangeMaxStoreMBSlow ?? '-'}MB; revalidateDays=${cfg?.revalidateDays ?? '-'}</div>
      </div>
    </div>`;
  return m;
}

function showSystemInfoModal(info) {
  const m = buildModal(info);
  document.body.appendChild(m);
}

function requestSystemInfo() {
  if (!('serviceWorker' in navigator)) {
    window.NotificationSystem && window.NotificationSystem.warning('Service Worker недоступен');
    return;
  }
  const send = () => {
    try {
      const ctl = navigator.serviceWorker.controller;
      if (ctl) ctl.postMessage({ type: 'GET_SW_INFO' });
    } catch {}
  };
  // Ответ обработаем через message
  send();
}

function showSystemInfo() {
  requestSystemInfo();
}

// Поймаем ответ
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (ev) => {
    const msg = ev.data || {};
    if (msg.type === 'SW_INFO' && msg.info) {
      showSystemInfoModal(msg.info);
    }
  });
}

// Показать кнопку при наличии клавиатуры (как для hotkeys)
(function bootstrap() {
  const btn = document.getElementById('sysinfo-btn');
  if (!btn) return;
  try {
    const hasKeyboard = window.hasKeyboard ? window.hasKeyboard() : true;
    btn.style.display = hasKeyboard ? 'block' : 'none';
  } catch {
    btn.style.display = 'block';
  }
})();

// Экспорт глобали для onclick
window.showSystemInfo = showSystemInfo;
