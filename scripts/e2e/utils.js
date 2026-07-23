// scripts/e2e/utils.js @ts-check
import { expect } from '@playwright/test';

export const BASE=process.env.BASE_URL||'http://127.0.0.1:4173';

const HOWLER_MOCK=`(()=>{let globalVolume=1;class MockHowl{constructor(options={}){this.options=options;this._playing=false;this._position=0;this._duration=240;this._volume=Number(options.volume??1);this._events=new Map();queueMicrotask(()=>options.onload?.());if(options.autoplay)queueMicrotask(()=>this.play())}play(){if(this._playing)return 1;this._playing=true;queueMicrotask(()=>this.options.onplay?.());this._emit('play');return 1}pause(){if(!this._playing)return this;this._playing=false;queueMicrotask(()=>this.options.onpause?.());this._emit('pause');return this}stop(){const wasPlaying=this._playing;this._playing=false;this._position=0;if(wasPlaying){queueMicrotask(()=>this.options.onstop?.());this._emit('stop')}return this}unload(){this._playing=false;this._events.clear();return null}playing(){return this._playing}seek(value){if(value===undefined)return this._position;this._position=Math.max(0,Number(value)||0);this.options.onseek?.();this._emit('seek');return this}duration(){return this._duration}state(){return'loaded'}volume(value){if(value===undefined)return this._volume;this._volume=Number(value)||0;return this}mute(){return this}rate(){return 1}loop(){return false}on(name,fn){if(typeof fn==='function'){const rows=this._events.get(name)||[];rows.push(fn);this._events.set(name,rows)}return this}once(name,fn){const wrap=(...args)=>{this.off(name,wrap);fn(...args)};return this.on(name,wrap)}off(name,fn){if(!name){this._events.clear();return this}if(!fn){this._events.delete(name);return this}this._events.set(name,(this._events.get(name)||[]).filter(row=>row!==fn));return this}_emit(name,...args){(this._events.get(name)||[]).forEach(fn=>fn(...args))}}window.Howl=MockHowl;window.Howler={version:'e2e-mock',ctx:{state:'running',resume:()=>Promise.resolve(),addEventListener:()=>{}},masterGain:null,volume(value){if(value===undefined)return globalVolume;globalVolume=Number(value)||0;return this},mute(value){if(value)globalVolume=0;return this},stop(){return this},_howls:[]};})();`;

const installAudioMock=async page=>{
  if(page.__vi3AudioMockInstalled)return;
  page.__vi3AudioMockInstalled=true;
  await page.route('**/scripts/vendor/howler.min.js',route=>route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:HOWLER_MOCK}));
};

export const waitForAppReady=async(page,{timeout=20000}={})=>{
  await expect.poll(
    () => page.evaluate(() => window.__appReady === true),
    {
      timeout,
      intervals: [100,200,500],
      message: 'Приложение не завершило initialize()'
    }
  ).toBe(true);
};

export const loginByPromo=async(page,promocode='VITRINA2025')=>{
  await installAudioMock(page);
  await page.goto(`${BASE}/index.html`,{waitUntil:'load'});
  await page.fill('#promo-inp',promocode);
  await page.click('#promo-btn');
  await page.waitForSelector('#main-block:not(.hidden)',{timeout:10000});
  await waitForAppReady(page);
  await page.waitForSelector('#album-icons-albums .album-icon',{timeout:10000});
  await page.waitForSelector('#album-icons-nav .album-icon',{timeout:10000});
  await page.waitForSelector('#track-list .track',{timeout:10000});
};

export const waitTracks=async page=>page.waitForSelector('#track-list .track',{timeout:10000});
export const waitForPlayback=async page=>{
  await expect.poll(
    () => page.evaluate(() =>
      window.playerCore?.isPlaying?.() === true
    ),
    {
      timeout: 10000,
      intervals: [50, 100, 200],
      message: 'PlayerCore не перешёл в playing'
    }
  ).toBe(true);
};
export const likeFirstTrack=async page=>{await waitTracks(page);const first=page.locator('#track-list .track').first();await first.hover();await first.locator('.like-star').click();};
export const openFavorites=async page=>{await page.click('.album-icon[data-akey="__favorites__"]');await waitTracks(page);};
export const playFirstTrack=async page=>{await waitTracks(page);await page.locator('#track-list .track').first().click();await page.waitForSelector('#lyricsplayerblock',{timeout:10000});await waitForPlayback(page);};
export const openSleepTimer=async page=>{await page.click('[data-testid="sleep-open"]');const modal=page.locator('.modal-bg.active').last();await expect(modal.locator('#sm-inp-min')).toBeVisible({timeout:5000});};
export const setSleepPreset=async(page,minutes)=>{const modal=page.locator('.modal-bg.active').last(),toggle=modal.locator('#sm-toggle'),switchLabel=modal.locator('.sleep-toggle-switch');if(!(await toggle.isChecked())){await switchLabel.click();await expect(toggle).toBeChecked();}await modal.locator('#sm-inp-min').fill(String(minutes));const apply=modal.locator('#sm-btn-apply');await expect(apply).toBeVisible();await apply.click();};
export const resetSleepTimer=async page=>{const modal=page.locator('.modal-bg.active').last(),toggle=modal.locator('#sm-toggle');if(await toggle.count()){if(await toggle.isChecked()){await modal.locator('.sleep-toggle-switch').click();await expect(toggle).not.toBeChecked();}const close=modal.locator('#sm-btn-close');if(await close.isVisible())await close.click();}else await page.evaluate(()=>window.SleepTimer?.stop?.(false));};
export const seedPlayerStateV2FromCurrent=async(page,{position=5,wasPlaying=true}={})=>{await page.evaluate(({position,wasPlaying})=>{const pc=window.playerCore,track=pc?.getCurrentTrack?.()||null,album=window.AlbumsManager?.getPlayingAlbum?.()||null;localStorage.setItem('playerStateV2',JSON.stringify({album,currentAlbum:window.AlbumsManager?.getCurrentAlbum?.()||album,trackUid:String(track?.uid||'').trim()||null,sourceAlbum:String(track?.sourceAlbum||'').trim()||null,trackIndex:pc?.getIndex?.()||0,position:Math.floor(position),volume:pc?.getVolume?.()??100,wasPlaying:!!wasPlaying,ts:Date.now()}));},{position,wasPlaying});};
