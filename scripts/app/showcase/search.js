export const buildShowcaseSearchDisplay = async ({ query: q, ensureLyricsIndexLoaded: eL, searchUidsByQuery: sQ, trk, ctx }) => {
  if (!q) return { type: 'normal' };
  await eL();
  return { type: 'search', res: (sQ({ query: q }) || []).filter(trk), cOrd: ctx?.order || [], cHid: new Set(ctx?.hidden || []) };
};

export const addSearchResultsToContext = ({ selected: s, trk, ctx: c, saveCtx: sC, clearSearch: cS, rerender: r, notify: n }) => {
  const u = [...s].filter(trk); if (!u.length || !c) return;
  const set = new Set(c.order || []);
  u.forEach(x => !set.has(x) && (c.order.push(x), set.add(x)));
  sC(c); cS?.(); r?.(); n?.success?.(`Добавлено ${u.length} треков`);
};

export const handleSharedShowcasePlaylist = ({ raw, opener }) => opener?.(raw);
export default { buildShowcaseSearchDisplay, addSearchResultsToContext, handleSharedShowcasePlaylist };
