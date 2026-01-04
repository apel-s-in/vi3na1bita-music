// scripts/app/network-manager.js
(function () {
  function safeGetConnection() {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  }

  function normalizeType(connection) {
    // Network Information API:
    // - effectiveType: 'slow-2g'|'2g'|'3g'|'4g'
    // - type: 'wifi'|'cellular'|...
    if (!connection) return { kind: 'unknown', raw: null };

    const type = connection.type;
    const effectiveType = connection.effectiveType;

    if (type === 'wifi') return { kind: 'wifi', raw: { type, effectiveType } };
    if (type === 'cellular') return { kind: 'cellular', raw: { type, effectiveType } };

    // iOS Safari чаще всего не даёт connection — будет unknown
    // На некоторых Android/Chromium type может быть undefined, но effectiveType есть
    if (effectiveType) {
      // считаем это "cellular-ish" (потому что effectiveType обычно даёт радио-оценку)
      return { kind: 'cellular', raw: { type, effectiveType } };
    }

    return { kind: 'unknown', raw: { type, effectiveType } };
  }

  function getStatus() {
    const online = navigator.onLine !== false; // если undefined — считаем online (iOS quirks)
    const conn = safeGetConnection();
    const net = normalizeType(conn);
    return {
      online,
      kind: net.kind, // 'wifi'|'cellular'|'unknown'
      raw: net.raw,
      saveData: !!(conn && conn.saveData),
    };
  }

  const listeners = new Set();

  function emit() {
    const st = getStatus();
    listeners.forEach((fn) => {
      try { fn(st); } catch (_) {}
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    // instant fire
    try { fn(getStatus()); } catch (_) {}
    return () => listeners.delete(fn);
  }

  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);

  const conn = safeGetConnection();
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', emit);
  } else if (conn && ('onchange' in conn)) {
    conn.onchange = emit;
  }

  window.NetworkManager = {
    getStatus,
    subscribe,
  };
})();
