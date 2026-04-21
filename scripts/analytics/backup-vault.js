// scripts/analytics/backup-vault.js
// UID.003_(Event log truth)_(держать backup честным и пересчитываемым)_(backup должен оставаться event-log-centric) // UID.073_(Hybrid sync orchestrator)_(подготовить backup как transport-слой для multi-provider sync)_(future orchestration жить отдельно от vault) // UID.089_(Future MetaDB stores)_(расширить backup listener/provider/recommendation/collection state)_(когда intel stores начнут наполняться, vault должен включить их без ломки формата) // UID.099_(Multi-device sync model)_(готовить deterministic merge без дублей)_(backup должен знать owner/devices/revision) // UID.100_(Backup snapshot as life capsule)_(сделать один канонический файл пользователя)_(manual/cloud backup используют один и тот же формат)
import { metaDB } from './meta-db.js'; import { toNum, minPositive, maxDateStr, mergeNumArrayMax, mergeNumericMapMax, mergeStatRowSafe, mergeAchievementsSafe, mergeFavoritesStorageSafe, mergePlaylistsStorageSafe, mergeProfileStorageValueSafe } from './backup-merge.js'; import DeviceRegistry from './device-registry.js';

const P_KEYS = ['__favorites_v2__','sc3:playlists','sc3:default','sc3:activeId','sc3:ui_v2','sc3:albumColors','sourcePref','favoritesOnlyMode','qualityMode:v1','offline:mode:v1','offline:cacheQuality:v1','cloud:listenThreshold','cloud:ttlDays','playerVolume','playerStateV2','lyricsViewMode','lyricsAnimationEnabled','lyricsShowAnimBtn','logoPulseEnabled','logoPulsePreset','logoPulseIntensity','logoPulseDebug','profileShowControls','dl_format_v1','app:first-install-ts','sleepTimerState:v2'];
const DL_KEYS = new Set(['offline:mode:v1','offline:cacheQuality:v1','cloud:listenThreshold','cloud:ttlDays','playerVolume','playerStateV2','sleepTimerState:v2','favoritesOnlyMode','qualityMode:v1']);
const PO_KEYS = new Set(['__favorites_v2__','sc3:playlists','sc3:default','sc3:activeId','sc3:ui_v2','sc3:albumColors','sourcePref','favoritesOnlyMode','qualityMode:v1','offline:mode:v1','offline:cacheQuality:v1','playerVolume','playerStateV2','lyricsViewMode','lyricsAnimationEnabled','lyricsShowAnimBtn','logoPulseEnabled','logoPulsePreset','logoPulseIntensity','logoPulseDebug','profileShowControls','dl_format_v1','sleepTimerState:v2']);

const sortObj = v => Array.isArray(v) ? v.map(sortObj) : (!v || typeof v !== 'object') ? v : Object.keys(v).sort().reduce((a, k) => (a[k] = sortObj(v[k]), a), {});
const stableStringify = v => JSON.stringify(sortObj(v));
const sha256Hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s||''))))].map(b => b.toString(16).padStart(2,'0')).join('');

const rbdStats = async () => {
  try {
    const [{ StatsAggregator }] = await Promise.all([import('./stats-aggregator.js')]);
    const agg = new StatsAggregator();
    const warm = await metaDB.getEvents('events_warm').catch(() => []);

    // Полная очистка stats и hot
    await metaDB.tx('stats', 'readwrite', s => s.clear());
    await metaDB.clearEvents('events_hot').catch(() => {});

    if (!Array.isArray(warm) || !warm.length) {
      await new Promise(r => setTimeout(r, 0));
      return true;
    }

    console.debug(`[rbdStats] rebuilding from ${warm.length} events...`);

    // Обрабатываем батчами по 500 событий — это безопасно для любого размера backup
    const BATCH_SIZE = 500;
    let processed = 0;
    for (let i = 0; i < warm.length; i += BATCH_SIZE) {
      const batch = warm.slice(i, i + BATCH_SIZE);
      await metaDB.addEvents(batch, 'events_hot');
      await agg.processHotEvents();

      // Гарантируем что hot очищен после processHotEvents
      const remaining = await metaDB.getEvents('events_hot').catch(() => []);
      if (Array.isArray(remaining) && remaining.length) {
        await agg.processHotEvents(); // повторный проход для остатков
      }

      processed += batch.length;
      // Даём event-loop подышать между батчами (для больших backup-ов)
      if (i + BATCH_SIZE < warm.length) {
        await new Promise(r => setTimeout(r, 10));
      }
    }

    console.debug(`[rbdStats] processed ${processed} events`);

    // Финальная дождалка — все подписчики stats:updated отработают
    await new Promise(r => setTimeout(r, 50));
    return true;
  } catch (e) {
    console.warn('[rbdStats] failed:', e?.message);
    return false;
  }
};
const rOwner = async () => { const p = window.YandexAuth?.getProfile?.(); return { internalUserId: localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || crypto.randomUUID(), ownerYandexId: String(p?.yandexId||p?.id||'').trim()||null, ownerLogin: String(p?.login||'').trim()||null, ownerDisplayName: String(p?.displayName||p?.realName||'').trim()||null }; };
const rDevReg = async () => {
  const { getOrCreateDeviceHash, getOrCreateDeviceStableId } = await import('../core/device-identity.js');
  const h = await getOrCreateDeviceHash();
  const id = await getOrCreateDeviceStableId();
  const cur = DeviceRegistry.normalizeDeviceRow({
    deviceHash: h,
    deviceStableId: id,
    platform: window.Utils?.getPlatform?.()?.isIOS ? 'ios' : (/Android/i.test(navigator.userAgent) ? 'android' : 'web'),
    userAgent: navigator.userAgent,
    firstSeenAt: Number(localStorage.getItem('app:first-install-ts') || Date.now()),
    lastSeenAt: Date.now(),
    seenHashes: [h]
  });

  // КРИТИЧНО: сначала чистим storage от дублей, потом добавляем current
  const raw = DeviceRegistry.getDeviceRegistry();
  const deduped = DeviceRegistry.normalizeDeviceRegistry(raw);
  const withCurrent = DeviceRegistry.normalizeDeviceRegistry([...deduped, cur]);

  // Проверяем результат: если получилось больше, чем количество уникальных stableId+hash → баг в dedup
  const expectedMax = new Set([...withCurrent.map(d => d.deviceStableId || d.deviceHash)].filter(Boolean)).size;
  const finalList = withCurrent.length > expectedMax ? withCurrent.slice(0, expectedMax) : withCurrent;

  if (finalList.length < raw.length) {
    console.debug(`[BackupVault] device registry deduplicated: ${raw.length} → ${finalList.length}`);
  }

  DeviceRegistry.saveDeviceRegistry(finalList);
  return finalList;
};
const rDevCac = async () => { try { const [{getAllTrackMetas}, {getCurrentDeviceHash, getCurrentDeviceStableId}] = await Promise.all([import('../offline/cache-db.js'), import('../core/device-identity.js')]); return { deviceHash: getCurrentDeviceHash?.() || localStorage.getItem('deviceHash') || '', deviceStableId: getCurrentDeviceStableId?.() || localStorage.getItem('deviceStableId') || '', items: (await getAllTrackMetas()).filter(m => ['pinned','cloud'].includes(m.type)).map(m => ({ uid:m.uid, type:m.type, quality:m.quality, size:m.size||0, cloudExpiresAt:m.cloudExpiresAt||null, pinnedAt:m.pinnedAt||null })) }; } catch { return null; } };

// Дедупликация intel-записей по ключу (сохраняем только последнюю запись для каждого key)
const dedupIntel = arr => {
  if (!Array.isArray(arr) || !arr.length) return [];
  const m = new Map();
  arr.forEach(r => { if (r?.key) m.set(String(r.key), r); });
  return [...m.values()];
};

// Ограничение warm events: храним только последние 2000 (достаточно для пересчёта stats + защита от гигантских backup)
const WARM_MAX = 2000;
const trimWarm = events => {
  if (!Array.isArray(events)) return [];
  if (events.length <= WARM_MAX) return events;
  // Сортируем по timestamp и берём последние WARM_MAX
  return [...events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-WARM_MAX);
};

const rSnap = async () => {
  const [st, w, a, str, uP, uR, lP, pI, hS, rS, cS, iR] = await Promise.all([
    metaDB.getAllStats(),
    metaDB.getEvents('events_warm'),
    metaDB.getGlobal('unlocked_achievements'),
    metaDB.getGlobal('global_streak'),
    metaDB.getGlobal('user_profile'),
    metaDB.getGlobal('user_profile_rpg'),
    metaDB.getStoreAll('listener_profile').catch(()=>[]),
    metaDB.getStoreAll('provider_identity').catch(()=>[]),
    metaDB.getStoreAll('hybrid_sync').catch(()=>[]),
    metaDB.getStoreAll('recommendation_state').catch(()=>[]),
    metaDB.getStoreAll('collection_state').catch(()=>[]),
    metaDB.getStoreAll('intel_runtime').catch(()=>[])
  ]);
  const warmTrimmed = trimWarm(w);
  if (warmTrimmed.length < w.length) {
    console.debug(`[BackupVault] warm events trimmed: ${w.length} → ${warmTrimmed.length}`);
  }
  return {
    stats: st,
    eventLog: { warm: warmTrimmed },
    achievements: a?.value || {},
    streaks: str?.value || {},
    userProfile: uP?.value || { name: 'Слушатель', avatar: '😎' },
    userProfileRpg: uR?.value || { xp: 0, level: 1 },
    localStorage: P_KEYS.reduce((acc, k) => { const v = localStorage.getItem(k); if (v != null) acc[k] = v; return acc; }, {}),
    intel: {
      listenerProfile: dedupIntel(lP),
      providerIdentity: dedupIntel(pI),
      hybridSync: dedupIntel(hS),
      recommendationState: dedupIntel(rS),
      collectionState: dedupIntel(cS),
      intelRuntime: dedupIntel(iR)
    }
  };
};

export class BackupVault {
  static async buildBackupObject() {
    const identity=await rOwner(), devices=await rDevReg(), data=await rSnap(), cm=await rDevCac();
    if(cm?.deviceHash||cm?.deviceStableId) {
      const d=devices.find(x=>(cm.deviceStableId&&x.deviceStableId===cm.deviceStableId)||(cm.deviceHash&&x.deviceHash===cm.deviceHash));
      if(d) d._cacheMeta=cm.items;
    }
    const cur=Array.isArray(devices)?devices.find(x=>(cm?.deviceStableId&&x.deviceStableId===cm.deviceStableId)||(cm?.deviceHash&&x.deviceHash===cm.deviceHash))||devices[0]||null:null;
    const revision={ timestamp:Date.now(), appVersion:window.APP_CONFIG?.APP_VERSION||null, schemaVersion:'6.0', eventCount:Array.isArray(data?.eventLog?.warm)?data.eventLog.warm.length:0, statsCount:Array.isArray(data?.stats)?data.stats.length:0, devicesCount:devices.length, profileName:String(data?.userProfile?.name||'Слушатель'), sourceDeviceStableId:String(cur?.deviceStableId||''), sourceDeviceLabel:String(cur?.label||''), sourceDeviceClass:String(cur?.class||''), sourcePlatform:String(cur?.platform||'') };
    const payloadHash=await sha256Hex(stableStringify({identity,devices,revision,data}));
    return { version:'6.0', createdAt:Date.now(), identity, devices, revision, integrity:{ algorithm:'SHA-256', payloadHash, ownerBinding:await sha256Hex(`${identity.ownerYandexId||'anon'}::${identity.internalUserId||'local'}::${payloadHash}`) }, data };
  }
  
  static async exportData() { const d=await this.buildBackupObject(), u=URL.createObjectURL(new Blob([stableStringify(d)],{type:'application/json'})), a=document.createElement('a'); a.href=u; a.download=`vi3na1bita_backup_${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.vi3bak`; a.click(); URL.revokeObjectURL(u); if(window.eventLogger){window.eventLogger.log('FEATURE_USED','global',{feature:'backup_export_manual'}); window.dispatchEvent(new CustomEvent('analytics:forceFlush'));} return d; }
  
  static async parseBackupText(t) { const b=JSON.parse(t); if(!b?.data?.eventLog||!b?.identity||!b?.integrity?.payloadHash) throw new Error('Invalid format v6.0 required'); if(await sha256Hex(stableStringify({identity:b.identity,devices:b.devices||[],revision:b.revision||{},data:b.data})) !== b.integrity.payloadHash) throw new Error('backup_integrity_failed'); return b; }
  
  static async importData(f, m = 'all') { return new Promise((res, rej) => { const r=new FileReader(); r.onload=async e=>{ try { const b=await this.parseBackupText(e.target.result), cY=String(window.YandexAuth?.getProfile?.()?.yandexId||'').trim(), oY=String(b?.identity?.ownerYandexId||'').trim(); if(!cY) throw new Error('restore_requires_yandex_login'); if(!oY||oY!==cY) throw new Error('restore_owner_mismatch'); const i=b.data.intel||{}, wS=async(st,r)=>{
  // Сначала чистим store целиком, потом пишем новые записи
  await metaDB.tx(st,'readwrite',s=>s.clear()).catch(()=>{});
  if(Array.isArray(r)&&r.length)await metaDB.tx(st,'readwrite',s=>r.forEach(x=>s.put(x)));
}; if(m==='all'||m==='stats'){
  const [lW, lA, lS, lR]=await Promise.all([metaDB.getEvents('events_warm'), metaDB.getGlobal('unlocked_achievements'), metaDB.getGlobal('global_streak'), metaDB.getGlobal('user_profile_rpg')]);
  const sn=new Set();
  let mE=[...lW,...(b.data.eventLog.warm||[])].filter(x=>x?.eventId&&!sn.has(x.eventId)&&sn.add(x.eventId)).sort((x,y)=>x.timestamp-y.timestamp);
  // Ограничение warm при merge — защита от бесконечного роста при повторных restore
  const WARM_LIMIT = 2000;
  if (mE.length > WARM_LIMIT) {
    console.debug(`[BackupVault] warm merge trimmed: ${mE.length} → ${WARM_LIMIT}`);
    mE = mE.slice(-WARM_LIMIT);
  }
  await metaDB.clearEvents('events_warm');
  await metaDB.addEvents(mE,'events_warm');
  await rbdStats(); await metaDB.setGlobal('unlocked_achievements', mergeAchievementsSafe(lA?.value||{},b.data.achievements||{})); const rS=b.data.streaks||{}, lsV=lS?.value||{}; await metaDB.setGlobal('global_streak', {...lsV,...rS,current:Math.max(toNum(lsV.current),toNum(rS.current)),longest:Math.max(toNum(lsV.longest),toNum(rS.longest)),lastActiveDate:maxDateStr(lsV.lastActiveDate,rS.lastActiveDate)}); const rR=b.data.userProfileRpg||{}, lrV=lR?.value||{}; await metaDB.setGlobal('user_profile_rpg', {...lrV,...rR,xp:Math.max(toNum(lrV.xp),toNum(rR.xp)),level:Math.max(toNum(lrV.level||1),toNum(rR.level||1),1)}); await wS('listener_profile',i.listenerProfile); await wS('provider_identity',i.providerIdentity); await wS('hybrid_sync',i.hybridSync); await wS('recommendation_state',i.recommendationState); await wS('collection_state',i.collectionState); await wS('intel_runtime',i.intelRuntime); } if(m==='all'||m==='profile'){
          if(b.data.userProfile) await metaDB.setGlobal('user_profile',b.data.userProfile);
          // КРИТИЧНО: дедуплицируем devices ДО записи в localStorage
          if (Array.isArray(b.devices)) {
            const dedupedDevices = DeviceRegistry.normalizeDeviceRegistry(b.devices);
            b.devices = dedupedDevices;
            console.debug(`[BackupVault] devices dedup on import: ${(b.devices || []).length}`);
          }
          const isPlaying = !!window.playerCore?.isPlaying?.();
          const PLAYBACK_GUARD = new Set(['playerStateV2','favoritesOnlyMode','sourcePref','qualityMode:v1']);
          Object.entries(b.data.localStorage||{}).forEach(([k,v])=>{
            if(!PO_KEYS.has(k)||DL_KEYS.has(k)) return;
            if(isPlaying && PLAYBACK_GUARD.has(k)) return; // не трогаем playback-чувствительные ключи при активном воспроизведении
            try{localStorage.setItem(k,mergeProfileStorageValueSafe(k,localStorage.getItem(k),v));}catch{}
          });
        } try { localStorage.setItem('backup:device_registry:v1',JSON.stringify(Array.isArray(b.devices)?b.devices:[])); localStorage.setItem('yandex:last_backup_local_ts',String(Number(b?.revision?.timestamp||b?.createdAt||Date.now()))); }catch{} window.dispatchEvent(new CustomEvent('stats:updated')); window.dispatchEvent(new CustomEvent('analytics:logUpdated')); res(true); }catch(err){rej(err);} }; r.readAsText(f); }); }
  
  static summarizeBackupObject(b) { const ls=b?.data?.localStorage||{}, f=(()=>{try{return JSON.parse(ls['__favorites_v2__']||'[]');}catch{return[];}})(), p=(()=>{try{return JSON.parse(ls['sc3:playlists']||'[]');}catch{return[];}})(), dv=Array.isArray(b?.devices)?DeviceRegistry.normalizeDeviceRegistry(b.devices):[]; return { timestamp:Number(b?.revision?.timestamp||b?.createdAt||0), appVersion:String(b?.revision?.appVersion||'unknown'), statsCount:Array.isArray(b?.data?.stats)?b.data.stats.filter(x=>x?.uid&&x.uid!=='global').length:0, eventCount:Array.isArray(b?.data?.eventLog?.warm)?b.data.eventLog.warm.length:0, achievementsCount:Object.keys(b?.data?.achievements||{}).length, favoritesCount:Array.isArray(f)?f.filter(x=>!x?.inactiveAt).length:0, playlistsCount:Array.isArray(p)?p.length:0, profileName:String(b?.data?.userProfile?.name||'Слушатель'), ownerYandexId:String(b?.identity?.ownerYandexId||''), devicesCount:dv.length, deviceStableCount:DeviceRegistry.countDeviceStableIds(dv), checksum:String(b?.integrity?.payloadHash||'') }; }
}
