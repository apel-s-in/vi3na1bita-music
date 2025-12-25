// @ts-check
/**
 * scripts/e2e/utils.js
 * Общие хелперы для Playwright e2e, чтобы не дублировать код в spec-файлах.
 */

export const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

export async function loginByPromo(page, promo = 'VITRINA2025') {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', promo);
  await page.click('#promo-btn');
  await page.waitForSelector('#main-block:not(.hidden)', { timeout: 10000 });
}

export async function waitTracks(page) {
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
}

export async function likeFirstTrack(page) {
  await waitTracks(page);
  const first = page.locator('#track-list .track').first();
  await first.hover();
  await first.locator('.like-star').click();
}

export async function openFavorites(page) {
  await page.click('.album-icon[data-akey="__favorites__"]');
  await waitTracks(page);
}

export async function playFirstTrack(page) {
  await waitTracks(page);
  await page.click('#track-list .track >> nth=0');
  await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });
}

/**
 * Записать PlayerState в localStorage в uid-формате (V2).
 * Берём playingAlbum из AlbumsManager, а uid/sourceAlbum из текущего трека.
 */
export async function seedPlayerStateV2FromCurrent(page, opts = {}) {
  const position = typeof opts.position === 'number' ? opts.position : 5;
  const wasPlaying = typeof opts.wasPlaying === 'boolean' ? opts.wasPlaying : true;

  await page.evaluate(({ position, wasPlaying }) => {
    const pc = window.playerCore;
    const track = pc?.getCurrentTrack?.() || null;

    const albumKey = window.AlbumsManager?.getPlayingAlbum?.() || null;

    const st = {
      album: albumKey,
      currentAlbum: window.AlbumsManager?.getCurrentAlbum?.() || albumKey,
      trackUid: String(track?.uid || '').trim() || null,
      sourceAlbum: String(track?.sourceAlbum || '').trim() || null,
      trackIndex: typeof pc?.getIndex === 'function' ? (pc.getIndex() || 0) : 0,
      position: Math.floor(position),
      volume: typeof pc?.getVolume === 'function' ? (pc.getVolume() ?? 100) : 100,
      wasPlaying: !!wasPlaying
    };

    localStorage.setItem('playerStateV2', JSON.stringify(st));
  }, { position, wasPlaying });
}
