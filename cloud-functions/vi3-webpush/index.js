'use strict';

const crypto = require('crypto');
const webpush = require('web-push');
const ydbMod = require('ydb-sdk');

let driverPromise = null;

const CFG = {
  endpoint: process.env.YDB_ENDPOINT || '',
  database: process.env.YDB_DATABASE || '',
  prefix: process.env.YDB_TABLE_PREFIX || 'vi3_',
  adminSecret: process.env.ADMIN_SECRET || '',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:apel-s-in@ya.ru',
  corsOrigins: String(process.env.CORS_ORIGINS || 'https://vi3na1bita.website.yandexcloud.net,https://apel-s-in.github.io')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
};

const TABLE = `${CFG.prefix}kv`;

const safe = v => String(v == null ? '' : v).trim();
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

const timingSafeEqualText = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
};

if (CFG.vapidPublicKey && CFG.vapidPrivateKey) {
  webpush.setVapidDetails(CFG.vapidSubject, CFG.vapidPublicKey, CFG.vapidPrivateKey);
}

function parseBody(event) {
  if (!event?.body) return event || {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : String(event.body || '{}');
  try { return JSON.parse(text || '{}') || {}; } catch { return {}; }
}

function corsHeaders(event) {
  const h = event.headers || {};
  const origin = safe(h.origin || h.Origin || '');
  const allow = CFG.corsOrigins.includes('*') ? '*' : (CFG.corsOrigins.includes(origin) ? origin : CFG.corsOrigins[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Vi3-Admin',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(event, statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(event),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

function valueOf(x) {
  if (x == null) return null;
  if (typeof x !== 'object') return x;
  if ('textValue' in x) return x.textValue;
  if ('utf8Value' in x) return x.utf8Value;
  if ('uint64Value' in x) return Number(x.uint64Value);
  if ('int64Value' in x) return Number(x.int64Value);
  if ('boolValue' in x) return !!x.boolValue;
  if ('optionalValue' in x) return valueOf(x.optionalValue);
  if ('value' in x) return valueOf(x.value);
  return null;
}

function rowsOf(res) {
  const sets = Array.isArray(res?.resultSets)
    ? res.resultSets
    : res?.resultSet
      ? [res.resultSet]
      : [];

  const resultSet =
    sets.find(set => set?.rows?.length) ||
    sets.find(set => set?.columns?.length) ||
    null;

  const columns = (resultSet?.columns || [])
    .map(column => safe(column.name || column));

  return (resultSet?.rows || []).map(row => {
    const items = row.items || row;
    if (!Array.isArray(items)) return row;

    return Object.fromEntries(
      items.map((item, index) => [
        columns[index] || `c${index}`,
        valueOf(item)
      ])
    );
  });
}

function payload(row) {
  try { return row?.payload_json ? JSON.parse(row.payload_json) : {}; } catch { return {}; }
}

function tvUtf8(v) {
  return ydbMod.TypedValues.utf8(String(v == null ? '' : v));
}

function tvUint64(v) {
  return ydbMod.TypedValues.uint64(num(v, 0));
}

async function getYdb() {
  if (driverPromise) return driverPromise;

  driverPromise = (async () => {
    const { Driver, getCredentialsFromEnv } = ydbMod;
    if (!CFG.endpoint || !CFG.database) throw new Error('ydb_env_missing');

    const driver = new Driver({
      endpoint: CFG.endpoint,
      database: CFG.database,
      authService: getCredentialsFromEnv()
    });

    const ready = await driver.ready(10000);
    if (!ready) throw new Error('ydb_not_ready');
    return driver;
  })().catch(err => {
    driverPromise = null;
    throw err;
  });

  return driverPromise;
}

async function query(sql, params = {}) {
  const driver = await getYdb();
  return driver.tableClient.withSession(async session => session.executeQuery(sql, params));
}

async function kvPrefix(prefix, limit = 100) {
  const to = `${prefix}\uffff`;
  const res = await query(`
    DECLARE $from AS Utf8;
    DECLARE $to AS Utf8;
    DECLARE $lim AS Uint64;

    SELECT pk, type, owner, updated_at, expires_at, payload_json
    FROM ${TABLE}
    WHERE pk >= $from AND pk < $to
    LIMIT $lim;
  `, {
    '$from': tvUtf8(prefix),
    '$to': tvUtf8(to),
    '$lim': tvUint64(limit)
  });

  return rowsOf(res);
}

async function kvDelete(pk) {
  await query(`
    DECLARE $pk AS Utf8;
    DELETE FROM ${TABLE}
    WHERE pk = $pk;
  `, { '$pk': tvUtf8(pk) });
}

async function sendToSubscription(row, notification) {
  const data = payload(row);
  const sub = data.subscription;
  if (!sub?.endpoint) return { ok: false, reason: 'bad_subscription' };

  const topic = safe(notification.tag || '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 32);

  try {
    await webpush.sendNotification(sub, JSON.stringify(notification), {
      TTL: notification.kind === 'CHAT_MESSAGE' ? 86400 : (notification.kind === 'VOICE_CALL' || notification.kind === 'GAME_INVITE' ? 120 : 3600),
      urgency: notification.kind === 'CHAT_MESSAGE' || notification.kind === 'GAME_INVITE' || notification.kind === 'VOICE_CALL' ? 'high' : 'normal',
      topic: topic || undefined
    });
    return { ok: true };
  } catch (err) {
    const status = Number(err.statusCode || err.status || 0);
    if (status === 404 || status === 410) {
      await kvDelete(row.pk).catch(() => null);
      return { ok: false, reason: 'subscription_gone', deleted: true };
    }
    return { ok: false, reason: err.message || 'webpush_error', status };
  }
}

async function actionSendToPlayer(event, body) {
  const adminHeader = Object.entries(event.headers || {})
    .find(([key]) => String(key).toLowerCase() === 'x-vi3-admin')?.[1];

  if (
    !CFG.adminSecret ||
    !timingSafeEqualText(adminHeader, CFG.adminSecret)
  ) {
    const error = new Error('bad_admin_secret');
    error.httpStatus = 403;
    throw error;
  }

  if (!CFG.vapidPublicKey || !CFG.vapidPrivateKey) {
    const error = new Error('vapid_env_missing');
    error.httpStatus = 503;
    throw error;
  }

  const playerId = safe(
    body.playerId ||
    body.toPlayerId ||
    body.toFriendId
  );

  if (!playerId) {
    const error = new Error('player_required');
    error.httpStatus = 400;
    throw error;
  }

  const notification = {
    title: safe(body.title || 'Витрина Разбита').slice(0, 80),
    body: safe(body.body || body.text || 'Новое уведомление').slice(0, 220),
    url: safe(body.url || './'),
    tag: safe(body.tag || `vi3-${playerId}`).slice(0, 80),
    requireInteraction: body.requireInteraction === true,
    kind: safe(body.kind || ''),
    fromFriendId: safe(body.fromFriendId || ''),
    gameId: safe(body.gameId || ''),
    msgId: safe(body.msgId || ''),
    callId: safe(body.callId || '')
  };

  const rows = await kvPrefix(`webPushSub:${playerId}:`, 20);
  const results = [];

  for (const row of rows) {
    results.push(await sendToSubscription(row, notification));
  }

  return {
    ok: true,
    playerId,
    subscriptions: rows.length,
    sent: results.filter(x => x.ok).length,
    results
  };
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(event), body: '' };

  const body = parseBody(event);
  const action = safe(body.action || event.queryStringParameters?.action || 'ping');

  try {
    if (action === 'ping') {
      return reply(event, 200, {
        ok: true,
        service: 'vi3-webpush',
        ydbConfigured: !!(CFG.endpoint && CFG.database),
        vapidConfigured: !!(CFG.vapidPublicKey && CFG.vapidPrivateKey),
        table: TABLE,
        ts: Date.now()
      });
    }

    if (action === 'send_to_player') {
      return reply(event, 200, await actionSendToPlayer(event, body));
    }

    return reply(event, 400, { ok: false, error: 'bad_action', allowed: ['ping', 'send_to_player'] });
  } catch (err) {
    return reply(
      event,
      Number(err?.httpStatus || 500),
      {
        ok: false,
        error: safe(err?.message || 'server_error')
      }
    );
  }
};
