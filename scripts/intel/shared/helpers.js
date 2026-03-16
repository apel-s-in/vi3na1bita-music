// UID.091_(No-op stubs before full implementation)_(не плодить одинаковые заглушки по всем intel-модулям)_(вынести повторяющиеся init/state/storage patterns в shared helper layer)
// UID.094_(No-paralysis rule)_(helper-ы должны быть максимально безопасными)_(все фабрики здесь обязаны быть no-throw и годиться для мягкого rollout)
// UID.095_(Ownership boundary: legacy vs intel)_(helper-ы обслуживают только intel-layer plumbing, а не core playback/business truth)_(не тянуть сюда ничего из PlayerCore/legacy ownership)
// UID.096_(Helper-first anti-duplication policy)_(жёстко закрепить унификацию повторяющегося кода)_(все новые простые intel-модули должны по возможности строиться через эти фабрики, а не копипастой)

export function makeNoopModule(extra = {}) {
  return {
    async init() { return true; },
    ...extra
  };
}

export function makeMemoryState(initialState = {}) {
  const box = { ...(initialState || {}) };
  return {
    getState() { return box; },
    patch(patch = {}) { Object.assign(box, patch || {}); return box; },
    reset(next = {}) {
      Object.keys(box).forEach(k => delete box[k]);
      Object.assign(box, next || {});
      return box;
    }
  };
}

export function makeJsonStorage(key, defaults) {
  const getDefaults = typeof defaults === 'function' ? defaults : () => ({ ...(defaults || {}) });
  return {
    read() {
      try { return { ...getDefaults(), ...(JSON.parse(localStorage.getItem(key) || '{}') || {}) }; }
      catch { return getDefaults(); }
    },
    write(value) {
      const next = { ...getDefaults(), ...(value || {}) };
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    },
    patch(patch = {}) {
      return this.write({ ...this.read(), ...(patch || {}) });
    }
  };
}

export function safeEmit(name, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(String(name || '').trim(), { detail }));
    return true;
  } catch {
    return false;
  }
}

export default {
  makeNoopModule,
  makeMemoryState,
  makeJsonStorage,
  safeEmit
};
