import { buildDeviceSettingsPath, normalizeDeviceSettingsSnapshot, safeDeviceString } from '../analytics/device-settings-contract.js';

const API='https://cloud-api.yandex.net/v1/disk',PROXY='https://functions.yandexcloud.net/d4ecdu6kgamevcauajid',aH=t=>({'Authorization':`OAuth ${t}`}),sS=safeDeviceString,sPJ=t=>{try{return JSON.parse(t)}catch{return null}},mPE=(p,e)=>{const s=Number(e?.status||0),pl=e?.payload&&typeof e.payload==='object'?e.payload:null,d=[sS(pl?.error),sS(pl?.stage),sS(pl?.path),sS(pl?.raw),sS(pl?.hint)].filter(Boolean).join(' | '),err=new Error(d?`${p}:${d}`:p);err.status=s;err.payload=pl;return err};

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

async function pJP(t,p,d){
  const rL=await fetch(`${API}/resources/upload?path=${encodeURIComponent(p)}&overwrite=true`,{headers:aH(t)});
  if(!rL.ok) throw new Error(`upload_link_failed:${rL.status}`);
  const rs=await fetch((await rL.json()).href,{method:'PUT',body:new Blob([JSON.stringify(d)],{type:'application/json'})});
  if(!rs.ok) throw new Error(`upload_failed:${rs.status}`);
  return true;
}

export const YandexDeviceSettingsDisk={
  async uploadDeviceSettings(t,d){
    if(!t) throw new Error('no_token');
    const stableId=sS(d?.deviceStableId||''),path=buildDeviceSettingsPath(stableId);
    if(!path) throw new Error('device_settings_no_stable_id');
    const doc=normalizeDeviceSettingsSnapshot({...d,path});
    await pJP(t,path,doc);
    return doc;
  },
  async getDeviceSettingsMeta(t,stableId){
    if(!t) throw new Error('no_token');
    const sid=sS(stableId);
    if(!sid) throw new Error('device_settings_no_stable_id');
    const u=new URL(PROXY);u.searchParams.set('mode','device_meta');u.searchParams.set('deviceStableId',sid);
    try{
      const d=await fPJ(u.toString(),t,2);
      return d?.exists?normalizeDeviceSettingsSnapshot(d.device||{}):null;
    }catch(e){
      const s=Number(e?.status||0);
      if(s===404) return null;
      if(s===401) throw mPE('disk_auth_error',e);
      if(s===403) throw mPE('disk_forbidden',e);
      throw mPE(sS(e?.message||'device_meta_proxy_failed'),e);
    }
  },
  async downloadDeviceSettings(t,stableId){
    if(!t) throw new Error('no_token');
    const sid=sS(stableId);
    if(!sid) throw new Error('device_settings_no_stable_id');
    const u=new URL(PROXY);u.searchParams.set('mode','device_download');u.searchParams.set('deviceStableId',sid);
    try{
      const d=await fPJ(u.toString(),t,2);
      if(!d||typeof d!=='object') throw new Error('invalid_device_settings_payload');
      return normalizeDeviceSettingsSnapshot(d);
    }catch(e){
      const s=Number(e?.status||0),msg=sS(e?.message||'');
      if(s===404) return null;
      if(s===409) return null;
      if(s===401) throw mPE('disk_auth_error',e);
      if(s===403) throw mPE('disk_forbidden',e);
      if([502,503,504].includes(s)) return null;
      if(msg.includes('device_settings_not_found')||msg.includes('device_download_proxy_failed')) return null;
      throw mPE(msg||'device_download_proxy_failed',e);
    }
  }
};

export default YandexDeviceSettingsDisk;
