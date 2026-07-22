import {
  YANDEX_DISK_PROXY as PROXY,
  fetchProxyJson
} from './yandex-disk-transport.js';

export const YandexLedgerDisk = {
  async verifyLedger(token) {
    if (!token) throw new Error('no_token');

    const url = new URL(PROXY);
    url.searchParams.set('mode', 'ledger_verify');

    return fetchProxyJson(
      url.toString(),
      token,
      1
    );
  }
};

export default YandexLedgerDisk;
