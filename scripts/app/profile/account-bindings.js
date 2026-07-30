export const bindProfileAccount = ({ container: c, profile, metaDB, onProfileChanged } = {}) => {
  if (!c || !profile) return () => {};
  const nInp = c.querySelector('#prof-name-inp'), pencilBtn = c.querySelector('#prof-name-edit'), avatarBtn = c.querySelector('#prof-avatar-btn'), shardsEl = () => c.querySelector('#prof-meta-shards');

  const syncShardMeta = () => {
    const el = shardsEl();
    const wallet = window.ShardWallet?.getSnapshot?.();
    if (el) {
      el.textContent = wallet?.available
        ? `♦ Осколки: ${Number(wallet.shards || 0)}`
        : '♦ Осколки: нужен вход через Яндекс';
    }
  };

  const saveName = async () => {
    if (!nInp) return;
    profile.name = nInp.value.trim() || 'Слушатель';
    profile.updatedAt = Date.now();
    profile.createdAt ||= profile.updatedAt;
    nInp.classList.add('name-inactive'); nInp.blur();
    await metaDB?.setGlobal?.('user_profile', profile).catch(() => {});
    try { window.eventLogger?.log?.('PROFILE_UPDATED', null, { field: 'name', value: profile.name }); window.dispatchEvent(new CustomEvent('backup:domain-dirty',{detail:{domain:'profile',immediate:true}})); } catch {}
    window.NotificationSystem?.success?.('Имя сохранено'); onProfileChanged?.(); syncShardMeta();
  };

  if (nInp) {
    nInp.removeAttribute('readonly'); nInp.classList.add('name-inactive');
    nInp.addEventListener('blur', saveName);
    nInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } if (e.key === 'Escape') { nInp.value = profile.name || 'Слушатель'; nInp.classList.add('name-inactive'); nInp.blur(); } });
    nInp.addEventListener('focus', () => nInp.classList.remove('name-inactive'));
  }

  pencilBtn?.addEventListener('click', () => { if (!nInp) return; nInp.classList.remove('name-inactive'); requestAnimationFrame(() => { nInp.focus(); nInp.setSelectionRange(nInp.value.length, nInp.value.length); }); });

  if (avatarBtn) avatarBtn.onclick = () => {
    const purchased = window.ShardWallet
      ?.getSnapshot?.()
      ?.purchasedAvatars || [];

    const items = [
      '😎',
      '🎧',
      '💔',
      ...purchased.map(item => item.avatar),
      '🔄'
    ];

    return window.Utils?.profileModals?.avatarPicker?.({
    title: 'Аватар профиля', items: [...new Set(items)],
    onPick: async (v, m) => {
      const isReset = v === '🔄'; profile.avatar = isReset ? '😎' : v; profile.updatedAt = Date.now(); profile.createdAt ||= profile.updatedAt; avatarBtn.textContent = profile.avatar;
      await metaDB?.setGlobal?.('user_profile', profile).catch(() => {});
      try { window.eventLogger?.log?.('PROFILE_UPDATED', null, { field: 'avatar', reset: isReset, value: profile.avatar }); window.dispatchEvent(new CustomEvent('backup:domain-dirty',{detail:{domain:'profile',immediate:true}})); } catch {}
      m?.remove?.(); onProfileChanged?.(); if (isReset) window.NotificationSystem?.info?.('Аватар сброшен');
    }
  });
  };

  syncShardMeta();
  window.addEventListener('shards:wallet-updated', syncShardMeta);
  return () =>
    window.removeEventListener(
      'shards:wallet-updated',
      syncShardMeta
    );
};
export default { bindProfileAccount };
