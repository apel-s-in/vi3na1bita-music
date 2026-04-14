// scripts/e2e/utils.js @ts-check
export const BASE=process.env.BASE_URL||'http://127.0.0.1:4173';
export const loginByPromo=async(p,pr='VITRINA2025')=>{await p.goto(`${BASE}/index.html`,{waitUntil:'load'});await p.fill('#promo-inp',pr);await p.click('#promo-btn');await p.waitForSelector('#main-block:not(.hidden)',{timeout:1e4})};
export const waitTracks=async p=>p.waitForSelector('#track-list .track',{timeout:1e4});
export const likeFirstTrack=async p=>{await waitTracks(p);const f=p.locator('#track-list .track').first();await f.hover();await f.locator('.like-star').click()};
export const openFavorites=async p=>{await p.click('.album-icon[data-akey="__favorites__"]');await waitTracks(p)};
export const playFirstTrack=async p=>{await waitTracks(p);await p.click('#track-list .track >> nth=0');await p.waitForSelector('#lyricsplayerblock',{timeout:1e4})};
export const openSleepTimer=async p=>p.click('[data-testid="sleep-open"]');
export const setSleepPreset=async(p,m)=>p.click(`[data-testid="sleep-preset-${m}"]`);
export const resetSleepTimer=async p=>p.click('[data-testid="sleep-reset"]');
export const seedPlayerStateV2FromCurrent=async(p,{position:ps=5,wasPlaying:wP=true}={})=>{await p.evaluate(({p,wP})=>{const pc=window.playerCore,t=pc?.getCurrentTrack?.()||null,aK=window.AlbumsManager?.getPlayingAlbum?.()||null;localStorage.setItem('playerStateV2',JSON.stringify({album:aK,currentAlbum:window.AlbumsManager?.getCurrentAlbum?.()||aK,trackUid:String(t?.uid||'').trim()||null,sourceAlbum:String(t?.sourceAlbum||'').trim()||null,trackIndex:pc?.getIndex?.()||0,position:Math.floor(p),volume:pc?.getVolume?.()??100,wasPlaying:!!wP}))},{p:ps,wP})};
