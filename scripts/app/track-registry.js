const _tr=new Map(),_alb=new Map(),_cfg=new Map(),_albTr=new Map(),_pHlth=new Map();
const toUrl=(b,r)=>{try{const cB=String(b).replace(/\/+$/,'')+'/';return/^https?:\/\//i.test(cB)&&r?new URL(String(r).replace(/^(\.\/|\/)+/,''),cB).toString():null;}catch{return null;}};
const getSrcOrd=()=>((localStorage.getItem('sourcePref')||(window.location?.hostname.includes('yandexcloud.net')?'yandex':'github'))==='github'?['github','yandex']:['yandex','github']);
const isHlthy=s=>!_pHlth.has(s)||(Date.now()-_pHlth.get(s).at>(_pHlth.get(s).ok?36e5:3e4))||_pHlth.get(s).ok;
const mark=(s,ok)=>_pHlth.set(s,{ok,at:Date.now()});
async function fetchFall(bs,p,t=6e3){for(const s of getSrcOrd()){if(!isHlthy(s)||!bs[s])continue;try{const c=new AbortController(),id=setTimeout(()=>c.abort(),t),r=await(window.NetPolicy?.guardedFetch?.(bs[s].replace(/\/+$/,'')+'/'+p.replace(/^\/+/,''),{cache:'force-cache',signal:c.signal})||fetch(bs[s].replace(/\/+$/,'')+'/'+p.replace(/^\/+/,''),{cache:'force-cache',signal:c.signal}));clearTimeout(id);if(!r.ok)throw new Error(`HTTP ${r.status}`);mark(s,true);return{json:await r.json(),src:s,base:bs[s]};}catch{mark(s,false);}}return null;}
export const getAudioCandidates = uid => {
  const track = _tr.get(String(uid || '').trim());
  const config = _cfg.get(track?.sourceAlbum);
  if (!track || !config?.bases || !track.rel_audio_low) return [];
  const album = (window.albumsIndex || []).find(item => item.key === track.sourceAlbum);
  const path = track.rel_audio_low;
  const archivePath = album?.archive_flat ? path.split('/').pop() : path;
  return [
    { provider: 'archive', url: album?.archive_base ? toUrl(album.archive_base, archivePath) : null },
    { provider: 'github', url: toUrl(config.bases.github || '', path) },
    { provider: 'yandex', url: toUrl(config.bases.yandex || '', path) }
  ].filter(item => item.url);
};
export const fetchAudioBlob = async (uid, { signal, timeoutMs = 45000 } = {}) => {
  let lastError = new Error('audio_source_unavailable');
  for (const candidate of getAudioCandidates(uid)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) throw new Error('network_not_allowed');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const options = { signal: controller.signal, redirect: 'follow' };
      const response = await (window.NetPolicy?.guardedFetch?.(candidate.url, options) || fetch(candidate.url, options));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (type.includes('text/html') || type.includes('application/json')) throw new Error('invalid_audio_response');
      const blob = await response.blob();
      if (!blob.size) throw new Error('empty_audio');
      return { ...candidate, blob, quality: 'lo' };
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      lastError = error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  throw lastError;
};
export const getSmartUrlInfo = async (uid, prop = 'audio', q = 'lo') => {
  if (prop === 'audio') return getAudioCandidates(uid)[0] || null;
  const track = _tr.get(String(uid || '').trim());
  const config = _cfg.get(track?.sourceAlbum);
  const path = prop === 'lyrics' ? track?.rel_lyrics : track?.rel_fulltext;
  if (!config?.bases || !path) return null;
  for (const provider of getSrcOrd()) {
    const url = toUrl(config.bases[provider], path);
    if (url) return { url, provider };
  }
  return null;
};
export const registerTrack=(t,aM)=>{const u=String(t?.uid||'').trim();if(!u)return;_tr.set(u,{uid:u,title:t.title||'Трек',audio:t.audio||null,audio_low:t.audio_low||null,src:t.audio||null,size:t.size||0,size_low:t.size_low||0,lyrics:t.lyrics||null,fulltext:t.fulltext||null,sourceAlbum:t.sourceAlbum||null,album:aM?.title||null,rel_audio:t.rel_audio||null,rel_audio_low:t.rel_audio_low||null,rel_lyrics:t.rel_lyrics||null,rel_fulltext:t.rel_fulltext||null});if(t.sourceAlbum&&aM?.title)_alb.set(t.sourceAlbum,aM.title);};
export const getTrackByUid=u=>_tr.get(String(u||'').trim())||null;
export const getAllUids=()=>[..._tr.keys()];
export const getAlbumTitle=k=>_alb.get(k)||null;
export const getAlbumConfig=k=>_cfg.get(k)||null;
export const getTracksForAlbum=k=>_albTr.get(k)||[];
export const getTrackProfilePreview=uid=>window.Intel?.trackProfiles?.getPreview?.(uid)||null;
export const hasTrackProfile=uid=>!!getTrackProfilePreview(uid);
export const getTrackProfile=async uid=>await window.Intel?.trackProfiles?.getProfile?.(uid)||null;
export const ensurePopulated=async()=>window.Utils.func.memoAsyncOnce('app:track-registry:populate',async()=>{if(!window.albumsIndex?.length)try{await window.Utils?.onceEvent?.(window,'albumsIndex:ready',{timeoutMs:5e3});}catch{}await Promise.allSettled((window.albumsIndex||[]).filter(a=>!a.key.startsWith('__')).map(async a=>{try{const bs={yandex:a.yandex_base?`${a.yandex_base.replace(/\/$/,'')}/`:'',github:a.github_base?`${a.github_base.replace(/\/$/,'')}/`:''},cK=`tr:cfg:${a.key}`,c=window.Utils?.fetchCache?.get?.(cK,432e6,'session'),r=c?c:await fetchFall(bs,'config.json',6e3);if(!r)return;if(!c)window.Utils?.fetchCache?.set?.(cK,{json:r.json,src:r.src,base:r.base},'session');const tit=r.json.albumName||a.title;_alb.set(a.key,tit);_cfg.set(a.key,{title:tit,bases:bs,activeSrc:r.src,artist:r.json.artist||'Витрина Разбита',links:(r.json.social_links||r.json.socials||[]).map(s=>({label:s.title||s.label,url:s.url}))});_albTr.set(a.key,(r.json.tracks||[]).map((t,i)=>{const hi=toUrl(r.base,t.audio),lo=toUrl(r.base,t.audio_low),u=String(t.uid||'').trim()||null;if(u)registerTrack({uid:u,title:t.title,audio:hi,audio_low:lo,size:t.size,size_low:t.size_low,lyrics:toUrl(r.base,t.lyrics),fulltext:toUrl(r.base,t.fulltext),sourceAlbum:a.key,rel_audio:t.audio,rel_audio_low:t.audio_low,rel_lyrics:t.lyrics,rel_fulltext:t.fulltext},{title:tit});return{num:i+1,title:t.title||`Трек ${i+1}`,uid:u,src:hi,sources:hi||lo?{audio:{hi,lo}}:null,lyrics:toUrl(r.base,t.lyrics),fulltext:toUrl(r.base,t.fulltext),hasLyrics:t.hasLyrics??!!t.lyrics};}));}catch{}}));});
export const resetSourceCache=()=>{_pHlth.clear();_tr.clear();_alb.clear();_cfg.clear();_albTr.clear();try{Object.keys(sessionStorage).filter(k=>k.startsWith('tr:cfg:')).forEach(k=>sessionStorage.removeItem(k));}catch{}};
window.TrackRegistry={getAudioCandidates,fetchAudioBlob,registerTrack,getTrackByUid,getAllUids,getAlbumTitle,ensurePopulated,getAlbumConfig,getTracksForAlbum,getSmartUrlInfo,resetSourceCache,hasTrackProfile,getTrackProfilePreview,getTrackProfile};
export default window.TrackRegistry;
