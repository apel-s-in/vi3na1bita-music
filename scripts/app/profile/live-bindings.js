export const bindProfileLiveBindings = ({ ctx, getContainer: gC, achView: aV }) => {
  if (ctx._pLB) return; ctx._pLB = true;
  const chk = () => ctx.getCurrentAlbum?.() === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__') && gC?.()?.isConnected && gC().querySelector('#tab-achievements.active');
  window.addEventListener('analytics:liveTick', () => chk() && aV.updateLiveNodes());
  window.addEventListener('achievements:updated', () => chk() && aV.render(ctx._achCurrentFilter || 'all'));
};
export default { bindProfileLiveBindings };
