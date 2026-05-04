export const bindProfileLiveBindings = ({ ctx, getContainer: gC, achView: aV }) => {
  if (ctx._pLB) return; ctx._pLB = true;
  const isProfile = () => ctx.getCurrentAlbum?.() === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__') && gC?.()?.isConnected;
  const achTabActive = () => !!gC?.()?.querySelector('#tab-achievements.active');
  const renderAch = () => isProfile() && achTabActive() && aV.render(ctx._achCurrentFilter || 'available');
  const updateAch = () => isProfile() && achTabActive() && aV.updateLiveNodes();

  window.addEventListener('analytics:liveTick', updateAch);
  window.addEventListener('achievements:updated', renderAch);
  window.addEventListener('backup:restore:applied', () => setTimeout(renderAch, 120));
  window.addEventListener('profile:data:refreshed', () => setTimeout(renderAch, 120));
  window.addEventListener('profile:main-tab-selected', e => {
    if (e.detail?.tabId === 'achievements') setTimeout(renderAch, 40);
  });
};
export default { bindProfileLiveBindings };
