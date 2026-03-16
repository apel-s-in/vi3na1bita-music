// @ts-check
export const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

export const loginByPromo = async (page, promo = 'VITRINA2025') => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', promo); await page.click('#promo-btn');
  await page.waitForSelector('#main-block:not(.hidden)', { timeout: 10000 });
};

export const waitTracks = async page => page.waitForSelector('#track-list .track', { timeout: 10000 });

export const likeFirstTrack = async page => { await waitTracks(page); const f = page.locator('#track-list .track').first(); await f.hover(); await f.locator('.like-star').click(); };

export const openFavorites = async page => { await page.click('.album-icon[data-akey="__favorites__"]'); await waitTracks(page); };

export const playFirstTrack = async page => { await waitTracks(page); await page.click('#track-list .track >> nth=0'); await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 }); };

export const openSleepTimer = async page => page.click('[data-testid="sleep-open"]');
export const setSleepPreset = async (page, mins) => page.click(`[data-testid="sleep-preset-${mins}"]`);
export const resetSleepTimer = async page => page.click('[data-testid="sleep-reset"]');

export const seedPlayerStateV2FromCurrent = async (page, { position = 5, wasPlaying = true } = {}) => {
  await page.evaluate(({ p, wP }) => {
    const pc = window.playerCore, t = pc?.getCurrentTrack?.() || null, aK = window.AlbumsManager?.getPlayingAlbum?.() || null;
    localStorage.setItem('playerStateV2', JSON.stringify({ album: aK, currentAlbum: window.AlbumsManager?.getCurrentAlbum?.() || aK, trackUid: String(t?.uid || '').trim() || null, sourceAlbum: String(t?.sourceAlbum || '').trim() || null, trackIndex: pc?.getIndex?.() || 0, position: Math.floor(p), volume: pc?.getVolume?.() ?? 100, wasPlaying: !!wP }));
  }, { p: position, wP: wasPlaying });
};
