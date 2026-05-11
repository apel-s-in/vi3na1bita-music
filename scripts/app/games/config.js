// UID.001_(Playback safety invariant)_(Game Center hard config не имеет доступа к playback)_(этот файл управляет только доступностью/текстами/URL)
// UID.005_(Soft-disable feature)_(ручной hard-switch для Game Center)_(разработчик может отключить вход для всех пользователей через код)
// UID.094_(No-paralysis rule)_(ошибка/выключение Game Center не ломает музыку)_(вкладка остаётся информационной, плеер продолжает работать)
// UID.095_(Ownership boundary)_(Game Center не владеет auth/player/backup)_(main app остаётся источником истины)

export const GAME_CENTER_SWITCH = {
  status: 'on', // 'on' | 'off'
  enterEnabled: true,
  title: 'Зал Витрины',
  eyebrow: 'Game Center · test room',
  message: 'Нажмите «Войти», чтобы открыть Game Center с Башней Витрины.',
  disabledReason: '',
  buttonText: 'Войти',
  roomUrl: './Games/index.html',
  revision: 'gc-2026-05-11-tower-fit-001',
  bridgeVersion: 1,
  minHostAppVersion: '8.5.6'
};

export const normalizeGameCenterSwitch = raw => {
  const x = raw && typeof raw === 'object' ? raw : {};
  const status = String(x.status || 'off').toLowerCase() === 'on' ? 'on' : 'off';
  return {
    status,
    enterEnabled: status === 'on' && x.enterEnabled === true,
    title: String(x.title || 'Зал Витрины'),
    eyebrow: String(x.eyebrow || 'Game Center'),
    message: String(x.message || ''),
    disabledReason: String(x.disabledReason || 'Раздел временно недоступен.'),
    buttonText: String(x.buttonText || 'Войти'),
    roomUrl: String(x.roomUrl || './Games/index.html'),
    revision: String(x.revision || 'dev'),
    bridgeVersion: Math.max(1, Number(x.bridgeVersion || 1) || 1),
    minHostAppVersion: String(x.minHostAppVersion || '')
  };
};

export default normalizeGameCenterSwitch(GAME_CENTER_SWITCH);
