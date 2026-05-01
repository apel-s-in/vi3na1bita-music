import { CLOUD_BACKUP_DIR, CLOUD_BACKUP_LATEST_PATH, CLOUD_BACKUP_META_PATH, buildBackupHistoryPath, sanitizeBackupPath, normalizeCloudBackupMeta, normalizeCloudBackupListItem, safeCloudString, safeCloudNum } from '../analytics/cloud-contract.js';
import { YANDEX_DISK_API as API, YANDEX_DISK_PROXY as PROXY, authHeaders as aH, fetchProxyJson as fPJ, uploadJson as pJP, ensureResourceDir, mapProxyError as mPE } from './yandex-disk-transport.js';

const BD=CLOUD_BACKUP_DIR,BP=CLOUD_BACKUP_LATEST_PATH,MP=CLOUD_BACKUP_META_PATH,BPV=s=>buildBackupHistoryPath(s),sS=safeCloudString,sN=safeCloudNum;

export const YandexBackupDisk={
  async upload(t,dO,{writeHistory=true,changedDomains=[]}={}){
    if(!t) throw new Error('no_token');
    const st=new Date().toISOString().replace(/[:.]/g,'-'),hPath=writeHistory?BPV(st):'',rg=dO?.data?.userProfileRpg||{},fs=dO?.data?.localStorage?.['__favorites_v2__']||'[]',ps=dO?.data?.localStorage?.['sc3:playlists']||'[]',ss=Array.isArray(dO?.data?.stats)?dO.data.stats:[],wm=Array.isArray(dO?.data?.eventLog?.warm)?dO.data.eventLog.warm:[],dv=Array.isArray(dO?.devices)?dO.devices:[];
    let fC=0,pC=0;
    try{fC=JSON.parse(fs).filter(i=>!i?.inactiveAt&&!i?.deletedAt).length}catch{}
    try{pC=JSON.parse(ps).filter(p=>!p?.deletedAt).length}catch{}
    const sI=new Set(dv.map(d=>sS(d?.deviceStableId)).filter(Boolean)),src=dv.find(d=>sS(d?.deviceStableId)===sS(dO?.revision?.sourceDeviceStableId))||dv[0]||null,m=normalizeCloudBackupMeta({latestPath:BP,historyPath:hPath,timestamp:sN(dO?.revision?.timestamp||dO?.createdAt||Date.now()),appVersion:dO?.revision?.appVersion||'unknown',schemaVersion:sS(dO?.version||dO?.revision?.version||'6.0'),changedDomains,lastHistoryAt:writeHistory?Date.now():0,ownerYandexId:dO?.identity?.ownerYandexId||null,profileName:sS(dO?.revision?.profileName||dO?.data?.userProfile?.name||'Слушатель')||'Слушатель',sourceDeviceStableId:sS(dO?.revision?.sourceDeviceStableId||src?.deviceStableId||''),sourceDeviceLabel:sS(dO?.revision?.sourceDeviceLabel||src?.label||''),sourceDeviceClass:sS(dO?.revision?.sourceDeviceClass||src?.class||''),sourcePlatform:sS(dO?.revision?.sourcePlatform||src?.platform||''),level:sN(rg.level||1),xp:sN(rg.xp||0),achievementsCount:Object.keys(dO?.data?.achievements||{}).length,favoritesCount:sN(fC),playlistsCount:sN(pC),statsCount:ss.filter(x=>x?.uid&&x.uid!=='global').length,eventCount:wm.length,devicesCount:dv.length,deviceStableCount:sI.size,checksum:sS(dO?.integrity?.payloadHash||''),version:sS(dO?.version||dO?.revision?.schemaVersion||dO?.revision?.version||'unknown')});
    await ensureResourceDir(t,BD).catch(()=>null);
    await pJP(t,BP,dO);
    if(writeHistory&&m.historyPath) try{await pJP(t,m.historyPath,dO)}catch{}
    await pJP(t,MP,m);
    if(writeHistory) this.deleteOldBackups(t,{keep:5}).catch(()=>{});
    return await this.getMeta(t).catch(()=>null)||m;
  },
  async getMeta(t){
    if(!t) throw new Error('no_token');
    const u=new URL(PROXY);u.searchParams.set('mode','meta');
    try{
      const d=await fPJ(u.toString(),t,2);
      return d?.exists?normalizeCloudBackupMeta(d.latest||{}):null;
    }catch(e){
      const s=Number(e?.status||0);
      if(s===404) return null;
      if(s===401) throw mPE('disk_auth_error',e);
      if(s===403) throw mPE('disk_forbidden',e);
      throw mPE(sS(e?.message||'meta_proxy_failed'),e);
    }
  },
  async download(t,p=BP){
    if(!t) throw new Error('no_token');
    const u=new URL(PROXY);u.searchParams.set('mode','download');u.searchParams.set('path',sanitizeBackupPath(p));
    try{
      const d=await fPJ(u.toString(),t,2);
      if(!d||typeof d!=='object') throw new Error('invalid_backup_payload');
      return d;
    }catch(e){
      const s=Number(e?.status||0);
      if(s===404) throw mPE('backup_not_found',e);
      if(s===401) throw mPE('disk_auth_error',e);
      if(s===403) throw mPE('disk_forbidden',e);
      if([502,503,504].includes(s)) throw mPE('proxy_failed_or_timeout',e);
      throw mPE(sS(e?.message||'proxy_failed_or_timeout'),e);
    }
  },
  async listBackups(t){
    if(!t) throw new Error('no_token');
    const u=new URL(PROXY);u.searchParams.set('mode','list');
    try{
      const d=await fPJ(u.toString(),t,2);
      return Array.isArray(d?.items)?d.items.map(normalizeCloudBackupListItem):[];
    }catch(e){
      const s=Number(e?.status||0);
      if(s===401) throw mPE('disk_auth_error',e);
      if(s===403) throw mPE('disk_forbidden',e);
      if([502,503,504].includes(s)) throw mPE('list_proxy_failed',e);
      throw mPE(sS(e?.message||'list_proxy_failed'),e);
    }
  },
  async checkExists(t){
    if(!t) return false;
    try{return !!(await this.getMeta(t))}catch{return false}
  },
  async deleteOldBackups(t,{keep:k=5}={}){
    if(!t) return;
    const r=await fetch(`${API}/resources?path=${encodeURIComponent(BD)}&limit=200`,{headers:aH(t)});
    if(!r.ok) return;
    const i=(await r.json())?._embedded?.items||[],v=i.filter(x=>/^vi3na1bita_backup_.*\.vi3bak$/i.test(sS(x.name))).sort((a,b)=>(Date.parse(b.modified)||0)-(Date.parse(a.modified)||0)),tD=v.slice(Math.max(0,k));
    for(const it of tD) await fetch(`${API}/resources?path=${encodeURIComponent(it.path)}`,{method:'DELETE',headers:aH(t)}).catch(()=>{});
  }
};

export default YandexBackupDisk;
