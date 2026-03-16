// UID.073_(Hybrid sync orchestrator)_(объединить несколько провайдеров вокруг одного профиля)_(держать единый sync state отдельно от cloud-sync legacy)
// UID.074_(Primary backup provider)_(иметь основной источник бэкапа)_(сохранять primaryBackup role в state)
// UID.075_(Secondary mirror backup)_(иметь резервную копию профиля)_(сохранять secondaryBackup role в state)
// UID.076_(Restore policy)_(восстанавливать предсказуемо)_(фиксировать порядок primary -> secondary -> local merge)
// UID.094_(No-paralysis rule)_(не ломать старый sync)_(пока быть только orchestration-layer без перехвата playback и core backup logic)

const KEY = 'intel:hybrid-sync:v1';

function defaults() {
  return {
    version: 'hybrid-sync-v1',
    primaryBackup: 'yandex',
    secondaryBackup: 'google',
    socialProvider: 'vk',
    lastSyncAt: 0,
    lastSyncStatus: 'idle'
  };
}

function read() {
  try {
    return { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) };
  } catch {
    return defaults();
  }
}

function write(value) {
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('intel:hybrid-sync:updated', { detail: value }));
  return value;
}

export const hybridSync = {
  async init() {
    write(read());
    return true;
  },

  get() {
    return read();
  },

  setRoles(patch = {}) {
    return write({ ...read(), ...(patch || {}) });
  },

  markSync(status = 'idle') {
    return write({ ...read(), lastSyncAt: Date.now(), lastSyncStatus: status });
  }
};

export default hybridSync;
