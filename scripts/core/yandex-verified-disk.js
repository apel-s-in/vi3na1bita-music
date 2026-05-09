// UID.104_(Trust and eligibility state)_(verified achievement transport через Cloud Function)_(локальный прогресс не блокируется)
// UID.109_(Yandex Cloud Functions validation layer)_(ledger_verify/achievement_verify/claim_prepare/claim_validate)_(server-side контур для внешних claim)
// UID.111_(Prize/global achievements distinction)_(verified != local unlock)_(для призов нужен server status)

import { YANDEX_DISK_PROXY as PROXY, fetchProxyJson as fPJ } from './yandex-disk-transport.js';

const s = v => String(v == null ? '' : v).trim();

const call = async (mode, token, params = {}) => {
  if (!token) throw new Error('no_token');
  const u = new URL(PROXY);
  u.searchParams.set('mode', mode);
  Object.entries(params || {}).forEach(([k, v]) => s(v) && u.searchParams.set(k, s(v)));
  return await fPJ(u.toString(), token, 1);
};

export const YandexVerifiedDisk = {
  verifyLedger(token) {
    return call('ledger_verify', token);
  },
  verifyAchievements(token, achievementId = 'all') {
    return call('achievement_verify', token, { achievementId });
  },
  prepareClaim(token, achievementId) {
    return call('claim_prepare', token, { achievementId });
  },
  validateClaim(token, { achievementId = '', claimId = '' } = {}) {
    return call('claim_validate', token, { achievementId, claimId });
  }
};

export default YandexVerifiedDisk;
