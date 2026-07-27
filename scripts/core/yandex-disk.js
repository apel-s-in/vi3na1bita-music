// ⚠️ КРИТИЧЕСКАЯ ЗАМЕТКА — YANDEX CLOUD GATEWAY ⚠️
// Клиент не должен отправлять OAuth Яндекс Диска в стандартном
// заголовке Authorization: gateway может интерпретировать его как IAM.
// Клиент отправляет только X-Yandex-Auth. Cloud Function принимает этот
// заголовок и уже сама использует Authorization: OAuth <token> при вызове
// cloud-api.yandex.net. Не помещать OAuth token в query string и логи.
// Признак регрессии: 403 до запуска функции и отсутствие requestId в логах.
import YandexBackupDisk from'./yandex-backup-disk.js';import YandexDeviceSettingsDisk from'./yandex-device-settings-disk.js';import YandexEventArchiveDisk from'./yandex-event-archive-disk.js';import YandexLedgerDisk from'./yandex-ledger-disk.js';
export const YandexDisk={...YandexBackupDisk,...YandexDeviceSettingsDisk,...YandexEventArchiveDisk,...YandexLedgerDisk};
window.YandexDisk=YandexDisk;export default YandexDisk;
