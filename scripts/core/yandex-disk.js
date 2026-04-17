// scripts/core/yandex-disk.js Сохранение прогресса в app:/ + стабильное чтение только через Cloud Function proxy. Без direct browser fallback на signed Yandex URL.
const API='https://cloud-api.yandex.net/v1/disk',BD='app:/Backup',BP=`${BD}/vi3na1bita_backup.vi3bak`,MP=`${BD}/vi3na1bita_backup_meta.json`,BPV=s=>`${BD}/vi3na1bita_backup_${s}.vi3bak`,PROXY='https://functions.yandexcloud.net/d4ecdu6kgamevcauajid',aH=t=>({'Authorization':`OAuth ${t}`}),sS=v=>String(v==null?'':v).trim(),sN=v=>Number.isFinite(Number(v))?Number(v):0,sPJ=t=>{try{return JSON.parse(t)}catch{return null}},mPE=(p,e)=>{const s=Number(e?.status||0),pl=e?.payload&&typeof e.payload==='object'?e.payload:null,d=[sS(pl?.error),sS(pl?.stage),sS(pl?.path),sS(pl?.raw),sS(pl?.hint)].filter(Boolean).join(' | '),err=new Error(d?`${p}:${d}`:p);err.status=s;err.payload=pl;return err};
async function fPJ(u,t,r=2){
  const qU=u.includes('?')?`${u}&token=${t}`:`${u}?token=${t}`;
  const headers={'X-Yandex-Auth':t,'Accept':'application/json'};
  let lE=null;
  for(let i=0;i<=r;i++){
    try{
      const rs=await fetch(qU,{method:'GET',headers,credentials:'omit',mode:'cors'}),tx=await rs.text(),d=sPJ(tx);
      if(rs.ok) return d;
      if([502,503,504].includes(rs.status)&&i<r){await new Promise(x=>setTimeout(x,800*(i+1)));continue}
      const e=new Error(sS(d?.error||`http_${rs.status}`));
      e.status=rs.status;e.payload=d||{raw:sS(tx).slice(0,400)};
      if(Number(e.status)&&![502,503,504].includes(Number(e.status))) throw e;
      lE=e;
    }catch(e){
      lE=e;
      if(Number(e?.status||0)&&![502,503,504].includes(Number(e?.status||0))) throw e;
    }
  }
  throw lE||new Error('proxy_failed')
}
async function pJP(t,p,d){const rL=await fetch(`${API}/resources/upload?path=${encodeURIComponent(p)}&overwrite=true`,{headers:aH(t)});if(!rL.ok)throw new Error(`upload_link_failed:${rL.status}`);const rs=await fetch((await rL.json()).href,{method:'PUT',body:new Blob([JSON.stringify(d)],{type:'application/json'})});if(!rs.ok)throw new Error(`upload_failed:${rs.status}`);return true}
export const YandexDisk={
  async upload(t,dO){if(!t)throw new Error('no_token');const st=new Date().toISOString().replace(/[:.]/g,'-'),rg=dO?.data?.userProfileRpg||{},fs=dO?.data?.localStorage?.['__favorites_v2__']||'[]',ps=dO?.data?.localStorage?.['sc3:playlists']||'[]',ss=Array.isArray(dO?.data?.stats)?dO.data.stats:[],wm=Array.isArray(dO?.data?.eventLog?.warm)?dO.data.eventLog.warm:[],dv=Array.isArray(dO?.devices)?dO.devices:[];let fC=0,pC=0;try{fC=JSON.parse(fs).filter(i=>!i?.inactiveAt).length}catch{}try{pC=JSON.parse(ps).length}catch{}const sI=new Set(dv.map(d=>sS(d?.deviceStableId)).filter(Boolean)),src=dv.find(d=>sS(d?.deviceStableId)===sS(dO?.revision?.sourceDeviceStableId))||dv[0]||null,m={latestPath:BP,historyPath:BPV(st),timestamp:sN(dO?.revision?.timestamp||dO?.createdAt||Date.now()),appVersion:dO?.revision?.appVersion||'unknown',ownerYandexId:dO?.identity?.ownerYandexId||null,profileName:sS(dO?.revision?.profileName||dO?.data?.userProfile?.name||'Слушатель')||'Слушатель',sourceDeviceStableId:sS(dO?.revision?.sourceDeviceStableId||src?.deviceStableId||''),sourceDeviceLabel:sS(dO?.revision?.sourceDeviceLabel||src?.label||''),sourceDeviceClass:sS(dO?.revision?.sourceDeviceClass||src?.class||''),sourcePlatform:sS(dO?.revision?.sourcePlatform||src?.platform||''),level:sN(rg.level||1),xp:sN(rg.xp||0),achievementsCount:Object.keys(dO?.data?.achievements||{}).length,favoritesCount:sN(fC),playlistsCount:sN(pC),statsCount:ss.filter(x=>x?.uid&&x.uid!=='global').length,eventCount:wm.length,devicesCount:dv.length,deviceStableCount:sI.size,checksum:sS(dO?.integrity?.payloadHash||''),version:sS(dO?.version||dO?.revision?.schemaVersion||'unknown')};await pJP(t,BP,dO);try{await pJP(t,m.historyPath,dO)}catch{}await pJP(t,MP,m);this.deleteOldBackups(t,{keep:5}).catch(()=>{});return await this.getMeta(t).catch(()=>null)||m},
  async getMeta(t){if(!t)throw new Error('no_token');const u=new URL(PROXY);u.searchParams.set('mode','meta');try{const d=await fPJ(u.toString(),t,2);return d?.exists?d.latest||null:null}catch(e){const s=Number(e?.status||0);if(s===404)return null;if(s===401)throw mPE('disk_auth_error',e);if(s===403)throw mPE('disk_forbidden',e);throw mPE(sS(e?.message||'meta_proxy_failed'),e)}},
  async download(t,p=BP){if(!t)throw new Error('no_token');const u=new URL(PROXY);u.searchParams.set('mode','download');u.searchParams.set('path',sS(p)||BP);try{const d=await fPJ(u.toString(),t,2);if(!d||typeof d!=='object')throw new Error('invalid_backup_payload');return d}catch(e){const s=Number(e?.status||0);if(s===404)throw mPE('backup_not_found',e);if(s===401)throw mPE('disk_auth_error',e);if(s===403)throw mPE('disk_forbidden',e);if([502,503,504].includes(s))throw mPE('proxy_failed_or_timeout',e);throw mPE(sS(e?.message||'proxy_failed_or_timeout'),e)}},
  async listBackups(t){if(!t)throw new Error('no_token');const u=new URL(PROXY);u.searchParams.set('mode','list');try{const d=await fPJ(u.toString(),t,2);return Array.isArray(d?.items)?d.items:[]}catch(e){const s=Number(e?.status||0);if(s===401)throw mPE('disk_auth_error',e);if(s===403)throw mPE('disk_forbidden',e);if([502,503,504].includes(s))throw mPE('list_proxy_failed',e);throw mPE(sS(e?.message||'list_proxy_failed'),e)}},
  async checkExists(t){if(!t)return false;try{return!!(await this.getMeta(t))}catch{return false}},
  async deleteOldBackups(t,{keep:k=5}={}){if(!t)return;const r=await fetch(`${API}/resources?path=${encodeURIComponent(BD)}&limit=200`,{headers:aH(t)});if(!r.ok)return;const i=(await r.json())?._embedded?.items||[],v=i.filter(x=>/^vi3na1bita_backup_.*\.vi3bak$/i.test(sS(x.name))).sort((a,b)=>(Date.parse(b.modified)||0)-(Date.parse(a.modified)||0)),tD=v.slice(Math.max(0,k));for(const it of tD)await fetch(`${API}/resources?path=${encodeURIComponent(it.path)}`,{method:'DELETE',headers:aH(t)}).catch(()=>{})}
};
window.YandexDisk=YandexDisk;export default YandexDisk;
