export function bindProfileLiveBindings({ ctx, getContainer, achView }) {
  if (ctx._profLiveAchBound) return;
  ctx._profLiveAchBound = true;

  const isProfileOpen = () => ctx.getCurrentAlbum?.() === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__');

  window.addEventListener('analytics:liveTick', () => {
    const container = getContainer?.();
    if (!isProfileOpen() || !container?.isConnected) return;
    const activeTab = container.querySelector('#tab-achievements.active');
    if (!activeTab) return;
    achView.updateLiveNodes();
  });

  window.addEventListener('achievements:updated', () => {
    const container = getContainer?.();
    if (!isProfileOpen() || !container?.isConnected) return;
    const activeTab = container.querySelector('#tab-achievements.active');
    if (!activeTab) return;
    achView.render(ctx._achCurrentFilter || 'all');
  });
}

export default { bindProfileLiveBindings };
