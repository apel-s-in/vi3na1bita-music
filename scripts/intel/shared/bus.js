const PREFIX = 'intel:';
export const intelBus = {
  on: (n, h, o) => { const e = `${PREFIX}${n}`; window.addEventListener(e, h, o); return () => { try { window.removeEventListener(e, h, o); } catch {} }; },
  emit: (n, detail = {}) => { try { window.dispatchEvent(new CustomEvent(`${PREFIX}${n}`, { detail })); return true; } catch { return false; } }
};
export default intelBus;
