import { CLOUD_BACKUP_DIR } from '../analytics/cloud-contract.js';
import { EVENT_ARCHIVE_DIR, EVENT_ARCHIVE_INDEX_PATH, normalizeEventArchiveIndex, normalizeEventArchiveSegment, buildEventArchiveIndexItem } from '../analytics/event-archive-contract.js';
import { YANDEX_DISK_API as API, YANDEX_DISK_PROXY as PROXY, authHeaders as aH, fetchProxyJson as fPJ, uploadJson as pJP, ensureResourceDir } from './yandex-disk-transport.js';

const s = v => String(v == null ? '' : v).trim();
const safeJson = t => { try { return JSON.parse(t); } catch { return null; } };

const downloadJsonByPath = async (token, path) => {
  if (!token || !path) return null;
  const link = await fetch(`${API}/resources/download?path=${encodeURIComponent(path)}`, { headers: aH(token) }).catch(() => null);
  if (!link || link.status === 404) return null;
  if (!link.ok) throw new Error(`event_archive_link_failed:${link.status}`);
  const href = (await link.json().catch(() => null))?.href;
  if (!href) return null;
  const r = await fetch(href).catch(() => null);
  return r?.ok ? safeJson(await r.text()) : null;
};

export const YandexEventArchiveDisk = {
  async getEventArchiveIndexViaProxy(token) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY);
    u.searchParams.set('mode', 'event_index');
    const d = await fPJ(u.toString(), token, 2);
    return normalizeEventArchiveIndex(d?.index || d || { items: [] });
  },

  async downloadEventArchiveSegmentViaProxy(token, path) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY);
    u.searchParams.set('mode', 'event_download');
    u.searchParams.set('path', s(path));
    const d = await fPJ(u.toString(), token, 2);
    return d?.exists && d?.segment ? normalizeEventArchiveSegment(d.segment) : null;
  },

  async getEventArchiveIndex(token) {
    if (!token) throw new Error('no_token');
    if (this.getEventArchiveIndexViaProxy) return this.getEventArchiveIndexViaProxy(token);
    const raw = await downloadJsonByPath(token, EVENT_ARCHIVE_INDEX_PATH).catch(() => null);
    return normalizeEventArchiveIndex(raw || { items: [] });
  },

  async downloadEventArchiveSegment(token, path) {
    if (!token) throw new Error('no_token');
    if (this.downloadEventArchiveSegmentViaProxy) return this.downloadEventArchiveSegmentViaProxy(token, path);
    const raw = await downloadJsonByPath(token, s(path)).catch(() => null);
    return raw ? normalizeEventArchiveSegment(raw) : null;
  },

  async uploadEventSegment(token, segment) {
    if (!token) throw new Error('no_token');
    const doc = normalizeEventArchiveSegment(segment || {});
    const item = buildEventArchiveIndexItem({ ...doc, path: segment?.path });
    if (!item.path || !doc.events.length) return { ok: false, reason: 'empty_segment' };

    await ensureResourceDir(token, CLOUD_BACKUP_DIR).catch(() => null);
    await ensureResourceDir(token, EVENT_ARCHIVE_DIR).catch(() => null);
    await pJP(token, item.path, { ...doc, path: item.path });

    const old = await this.getEventArchiveIndex(token).catch(() => ({ items: [] }));
    const index = normalizeEventArchiveIndex([...(old?.items || []), item]);
    await pJP(token, EVENT_ARCHIVE_INDEX_PATH, index);

    return { ok: true, item, index };
  }
};

export default YandexEventArchiveDisk;
