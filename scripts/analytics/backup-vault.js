// scripts/analytics/backup-vault.js
// UID.003_(Event log truth)_(держать backup честным и пересчитываемым)_(backup должен оставаться event-log-centric) // UID.073_(Hybrid sync orchestrator)_(подготовить backup как transport-слой для multi-provider sync)_(future orchestration жить отдельно от vault) // UID.089_(Future MetaDB stores)_(расширить backup listener/provider/recommendation/collection state)_(когда intel stores начнут наполняться, vault должен включить их без ломки формата) // UID.099_(Multi-device sync model)_(готовить deterministic merge без дублей)_(backup должен знать owner/devices/revision) // UID.100_(Backup snapshot as life capsule)_(сделать один канонический файл пользователя)_(manual/cloud backup используют один и тот же формат)
import DeviceRegistry from './device-registry.js';
import { normalizeCloudBackupMeta } from './cloud-contract.js';
import { buildFullBackupObject, stableStringify, sha256Hex } from './backup-builders.js';
import { applyBackupImportObject } from './backup-importers.js';

export class BackupVault {
  static async buildBackupObject() { return await buildFullBackupObject(); }
  
  static async exportData() { const d=await this.buildBackupObject(), u=URL.createObjectURL(new Blob([stableStringify(d)],{type:'application/json'})), a=document.createElement('a'); a.href=u; a.download=`vi3na1bita_backup_${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.vi3bak`; a.click(); URL.revokeObjectURL(u); if(window.eventLogger){window.eventLogger.log('FEATURE_USED','global',{feature:'backup_export_manual'}); window.dispatchEvent(new CustomEvent('analytics:forceFlush'));} return d; }
  
  static async parseBackupText(t) { const b=JSON.parse(t); if(!b?.data?.eventLog||!b?.identity||!b?.integrity?.payloadHash) throw new Error('Invalid format v6.0 required'); if(await sha256Hex(stableStringify({identity:b.identity,devices:b.devices||[],revision:b.revision||{},data:b.data})) !== b.integrity.payloadHash) throw new Error('backup_integrity_failed'); return b; }

  static async importBackupObject(b, m = 'all') { if(!b||typeof b!=='object') throw new Error('invalid_backup_object'); await applyBackupImportObject(b, m); return true; }

  static async importBackupText(t, m = 'all') { const b=await this.parseBackupText(t); return await this.importBackupObject(b, m); }

  static async importBackupFile(f, m = 'all') { return new Promise((res, rej) => { const r=new FileReader(); r.onload=async e=>{ try { await this.importBackupText(e.target.result, m); res(true); }catch(err){rej(err);} }; r.readAsText(f); }); }

  static async importData(f, m = 'all') { return await this.importBackupFile(f, m); }
  
  static summarizeBackupObject(b) { const ls=b?.data?.localStorage||{}, f=(()=>{try{return JSON.parse(ls['__favorites_v2__']||'[]');}catch{return[];}})(), p=(()=>{try{return JSON.parse(ls['sc3:playlists']||'[]');}catch{return[];}})(), dv=Array.isArray(b?.devices)?DeviceRegistry.normalizeDeviceRegistry(b.devices):[]; return normalizeCloudBackupMeta({ timestamp:Number(b?.revision?.timestamp||b?.createdAt||0), appVersion:String(b?.revision?.appVersion||'unknown'), statsCount:Array.isArray(b?.data?.stats)?b.data.stats.filter(x=>x?.uid&&x.uid!=='global').length:0, eventCount:Array.isArray(b?.data?.eventLog?.warm)?b.data.eventLog.warm.length:0, achievementsCount:Object.keys(b?.data?.achievements||{}).length, favoritesCount:Array.isArray(f)?f.filter(x=>!x?.inactiveAt).length:0, playlistsCount:Array.isArray(p)?p.length:0, profileName:String(b?.data?.userProfile?.name||'Слушатель'), ownerYandexId:String(b?.identity?.ownerYandexId||''), devicesCount:dv.length, deviceStableCount:DeviceRegistry.countDeviceStableIds(dv), checksum:String(b?.integrity?.payloadHash||''), version:String(b?.version||b?.revision?.version||'unknown') }); }
}
