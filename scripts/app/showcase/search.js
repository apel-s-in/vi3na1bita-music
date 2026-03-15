export async function buildShowcaseSearchDisplay({ query, ensureLyricsIndexLoaded, searchUidsByQuery, trk, ctx }) {
  const hid = new Set(ctx?.hidden || []);
  if (!query) return { type: 'normal' };
  await ensureLyricsIndexLoaded();
  const res = (searchUidsByQuery({ query }) || []).filter(trk);
  return { type: 'search', res, cOrd: ctx?.order || [], cHid: hid };
}

export function addSearchResultsToContext({ selected, trk, ctx, saveCtx, isDefault, store, clearSearch, rerender, notify }) {
  const u = [...selected].filter(trk);
  if (!u.length) return;
  if (!ctx) return;
  const s = new Set(ctx.order || []);
  u.forEach(x => { if (!s.has(x)) { ctx.order.push(x); s.add(x); } });
  saveCtx(ctx);
  clearSearch?.();
  rerender?.();
  notify?.success?.(`Добавлено ${u.length} треков`);
}

export function handleSharedShowcasePlaylist({ raw, opener }) {
  return opener?.(raw);
}

export default {
  buildShowcaseSearchDisplay,
  addSearchResultsToContext,
  handleSharedShowcasePlaylist
};
