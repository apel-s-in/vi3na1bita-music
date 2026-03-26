// UID.009_(GitHub-first additive rollout)_(подключать слой без тяжёлого рефакторинга)_(использовать window events как мягкую шину) UID.081_(Telemetry mapper)_(иметь чистые доменные события для future mapping)_(эмитить intel:* events централизованно) UID.094_(No-paralysis rule)_(падение intel-слоя не должно ломать плеер)_(шина обязана быть максимально безопасной и без throw)
const PREFIX = 'intel:';
export const intelBus = {
  on: (n, h, o) => { const e = `${PREFIX}${n}`; window.addEventListener(e, h, o); return () => { try { window.removeEventListener(e, h, o); } catch {} }; },
  emit: (n, detail = {}) => { try { window.dispatchEvent(new CustomEvent(`${PREFIX}${n}`, { detail })); return true; } catch { return false; } }
};
export default intelBus;
