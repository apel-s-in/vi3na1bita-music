// Стабильная идентификация устройства без зависимости от случайного UUID. Fingerprint строится из стабильных характеристик браузера.
const LS_DEVICE_HASH='deviceHash',LS_DEVICE_STABLE='deviceStableFingerprint',LS_DEVICE_STABLE_ID='deviceStableId';
const buildStableFingerprint=()=>[navigator.platform||'',navigator.language||'',String(screen.width||0),String(screen.height||0),String(screen.colorDepth||0),String(navigator.hardwareConcurrency||0),Intl.DateTimeFormat().resolvedOptions().timeZone||'',navigator.userAgent.slice(0,80)].join('|');
async function sha256Short(str){try{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));return[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);}catch{let h=0;for(let i=0;i<str.length;i++)h=((h<<5)-h+str.charCodeAt(i))|0;return Math.abs(h).toString(16).padStart(8,'0');}}
export async function getOrCreateDeviceHash(){const ex=localStorage.getItem(LS_DEVICE_HASH),sF=buildStableFingerprint(),stF=localStorage.getItem(LS_DEVICE_STABLE);if(ex&&stF===sF)return ex;const salt=ex?ex.slice(0,8):Math.random().toString(36).slice(2,10),nH='dv_'+await sha256Short(sF+salt);localStorage.setItem(LS_DEVICE_HASH,nH);localStorage.setItem(LS_DEVICE_STABLE,sF);return nH;}
export async function getOrCreateDeviceStableId(){const ex=localStorage.getItem(LS_DEVICE_STABLE_ID),sF=buildStableFingerprint();if(ex)return ex;const sId='dst_'+await sha256Short(sF);localStorage.setItem(LS_DEVICE_STABLE_ID,sId);return sId;}
export const getCurrentDeviceHash=()=>localStorage.getItem(LS_DEVICE_HASH)||null;
export const getCurrentDeviceStableId=()=>localStorage.getItem(LS_DEVICE_STABLE_ID)||null;
export default{getOrCreateDeviceHash,getOrCreateDeviceStableId,getCurrentDeviceHash,getCurrentDeviceStableId};
