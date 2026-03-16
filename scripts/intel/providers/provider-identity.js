// UID.069_(Internal user identity)_(иметь один профиль на все внешние входы)_(держать internalUserId независимо от provider ids)
// UID.070_(Linked providers)_(подключать Яндекс/Google/VK без конфликтов)_(вести providers внутри одного identity state)
// UID.071_(Provider capability model)_(понимать что умеет каждый provider)_(хранить capabilities/scopes/roles в связке provider state)
// UID.077_(Yandex auth/backup/AI)_(готовить Яндекс как основной хаб)_(по умолчанию считать yandex primary provider)
// UID.078_(Google mirror/export)_(готовить резервный и вспомогательный provider)_(держать google как linked extension)
// UID.079_(VK social/media actions)_(готовить social/media provider)_(держать vk как linked extension с отдельными capability flags)
// UID.095_(Ownership boundary: legacy vs intel)_(identity layer не должен подменять локальный профиль пользователя приложения)_(этот модуль хранит provider-link metadata, а не владеет stats/favorites/playback/app-profile truth)

const KEY = 'intel:provider-identity:v1';

function makeBase() {
  return {
    version: 'provider-identity-v1',
    internalUserId: localStorage.getItem('intel:internal-user-id') || crypto.randomUUID(),
    primaryProvider: 'yandex',
    providers: {}
  };
}

function read() {
  try {
    const base = { ...makeBase(), ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) };
    localStorage.setItem('intel:internal-user-id', base.internalUserId);
    return base;
  } catch {
    return makeBase();
  }
}

function write(value) {
  localStorage.setItem(KEY, JSON.stringify(value));
  localStorage.setItem('intel:internal-user-id', value.internalUserId);
  window.dispatchEvent(new CustomEvent('intel:provider-identity:updated', { detail: value }));
  return value;
}

export const providerIdentity = {
  async init() {
    write(read());
    return true;
  },

  get() {
    return read();
  },

  setPrimary(provider) {
    const state = read();
    state.primaryProvider = String(provider || '').trim() || state.primaryProvider;
    return write(state);
  },

  link(provider, patch = {}) {
    const name = String(provider || '').trim();
    if (!name) return read();
    const state = read();
    state.providers[name] = {
      provider: name,
      linkedAt: Date.now(),
      scopes: [],
      capabilities: [],
      roles: [],
      status: 'linked',
      ...(state.providers[name] || {}),
      ...(patch || {})
    };
    return write(state);
  },

  unlink(provider) {
    const name = String(provider || '').trim();
    const state = read();
    delete state.providers[name];
    return write(state);
  },

  hasCapability(provider, capability) {
    const item = read().providers?.[String(provider || '').trim()];
    return !!item?.capabilities?.includes?.(capability);
  }
};

export default providerIdentity;
