export const safeNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const safeString = v => String(v == null ? '' : v).trim();
export const safeJsonParse = (r, f = null) => { try { return JSON.parse(r); } catch { return f; } };

export const normalizeBackupSummary = (s = {}) => ({ appVersion:safeString(s?.appVersion||'unknown'), timestamp:safeNum(s?.timestamp), favoritesCount:safeNum(s?.favoritesCount), playlistsCount:safeNum(s?.playlistsCount), profileName:safeString(s?.profileName||'Слушатель')||'Слушатель', level:Math.max(1,safeNum(s?.level||1)), xp:safeNum(s?.xp), achievementsCount:safeNum(s?.achievementsCount), statsCount:safeNum(s?.statsCount), eventCount:safeNum(s?.eventCount), devicesCount:safeNum(s?.devicesCount), deviceStableCount:safeNum(s?.deviceStableCount), checksum:safeString(s?.checksum||''), ownerYandexId:safeString(s?.ownerYandexId||''), sourceDeviceStableId:safeString(s?.sourceDeviceStableId||''), sourceDeviceLabel:safeString(s?.sourceDeviceLabel||''), sourceDeviceClass:safeString(s?.sourceDeviceClass||''), sourcePlatform:safeString(s?.sourcePlatform||'') });

export const getRichnessScore = s => { const x=normalizeBackupSummary(s); return safeNum(x.level)*1000 + safeNum(x.xp) + safeNum(x.achievementsCount)*250 + safeNum(x.favoritesCount)*40 + safeNum(x.playlistsCount)*60 + safeNum(x.statsCount)*6 + safeNum(x.eventCount)*2 + safeNum(x.devicesCount)*25 + safeNum(x.deviceStableCount)*30; };

export const compareLocalVsCloud = (l, c) => { const ll=normalizeBackupSummary(l||{}), cc=normalizeBackupSummary(c||{}), lTs=safeNum(ll.timestamp), cTs=safeNum(cc.timestamp), lSc=getRichnessScore(ll), cSc=getRichnessScore(cc), sDf=cSc-lSc, tDf=cTs-lTs; if(!c||(!cTs&&cSc===0)) return{state:'no_cloud',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf}; if(lTs===0&&lSc<=1200&&cSc>0) return{state:'cloud_richer_new_device',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};

// equivalent только если timestamps РЕАЛЬНО близки (1 минута) И разница очень маленькая (200 score = ~1 ачивка или 5 треков)
if(Math.abs(tDf)<60000&&Math.abs(sDf)<200) return{state:'equivalent',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};

// Если облако явно богаче (>500 score = +1 уровень или +5 ачивок) — всегда cloud_richer
if(cSc-lSc>500) return{state:'cloud_richer',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};

// Если локальное явно богаче (>500 score) — всегда local_richer (даже если cloud ts новее — это локальный backup-свежак, просто ещё не успел загрузиться)
if(lSc-cSc>500) return{state:'local_richer',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};

if(cTs>lTs&&cSc>=lSc) return{state:'cloud_richer',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};
if(lTs>cTs&&lSc>=cSc) return{state:'local_richer',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};
if(cSc>lSc&&cTs>=lTs) return{state:'cloud_probably_richer',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};
if(lSc>cSc&&lTs>=cTs) return{state:'local_probably_richer',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};

// Если ts конфликтует, но score очень близок (diff < 200) — считаем equivalent
if(Math.abs(sDf)<200) return{state:'equivalent',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf};

// Последний fallback — явный conflict
return{state:'conflict',localTs:lTs,cloudTs:cTs,localScore:lSc,cloudScore:cSc,scoreDiff:sDf,tsDiff:tDf}; };

export const getLocalBackupUiSnapshot = p => { try { const f=safeJsonParse(localStorage.getItem('__favorites_v2__'),[]), pl=safeJsonParse(localStorage.getItem('sc3:playlists'),[]), r=window.DeviceRegistry?.getDeviceRegistry?.()||safeJsonParse(localStorage.getItem('backup:device_registry:v1'),[])||[], a=window.achievementEngine, cur=window.DeviceRegistry?.getCurrentDeviceIdentity?.()||{}, row=(Array.isArray(r)?r:[]).find(d=>safeString(d?.deviceStableId)&&safeString(d?.deviceStableId)===safeString(cur?.deviceStableId))||{}; return normalizeBackupSummary({ appVersion:window.APP_CONFIG?.APP_VERSION||'unknown', timestamp:safeNum(localStorage.getItem('yandex:last_backup_local_ts')), favoritesCount:Array.isArray(f)?f.filter(i=>!i?.inactiveAt).length:0, playlistsCount:Array.isArray(pl)?pl.length:0, profileName:p?.name||'Слушатель', level:safeNum(a?.profile?.level||1), xp:safeNum(a?.profile?.xp||0), achievementsCount:Object.keys(a?.unlocked||{}).length, devicesCount:Array.isArray(r)?r.length:0, deviceStableCount:window.DeviceRegistry?.countDeviceStableIds?.(r)||new Set((Array.isArray(r)?r:[]).map(d=>safeString(d?.deviceStableId)).filter(Boolean)).size, sourceDeviceStableId:safeString(cur?.deviceStableId||''), sourceDeviceLabel:safeString(row?.label||''), sourceDeviceClass:safeString(row?.class||''), sourcePlatform:safeString(row?.platform||'') }); } catch { return normalizeBackupSummary({ appVersion:window.APP_CONFIG?.APP_VERSION||'unknown', timestamp:safeNum(localStorage.getItem('yandex:last_backup_local_ts')), favoritesCount:0, playlistsCount:0, profileName:p?.name||'Слушатель', level:safeNum(window.achievementEngine?.profile?.level||1), xp:safeNum(window.achievementEngine?.profile?.xp||0), achievementsCount:Object.keys(window.achievementEngine?.unlocked||{}).length, devicesCount:0, deviceStableCount:0 }); } };

export const normalizeCloudBackupMeta = m => normalizeBackupSummary(m||{});

export const getBackupCompareLabel = (l, c) => c ? ({no_cloud:'Облачная копия отсутствует',cloud_richer_new_device:'Облако выглядит как основной источник для нового устройства',cloud_richer:'Облако богаче и новее локального профиля',cloud_probably_richer:'Облако вероятно богаче локального профиля',local_richer:'Локальные данные богаче облачной копии',local_probably_richer:'Локальный профиль вероятно богаче облачного',equivalent:'Локальная и облачная копии практически эквивалентны',conflict:'Есть смешанные признаки: нужна ручная проверка'})[compareLocalVsCloud(l||{},c||{}).state] || 'Сравнение недоступно' : 'Нет данных о копии';

export default { safeNum, safeString, safeJsonParse, normalizeBackupSummary, normalizeCloudBackupMeta, getRichnessScore, compareLocalVsCloud, getLocalBackupUiSnapshot, getBackupCompareLabel };
