// UID.072_(Provider consents)_(контролировать приватность и доступы)_(держать consent flags рядом с linked providers и sync)
// UID.082_(Local truth vs external telemetry split)_(не отправлять лишнее наружу)_(любой export должен проверять consent state)
// UID.083_(Yandex Metrica safe export)_(внешняя аналитика только по согласию)_(позже telemetry mapper обязан читать этот модуль)
// UID.095_(Ownership boundary: legacy vs intel)_(consent layer не должен сам ничего экспортировать и не должен жить в UI)_(модуль только хранит flags, а применение/рендеринг делегируется mapper/UI слоям)

const KEY = 'intel:provider-consents:v1';

const defaults = () => ({
  analytics: false,
  personalization: false,
  cloudBackup: false,
  socialActions: false,
  aiAssistant: false
});

function read() {
  try {
    return { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) };
  } catch {
    return defaults();
  }
}

function write(value) {
  localStorage.setItem(KEY, JSON.stringify({ ...defaults(), ...(value || {}) }));
  return read();
}

export const providerConsents = {
  async init() {
    return true;
  },

  get() {
    return read();
  },

  set(patch = {}) {
    return write({ ...read(), ...(patch || {}) });
  }
};

export default providerConsents;
