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

const getInviteParams = () => {
  const p = new URLSearchParams(W.location.search);
  const gcGame = p.get('gcGame') || p.get('game') || '';
  const room = p.get('room') || '';
  const key = p.get('key') || p.get('secret') || '';

  return {
    hasInvite: gcGame === 'war_hearts' && !!room && !!key,
    gcGame,
    room,
    key
  };
};

const makeRoomUrl = cfg => {
  const url = new URL(String(cfg.roomUrl || './Games/index.html'), W.location.href);
  const invite = getInviteParams();

  url.searchParams.set('bridge', '1');
  url.searchParams.set('rev', cfg.revision || 'dev');

  if (invite.hasInvite) {
    url.searchParams.set('gcGame', invite.gcGame);
    url.searchParams.set('room', invite.room);
    url.searchParams.set('key', invite.key);
  }

  return url.toString();
};

const render = ({ cfg, mounted = false } = {}) => {
  const canEnter = cfg.status === 'on' && cfg.enterEnabled;
  const invite = getInviteParams();
  const buttonText = invite.hasInvite ? 'Принять приглашение' : esc(cfg.buttonText);
  const message = invite.hasInvite
    ? 'Вас пригласили в сетевую игру. Можно войти как гость или авторизоваться, чтобы позже сохранять прогресс.'
    : esc(cfg.message);

  return `<section class="gc-host" data-gc-status="${esc(cfg.status)}">
    <div class="gc-panel">
      <div class="gc-panel-kicker">${esc(cfg.eyebrow)}</div>
      <div class="gc-panel-title">${esc(cfg.title)}</div>
      <div class="gc-panel-text">${message}</div>
      ${!canEnter ? `<div class="gc-panel-note">${esc(cfg.disabledReason)}</div>` : ''}
      <button class="gc-enter-btn" type="button" data-gc-enter ${canEnter ? '' : 'disabled'}>${mounted ? 'Комната открыта' : buttonText}</button>
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
    const host = container.querySelector('.gc-host');
    const panel = container.querySelector('.gc-panel');

    btn.disabled = true;
    btn.textContent = 'Открываем...';
    host?.classList.add('is-mounted');
    if (panel) panel.hidden = true;

    frameWrap.hidden = false;
    frameWrap.innerHTML = `<iframe class="gc-frame" title="Game Center" src="${esc(makeRoomUrl(cfg))}" sandbox="allow-scripts allow-forms allow-popups" allow="fullscreen; microphone" allowfullscreen referrerpolicy="no-referrer"></iframe>`;
    const iframe = frameWrap.querySelector('iframe');

    bridge?.destroy?.();
    bridge = createGameBridgeHost({
      iframe,
      config: cfg,
      onState: st => {
        if (st?.state === 'closed_by_game') {
          try {
            W.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'game_center_exit', revision: cfg.revision });
            W.dispatchEvent(new CustomEvent('analytics:forceFlush'));
          } catch {}

          frameWrap.hidden = true;
          frameWrap.innerHTML = '';
          host?.classList.remove('is-mounted');
          if (panel) panel.hidden = false;
          btn.disabled = false;
          btn.textContent = getInviteParams().hasInvite ? 'Принять приглашение' : esc(cfg.buttonText);
        }
      }
    });

    try {
      W.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'game_center_enter', revision: cfg.revision });
      W.dispatchEvent(new CustomEvent('analytics:forceFlush'));
    } catch {}

    btn.textContent = 'Комната открыта';
  });

  return true;
};

export default { renderGameCenterHost };
