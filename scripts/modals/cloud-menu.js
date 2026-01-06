//=================================================
// FILE: scripts/modals/cloud-menu.js
function openCloudMenu(uid) {
  const track = W.config.tracks.find(t => t.uid === uid);

  Modal.open({
    title: `☁ ${track.title}`,
    content: 'Выберите действие',
    buttons: [
      {
        text: 'Добавить 🔒',
        action: async () => {
          await offlineManager.togglePinned(uid, true);
          toast('Трек закреплён', 'success');
        }
      },
      {
        text: 'Удалить из кэша',
        danger: true,
        action: () => {
          if (confirm('Удалить из кэша (статистика облачка будет сброшена)?')) {
            offlineManager.deleteLocal(uid);
            statsManager.resetCloud(uid);
            toast('Трек удалён из кэша', 'info');
            offlineManager.updateTrackIndicators(uid);
          }
        }
      }
    ]
  });
}
