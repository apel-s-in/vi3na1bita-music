import { renderCloudSectionCard, renderModalNote } from './profile-render-kit.js';
import { renderYandexActionGrid } from './cloud-action-render-kit.js';

export const openBackupInfoModal = () => window.Modals?.open?.({
  title: 'Что синхронизируется',
  maxWidth: 400,
  bodyHtml: `${renderModalNote({ text: 'Backup v7.1 передаёт только новые immutable ranges и небольшие account/device документы.', style: 'margin:0 0 14px' })}${renderCloudSectionCard({ title: 'Общие данные аккаунта', body: '<ul style="margin:0 0 0 18px;color:#eaf2ff;line-height:1.5"><li>пользовательские плейлисты</li><li>подробные локальные listening events</li><li>rebuildable-статистика по устройствам и трекам</li></ul><div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.4">Избранное, достижения, Осколки, Преданность, playback ownership и серверные устройства хранятся отдельно на сервере.</div>' })}${renderCloudSectionCard({ title: 'Настройки устройства', style: 'margin-top:10px', body: renderModalNote({ html: 'Настройки текущей установки сохраняются в <b>app:/Backup/v7/devices/&lt;deviceId&gt;/settings.json</b>. Физические аудиофайлы не передаются.', style: 'margin:0' }) })}${renderCloudSectionCard({ title: 'Быстрые действия', style: 'margin-top:10px', body: renderYandexActionGrid([['save-backup', '☁️ Синхронизировать сейчас'], ['sync-log', '📜 Журнал синхронизации']]) })}`
});

export default { openBackupInfoModal };
