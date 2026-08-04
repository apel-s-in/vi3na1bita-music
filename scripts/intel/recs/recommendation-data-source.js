// Политика источников рекомендаций.
// Серверная статистика — authority для авторизованного аккаунта.
// Локальная rebuildable-статистика добавляет подробные поведенческие признаки.
import { getConfirmedListeningStats } from '../../analytics/confirmed-listening-stats.js';

const safe = value => String(value == null ? '' : value).trim();
const authorized = () => window.YandexAuth?.getSessionStatus?.() === 'active' && window.YandexAuth?.isTokenAlive?.();

const localRowsByUid = rows => new Map(
  (Array.isArray(rows) ? rows : [])
    .filter(row => row?.uid && row.uid !== 'global')
    .map(row => [safe(row.uid), row])
);

const serverRowsByUid = snapshot => new Map(
  (Array.isArray(snapshot?.tracks) ? snapshot.tracks : [])
    .filter(row => safe(row?.uid))
    .map(row => [safe(row.uid), {
      uid: safe(row.uid),
      globalListenSeconds: Math.max(0, Number(row.listenMs || 0)) / 1000,
      globalValidListenCount: Math.max(0, Number(row.validPlays || 0)),
      globalFullListenCount: Math.max(0, Number(row.fullPlays || 0)),
      source: 'server_confirmed'
    }])
);

export const resolveRecommendationDataSource = localRows => {
  const local = localRowsByUid(localRows);
  const accountAuthorized = authorized();
  const serverSnapshot = accountAuthorized ? getConfirmedListeningStats() : null;
  const serverAvailable = serverSnapshot?.available === true;
  const server = serverAvailable ? serverRowsByUid(serverSnapshot) : new Map();

  return {
    mode: !accountAuthorized ? 'local_compatible' : serverAvailable ? 'account_hybrid' : 'account_server_pending',
    accountAuthorized,
    serverAvailable,
    fullIntel: local.size > 0,
    serverCorrected: serverAvailable,
    authority: serverAvailable ? 'server_confirmed' : 'local_rebuildable',
    canonicalByUid: serverAvailable ? server : local,
    serverByUid: server,
    localByUid: local,
    localDetailAvailable: local.size > 0,
    serverUpdatedAt: Math.max(0, Number(serverSnapshot?.updatedAt || 0))
  };
};

export default { resolveRecommendationDataSource };
