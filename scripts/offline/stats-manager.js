// scripts/offline/stats-manager.js

import { getGlobalStats } from './cache-db.js';

export async function getPopularTracks({ allUids, minFullListens = 3, getTitleByUid }) {
  const out = [];
  for (const uid of allUids()) {
    const s = await getGlobalStats(uid);
    if ((s.totalFullListens || 0) >= minFullListens) {
      out.push({
        uid,
        title: getTitleByUid(uid),
        fullListens: s.totalFullListens || 0,
        totalPlayMs: s.totalPlayMs || 0,
      });
    }
  }
  // сортировка по убыванию fullListens
  out.sort((a, b) => (b.fullListens - a.fullListens) || (b.totalPlayMs - a.totalPlayMs));
  return out;
}

export function formatTotalTime(ms) {
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return { days: d, hours: h, minutes: m };
}
