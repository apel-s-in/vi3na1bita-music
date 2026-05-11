// UID.001_(Playback safety invariant)_(Game Center host не управляет плеером)_(только preview/iframe/read-only bridge)
// UID.006_(Lazy loading)_(iframe грузится только после клика Войти)_(не мешаем startup, iOS background и locked-screen playback)
// UID.094_(No-paralysis rule)_(ошибка Game Center не ломает музыку)_(fallback показывает информационную карточку)
// UID.095_(Ownership boundary)_(Game Center — отдельный micro-app)_(основное приложение остаётся владельцем auth/profile/stats/player)

import { createGameBridgeHost } from './bridge-host.js';

const W = window;
const esc = s => W.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

const fallbackConfig = {
  status: 'off',
  enterEnabled: false,
  title: 'Зал Витрины',
  eyebrow: 'Game Center',
  message: 'Раздел временно недоступен.',
  disabledReason: 'Вход закрыт.',
  buttonText: 'Войти',
  roomUrl: './Games/index.html',
  revision: 'fallback',
  bridgeVersion: 1
};

const loadConfig = async () => {
  try {
    const m = await import(`./config.js?gc-hard=${Date.now()}`);
    return m.normalizeGameCenterSwitch?.(m.GAME_CENTER_SWITCH || m.default) || m.default || fallbackConfig;
  } catch {
    return fallbackConfig;
  }
};

const makeRoomUrl = cfg => {
  const u = String(cfg.roomUrl || './Games/index.html');
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}bridge=1&rev=${encodeURIComponent(cfg.revision || 'dev')}`;
};

const render = ({ cfg, mounted = false } = {}) => {
  const canEnter = cfg.status === 'on' && cfg.enterEnabled;
  return `<section class="gc-host" data-gc-status="${esc(cfg.status)}">
    <div class="gc-panel">
      <div class="gc-panel-kicker">${esc(cfg.eyebrow)}</div>
      <div class="gc-panel-title">${esc(cfg.title)}</div>
      <div class="gc-panel-text">${esc(cfg.message)}</div>
      ${!canEnter ? `<div class="gc-panel-note">${esc(cfg.disabledReason)}</div>` : ''}
      <button class="gc-enter-btn" type="button" data-gc-enter ${canEnter ? '' : 'disabled'}>${mounted ? 'Комната открыта' : esc(cfg.buttonText)}</button>
      <div class="gc-devline">rev: ${esc(cfg.revision)} · bridge v${Number(cfg.bridgeVersion || 1)}</div>
    </div>
    <div class="gc-frame-wrap" id="gc-frame-wrap" hidden></div>
  </section>`;
};

export const renderGameCenterHost = async ({ container } = {}) => {
  if (!container) return false;
  const cfg = await loadConfig();
  let bridge = null;
  container.innerHTML = render({ cfg });

  const btn = container.querySelector('[data-gc-enter]');
  const frameWrap = container.querySelector('#gc-frame-wrap');

  btn?.addEventListener('click', () => {
    if (btn.disabled || !frameWrap) return;
    btn.disabled = true;
    btn.textContent = 'Открываем...';
    frameWrap.hidden = false;
    frameWrap.innerHTML = `<iframe class="gc-frame" title="Game Center" src="${esc(makeRoomUrl(cfg))}" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>`;
    const iframe = frameWrap.querySelector('iframe');
    bridge?.destroy?.();
    bridge = createGameBridgeHost({ iframe, config: cfg, onState: () => {} });
    try { W.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'game_center_enter', revision: cfg.revision }); W.dispatchEvent(new CustomEvent('analytics:forceFlush')); } catch {}
    btn.textContent = 'Комната открыта';
  });

  return true;
};

export default { renderGameCenterHost };
