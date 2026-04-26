import { CLOUD_BACKUP_DIR } from '../analytics/cloud-contract.js';
import { DEVICE_SETTINGS_DIR, buildDeviceSettingsPath, normalizeDeviceSettingsSnapshot, safeDeviceString } from '../analytics/device-settings-contract.js';
import { YANDEX_DISK_PROXY as PROXY, fetchProxyJson as fPJ, uploadJson as pJP, ensureResourceDir, mapProxyError as mPE } from './yandex-disk-transport.js';

const sS=safeDeviceString;

export const YandexDeviceSettingsDisk={
  async uploadDeviceSettings(t,d){
    if(!t) throw new Error('no_token');
    const stableId=sS(d?.deviceStableId||''),path=buildDeviceSettingsPath(stableId);
    if(!path) throw new Error('device_settings_no_stable_id');
    const doc=normalizeDeviceSettingsSnapshot({...d,path});
    await ensureResourceDir(t,CLOUD_BACKUP_DIR).catch(()=>null);
    await ensureResourceDir(t,DEVICE_SETTINGS_DIR).catch(()=>null);
    await pJP(t,path,doc);
    return doc;
  },
  async getDeviceSettingsMeta(t,stableId){
    if(!t) throw new Error('no_token');
    const sid=sS(stableId);
    if(!sid) return null;
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
    if(!sid) return null;
    const u=new URL(PROXY);u.searchParams.set('mode','device_download');u.searchParams.set('deviceStableId',sid);
    try{
      const d=await fPJ(u.toString(),t,2);
      if(!d||typeof d!=='object'||d.exists===false) return null;
      const doc=normalizeDeviceSettingsSnapshot(d);
      return doc.deviceStableId?doc:null;
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
