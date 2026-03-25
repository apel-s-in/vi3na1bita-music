export const bindProfileAccount = ({ container: c, profile, metaDB, onProfileChanged } = {}) => {
  if (!c || !profile) return () => {};

  const nInp = c.querySelector('#prof-name-inp');
  const pencilBtn = c.querySelector('#prof-name-edit');
  const avatarBtn = c.querySelector('#prof-avatar-btn');
  const levelEl = () => c.querySelector('#prof-meta-level');

  const syncLevelMeta = () => {
    const el = levelEl();
    if (el) el.textContent = `⭐ Уровень: ${window.achievementEngine?.profile?.level || 1}`;
  };

  const saveName = async () => {
    if (!nInp) return;
    const newName = nInp.value.trim() || 'Слушатель';
    profile.name = newName;
    nInp.classList.add('name-inactive');
    nInp.blur();
    await metaDB?.setGlobal?.('user_profile', profile).catch(() => {});
    window.NotificationSystem?.success?.('Имя сохранено');
    onProfileChanged?.();
    syncLevelMeta();
  };

  if (nInp) {
    nInp.removeAttribute('readonly');
    nInp.classList.add('name-inactive');

    nInp.addEventListener('blur', saveName);
    nInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveName(); }
      if (e.key === 'Escape') {
        nInp.value = profile.name || 'Слушатель';
        nInp.classList.add('name-inactive');
        nInp.blur();
      }
    });
    nInp.addEventListener('focus', () => nInp.classList.remove('name-inactive'));
  }

  pencilBtn?.addEventListener('click', () => {
    if (!nInp) return;
    nInp.classList.remove('name-inactive');
    requestAnimationFrame(() => {
      nInp.focus();
      const len = nInp.value.length;
      nInp.setSelectionRange(len, len);
    });
  });

  avatarBtn && (avatarBtn.onclick = () => {
    const AVA_ITEMS = ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎','🎵','🌟','🦁','🐯','🦊','🎮','🎤','🎹','🥁','🎺','🔄'];
    window.Utils?.profileModals?.avatarPicker?.({
      title: 'Аватар профиля',
      items: AVA_ITEMS,
      onPick: async (v, m) => {
        const isReset = v === '🔄';
        profile.avatar = isReset ? '😎' : v;
        if (avatarBtn) avatarBtn.textContent = profile.avatar;
        await metaDB?.setGlobal?.('user_profile', profile).catch(() => {});
        m?.remove?.();
        onProfileChanged?.();
        if (isReset) window.NotificationSystem?.info?.('Аватар сброшен');
      }
    });
  });

  syncLevelMeta();
  window.addEventListener('achievements:updated', syncLevelMeta);

  return () => {
    window.removeEventListener('achievements:updated', syncLevelMeta);
  };
};

export default { bindProfileAccount };
