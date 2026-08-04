import { metaDB } from './meta-db.js';
import { normalizeEventEnvelope } from './event-contract.js';
import { buildLedgerEvents, LEDGER_CHECKPOINT_KEY, publishLedgerCheckpoint, writeLedgerCheckpoint } from './event-integrity.js';

const commitLedgerBatch = async ({ events, checkpoint }) => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(['events_hot', 'global'], 'readwrite');
    const eventStore = tx.objectStore('events_hot');
    const globalStore = tx.objectStore('global');

    events.forEach(event => eventStore.put(event));
    globalStore.put({ key: LEDGER_CHECKPOINT_KEY, value: checkpoint });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('event_ledger_commit_aborted'));
  });
};

class EventLogger {
  constructor() {
    this.queue = []; this.sessionId = crypto.randomUUID(); this.deviceHash = localStorage.getItem('deviceHash') || ('tmp_' + crypto.randomUUID()); this.deviceStableId = localStorage.getItem('deviceStableId') || ''; this._flushPromise = null; this._rerun = false;
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
      const ua = navigator.userAgent || '';
      const pf = window.Utils?.getPlatform?.() || {};
      const platform = pf.isIOS ? 'ios' : pf.isAndroid ? 'android' : 'web';
      const deviceClass = pf.isIOS ? (/iPad/i.test(ua) ? 'iPad' : 'iPhone') : pf.isAndroid ? 'Android' : 'Desktop';
      const deviceBrowser = /YaBrowser/i.test(ua) ? 'Яндекс Браузер' : /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : /Firefox\//i.test(ua) ? 'Firefox' : 'Browser';
      const deviceOs = /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
      const fallbackLabel = platform === 'ios' ? `Мой ${deviceClass}` : platform === 'android' ? 'Моё Android устройство' : 'Мой компьютер';
      return {
        deviceLabel: localStorage.getItem('yandex:onboarding:device_label') || fallbackLabel,
        deviceClass,
        devicePwa: pf.isPWA === true,
        deviceOs,
        deviceBrowser,
        deviceLang: navigator.language || '',
        deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        deviceScreen: `${screen.width || 0}×${screen.height || 0}`,
        platform
      };
    } catch {
      return { deviceLabel: '', deviceClass: '', devicePwa: false };
    }
  }
  log(type, uid, data = {}) {
    if (window._isRestoring) return null;
    const dm = this._deviceMeta(), ev = normalizeEventEnvelope({ sessionId: this.sessionId, deviceHash: this.deviceHash, deviceStableId: this.deviceStableId, ...dm, platform: window.Utils?.getPlatform()?.isIOS ? 'ios' : (window.Utils?.getPlatform()?.isAndroid ? 'android' : 'web'), type, uid, data });
    this.queue.push(ev);
    window.dispatchEvent(new CustomEvent('analytics:eventQueued', { detail: { eventId: ev.eventId, domain: ev.domain, type: ev.type } }));
    if (this.queue.length > 20) this.flush();
    return ev;
  }
  async rotateChain({ chainId = `chain_v71_${crypto.randomUUID()}`, reason = 'backup_v71' } = {}) {
    await this.flush();
    await window.statsAggregator?.waitForIdle?.().catch(() => null);

    const checkpoint = await writeLedgerCheckpoint(metaDB, {
      chainId,
      deviceSeq: 0,
      headHash: '',
      deviceStableId: this.deviceStableId || localStorage.getItem('deviceStableId') || '',
      deviceHash: this.deviceHash || localStorage.getItem('deviceHash') || '',
      updatedAt: Date.now(),
      repairedAt: 0,
      repairReason: reason,
      repairedEvents: 0
    });

    this.sessionId = crypto.randomUUID();
    window.dispatchEvent(new CustomEvent('event-ledger:rotated', { detail: checkpoint }));
    return checkpoint;
  }
  flush() {
    if (this._flushPromise) { this._rerun = true; return this._flushPromise; }
    this._flushPromise = (async () => {
      do {
        this._rerun = false;
        if (!this.queue.length) break;
        const raw = this.queue.splice(0);
        try {
          const built = await buildLedgerEvents(raw, { db: metaDB });
          await commitLedgerBatch(built);
          publishLedgerCheckpoint(built.checkpoint);
          window.dispatchEvent(new CustomEvent('analytics:logUpdated', { detail: { count: built.events.length, domains: [...new Set(built.events.map(item => item.domain).filter(Boolean))] } }));
        } catch {
          this.queue.unshift(...raw);
          break;
        }
      } while (this._rerun || this.queue.length);
      return true;
    })().finally(() => { this._flushPromise = null; });
    return this._flushPromise;
  }
}

export const eventLogger = new EventLogger();
window.eventLogger = eventLogger;
