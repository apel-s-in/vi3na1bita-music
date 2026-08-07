// Recommendation memory и безопасные account domains поверх immutable Backup V7 events.
// Модуль не управляет playback и не считает server-authoritative игровые данные.
import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';

const CONTROLS_KEY = 'intel:recommendation-controls:v1';
const UI_KEY = 'profile:ui-personalization:v1';
const RECOMMENDATION_EVENT_IDS_LIMIT = 256;
const SHOWN_DEDUP_MS = 6 * 60 * 60 * 1000;
const ACCEPT_WINDOW_MS = 15000;
const SAFE_GAME_KEYS = new Set(['presets', 'uiSettings', 'matchDraft']);
const SAFE_CONTROL_KEYS = new Set(['familyMode', 'sleepMode', 'noExplicit', 'noHorror', 'noPolitics', 'preferredEnergy', 'preferredLanguage']);
const SAFE_UI_KEYS = new Set(['hiddenBlocks', 'statsCardOrder', 'preferredCharts', 'expandedGroups']);
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = value => {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
};
const recKey = (context, uid) => `rec:${safe(context || 'generic').slice(0, 60)}:${safe(uid).slice(0, 160)}`;
const currentGameStorageKey = () => `gc_data_${safe(localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || 'local')}`;
const eventClock = event => Math.max(0, num(event?.timestamp));
const eventIds = raw => [...new Set((Array.isArray(raw) ? raw : []).map(safe).filter(Boolean))].slice(-RECOMMENDATION_EVENT_IDS_LIMIT);

const readJson = (key, fallback = {}) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const normalizeRecommendation = raw => ({
  version: 1,
  key: safe(raw?.key),
  uid: safe(raw?.uid).slice(0, 160),
  context: safe(raw?.context || 'generic').slice(0, 60),
  reasonCode: safe(raw?.reasonCode).slice(0, 80),
  shown: Math.floor(num(raw?.shown)),
  clicked: Math.floor(num(raw?.clicked)),
  accepted: Math.floor(num(raw?.accepted)),
  dismissed: Math.floor(num(raw?.dismissed)),
  lastShownAt: num(raw?.lastShownAt),
  lastClickedAt: num(raw?.lastClickedAt),
  lastAcceptedAt: num(raw?.lastAcceptedAt),
  dismissedAt: num(raw?.dismissedAt),
  cooldownUntil: num(raw?.cooldownUntil),
  eventIds: eventIds(raw?.eventIds),
  updatedAt: num(raw?.updatedAt)
});

const readRecommendation = async (context, uid) => {
  const key = recKey(context, uid);
  const row = await metaDB.getStoreValue('recommendation_state', key).catch(() => null);
  return normalizeRecommendation({ ...(row?.value || {}), key, uid, context });
};

const writeRecommendation = row => metaDB.setStoreValue('recommendation_state', row.key, normalizeRecommendation(row));

const applyRecommendationEvent = async event => {
  const uid = safe(event?.uid || event?.data?.uid);
  const context = safe(event?.data?.context || 'generic');
  const type = safe(event?.type);
  const id = safe(event?.eventId);
  if (!uid || !id || !type.startsWith('RECOMMENDATION_')) return false;

  const current = await readRecommendation(context, uid);
  if (current.eventIds.includes(id)) return false;

  const at = eventClock(event) || Date.now();
  const next = {
    ...current,
    key: recKey(context, uid),
    uid,
    context,
    reasonCode: safe(event?.data?.reasonCode || current.reasonCode).slice(0, 80),
    eventIds: [...current.eventIds, id],
    updatedAt: Math.max(current.updatedAt, at)
  };

  if (type === 'RECOMMENDATION_SHOWN') {
    next.shown++;
    next.lastShownAt = Math.max(next.lastShownAt, at);
  } else if (type === 'RECOMMENDATION_CLICKED') {
    next.clicked++;
    next.lastClickedAt = Math.max(next.lastClickedAt, at);
  } else if (type === 'RECOMMENDATION_ACCEPTED') {
    next.accepted++;
    next.lastAcceptedAt = Math.max(next.lastAcceptedAt, at);
    next.dismissedAt = 0;
    next.cooldownUntil = 0;
  } else if (type === 'RECOMMENDATION_DISMISSED') {
    next.dismissed++;
    next.dismissedAt = Math.max(next.dismissedAt, at);
    next.cooldownUntil = Math.max(next.cooldownUntil, num(event?.data?.cooldownUntil));
  } else {
    return false;
  }

  await writeRecommendation(next);
  return true;
};

const normalizeControls = raw => {
  const controls = {};
  Object.entries(plain(raw?.controls) ? raw.controls : plain(raw) ? raw : {}).forEach(([key, value]) => {
    if (!SAFE_CONTROL_KEYS.has(key)) return;
    if (['preferredEnergy'].includes(key)) controls[key] = Math.max(0, Math.min(1, Number(value) || 0));
    else if (key === 'preferredLanguage') controls[key] = safe(value).slice(0, 20);
    else controls[key] = value === true;
  });
  return { version: 1, controls, updatedAt: num(raw?.updatedAt), eventId: safe(raw?.eventId) };
};

const normalizeUi = raw => {
  const value = {};
  Object.entries(plain(raw?.value) ? raw.value : plain(raw) ? raw : {}).forEach(([key, item]) => {
    if (!SAFE_UI_KEYS.has(key)) return;
    if (Array.isArray(item)) value[key] = [...new Set(item.map(safe).filter(Boolean))].slice(0, 100);
    else if (plain(item)) value[key] = Object.fromEntries(Object.entries(item).slice(0, 100).map(([name, state]) => [safe(name).slice(0, 80), state === true]));
  });
  return { version: 1, value, updatedAt: num(raw?.updatedAt), eventId: safe(raw?.eventId) };
};

const applyControlsEvent = event => {
  const incoming = normalizeControls({ controls: event?.data?.controls, updatedAt: eventClock(event), eventId: event?.eventId });
  const current = normalizeControls(readJson(CONTROLS_KEY, {}));
  if (incoming.updatedAt < current.updatedAt || (incoming.updatedAt === current.updatedAt && incoming.eventId <= current.eventId)) return false;
  return writeJson(CONTROLS_KEY, incoming);
};

const applyUiEvent = event => {
  const incoming = normalizeUi({ value: event?.data?.value, updatedAt: eventClock(event), eventId: event?.eventId });
  const current = normalizeUi(readJson(UI_KEY, {}));
  if (incoming.updatedAt < current.updatedAt || (incoming.updatedAt === current.updatedAt && incoming.eventId <= current.eventId)) return false;
  return writeJson(UI_KEY, incoming);
};

const applyGameEvent = async event => {
  const gameId = safe(event?.data?.gameId).slice(0, 60);
  const key = safe(event?.data?.key).slice(0, 40);
  const value = clone(event?.data?.value);
  if (!gameId || !SAFE_GAME_KEYS.has(key) || value == null) return false;

  const clockKey = `gameStateClock:${gameId}:${key}`;
  const oldClock = (await metaDB.getStoreValue('intel_runtime', clockKey).catch(() => null))?.value || {};
  const timestamp = eventClock(event);
  const eventId = safe(event?.eventId);
  if (timestamp < num(oldClock.updatedAt) || (timestamp === num(oldClock.updatedAt) && eventId <= safe(oldClock.eventId))) return false;

  const storageKey = currentGameStorageKey();
  const root = readJson(storageKey, {});
  root[`${gameId}_${key}`] = value;
  writeJson(storageKey, root);
  await metaDB.setStoreValue('intel_runtime', clockKey, { updatedAt: timestamp, eventId });
  window.dispatchEvent(new CustomEvent('game:backup-state-applied', { detail: { gameId, key } }));
  return true;
};

export const ingestBackupDomainEvents = async events => {
  const rows = (Array.isArray(events) ? events : []).filter(Boolean).sort((left, right) => eventClock(left) - eventClock(right) || safe(left.eventId).localeCompare(safe(right.eventId)));
  let applied = 0;

  for (const event of rows) {
    const type = safe(event.type);
    if (type.startsWith('RECOMMENDATION_') && !['RECOMMENDATION_CONTROLS_CHANGED'].includes(type)) {
      applied += await applyRecommendationEvent(event) ? 1 : 0;
    } else if (type === 'RECOMMENDATION_CONTROLS_CHANGED') {
      applied += applyControlsEvent(event) ? 1 : 0;
    } else if (type === 'UI_PERSONALIZATION_CHANGED') {
      applied += applyUiEvent(event) ? 1 : 0;
    } else if (type === 'GAME_STATE_CHANGED') {
      applied += await applyGameEvent(event) ? 1 : 0;
    }
  }

  if (applied) window.dispatchEvent(new CustomEvent('backup:domain-state-applied', { detail: { applied } }));
  return { applied };
};

const logAndApply = async (type, uid, data) => {
  const event = eventLogger.log(type, uid || null, data);
  if (!event) return null;
  await ingestBackupDomainEvents([{ ...event, timestamp: event.timestamp || Date.now() }]);
  return event;
};

const pendingAcceptances = new Map();
let initialized = false;

export const recommendationMemory = {
  async init() {
    if (initialized) return true;
    initialized = true;
    window.addEventListener('player:play', event => {
      const uid = safe(event.detail?.uid);
      const pending = pendingAcceptances.get(uid);
      if (!pending) return;
      pendingAcceptances.delete(uid);
      if (Date.now() - pending.at > ACCEPT_WINDOW_MS) return;
      this.record('accepted', pending).catch(() => null);
    });
    return true;
  },
  async get(uid, context = 'generic') {
    return readRecommendation(context, uid);
  },
  async canShow(uid, context = 'generic', at = Date.now()) {
    const row = await readRecommendation(context, uid);
    return !row.dismissedAt || row.cooldownUntil <= at;
  },
  async record(kind, { uid, context = 'generic', reasonCode = '', cooldownUntil = 0 } = {}) {
    const cleanUid = safe(uid);
    const cleanContext = safe(context || 'generic');
    if (!cleanUid || !['shown', 'clicked', 'accepted', 'dismissed'].includes(kind)) return null;
    const row = await readRecommendation(cleanContext, cleanUid);
    if (kind === 'shown' && Date.now() - row.lastShownAt < SHOWN_DEDUP_MS) return null;
    const type = `RECOMMENDATION_${kind.toUpperCase()}`;
    const event = await logAndApply(type, cleanUid, { uid: cleanUid, context: cleanContext, reasonCode: safe(reasonCode), cooldownUntil: num(cooldownUntil) });
    if (kind === 'clicked') {
      const at = Date.now();
      pendingAcceptances.forEach((pending, pendingUid) => {
        if (at - pending.at > ACCEPT_WINDOW_MS) pendingAcceptances.delete(pendingUid);
      });
      pendingAcceptances.set(cleanUid, { uid: cleanUid, context: cleanContext, reasonCode: safe(reasonCode), at });
    }
    return event;
  },
  shown(options) {
    return this.record('shown', options);
  },
  clicked(options) {
    return this.record('clicked', options);
  },
  dismissed(options = {}) {
    const cooldownUntil = num(options.cooldownUntil) || Date.now() + 30 * 24 * 60 * 60 * 1000;
    return this.record('dismissed', { ...options, cooldownUntil });
  }
};

export const getRecommendationControls = () => normalizeControls(readJson(CONTROLS_KEY, {})).controls;

export const setRecommendationControls = async (patch = {}, reason = 'user') => {
  const current = getRecommendationControls();
  const next = normalizeControls({ controls: { ...current, ...patch }, updatedAt: Date.now() });
  await logAndApply('RECOMMENDATION_CONTROLS_CHANGED', null, { controls: next.controls, reason: safe(reason) });
  return getRecommendationControls();
};

export const getUiPersonalization = () => normalizeUi(readJson(UI_KEY, {})).value;

export const setUiPersonalization = async (patch = {}, reason = 'user') => {
  const current = getUiPersonalization();
  const next = normalizeUi({ value: { ...current, ...patch }, updatedAt: Date.now() });
  await logAndApply('UI_PERSONALIZATION_CHANGED', null, { value: next.value, reason: safe(reason) });
  return getUiPersonalization();
};

export const recordSafeGameState = async ({ gameId, key, value } = {}) => {
  if (!SAFE_GAME_KEYS.has(safe(key))) return null;
  return logAndApply('GAME_STATE_CHANGED', null, { gameId: safe(gameId), key: safe(key), value: clone(value) });
};

export const initBackupDomainState = async () => {
  await recommendationMemory.init();
  window.IntelBackupState = {
    recommendationMemory,
    getRecommendationControls,
    setRecommendationControls,
    getUiPersonalization,
    setUiPersonalization,
    recordSafeGameState
  };
  return true;
};

export default {
  recommendationMemory,
  ingestBackupDomainEvents,
  getRecommendationControls,
  setRecommendationControls,
  getUiPersonalization,
  setUiPersonalization,
  recordSafeGameState,
  initBackupDomainState
};
