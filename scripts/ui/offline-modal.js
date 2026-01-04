// scripts/ui/offline-modal.js
// OFFLINE Modal (A–D) — MVP по ТЗ_Нью.
// Важно: НЕ управляет воспроизведением, только настройками OfflineManager и UI.

import { OfflineUI } from '../app/offline-ui-bootstrap.js';

const NETPOLICY_KEY = 'offline:netPolicy:v1';
const ALERT_KEY = 'offline:alert:v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const j = JSON.parse(raw);
    return (j === null || j === undefined) ? fallback : j;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function getNetPolicy() {
  const v = String(localStorage.getItem(NETPOLICY_KEY) || 'ask').toLowerCase().trim();
  if (v === 'wifi') return 'wifi';
  if (v === 'cellular') return 'cellular';
  if (v === 'unknown') return 'unknown';
  return 'ask'; // спросить
}

function setNetPolicy(v) {
  const s = String(v || '').toLowerCase().trim();
  const next =
    (s === 'wifi' || s === 'cellular' || s === 'unknown' || s === 'ask') ? s : 'ask';
  try { localStorage.setItem(NETPOLICY_KEY, next); } catch {}
  return next;
}

function getNetworkStatus() {
  try {
    if (window.NetworkManager && typeof window.NetworkManager.getStatus === 'function') {
      return window.NetworkManager.getStatus();
    }
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown', raw: null, saveData: false };
}

function setAlert(flag, reason) {
  const next = !!flag;
  const payload = { on: next, ts: Date.now(), reason: String(reason || '') };
  writeJson(ALERT_KEY, payload);
  return payload;
}

function getAlert() {
  const a = readJson(ALERT_KEY, { on: false, ts: 0, reason: '' });
  return {
    on: !!a?.on,
    ts: Number(a?.ts || 0),
    reason: String(a?.reason || '')
  };
}

function fmtNet(st) {
  if (!st) return '—';
  const online = st.online ? 'online' : 'offline';
  const kind = st.kind || 'unknown';
  return `${online}, ${kind}`;
}

function ensureModal(html) {
  if (window.Utils && typeof window.Utils.createModal === 'function') {
    return window.Utils.createModal(html);
  }
  return null;
}

async function renderModal() {
  const om = OfflineUI?.offlineManager;
  if (!om) return null;

  const isOffline = om.isOfflineMode();
  const cq = await om.getCacheQuality();
  const st = getNetworkStatus();
  const policy = getNetPolicy();
  const alert = getAlert();

  const html = `
    <div class="modal-feedback" style="max-width: 520px;">
      <button class="bigclose" title="Закрыть" aria-label="Закрыть">
        <svg viewBox="0 0 48 48">
          <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        </svg>
      </button>

      <div style="font-size: 1.1em; font-weight: 900; color: #eaf2ff; margin-bottom: 10px;">
        OFFLINE
      </div>

      <div style="color:#9db7dd; line-height:1.45; margin-bottom: 14px;">
        <div><strong>Сеть:</strong> ${fmtNet(st)}</div>
        <div><strong>Режим:</strong> <span id="offline-modal-mode">${isOffline ? 'OFFLINE' : 'ONLINE'}</span></div>
        ${alert.on ? `<div style="margin-top:8px; color:#ff9800;"><strong>!</strong> ${alert.reason || 'Требуется внимание'}</div>` : ''}
      </div>

      <!-- A: Offline mode -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 8px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">A) Offline Mode</div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn ${isOffline ? 'offline' : 'online'}" id="offline-modal-toggle" style="min-width: 220px;">
            ${isOffline ? 'Выключить OFFLINE' : 'Включить OFFLINE'}
          </button>
        </div>
        <div style="margin-top:8px; font-size: 12px; color:#9db7dd; text-align:center;">
          OFFLINE режим влияет на поведение кэша и доступность функций при отсутствии сети.
        </div>
      </div>

      <!-- B: Cache Quality -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 12px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">B) Cache Quality (CQ)</div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn ${cq === 'hi' ? 'offline' : 'online'}" id="offline-modal-cq-hi" style="min-width: 160px;">
            CQ: Hi
          </button>
          <button class="offline-btn ${cq === 'lo' ? 'offline' : 'online'}" id="offline-modal-cq-lo" style="min-width: 160px;">
            CQ: Lo
          </button>
        </div>
        <div style="margin-top:8px; font-size: 12px; color:#9db7dd; text-align:center;">
          CQ управляет качеством, в котором мы стараемся держать офлайн-кэш.
        </div>
      </div>

      <!-- C: Pinned / actions (MVP) -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 12px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">C) Pinned / Cache</div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn" id="offline-modal-clear-alert" style="min-width: 220px;">
            Сбросить "!" (прочитано)
          </button>
        </div>
        <div style="margin-top:8px; font-size: 12px; color:#9db7dd; text-align:center;">
          Полная очистка/100% OFFLINE будет добавлена следующим шагом (после downloader + blobs).
        </div>
      </div>

      <!-- D: Network policy -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 12px;">
        <div style="font-weight: 900; color:#eaf2ff; margin-bottom: 8px;">D) Network Policy</div>

        <div style="display:grid; gap:8px;">
          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Скачивать только по Wi‑Fi</span>
            <input type="radio" name="offline-netpolicy" value="wifi" ${policy === 'wifi' ? 'checked' : ''}>
          </label>

          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Разрешить по мобильной сети</span>
            <input type="radio" name="offline-netpolicy" value="cellular" ${policy === 'cellular' ? 'checked' : ''}>
          </label>

          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Unknown сеть: разрешить</span>
            <input type="radio" name="offline-netpolicy" value="unknown" ${policy === 'unknown' ? 'checked' : ''}>
          </label>

          <label style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
            <span style="color:#cfe3ff;">Всегда спрашивать</span>
            <input type="radio" name="offline-netpolicy" value="ask" ${policy === 'ask' ? 'checked' : ''}>
          </label>
        </div>

        <div style="margin-top:8px; font-size: 12px; color:#9db7dd; text-align:center;">
          На iOS Network Information API часто недоступен → будет Unknown.
        </div>
      </div>
    </div>
  `;

  return ensureModal(html);
}

function bindModalHandlers(modal) {
  const om = OfflineUI.offlineManager;
  if (!modal || !om) return;

  const rerender = async () => {
    try { modal.remove(); } catch {}
    const next = await renderModal();
    bindModalHandlers(next);
  };

  modal.querySelector('#offline-modal-toggle')?.addEventListener('click', async () => {
    const next = !om.isOfflineMode();
    om.setOfflineMode(next);

    // По ТЗ: тосты (минимум 2 штуки по событию)
    if (next) {
      window.NotificationSystem?.offline('OFFLINE режим включён');
      window.NotificationSystem?.info('Кэш будет подстраиваться под CQ и политику сети');
      // Ставим alert, чтобы "!" появился (как сигнал)
      setAlert(true, 'OFFLINE включён. Проверьте CQ и политику сети.');
    } else {
      window.NotificationSystem?.success('OFFLINE режим выключен');
      window.NotificationSystem?.info('ONLINE режим активен');
      // alert можно снять
      setAlert(false, '');
    }

    // Обновим кнопку снаружи (bootstrap слушает storage/или вызовем событие)
    try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}

    await rerender();
  });

  modal.querySelector('#offline-modal-cq-hi')?.addEventListener('click', async () => {
    await om.setCacheQuality('hi');
    window.NotificationSystem?.success('CQ: Hi');
    await rerender();
  });

  modal.querySelector('#offline-modal-cq-lo')?.addEventListener('click', async () => {
    await om.setCacheQuality('lo');
    window.NotificationSystem?.success('CQ: Lo');
    await rerender();
  });

  modal.querySelector('#offline-modal-clear-alert')?.addEventListener('click', async () => {
    setAlert(false, '');
    window.NotificationSystem?.success('Ок');
    try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
    await rerender();
  });

  modal.querySelectorAll('input[name="offline-netpolicy"]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const v = String(inp.value || 'ask');
      const next = setNetPolicy(v);

      // Подтверждение для cellular/unknown — сразу (по ТЗ “confirm”)
      if (next === 'cellular') {
        const ok = window.confirm('Разрешить загрузки по мобильной сети? Это может расходовать трафик.');
        if (!ok) {
          setNetPolicy('ask');
        }
      }
      if (next === 'unknown') {
        const ok = window.confirm('Сеть определяется как Unknown. Разрешить загрузки в этом режиме?');
        if (!ok) {
          setNetPolicy('ask');
        }
      }

      window.NotificationSystem?.info('Политика сети сохранена');
      try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
    });
  });
}

export async function openOfflineModal() {
  const modal = await renderModal();
  if (!modal) return;

  bindModalHandlers(modal);

  // По уточнению: тосты показываем только при включении OFFLINE, не при открытии модалки.
}

export const OfflineModal = { open: openOfflineModal };
