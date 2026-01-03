// scripts/offline/track-resolver.js

import { getAudioBlob, bytesByQuality, getMeta } from './cache-db.js';

// track: { uid, urlHi, urlLo, sizeHi, sizeLo }
// pq: 'hi'|'lo'
// Возвращает: { src, via:'local'|'network', quality:'hi'|'lo', local:{quality, bytes, complete:boolean} }
export async function resolveForPlayback(track, pq) {
  const { uid, urlHi, urlLo, sizeHi, sizeLo } = track;
  const hi = await getAudioBlob(uid, 'hi');
  const lo = await getAudioBlob(uid, 'lo');

  const localHas = {
    hi: !!hi,
    lo: !!lo,
  };

  // 1) локально качество >= PQ
  if (pq === 'hi' && localHas.hi) {
    const complete = (hi.bytes || 0) >= (sizeHi || 0) && (sizeHi || 0) > 0;
    return { src: URL.createObjectURL(hi.blob), via: 'local', quality: 'hi', local: { quality: 'hi', bytes: hi.bytes, complete } };
  }
  if (pq === 'lo' && (localHas.hi || localHas.lo)) {
    // можно улучшить из Hi
    if (localHas.hi) {
      const complete = (hi.bytes || 0) >= (sizeHi || 0) && (sizeHi || 0) > 0;
      return { src: URL.createObjectURL(hi.blob), via: 'local', quality: 'hi', local: { quality: 'hi', bytes: hi.bytes, complete } };
    }
    const complete = (lo.bytes || 0) >= (sizeLo || 0) && (sizeLo || 0) > 0;
    return { src: URL.createObjectURL(lo.blob), via: 'local', quality: 'lo', local: { quality: 'lo', bytes: lo.bytes, complete } };
  }

  // 2) сеть = PQ (если есть URL и политика позволит — проверит QueueManager)
  if (pq === 'hi' && urlHi) {
    return { src: urlHi, via: 'network', quality: 'hi', local: null };
  }
  if (pq === 'lo' && urlLo) {
    return { src: urlLo, via: 'network', quality: 'lo', local: null };
  }

  // 3) локально < PQ — только как fallback
  if (pq === 'hi' && localHas.lo) {
    const complete = (lo.bytes || 0) >= (sizeLo || 0) && (sizeLo || 0) > 0;
    return { src: URL.createObjectURL(lo.blob), via: 'local', quality: 'lo', local: { quality: 'lo', bytes: lo.bytes, complete } };
  }

  // 4) иначе — недоступно
  return { src: null, via: 'none', quality: pq, local: null };
}
