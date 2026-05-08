// scripts/analytics/event-logger.js
// UID.003_(Event log truth)_(оставить события источником правды)_(все долгоживущие user states должны выводиться отсюда или из кэша поверх этого слоя)
// UID.104_(Trust and eligibility state)_(EventLogger пишет ledger fields перед сохранением)_(deviceSeq/prevHash/eventHash/checkpoint)
// UID.094_(No-paralysis rule)_(event logging не должен влиять на playback)_(ошибка ledger только возвращает события в очередь)

import { metaDB } from './meta-db.js';
import DeviceRegistry from './device-registry.js';
import { normalizeEventEnvelope } from './event-contract.js';
import { buildLedgerEvents, writeLedgerCheckpoint } from './event-integrity.js';

class EventLogger {
  constructor() {
    this.queue = []; this.sessionId = crypto.randomUUID(); this.deviceHash = localStorage.getItem('deviceHash') || ('tmp_' + crypto.randomUUID()); this.deviceStableId = localStorage.getItem('deviceStableId') || ''; this._flushing = false; this._rerun = false;
  }
  async init() {
    await metaDB.init();
    try { const { getOrCreateDeviceHash, getOrCreateDeviceStableId } = await import('../core/device-identity.js'); this.deviceHash = await getOrCreateDeviceHash(); this.deviceStableId = await getOrCreateDeviceStableId(); }
    catch { if (!localStorage.getItem('deviceHash')) localStorage.setItem('deviceHash', this.deviceHash = 'dv_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)); else this.deviceHash = localStorage.getItem('deviceHash'); this.deviceStableId = localStorage.getItem('deviceStableId') || ''; }
    ['visibilitychange', 'beforeunload'].forEach(e => window.addEventListener(e, () => document.hidden !== false && this.flush()));
    window.addEventListener('analytics:forceFlush', () => this.flush());
    setInterval(() => this.flush(), 15000);
  }
  _deviceMeta() {
    try {
      const sid = this.deviceStableId || localStorage.getItem('deviceStableId') || '', h = this.deviceHash || localStorage.getItem('deviceHash') || '', r = DeviceRegistry.getDeviceRegistry(), row = (r || []).find(d => (sid && d.deviceStableId === sid) || (h && d.deviceHash === h)) || {}, ua = navigator.userAgent || '', pf = window.Utils?.getPlatform?.() || {}, platform = pf.isIOS ? 'ios' : (pf.isAndroid ? 'android' : 'web'), cls = row.class || (pf.isIOS ? 'iPhone' : (pf.isAndroid ? 'Android' : 'Desktop')), br = row.browser || (/YaBrowser/i.test(ua) ? 'Яндекс Браузер' : /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : /Firefox\//i.test(ua) ? 'Firefox' : 'Browser'), os = row.os || (/iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '');
      return { deviceLabel: row.label || localStorage.getItem('yandex:onboarding:device_label') || cls, deviceClass: cls, devicePwa: !!(row.pwa ?? pf.isPWA), deviceOs: os, deviceBrowser: br, deviceLang: row.lang || navigator.language || '', deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', deviceScreen: row.screen || `${screen.width || 0}×${screen.height || 0}`, platform };
    } catch { return { deviceLabel: '', deviceClass: '', devicePwa: false }; }
  }
  log(type, uid, data = {}) {
    if (window._isRestoring) return null;
    const dm = this._deviceMeta(), ev = normalizeEventEnvelope({ sessionId: this.sessionId, deviceHash: this.deviceHash, deviceStableId: this.deviceStableId, ...dm, platform: window.Utils?.getPlatform()?.isIOS ? 'ios' : (window.Utils?.getPlatform()?.isAndroid ? 'android' : 'web'), type, uid, data });
    this.queue.push(ev);
    if (this.queue.length > 20) this.flush();
    return ev;
  }
  async flush() {
    if (this._flushing) { this._rerun = true; return; }
    this._flushing = true;
    try {
      do {
        this._rerun = false;
        if (!this.queue.length) break;
        const raw = [...this.queue]; this.queue = [];
        try {
          const built = await buildLedgerEvents(raw, { db: metaDB });
          await metaDB.addEvents(built.events, 'events_hot');
          await writeLedgerCheckpoint(metaDB, built.checkpoint);
          window.dispatchEvent(new CustomEvent('analytics:logUpdated', { detail: { count: built.events.length, domains: [...new Set(built.events.map(x => x.domain).filter(Boolean))] } }));
        } catch {
          this.queue = [...raw, ...this.queue];
          break;
        }
      } while (this._rerun);
    } finally { this._flushing = false; }
  }
}

export const eventLogger = new EventLogger();
window.eventLogger = eventLogger;
