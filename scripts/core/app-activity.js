// Локальный контроллер активности приложения.
// Не управляет playback: только сообщает фоновым сетевым контурам,
// можно ли выполнять необязательные платные чтения.
const IDLE_AFTER_MS = 5 * 60 * 1000;
const ACTIVE_EVENTS = Object.freeze(['pointerdown', 'touchstart', 'keydown', 'wheel']);
let initialized = false;
let lastActivityAt = Date.now();
let mode = 'active';
let timer = 0;

const playing = () => window.playerCore?.isPlaying?.() === true;

const computeMode = () => {
  if (playing()) return 'playback';
  if (document.hidden) return 'quiet';
  return Date.now() - lastActivityAt >= IDLE_AFTER_MS ? 'quiet' : 'active';
};

const publish = reason => {
  const next = computeMode();
  if (next === mode) return mode;
  mode = next;
  window.dispatchEvent(new CustomEvent('app:activity-mode', {
    detail: {
      mode,
      reason,
      lastActivityAt,
      idleForMs: Math.max(0, Date.now() - lastActivityAt),
      playing: playing(),
      hidden: document.hidden
    }
  }));
  return mode;
};

export const markAppActivity = (reason = 'user') => {
  lastActivityAt = Date.now();
  publish(reason);
  return getAppActivityState();
};

export const getAppActivityState = () => ({
  mode: computeMode(),
  lastActivityAt,
  idleForMs: Math.max(0, Date.now() - lastActivityAt),
  idleAfterMs: IDLE_AFTER_MS,
  playing: playing(),
  hidden: document.hidden,
  quiet: computeMode() === 'quiet'
});

export const isAppQuiet = () => computeMode() === 'quiet';
export const canRunPaidBackgroundRequest = () => !isAppQuiet();

export const initAppActivity = () => {
  if (initialized) return;
  initialized = true;

  ACTIVE_EVENTS.forEach(name => {
    document.addEventListener(name, () => markAppActivity(name), {
      capture: true,
      passive: true
    });
  });

  ['player:play', 'player:pause', 'player:stop', 'player:ended'].forEach(name => {
    window.addEventListener(name, () => publish(name));
  });

  document.addEventListener('visibilitychange', () => publish('visibilitychange'));
  window.addEventListener('focus', () => markAppActivity('focus'));

  timer = setInterval(() => publish('idle_check'), 30000);
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    timer = 0;
  }, { once: true });

  publish('init');
};

window.AppActivity = {
  init: initAppActivity,
  mark: markAppActivity,
  getState: getAppActivityState,
  isQuiet: isAppQuiet,
  canRunPaidBackgroundRequest
};

export default window.AppActivity;
