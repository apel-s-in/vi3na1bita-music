// scripts/analytics/event-logger.js
// UID.003_(Event log truth)_(оставить события источником правды)_(все долгоживущие user states должны выводиться отсюда или из кэша поверх этого слоя) // UID.017_(Launch source stats)_(подготовить логирование discovery source)_(future track launches/recommendation/provider actions должны иметь source-aware events) // UID.056_(Recommendation reasons)_(готовить explainable rec telemetry)_(shown/clicked/accepted/dismissed reason-aware rec events логировать здесь) // UID.072_(Provider consents)_(не логировать лишнее без разрешений)_(future external-exportable events должны отличаться от полного локального event log) // UID.081_(Telemetry mapper)_(развести raw events и external payloads)_(event-logger пишет локальную truth, mapper позже решает что можно экспортировать) // UID.083_(Yandex Metrica safe export)_(не слать сырые local events напрямую наружу)_(метрика должна получать только mapped whitelist layer) // UID.094_(No-paralysis rule)_(event logging не должен зависеть от intel/providers)_(любые новые event types additive и безопасные)

import { metaDB } from './meta-db.js';

class EventLogger {
  constructor() { this.queue=[]; this.sessionId=crypto.randomUUID(); this.deviceHash=localStorage.getItem('deviceHash')||('tmp_'+crypto.randomUUID()); }
  async init() { await metaDB.init(); try { const { getOrCreateDeviceHash } = await import('../core/device-identity.js'); this.deviceHash = await getOrCreateDeviceHash(); } catch { if(!localStorage.getItem('deviceHash')) localStorage.setItem('deviceHash', this.deviceHash='dv_'+crypto.randomUUID().replace(/-/g,'').slice(0,16)); else this.deviceHash=localStorage.getItem('deviceHash'); } ['visibilitychange','beforeunload'].forEach(e=>window.addEventListener(e,()=>document.hidden!==false&&this.flush())); window.addEventListener('analytics:forceFlush',()=>this.flush()); setInterval(()=>this.flush(),15000); }
  log(type, uid, data={}) { if (window._isRestoring) return; this.queue.push({eventId:crypto.randomUUID(),sessionId:this.sessionId,deviceHash:this.deviceHash,platform:window.Utils?.getPlatform()?.isIOS?'ios':'web',type,uid,timestamp:Date.now(),data}); if(this.queue.length>20)this.flush(); }
  async flush() { if(!this.queue.length)return; const b=[...this.queue]; this.queue=[]; try{ await metaDB.addEvents(b,'events_hot'); window.dispatchEvent(new CustomEvent('analytics:logUpdated')); }catch{ this.queue=[...b,...this.queue]; } }
}

export const eventLogger = new EventLogger(); window.eventLogger = eventLogger;
