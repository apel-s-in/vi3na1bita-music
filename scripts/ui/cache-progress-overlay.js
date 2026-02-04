// scripts/ui/cache-progress-overlay.js
// AC12: независимый слой прогресса кэша (CQ) поверх основного прогресс-бара.
// Не трогаем PlayerCore и основной прогресс/seek. Инварианты I1/I2 соблюдены.

import { bytesByQuality } from '../offline/cache-db.js';
// OfflineUI берем из window
import { getTrackByUid } from '../app/track-registry.js';

const CSS_TEXT = `
  #player-progress-bar { position: relative; }
  #player-cache-fill {
    position: absolute;
    inset: 0;
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%);
    border-radius: 3px;
    pointer-events: none;
    z-index: 0; /* под основным fill */
  }
  #player-progress-fill { position: relative; z-index: 1; } /* основной слой сверху */
`;

function injectCssOnce() {
  if (document.getElementById('cache-progress-css')) return;
  const s = document.createElement('style');
  s.id = 'cache-progress-css';
  s.textContent = CSS_TEXT;
  document.head.appendChild(s);
}

function ensureOverlay() {
  const bar = document.getElementById('player-progress-bar');
  if (!bar) return null;
  let ov = document.getElementById('player-cache-fill');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'player-cache-fill';
    bar.prepend(ov); // кладём под основной fill
  }
  return ov;
}

async function computePercentForCurrent() {
  const pc = window.playerCore;
  if (!pc || typeof pc.getCurrentTrack !== 'function') return 0;

  const track = pc.getCurrentTrack();
  if (!track) return 0;

  const uid = String(track.uid || '').trim();
  if (!uid) return 0;

  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr) return 0;

  const cq = await mgr.getCacheQuality();
  const meta = getTrackByUid(uid) || {};

  const needMb = cq === 'hi'
    ? Number(meta.sizeHi || meta.size || 0)
    : Number(meta.sizeLo || meta.size_low || 0);

  if (!(Number.isFinite(needMb) && needMb > 0)) return 0;

  const needBytes = Math.floor(needMb * 1024 * 1024);

  const { hi, lo } = await bytesByQuality(uid);
  const haveBytes = cq === 'hi' ? Number(hi || 0) : Number(lo || 0);

  if (!(Number.isFinite(haveBytes) && haveBytes > 0)) return 0;

  const pct = Math.max(0, Math.min(100, (haveBytes / needBytes) * 100));
  return pct;
}

async function updateOverlay() {
  const ov = ensureOverlay();
  if (!ov) return;
  try {
    const pct = await computePercentForCurrent();
    ov.style.width = `${pct.toFixed(2)}%`;
  } catch {}
}

export function attachCacheProgressOverlay() {
  injectCssOnce();
  ensureOverlay();

  // L1: Используем правильный путь к утилите
  const schedule = (window.Utils?.func?.debounceFrame)
    ? window.Utils.func.debounceFrame(() => { updateOverlay(); })
    : (() => updateOverlay());

  // Обновления по событиям OfflineManager
  const mgr = window.OfflineUI?.offlineManager;
  if (mgr?.on) {
    mgr.on('progress', schedule);
  }

  // Обновления по событиям PlayerCore (смена трека/тик/seek)
  const pc = window.playerCore;
  if (pc?.on) {
    pc.on({
      onTrackChange: schedule,
      onTick: () => schedule(),
      onPause: schedule,
      onPlay: schedule,
    });
  }

  schedule();
}
