import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';

const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

export const openBackupInfoModal = () => window.Modals?.open?.({
  title: 'Что сохраняется в backup',
  maxWidth: 480,
  bodyHtml: `<div class="modal-confirm-text">Backup хранит общий прогресс аккаунта и данные синхронизации.<br><br>Внутрь входят:<ul style="margin:10px 0 0 18px;color:#eaf2ff;line-height:1.5"><li>статистика и event log</li><li>достижения, XP, стрики</li><li>локальный профиль</li><li>избранное и плейлисты</li><li>часть настроек интерфейса и player state</li><li>внутренние intel/store данные</li><li>реестр устройств и привязка к владельцу Яндекса</li></ul><div style="margin-top:12px;color:#9db7dd">Архитектурно проект уже движется к более чистому разделению account-shared и device-local данных. Восстановление разрешено только под тем же Яндекс-аккаунтом владельца backup.</div></div>`
});

export const openBackupFoundModal = m => {
  const lI = getLocalBackupUiSnapshot({ name: 'Слушатель' });
  const c = compareLocalVsCloud(lI, m || {});
  const cL = getBackupCompareLabel(lI, m || {});
  const dev = [m?.sourceDeviceLabel, m?.sourceDeviceClass, m?.sourcePlatform].filter(Boolean).join(' · ');
  window.Modals?.open?.({
    title: 'Облачная копия найдена',
    maxWidth: 460,
    bodyHtml: `<div class="modal-confirm-text"><b>Статус:</b> копия доступна<br><b>Дата:</b> ${m?.timestamp ? new Date(m.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br><b>Профиль:</b> ${esc(m?.profileName || 'Слушатель')}<br><b>Устройство:</b> ${esc(dev || 'не указано')}<br><b>Версия приложения:</b> ${esc(m?.appVersion || 'unknown')}<br><b>Размер:</b> ${esc(m?.sizeHuman || 'unknown')}<br><b>Сравнение:</b> ${esc(cL)}<br><b>Тип:</b> ${esc(c.state)}<br>${m?.historyPath ? `<b>История:</b> версионированный backup сохранён<br>` : ''}<br><span style="color:#9db7dd">Копия хранится в личной папке приложения на Яндекс Диске и привязана к аккаунту владельца.</span></div>`
  });
};

export default { openBackupInfoModal, openBackupFoundModal };
