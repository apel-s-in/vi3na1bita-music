// Локальный измеритель наблюдаемых запросов этого экземпляра приложения.
// Это не замена Billing Export: server-side RU, cold start, Cloud Logging
// и внутренние вызовы функций без server metadata здесь не выдумываются.
const STORAGE_KEY = 'cloudUsage:device:v1';
const MAX_RECENT = 120;
const encoder = new TextEncoder();
const safe = value => String(value == null ? '' : value).trim();
const bytes = value => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value ?? null)).byteLength;
const empty = () => ({ version: 1, startedAt: Date.now(), updatedAt: 0, totals: {}, recent: [] });
let state = readState();

function readState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return value && value.version === 1 ? { ...empty(), ...value, totals: value.totals || {}, recent: Array.isArray(value.recent) ? value.recent : [] } : empty();
  } catch {
    return empty();
  }
}

function saveState() {
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const keyOf = row => [safe(row.service), safe(row.operation), safe(row.action || row.host)].join(':');
const normalizeServerUsage = raw => ({
  queryCount: Math.max(0, Math.floor(Number(raw?.queryCount || 0))),
  casAttempts: Math.max(0, Math.floor(Number(raw?.casAttempts || 0))),
  casConflicts: Math.max(0, Math.floor(Number(raw?.casConflicts || 0))),
  internalWebPushCalls: Math.max(0, Math.floor(Number(raw?.internalWebPushCalls || 0))),
  durationMs: Math.max(0, Number(raw?.durationMs || 0)),
  responseBytes: Math.max(0, Number(raw?.responseBytes || 0))
});

export const recordCloudUsage = row => {
  const item = {
    service: safe(row?.service || 'unknown'),
    operation: safe(row?.operation || 'request'),
    action: safe(row?.action),
    host: safe(row?.host),
    status: Math.max(0, Number(row?.status || 0)),
    requestBytes: Math.max(0, Number(row?.requestBytes || 0)),
    responseBytes: Math.max(0, Number(row?.responseBytes || 0)),
    durationMs: Math.max(0, Number(row?.durationMs || 0)),
    exact: row?.exact === true,
    estimated: row?.estimated === true,
    cached: row?.cached === true,
    serverUsage: normalizeServerUsage(row?.serverUsage),
    at: Date.now()
  };
  const key = keyOf(item);
  const total = state.totals[key] || {
    service: item.service,
    operation: item.operation,
    action: item.action,
    host: item.host,
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
    serverDurationMs: 0,
    serverUsageCalls: 0,
    lastAt: 0
  };
  total.calls++;
  total.requestBytes += item.requestBytes;
  total.responseBytes += item.responseBytes;
  total.durationMs += item.durationMs;
  total.errors += item.status >= 400 || item.status === 0 ? 1 : 0;
  total.cacheHits += item.cached ? 1 : 0;
  total.exactCalls += item.exact ? 1 : 0;
  total.estimatedCalls += item.estimated ? 1 : 0;
  total.queryCount = Number(total.queryCount || 0) + item.serverUsage.queryCount;
  total.casAttempts = Number(total.casAttempts || 0) + item.serverUsage.casAttempts;
  total.casConflicts = Number(total.casConflicts || 0) + item.serverUsage.casConflicts;
  total.internalWebPushCalls = Number(total.internalWebPushCalls || 0) + item.serverUsage.internalWebPushCalls;
  total.serverDurationMs = Number(total.serverDurationMs || 0) + item.serverUsage.durationMs;
  total.serverUsageCalls = Number(total.serverUsageCalls || 0) + (row?.serverUsage ? 1 : 0);
  total.lastAt = item.at;
  state.totals[key] = total;
  state.recent = [item, ...state.recent].slice(0, MAX_RECENT);
  saveState();
  window.dispatchEvent(new CustomEvent('cloud-usage:updated', { detail: getCloudUsageSnapshot() }));
  return item;
};

export const meteredJsonFetch = async (url, { action = '', service = 'cloud_functions', operation = 'invoke', init = {} } = {}) => {
  const startedAt = performance.now();
  const requestBody = typeof init.body === 'string' ? init.body : init.body == null ? '' : JSON.stringify(init.body);
  let status = 0;
  let responseText = '';
  try {
    const response = await fetch(url, { ...init, body: requestBody || init.body });
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
      status,
      requestBytes: bytes(requestBody),
      responseBytes: bytes(responseText),
      durationMs: performance.now() - startedAt,
      serverUsage: result?.usage,
      exact: true
    });
    return { response, result, responseText };
  } catch (error) {
    recordCloudUsage({
      service,
      operation,
      action,
      host: new URL(url, location.href).host,
      status,
      requestBytes: bytes(requestBody),
      responseBytes: bytes(responseText),
      durationMs: performance.now() - startedAt,
      exact: true
    });
    throw error;
  }
};

export const recordYandexStorageResponse = ({ url, method = 'GET', response, responseBytes = 0, durationMs = 0, cached = false } = {}) => {
  let host = '';
  try {
    host = new URL(url, location.href).host;
  } catch {}
  if (!host.endsWith('storage.yandexcloud.net')) return null;
  return recordCloudUsage({
    service: 'object_storage',
    operation: safe(method || 'GET').toUpperCase(),
    host,
    status: Number(response?.status || 0),
    responseBytes: Math.max(0, Number(responseBytes || response?.headers?.get?.('content-length') || 0)),
    durationMs,
    cached,
    estimated: true
  });
};

const priceFor = row => {
  if (row.service === 'cloud_functions' && row.operation === 'invoke') {
    return row.calls * 18.97 / 1000000;
  }
  if (row.service === 'object_storage') {
    if (['GET', 'HEAD', 'OPTIONS'].includes(row.operation)) return row.calls * 0.46 / 10000;
    if (['PUT', 'POST', 'PATCH', 'LIST'].includes(row.operation)) return row.calls * 0.5692 / 1000;
  }
  return 0;
};

export const getCloudUsageSnapshot = () => {
  const rows = Object.values(state.totals).map(row => ({ ...row })).sort((left, right) => right.lastAt - left.lastAt);
  const responseBytes = rows.reduce((sum, row) => sum + Number(row.responseBytes || 0), 0);
  const directCost = rows.reduce((sum, row) => sum + priceFor(row), 0);
  const egressCost = responseBytes / (1024 ** 3) * 1.67994;
  const observedCost = directCost + egressCost;
  return {
    version: 1,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    rows,
    recent: state.recent.map(row => ({ ...row })),
    totals: {
      calls: rows.reduce((sum, row) => sum + Number(row.calls || 0), 0),
      errors: rows.reduce((sum, row) => sum + Number(row.errors || 0), 0),
      requestBytes: rows.reduce((sum, row) => sum + Number(row.requestBytes || 0), 0),
      responseBytes,
      queryCount: rows.reduce((sum, row) => sum + Number(row.queryCount || 0), 0),
      casAttempts: rows.reduce((sum, row) => sum + Number(row.casAttempts || 0), 0),
      casConflicts: rows.reduce((sum, row) => sum + Number(row.casConflicts || 0), 0),
      internalWebPushCalls: rows.reduce((sum, row) => sum + Number(row.internalWebPushCalls || 0), 0),
      serverDurationMs: rows.reduce((sum, row) => sum + Number(row.serverDurationMs || 0), 0),
      serverUsageCalls: rows.reduce((sum, row) => sum + Number(row.serverUsageCalls || 0), 0),
      observedCostRub: observedCost,
      projected1000Rub: observedCost * 1000
    },
    unknown: [
      'YDB Request Units: queryCount не является RU',
      'тарифицированное время и память Cloud Functions: durationMs — wall time функции, а не официальный биллинг',
      'cold starts',
      'Cloud Logging',
      'внутренние вызовы vi3-signaling → vi3-webpush',
      'операции Backup Proxy → Яндекс Диск',
      'частичный media traffic Howler/Range без Resource Timing'
    ]
  };
};

export const resetCloudUsage = () => {
  state = empty();
  saveState();
  window.dispatchEvent(new CustomEvent('cloud-usage:updated', { detail: getCloudUsageSnapshot() }));
  return getCloudUsageSnapshot();
};

window.CloudUsageMeter = {
  getSnapshot: getCloudUsageSnapshot,
  reset: resetCloudUsage,
  record: recordCloudUsage
};

export default window.CloudUsageMeter;
