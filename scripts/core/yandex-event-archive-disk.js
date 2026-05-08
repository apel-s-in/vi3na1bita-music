import { CLOUD_BACKUP_DIR } from '../analytics/cloud-contract.js';
import { EVENT_ARCHIVE_DIR, normalizeEventArchiveIndex, normalizeEventArchiveSegment, buildEventArchiveIndexItem } from '../analytics/event-archive-contract.js';
import { YANDEX_DISK_PROXY as PROXY, fetchProxyJson as fPJ, uploadJson as pJP, ensureResourceDir } from './yandex-disk-transport.js';

const s = v => String(v == null ? '' : v).trim();

export const YandexEventArchiveDisk = {
  async getEventArchiveIndexViaProxy(token) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY); u.searchParams.set('mode', 'event_index');
    const d = await fPJ(u.toString(), token, 2);
    return normalizeEventArchiveIndex(d?.index || { items: [] });
  },

  async downloadEventArchiveSegmentViaProxy(token, path) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY); u.searchParams.set('mode', 'event_download'); u.searchParams.set('path', s(path));
    const d = await fPJ(u.toString(), token, 2);
    return d?.exists && d?.segment ? normalizeEventArchiveSegment(d.segment) : null;
  },

  async getEventArchiveIndex(token) {
    return this.getEventArchiveIndexViaProxy(token);
  },

  async downloadEventArchiveSegment(token, path) {
    return this.downloadEventArchiveSegmentViaProxy(token, path);
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
    await pJP(token, 'app:/Backup/events/index.json', index);

    return { ok: true, item, index };
  }
};

export default YandexEventArchiveDisk;
