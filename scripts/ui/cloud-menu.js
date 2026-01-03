// scripts/ui/cloud-menu.js
// Меню для ☁ (ТЗ 9.6: “Добавить 🔒” / “Удалить из кэша” + сброс статистики)

import offlineManager from '../utils/offline-manager.js';
import { showToast } from './notify.js';

function showCloudMenu(uid, anchorElement) {
  const menu = Utils.createModal({
    title: 'Cloud ☁ для трека',
    content: `
      <button id="add-pinned">Добавить замочек 🔒</button>
      <button id="delete-cloud" class="danger">Удалить из кэша (статистика будет сброшена)</button>
    `,
    small: true,
    positionNear: anchorElement // Если Utils поддерживает, иначе центр
  });

  menu.show();

  menu.querySelector('#add-pinned').onclick = async () => {
    await offlineManager.setPinned(uid, true); // pinned=true, не сбрасывает статистику
    showToast('Трек добавлен в pinned 🔒');
    menu.close();
    // TODO: перерендер трек-листа
  };

  menu.querySelector('#delete-cloud').onclick = async () => {
    if (confirm('Удалить из кэша? Статистика cloud будет сброшена.')) {
      await offlineManager.setCloud(uid, false); // Сброс cloudStats (ТЗ 9.6 + уточнение)
      showToast('Трек удалён из cloud. Статистика сброшена.');
      menu.close();
      // TODO: перерендер трек-листа, не прерывать если CUR играет (ТЗ 9.6)
    }
  };
}

export { showCloudMenu };
