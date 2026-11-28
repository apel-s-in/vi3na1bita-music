import { getAudioSourceOrder } from '../core/audio-source-policy.js';

const _tr=new Map(),_alb=new Map(),_cfg=new Map(),_albTr=new Map(),_pHlth=new Map();
const toUrl=(b,r)=>{try{const cB=String(b).replace(/\/+$/,'')+'/';return/^https?:\/\//i.test(cB)&&r?new URL(String(r).replace(/^(\.\/|\/)+/,''),cB).toString():null;}catch{return null;}};
const getSrcOrd = () => ['cloudru', 'yandex'];
const getJsDelivrBase = album => {
  const repo = String(album?.jsdelivr_repo || '').trim();
  const commit = String(album?.jsdelivr_commit || '').trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && /^[a-f0-9]{40}$/i.test(commit)
    ? `https://cdn.jsdelivr.net/gh/${repo}@${commit}/`
    : '';
};
async function fetchFall(bases, path, timeoutMs = 8000) {
  for (const source of getSrcOrd()) {
    if (!bases[source]) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = toUrl(bases[source], path);
      const options = { cache: 'force-cache', signal: controller.signal };
      const response = await (window.NetPolicy?.guardedFetch?.(url, options) || fetch(url, options));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json?.tracks)) throw new Error('invalid_album_config');
      return { json, src: source, base: bases[source] };
    } catch {} finally { clearTimeout(timer); }
  }
  return null;
}
export const getAudioCandidates = uid => {
  const track = _tr.get(String(uid || '').trim());
  const config = _cfg.get(track?.sourceAlbum);
  if (!track || !config?.bases || !track.rel_audio_low) return [];
  const album = (window.albumsIndex || []).find(item => item.key === track.sourceAlbum);
  const path = track.rel_audio_low;
  const archivePath = album?.archive_flat ? path.split('/').pop() : path;
  const jsdelivrBase = getJsDelivrBase(album);
  const candidates = [
    { provider: 'archive', url: album?.archive_base ? toUrl(album.archive_base, archivePath) : null },
    { provider: 'jsdelivr', url: jsdelivrBase ? toUrl(jsdelivrBase, path) : null },
    { provider: 'github', url: toUrl(config.bases.github || '', path) },
    { provider: 'cloudru', url: toUrl(config.bases.cloudru || '', path) },
    { provider: 'yandex', url: toUrl(config.bases.yandex || '', path) }
  ].filter(item => item.url);
  return getAudioSourceOrder().map(provider => candidates.find(item => item.provider === provider)).filter(Boolean);
};
export const fetchAudioBlob = async (uid, { signal, timeoutMs = 45000 } = {}) => {
  let lastError = new Error('audio_source_unavailable');
  const attempted = new Set();
  while (true) {
    const candidate = getAudioCandidates(uid).find(item => !attempted.has(item.url));
    if (!candidate) break;
    attempted.add(candidate.url);
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
      if (blob.size < 1024) throw new Error('invalid_audio_size');
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
export const getStaticCandidates = (uid, prop = 'lyrics') => {
  const track = _tr.get(String(uid || '').trim());
  const config = _cfg.get(track?.sourceAlbum);
  const path = prop === 'lyrics' ? track?.rel_lyrics : track?.rel_fulltext;
  if (!config?.bases || !path) return [];
  return getSrcOrd().map(provider => ({ provider, url: toUrl(config.bases[provider], path) })).filter(item => item.url);
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
export const ensurePopulated=async()=>window.Utils.func.memoAsyncOnce('app:track-registry:populate',async()=>{if(!window.albumsIndex?.length)try{await window.Utils?.onceEvent?.(window,'albumsIndex:ready',{timeoutMs:5e3});}catch{}await Promise.allSettled((window.albumsIndex||[]).filter(a=>!a.key.startsWith('__')).map(async a=>{try{const bs={cloudru:a.cloudru_base||`https://vi3na1bita.s3.cloud.ru/albums/${encodeURIComponent(a.key)}/`,yandex:a.yandex_base?`${a.yandex_base.replace(/\/$/,'')}/`:'',github:a.github_base?`${a.github_base.replace(/\/$/,'')}/`:''},revision=String(a.config_revision||'').trim(),configPath=revision?`config.json?config_revision=${encodeURIComponent(revision)}`:'config.json',cK=`tr:cfg:cloudru-v1:${a.key}${revision?`:${revision}`:''}`,c=window.Utils?.fetchCache?.get?.(cK,432e6,'session'),r=c?c:await fetchFall(bs,configPath,6e3);if(!r)return;if(!c)window.Utils?.fetchCache?.set?.(cK,{json:r.json,src:r.src,base:r.base},'session');const tit=r.json.albumName||a.title;_alb.set(a.key,tit);_cfg.set(a.key,{title:tit,bases:bs,activeSrc:r.src,artist:r.json.artist||'Витрина Разбита',links:(r.json.social_links||r.json.socials||[]).map(s=>({label:s.title||s.label,url:s.url}))});_albTr.set(a.key,(r.json.tracks||[]).map((t,i)=>{const hi=null,lo=toUrl(bs.cloudru,t.audio_low),u=String(t.uid||'').trim()||null;if(u)registerTrack({uid:u,title:t.title,audio:lo,audio_low:lo,size:t.size,size_low:t.size_low,lyrics:toUrl(bs.cloudru,t.lyrics),fulltext:toUrl(bs.cloudru,t.fulltext),sourceAlbum:a.key,rel_audio:t.audio,rel_audio_low:t.audio_low,rel_lyrics:t.lyrics,rel_fulltext:t.fulltext},{title:tit});return{num:i+1,title:t.title||`Трек ${i+1}`,uid:u,src:lo,sources:lo?{audio:{hi:null,lo}}:null,lyrics:toUrl(bs.cloudru,t.lyrics),fulltext:toUrl(bs.cloudru,t.fulltext),hasLyrics:t.hasLyrics??!!t.lyrics};}));}catch{}}));});
export const resetSourceCache=()=>{_pHlth.clear();_tr.clear();_alb.clear();_cfg.clear();_albTr.clear();try{Object.keys(sessionStorage).filter(k=>k.startsWith('tr:cfg:')).forEach(k=>sessionStorage.removeItem(k));}catch{}};
window.TrackRegistry={getStaticCandidates,getAudioCandidates,fetchAudioBlob,registerTrack,getTrackByUid,getAllUids,getAlbumTitle,ensurePopulated,getAlbumConfig,getTracksForAlbum,getSmartUrlInfo,resetSourceCache,hasTrackProfile,getTrackProfilePreview,getTrackProfile};
export default window.TrackRegistry;
