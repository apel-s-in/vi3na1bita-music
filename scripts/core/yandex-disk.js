// scripts/core/yandex-disk.js
// Сохранение прогресса в app:/ + стабильное чтение только через Cloud Function proxy.
//
// ============================================================================
// ⚠️ КРИТИЧЕСКАЯ АРХИТЕКТУРНАЯ ЗАМЕТКА — ЛОВУШКА ЯНДЕКС CLOUD GATEWAY ⚠️
// ============================================================================
// API Gateway Яндекс Облака ЖАДНО перехватывает заголовок 'Authorization'
// и пытается валидировать его как токен разработчика IAM. Если заголовок
// содержит ЛЮБОЙ токен (включая OAuth токен Яндекс Диска), шлюз РЕЖЕТ
// запрос с 403 Forbidden ЕЩЁ ДО того, как он достигнет Cloud Function.
// Node.js код функции в этот момент даже не запускается.
//
// ПРАВИЛЬНОЕ РЕШЕНИЕ (применено и НЕ ИЗМЕНЯТЬ):
//   1. Клиент НЕ шлёт заголовок 'Authorization' к functions.yandexcloud.net
//   2. Клиент шлёт кастомный заголовок 'X-Yandex-Auth' (шлюз его пропускает)
//   3. Клиент дублирует токен в query параметре '?token=...' (fallback)
//   4. Cloud Function читает токен из 'x-yandex-auth' ИЛИ из query
//   5. Только Cloud Function шлёт 'Authorization: OAuth <token>' к cloud-api.yandex.net
//
// ПРИЗНАКИ РЕГРЕССИИ (если кто-то добавит Authorization обратно):
//   - mode=meta, mode=list, mode=download → 403 Forbidden
//   - В логах Cloud Function НЕТ строк [DISK ...] (функция не запускается)
//   - "Сохранить" работает (прямой запрос к Диску), но "Из облака" падает
//
// Дата фиксации: 2026-04-15. НЕ ДОБАВЛЯТЬ Authorization в fPJ() НИ ПРИ КАКИХ УСЛОВИЯХ!
// ============================================================================
import YandexBackupDisk from './yandex-backup-disk.js';
import YandexDeviceSettingsDisk from './yandex-device-settings-disk.js';

export const YandexDisk = {
  ...YandexBackupDisk,
  ...YandexDeviceSettingsDisk
};

window.YandexDisk = YandexDisk;
export default YandexDisk;
