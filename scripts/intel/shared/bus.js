// UID.009_(GitHub-first additive rollout)_(подключать слой без тяжёлого рефакторинга)_(использовать window events как мягкую шину)
// UID.081_(Telemetry mapper)_(иметь чистые доменные события для future mapping)_(эмитить intel:* events централизованно)
// UID.094_(No-paralysis rule)_(падение intel-слоя не должно ломать плеер)_(шина обязана быть максимально безопасной и без throw)

const PREFIX = 'intel:';

export const intelBus = {
  on(name, handler, options) {
    const eventName = `${PREFIX}${name}`;
    window.addEventListener(eventName, handler, options);
    return () => {
      try { window.removeEventListener(eventName, handler, options); } catch {}
    };
  },

  emit(name, detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(`${PREFIX}${name}`, { detail }));
      return true;
    } catch {
      return false;
    }
  }
};

export default intelBus;
