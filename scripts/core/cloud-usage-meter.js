// Privacy-safe измеритель наблюдаемых Yandex Cloud операций.
// Хранит только скользящее окно 24 часа и никогда не сохраняет body,
// headers, OAuth token, social session, playerId, friendId или track UID.
const STORAGE_KEY = 'cloudUsage:device:v2';
const LEGACY_STORAGE_KEY = 'cloudUsage:device:v1';
const VERSION = 2;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 5000;
const encoder = new TextEncoder();
const safe = value => String(value == null ? '' : value).trim();
const number = value => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);
const bytes = value => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value ?? null)).byteLength;
const correlationKey = () => `cu_${crypto.randomUUID().replace(/-/g, '')}`;
const resourceKey = async value => {
  const url = new URL(String(value || ''), location.href);
  url.hash = '';
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(url.href));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
};
const empty = () => ({ version: VERSION, windowMs: WINDOW_MS, startedAt: Date.now(), updatedAt: 0, events: [], droppedEvents: 0, persistenceErrors: 0 });
let state = readState();
let inFlight = 0;
let maxInFlight = 0;
function readState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (value?.version !== VERSION || !Array.isArray(value.events)) return empty();
    return { ...empty(), ...value, events: value.events.filter(Boolean), droppedEvents: number(value.droppedEvents), persistenceErrors: number(value.persistenceErrors) };
  } catch {
    return empty();
  }
}
function pruneState(at = Date.now()) {
  const cutoff = at - WINDOW_MS;
  const before = state.events.length;
  const active = state.events.filter(item => number(item?.at) >= cutoff).sort((left, right) => number(right.at) - number(left.at));
  if (active.length > MAX_EVENTS) {
    state.droppedEvents += active.length - MAX_EVENTS;
    active.length = MAX_EVENTS;
  }
  state.events = active;
  const changed = before !== active.length;
  if (active.length) state.startedAt = Math.max(cutoff, number(active[active.length - 1].at));
  else state.startedAt = at;
  return changed;
}
function saveState() {
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    state.persistenceErrors++;
    return false;
  }
}
const normalizeServerUsage = raw => ({
  queryCount: Math.floor(number(raw?.queryCount)),
  casAttempts: Math.floor(number(raw?.casAttempts)),
  casConflicts: Math.floor(number(raw?.casConflicts)),
  internalWebPushCalls: Math.floor(number(raw?.internalWebPushCalls)),
  authorityCalls: Math.floor(number(raw?.authorityCalls)),
  diskApiCalls: Math.floor(number(raw?.diskApiCalls)),
  diskOperations: { list: Math.floor(number(raw?.diskOperations?.list)), download: Math.floor(number(raw?.diskOperations?.download)), upload: Math.floor(number(raw?.diskOperations?.upload)), delete: Math.floor(number(raw?.diskOperations?.delete)), mkdir: Math.floor(number(raw?.diskOperations?.mkdir)) },
  networkCalls: Math.floor(number(raw?.networkCalls)),
  networkRequestBytes: Math.floor(number(raw?.requestBytes)),
  networkResponseBytes: Math.floor(number(raw?.responseBytes)),
  redirects: Math.floor(number(raw?.redirects)),
  durationMs: number(raw?.durationMs),
  responseBytes: Math.floor(number(raw?.responseBytesFinal ?? raw?.responseBytes))
});
const runtimeContext = () => {
  const activity = window.AppActivity?.getState?.() || {};
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    visibility: document.visibilityState || 'unknown',
    activityMode: safe(activity.mode || (document.hidden ? 'quiet' : 'active')),
    quiet: activity.quiet === true,
    playing: window.playerCore?.isPlaying?.() === true,
    online: navigator.onLine !== false,
    networkType: safe(window.NetPolicy?.detectNetworkType?.() || connection?.type || connection?.effectiveType || 'unknown'),
    appAgeMs: Math.max(0, Math.floor(performance.now()))
  };
};
const captureInitiator = stack => {
  const lines = safe(stack || new Error().stack)
    .split('\n')
    .map(line => line.trim());
  const line = lines.find(item => /(?:scripts|src|Friends)\//.test(item) && !/cloud-usage-meter\.js/.test(item)) || '';
  return line
    .replace(/https?:\/\/[^/\s)]+/g, '')
    .replace(/[?#][^\s)]*/g, '')
    .slice(0, 220);
};
const keyOf = row => [safe(row.service), safe(row.operation), safe(row.action || row.host), row.suppressed ? safe(row.suppressionReason) : ''].join(':');
const aggregateEvents = events => {
  const map = new Map();
  events.forEach(item => {
    const key = keyOf(item);
    const row = map.get(key) || {
      service: item.service,
      operation: item.operation,
      action: item.action,
      host: item.host,
      suppressed: item.suppressed === true,
      suppressionReason: item.suppressionReason || '',
      calls: 0,
      requestBytes: 0,
      responseBytes: 0,
      durationMs: 0,
      errors: 0,
      cacheHits: 0,
      exactCalls: 0,
      estimatedCalls: 0,
      queryCount: 0,
      casAttempts: 0,
      casConflicts: 0,
      internalWebPushCalls: 0,
      authorityCalls: 0,
      diskApiCalls: 0,
      diskListCalls: 0,
      diskDownloadCalls: 0,
      diskUploadCalls: 0,
      diskDeleteCalls: 0,
      diskMkdirCalls: 0,
      redirects: 0,
      serverDurationMs: 0,
      serverUsageCalls: 0,
      hiddenCalls: 0,
      quietCalls: 0,
      playbackCalls: 0,
      statuses: {},
      initiators: {},
      firstAt: 0,
      lastAt: 0
    };
    row.calls++;
    row.requestBytes += number(item.requestBytes);
    row.responseBytes += number(item.responseBytes);
    row.durationMs += number(item.durationMs);
    row.errors += !item.suppressed && (number(item.status) >= 400 || number(item.status) === 0) ? 1 : 0;
    row.cacheHits += item.cached ? 1 : 0;
    row.exactCalls += item.exact ? 1 : 0;
    row.estimatedCalls += item.estimated ? 1 : 0;
    row.queryCount += number(item.serverUsage?.queryCount);
    row.casAttempts += number(item.serverUsage?.casAttempts);
    row.casConflicts += number(item.serverUsage?.casConflicts);
    row.internalWebPushCalls += number(item.serverUsage?.internalWebPushCalls);
    row.authorityCalls += number(item.serverUsage?.authorityCalls);
    row.diskApiCalls += number(item.serverUsage?.diskApiCalls);
    row.diskListCalls += number(item.serverUsage?.diskOperations?.list);
    row.diskDownloadCalls += number(item.serverUsage?.diskOperations?.download);
    row.diskUploadCalls += number(item.serverUsage?.diskOperations?.upload);
    row.diskDeleteCalls += number(item.serverUsage?.diskOperations?.delete);
    row.diskMkdirCalls += number(item.serverUsage?.diskOperations?.mkdir);
    row.redirects += number(item.serverUsage?.redirects);
    row.serverDurationMs += number(item.serverUsage?.durationMs);
    row.serverUsageCalls += item.serverUsagePresent ? 1 : 0;
    row.hiddenCalls += item.context?.visibility === 'hidden' ? 1 : 0;
    row.quietCalls += item.context?.quiet ? 1 : 0;
    row.playbackCalls += item.context?.playing ? 1 : 0;
    const status = item.suppressed ? `SUPPRESSED:${item.suppressionReason}` : String(item.status || 'ERR');
    row.statuses[status] = number(row.statuses[status]) + 1;
    if (item.initiator) row.initiators[item.initiator] = number(row.initiators[item.initiator]) + 1;
    row.firstAt = row.firstAt ? Math.min(row.firstAt, item.at) : item.at;
    row.lastAt = Math.max(row.lastAt, item.at);
    map.set(key, row);
  });
  return [...map.values()].sort((left, right) => right.calls - left.calls || right.lastAt - left.lastAt);
};
const median = values => {
  const rows = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!rows.length) return 0;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
};
const burstCount = (timestamps, windowMs) => {
  const rows = [...timestamps].sort((left, right) => left - right);
  let best = 0;
  let left = 0;
  for (let right = 0; right < rows.length; right++) {
    while (rows[right] - rows[left] > windowMs) left++;
    best = Math.max(best, right - left + 1);
  }
  return best;
};
const buildDiagnostics = events => {
  const paid = events.filter(item => !item.suppressed);
  const byAction = new Map();
  paid.forEach(item => {
    const key = `${item.service}:${item.action || item.operation}`;
    if (!byAction.has(key)) byAction.set(key, []);
    byAction.get(key).push(item);
  });
  const actionPatterns = [...byAction.entries()]
    .map(([key, items]) => {
      const ordered = [...items].sort((left, right) => left.at - right.at);
      const intervals = ordered.slice(1).map((item, index) => item.at - ordered[index].at);
      const medianIntervalMs = median(intervals);
      const deviations = intervals.map(value => Math.abs(value - medianIntervalMs));
      const periodicityRatio = medianIntervalMs > 0 ? median(deviations) / medianIntervalMs : 0;
      const queryCounts = ordered.map(item => number(item.serverUsage?.queryCount));
      return {
        key,
        calls: ordered.length,
        firstAt: ordered[0]?.at || 0,
        lastAt: ordered[ordered.length - 1]?.at || 0,
        minIntervalMs: intervals.length ? Math.min(...intervals) : 0,
        medianIntervalMs,
        maxIntervalMs: intervals.length ? Math.max(...intervals) : 0,
        periodic: intervals.length >= 3 && medianIntervalMs >= 1000 && periodicityRatio <= 0.25,
        periodicityRatio: Math.round(periodicityRatio * 1000) / 1000,
        maxBurst10s: burstCount(
          ordered.map(item => item.at),
          10000
        ),
        averageQueryCount: queryCounts.length ? Math.round((queryCounts.reduce((sum, value) => sum + value, 0) / queryCounts.length) * 100) / 100 : 0,
        maxQueryCount: queryCounts.length ? Math.max(...queryCounts) : 0,
        errors: ordered.filter(item => item.status >= 400 || item.status === 0).length,
        hiddenCalls: ordered.filter(item => item.context?.visibility === 'hidden').length,
        quietCalls: ordered.filter(item => item.context?.quiet).length
      };
    })
    .sort((left, right) => right.calls - left.calls);
  const findings = [];
  actionPatterns.forEach(item => {
    if (item.periodic && item.calls >= 4) findings.push({ severity: 'info', code: 'periodic_request', action: item.key, message: `Периодический запрос: медианный интервал ${Math.round(item.medianIntervalMs / 1000)} сек`, value: item.calls });
    if (item.maxBurst10s >= 4) findings.push({ severity: item.maxBurst10s >= 8 ? 'high' : 'medium', code: 'request_burst', action: item.key, message: `До ${item.maxBurst10s} запросов за 10 секунд`, value: item.maxBurst10s });
    if (item.averageQueryCount >= 15) findings.push({ severity: item.averageQueryCount >= 30 ? 'high' : 'medium', code: 'high_ydb_query_fanout', action: item.key, message: `Среднее число YDB query на вызов: ${item.averageQueryCount}`, value: item.averageQueryCount });
    if (item.errors > 0) findings.push({ severity: 'high', code: 'request_errors', action: item.key, message: `Ошибок: ${item.errors}`, value: item.errors });
    if (item.quietCalls > 0) findings.push({ severity: 'medium', code: 'paid_request_in_quiet_mode', action: item.key, message: `Платных запросов в quiet mode: ${item.quietCalls}`, value: item.quietCalls });
    if (item.hiddenCalls > 0 && !/listen_session_heartbeat/.test(item.key)) findings.push({ severity: 'medium', code: 'background_request', action: item.key, message: `Запросов при скрытом документе: ${item.hiddenCalls}`, value: item.hiddenCalls });
  });
  const metadataCalls = paid.filter(item => item.serverUsagePresent).length;
  return {
    actionPatterns,
    findings: findings.slice(0, 100),
    peakBurst10s: burstCount(
      paid.map(item => item.at),
      10000
    ),
    metadataCalls,
    metadataCoveragePct: paid.length ? Math.round((metadataCalls / paid.length) * 10000) / 100 : 0,
    maxInFlight,
    suppressedAttempts: events.filter(item => item.suppressed).length,
    droppedEvents: state.droppedEvents,
    persistenceErrors: state.persistenceErrors,
    truncated: state.droppedEvents > 0
  };
};
export const recordCloudUsage = row => {
  pruneState();
  const rawServerUsage = row?.serverUsage;
  const item = {
    service: safe(row?.service || 'unknown'),
    operation: safe(row?.operation || 'request'),
    action: safe(row?.action),
    host: safe(row?.host),
    correlationKey: safe(row?.correlationKey).slice(0, 80),
    resourceKey: safe(row?.resourceKey).slice(0, 64),
    source: safe(row?.source || 'page'),
    status: Math.floor(number(row?.status)),
    requestBytes: Math.floor(number(row?.requestBytes)),
    responseBytes: Math.floor(number(row?.responseBytes)),
    transferSize: Math.floor(number(row?.transferSize)),
    encodedBodySize: Math.floor(number(row?.encodedBodySize)),
    decodedBodySize: Math.floor(number(row?.decodedBodySize)),
    unknownBytes: row?.unknownBytes === true,
    rangeRequest: row?.rangeRequest === true,
    durationMs: number(row?.durationMs),
    exact: row?.exact === true,
    estimated: row?.estimated === true,
    cached: row?.cached === true,
    suppressed: row?.suppressed === true,
    suppressionReason: safe(row?.suppressionReason),
    serverUsagePresent: !!rawServerUsage && typeof rawServerUsage === 'object',
    serverUsage: normalizeServerUsage(rawServerUsage),
    initiator: safe(row?.initiator || captureInitiator(row?.stack)),
    concurrentAtStart: Math.floor(number(row?.concurrentAtStart)),
    context: row?.context && typeof row.context === 'object' ? { ...runtimeContext(), ...row.context } : runtimeContext(),
    at: Math.floor(number(row?.at) || Date.now())
  };
  const duplicateIndex = item.correlationKey ? state.events.findIndex(existing => existing.correlationKey === item.correlationKey && existing.service === item.service) : -1;
  if (duplicateIndex >= 0) {
    const existing = state.events[duplicateIndex];
    state.events[duplicateIndex] = {
      ...existing,
      ...item,
      status: item.status || existing.status,
      requestBytes: Math.max(number(existing.requestBytes), item.requestBytes),
      responseBytes: Math.max(number(existing.responseBytes), item.responseBytes),
      transferSize: Math.max(number(existing.transferSize), item.transferSize),
      encodedBodySize: Math.max(number(existing.encodedBodySize), item.encodedBodySize),
      decodedBodySize: Math.max(number(existing.decodedBodySize), item.decodedBodySize),
      durationMs: Math.max(number(existing.durationMs), item.durationMs),
      cached: existing.cached || item.cached,
      unknownBytes: existing.unknownBytes && item.unknownBytes,
      source: [...new Set([existing.source, item.source].filter(Boolean))].join('+')
    };
  } else {
    state.events.unshift(item);
  }
  pruneState();
  saveState();
  window.dispatchEvent(new CustomEvent('cloud-usage:updated'));
  return item;
};
export const recordSuppressedCloudAttempt = ({ action = '', reason = 'client_guard', service = 'cloud_functions', initiator = '' } = {}) =>
  recordCloudUsage({ service: 'client_guard', operation: 'suppressed', action: safe(action), host: service, suppressed: true, suppressionReason: safe(reason), initiator: initiator || captureInitiator(), exact: true });
export const meteredJsonFetch = async (url, { action = '', service = 'cloud_functions', operation = 'invoke', init = {} } = {}) => {
  const startedAt = performance.now();
  const initiator = captureInitiator();
  const context = runtimeContext();
  const concurrentAtStart = ++inFlight;
  maxInFlight = Math.max(maxInFlight, inFlight);
  const requestBody = typeof init.body === 'string' ? init.body : init.body == null ? '' : JSON.stringify(init.body);
  const requestCorrelationKey = correlationKey();
  const headers = new Headers(init.headers || {});
  headers.set('X-Vi3-Correlation', requestCorrelationKey);
  let status = 0;
  let responseText = '';
  try {
    const response = await fetch(url, { ...init, headers, body: requestBody || init.body });
    status = response.status;
    responseText = await response.text();
    let result = {};
    try {
      result = JSON.parse(responseText || '{}') || {};
    } catch {}
    recordCloudUsage({
      service,
      operation,
      action,
      host: new URL(url, location.href).host,
      correlationKey: requestCorrelationKey,
      status,
      requestBytes: bytes(requestBody),
      responseBytes: bytes(responseText),
      durationMs: performance.now() - startedAt,
      serverUsage: result?.usage,
      initiator,
      concurrentAtStart,
      context,
      exact: true
    });
    return { response, result, responseText };
  } catch (error) {
    recordCloudUsage({ service, operation, action, host: new URL(url, location.href).host, correlationKey: requestCorrelationKey, status, requestBytes: bytes(requestBody), responseBytes: bytes(responseText), durationMs: performance.now() - startedAt, initiator, concurrentAtStart, context, exact: true });
    throw error;
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
};
export const recordYandexStorageResponse = ({ url, method = 'GET', response, responseBytes = 0, durationMs = 0, cached = false } = {}) => {
  let host = '';
  try {
    host = new URL(url, location.href).host;
  } catch {}
  if (!host.endsWith('storage.yandexcloud.net')) return null;
  return recordCloudUsage({ service: 'object_storage', operation: safe(method || 'GET').toUpperCase(), host, status: Number(response?.status || 0), responseBytes: Math.floor(number(responseBytes || response?.headers?.get?.('content-length'))), durationMs, cached, estimated: true });
};
const operationCost = row => {
  if (row.suppressed) return 0;
  if (row.service === 'cloud_functions' && row.operation === 'invoke') return (row.calls * 18.97) / 1000000;
  if (row.service === 'object_storage' && ['GET', 'HEAD', 'OPTIONS'].includes(row.operation)) return (row.calls * 0.46) / 10000;
  if (row.service === 'object_storage' && ['PUT', 'POST', 'PATCH', 'LIST'].includes(row.operation)) return (row.calls * 0.5692) / 1000;
  return 0;
};
const egressCost = rows =>
  rows.reduce((sum, row) => {
    const gigabytes = number(row.responseBytes) / 1024 ** 3;
    if (row.service === 'object_storage') return sum + gigabytes * 1.67994;
    if (row.service === 'cloud_functions') return sum + gigabytes * 1.42;
    return sum;
  }, 0);
export const getCloudUsageSnapshot = () => {
  const changed = pruneState();
  if (changed) saveState();
  const events = state.events.map(item => ({ ...item, serverUsage: { ...item.serverUsage }, context: { ...item.context } }));
  const allRows = aggregateEvents(events);
  const rows = allRows.filter(row => !row.suppressed);
  const suppressedRows = allRows.filter(row => row.suppressed);
  const directCost = rows.reduce((sum, row) => sum + operationCost(row), 0);
  const internalInvocationCost = (rows.reduce((sum, row) => sum + number(row.internalWebPushCalls), 0) * 18.97) / 1000000;
  const observedCost = directCost + internalInvocationCost + egressCost(rows);
  const observedFromAt = events.length ? Math.max(Date.now() - WINDOW_MS, events[events.length - 1].at) : Date.now();
  return {
    version: VERSION,
    windowMs: WINDOW_MS,
    observedFromAt,
    observedUntilAt: Date.now(),
    updatedAt: state.updatedAt,
    rows,
    suppressedRows,
    recent: events,
    totals: {
      calls: rows.reduce((sum, row) => sum + row.calls, 0),
      suppressedAttempts: suppressedRows.reduce((sum, row) => sum + row.calls, 0),
      errors: rows.reduce((sum, row) => sum + row.errors, 0),
      requestBytes: rows.reduce((sum, row) => sum + row.requestBytes, 0),
      responseBytes: rows.reduce((sum, row) => sum + row.responseBytes, 0),
      queryCount: rows.reduce((sum, row) => sum + row.queryCount, 0),
      casAttempts: rows.reduce((sum, row) => sum + row.casAttempts, 0),
      casConflicts: rows.reduce((sum, row) => sum + row.casConflicts, 0),
      internalWebPushCalls: rows.reduce((sum, row) => sum + row.internalWebPushCalls, 0),
      authorityCalls: rows.reduce((sum, row) => sum + row.authorityCalls, 0),
      diskApiCalls: rows.reduce((sum, row) => sum + row.diskApiCalls, 0),
      diskListCalls: rows.reduce((sum, row) => sum + row.diskListCalls, 0),
      diskDownloadCalls: rows.reduce((sum, row) => sum + row.diskDownloadCalls, 0),
      diskUploadCalls: rows.reduce((sum, row) => sum + row.diskUploadCalls, 0),
      diskDeleteCalls: rows.reduce((sum, row) => sum + row.diskDeleteCalls, 0),
      diskMkdirCalls: rows.reduce((sum, row) => sum + row.diskMkdirCalls, 0),
      redirects: rows.reduce((sum, row) => sum + row.redirects, 0),
      serverDurationMs: rows.reduce((sum, row) => sum + row.serverDurationMs, 0),
      serverUsageCalls: rows.reduce((sum, row) => sum + row.serverUsageCalls, 0),
      observedCostRub: observedCost,
      projected1000Rub: observedCost * 1000
    },
    diagnostics: buildDiagnostics(events),
    unknown: ['YDB Request Units: queryCount не является RU', 'durationMs — wall time функции, а не официальный execution billing', 'cold starts и округление Cloud Functions', 'Cloud Logging bytes', 'операции Яндекс Диска без metadata Backup Proxy', 'частичный Howler GET/Range traffic без доступного Resource Timing']
  };
};
const getServiceWorkerVersion = () =>
  new Promise(resolve => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) return resolve('');
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve('timeout'), 800);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      resolve(safe(event.data?.version));
    };
    controller.postMessage({ type: 'GET_SW_VERSION' }, [channel.port2]);
  });
const jsonArrayLength = key => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return -1;
  }
};
export const buildCloudUsageReport = async () => {
  const snapshot = getCloudUsageSnapshot();
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const storage = await navigator.storage?.estimate?.().catch(() => null);
  const backoff = window.SocialSessionDiagnostics?.getBackoffState?.() || null;
  const activity = window.AppActivity?.getState?.() || {};
  return {
    schema: 'vi3-cloud-usage-report-v2',
    privacy: { requestBodiesIncluded: false, responseBodiesIncluded: false, headersIncluded: false, oauthTokensIncluded: false, socialSessionsIncluded: false, userIdentifiersIncluded: false, trackIdentifiersIncluded: false },
    generatedAt: Date.now(),
    generatedAtIso: new Date().toISOString(),
    app: { version: safe(window.APP_CONFIG?.APP_VERSION || window.VERSION), buildDate: safe(window.APP_CONFIG?.BUILD_DATE || window.BUILD_DATE), serviceWorkerVersion: await getServiceWorkerVersion() },
    environment: {
      userAgent: safe(navigator.userAgent).slice(0, 400),
      language: safe(navigator.language),
      timezone: safe(Intl.DateTimeFormat().resolvedOptions().timeZone),
      platform: window.Utils?.getPlatform?.() || {},
      screen: { width: number(screen.width), height: number(screen.height), pixelRatio: number(devicePixelRatio) },
      hardwareConcurrency: number(navigator.hardwareConcurrency),
      deviceMemoryGb: number(navigator.deviceMemory),
      online: navigator.onLine !== false,
      connection: { type: safe(connection?.type), effectiveType: safe(connection?.effectiveType), downlinkMbps: number(connection?.downlink), rttMs: number(connection?.rtt), saveData: connection?.saveData === true }
    },
    runtime: {
      visibility: document.visibilityState,
      activity,
      playback: { playing: window.playerCore?.isPlaying?.() === true, provider: safe(window.playerCore?.currentProvider), quality: safe(window.playerCore?.qMode) },
      socialServerBackoff: backoff,
      pageAgeMs: Math.floor(performance.now()),
      storage: storage ? { usageBytes: number(storage.usage), quotaBytes: number(storage.quota) } : null
    },
    queues: {
      favoriteMirrorOutbox: jsonArrayLength('favoriteMirror:outbox:v1'),
      listeningCompletionOutbox: window.ListeningReceipts?.getCompletionOutboxSnapshot?.().length ?? jsonArrayLength('listeningReceipts:completionOutbox:v1'),
      backupDirty: localStorage.getItem('backup:v71:dirty') === '1',
      backupNextPhase: safe(localStorage.getItem('backup:v71:next-phase')),
      backupNextSyncAt: number(localStorage.getItem('backup:v71:next-sync-at'))
    },
    cloudUsage: snapshot
  };
};
const reportFilename = () => `vi3-cloud-usage-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
export const downloadCloudUsageReport = async () => {
  const report = await buildCloudUsageReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFilename();
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 5000);
  return report;
};
export const copyCloudUsageReport = async () => {
  const report = await buildCloudUsageReport();
  await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  return report;
};
export const resetCloudUsage = () => {
  state = empty();
  maxInFlight = inFlight;
  saveState();
  window.dispatchEvent(new CustomEvent('cloud-usage:updated'));
  return getCloudUsageSnapshot();
};
window.CloudUsageMeter = { getSnapshot: getCloudUsageSnapshot, buildReport: buildCloudUsageReport, downloadReport: downloadCloudUsageReport, copyReport: copyCloudUsageReport, reset: resetCloudUsage, record: recordCloudUsage, recordSuppressed: recordSuppressedCloudAttempt };
export default window.CloudUsageMeter;
