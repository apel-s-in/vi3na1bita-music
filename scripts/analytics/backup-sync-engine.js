// scripts/analytics/backup-sync-engine.js
// Умный автосейв: только при реальных изменениях, с защитой от затирания облака.

import { safeNum, safeString, safeJsonParse, compareLocalVsCloud } from './backup-summary.js';

const LS_SYNC = 'backup:autosync:enabled', LS_RESTORE = 'backup:restore_or_skip_done', WATCH = new Set(['__favorites_v2__','sc3:playlists','sc3:default','sc3:activeId','sc3:ui_v2','sourcePref','favoritesOnlyMode','qualityMode:v1','lyricsViewMode','lyricsAnimationEnabled','logoPulseEnabled','dl_format_v1']);
let _tmr=null, _last=0, _bnd=false, _rdy=false;

const getLocSum = () => { const a=window.achievementEngine, f=safeJsonParse(localStorage.getItem('__favorites_v2__'),[]), pl=safeJsonParse(localStorage.getItem('sc3:playlists'),[]), r=window.DeviceRegistry?.getDeviceRegistry?.()||safeJsonParse(localStorage.getItem('backup:device_registry:v1'),[])||[]; return { timestamp:safeNum(localStorage.getItem('yandex:last_backup_local_ts')), level:safeNum(a?.profile?.level||1), xp:safeNum(a?.profile?.xp||0), achievementsCount:Object.keys(a?.unlocked||{}).length, favoritesCount:Array.isArray(f)?f.filter(i=>!i?.inactiveAt).length:0, playlistsCount:Array.isArray(pl)?pl.length:0, statsCount:0, eventCount:0, devicesCount:Array.isArray(r)?r.length:0, deviceStableCount:window.DeviceRegistry?.countDeviceStableIds?.(r)||new Set((Array.isArray(r)?r:[]).map(d=>safeString(d?.deviceStableId)).filter(Boolean)).size }; };
const enrich = async s => { try { const { metaDB } = await import('./meta-db.js'), [st, w] = await Promise.all([metaDB.getAllStats().catch(()=>[]), metaDB.getEvents('events_warm').catch(()=>[])]); return { ...s, statsCount:Array.isArray(st)?st.filter(x=>x?.uid&&x.uid!=='global').length:safeNum(s?.statsCount), eventCount:Array.isArray(w)?w.length:safeNum(s?.eventCount) }; } catch { return s; } };

export const isSyncEnabled = () => localStorage.getItem(LS_SYNC) !== '0';
export const isSyncReady = () => _rdy;
const canUp = () => _rdy && isSyncEnabled() && isRestoreOrSkipDone();

export const isRestoreOrSkipDone = () => localStorage.getItem(LS_RESTORE) === '1';
export const markRestoreOrSkipDone = r => { localStorage.setItem(LS_RESTORE, '1'); console.debug('[BackupSyncEngine] restore/skip done:', r); };

export const markSyncReady = r => {
  const reason = String(r || '').trim();
  const safeReady = ['no_cloud_backup','cloud_not_newer','diff_too_small','no_auth_local_only','logged_out_local_only','offline_skip','restore_completed','manual_save','user_skipped_restore'];
  const riskyBlocked = ['meta_check_failed','timeout_fallback','cloud_newer_user_choice'];
  if (_rdy && !riskyBlocked.includes(reason)) return;
  if (riskyBlocked.includes(reason)) {
    console.warn('[BackupSyncEngine] sync NOT ready due to risky state:', reason);
    window.dispatchEvent(new CustomEvent('backup:sync:ready',{detail:{reason,blocked:true}}));
    return;
  }
  _rdy = true;
  if (safeReady.includes(reason)) markRestoreOrSkipDone(reason);
  console.debug('[BackupSyncEngine] sync READY:', reason);
  window.dispatchEvent(new CustomEvent('backup:sync:ready',{detail:{reason}}));
};

export const setSyncEnabled = v => { localStorage.setItem(LS_SYNC, v?'1':'0'); if(!v){clearTimeout(_tmr);_tmr=null;} window.dispatchEvent(new CustomEvent('backup:sync:settings:changed')); };

const emitSt = s => window.dispatchEvent(new CustomEvent('backup:sync:state',{detail:{state:s}}));

const checkSafe = async (d, t) => { try { const cm=await d.getMeta(t).catch(()=>null), lSum=await enrich(getLocSum()), cmp=compareLocalVsCloud(lSum, cm); if(cmp.state==='no_cloud') return{ok:true,reason:'no_cloud'}; if(['local_richer','local_probably_richer','equivalent'].includes(cmp.state)) return{ok:true,reason:cmp.state,compare:cmp,cloudMeta:cm}; return{ok:false,reason:cmp.state,compare:cmp,cloudMeta:cm}; } catch(e){ const m=String(e?.message||''); if(m.includes('disk_forbidden')||m.includes('disk_auth_error')){window.YandexAuth?.logout?.();window.NotificationSystem?.error('Сессия Яндекса устарела или нет прав. Автосохранение остановлено.');} return{ok:false,reason:'cloud_compare_failed',error:m}; } };

const markDirty = (isA = false) => { if(!canUp()) return; try{localStorage.setItem('backup:local_dirty_ts', String(Date.now()));}catch{} clearTimeout(_tmr); _tmr = setTimeout(async () => { if(!canUp()) return; const ya=window.YandexAuth, disk=window.YandexDisk; if(!ya||!disk||ya.getSessionStatus()!=='active'||!ya.isTokenAlive()||!(window.NetPolicy?.isNetworkAllowed?.()??navigator.onLine)||Date.now()-_last<10000) return; emitSt('syncing'); try { const {BackupVault}=await import('./backup-vault.js'), tok=ya.getToken(); if(!tok||!ya.isTokenAlive()) return emitSt('idle'); const b=await BackupVault.buildBackupObject(), d=b?.data, fV=d?.localStorage?.['__favorites_v2__'], pV=d?.localStorage?.['sc3:playlists']; let fC=0,pC=0; try{fC=JSON.parse(fV||'[]').filter(i=>!i.inactiveAt).length;pC=JSON.parse(pV||'[]').length;}catch{} if((d?.stats?.length||0)<=1 && (d?.eventLog?.warm?.length||0)===0 && Object.keys(d?.achievements||{}).length===0 && fC===0 && pC===0) return emitSt('idle'); const sU=await checkSafe(disk, tok); if(!sU.ok){ emitSt('idle'); if(sU.cloudMeta) try{localStorage.setItem('yandex:last_backup_check',JSON.stringify(sU.cloudMeta));window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));}catch{} if(['cloud_richer','cloud_probably_richer'].includes(sU.reason)) window.dispatchEvent(new CustomEvent('yandex:cloud:newer',{detail:{meta:sU.cloudMeta||null,compareState:sU.reason,localScore:sU.compare?.localScore||0,cloudScore:sU.compare?.cloudScore||0,localTs:sU.compare?.localTs||0,cloudTs:sU.compare?.cloudTs||0}})); return; } const mt=await disk.upload(tok,b); _last=Date.now(); try{localStorage.setItem('yandex:last_backup_meta',JSON.stringify(mt));localStorage.setItem('yandex:last_backup_check',JSON.stringify(mt));localStorage.setItem('yandex:last_backup_local_ts',String(Number(b?.revision?.timestamp||b?.createdAt||Date.now())));window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));}catch{} emitSt('ok'); setTimeout(()=>emitSt('idle'),3000); if(window.eventLogger){window.eventLogger.log('FEATURE_USED','global',{feature:'backup'});window.dispatchEvent(new CustomEvent('analytics:forceFlush'));} } catch(e){ emitSt('idle'); console.debug('[BackupSyncEngine] skip:',e?.message); } }, isA?5000:60000); };

export const initBackupSyncEngine = () => { if(_bnd) return; _bnd=true; if(!localStorage._bsePatched){ const oS=localStorage.setItem.bind(localStorage); localStorage.setItem=function(k,v){ oS(k,v); if(WATCH.has(k)&&_rdy&&!k.startsWith('backup:')&&!k.startsWith('yandex:')) markDirty(false); }; localStorage._bsePatched=true; } window.addEventListener('achievements:updated', e => { if(e.detail?.unlocked>0&&_rdy) markDirty(true); }); setTimeout(()=>{ if(!_rdy){ console.warn('[BackupSyncEngine] timeout fallback reached; autosave remains blocked until cloud state is resolved'); window.dispatchEvent(new CustomEvent('backup:sync:ready',{detail:{reason:'timeout_fallback',blocked:true}})); } }, 300000); };

export const getSyncIntervalSec = () => 60;
export default { initBackupSyncEngine, markSyncReady, isSyncReady, isSyncEnabled, setSyncEnabled, getSyncIntervalSec, markRestoreOrSkipDone, isRestoreOrSkipDone };
