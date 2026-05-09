import { CLOUD_BACKUP_DIR } from '../analytics/cloud-contract.js';
import { EVENT_ARCHIVE_DIR, normalizeEventArchiveIndex, normalizeEventArchiveSegment, buildEventArchiveIndexItem } from '../analytics/event-archive-contract.js';
import { YANDEX_DISK_PROXY as PROXY, fetchProxyJson as fPJ, uploadJson as pJP, ensureResourceDir } from './yandex-disk-transport.js';

const s = v => String(v == null ? '' : v).trim();
const jp = t => { try { return JSON.parse(t); } catch { return null; } };
const postProxyJson = async (mode, token, body = {}) => {
  const u = new URL(PROXY); u.searchParams.set('mode', mode); u.searchParams.set('token', token);
  const r = await fetch(u.toString(), { method:'POST', headers:{ 'X-Yandex-Auth':token, 'Content-Type':'application/json', Accept:'application/json' }, credentials:'omit', mode:'cors', body:JSON.stringify(body || {}) });
  const txt = await r.text(), j = jp(txt) || {};
  if (!r.ok || j.ok === false) { const e = new Error(s(j.error || `proxy_${mode}_${r.status}`)); e.status = r.status; e.payload = j; throw e; }
  return j;
};

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

  async inspectEventArchive(token) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY); u.searchParams.set('mode', 'archive_inspect');
    const d = await fPJ(u.toString(), token, 2);
    return d?.archive || { index: { items: [] }, branches: [], totals: {} };
  },

  async uploadEventArchiveIndex(token, index) {
    if (!token) throw new Error('no_token');
    await ensureResourceDir(token, CLOUD_BACKUP_DIR).catch(() => null);
    await ensureResourceDir(token, EVENT_ARCHIVE_DIR).catch(() => null);
    await pJP(token, 'app:/Backup/events/index.json', normalizeEventArchiveIndex(index || { items: [] }));
    return true;
  },

  async listEventArchiveFiles(token) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY); u.searchParams.set('mode', 'archive_list_files');
    const d = await fPJ(u.toString(), token, 2);
    return d?.archive || { items: [], totals: {} };
  },

  async deleteEventArchiveSegments(token, paths = []) {
    if (!token) throw new Error('no_token');
    return await postProxyJson('archive_delete_segments', token, { paths: (Array.isArray(paths) ? paths : []).map(s).filter(Boolean) });
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
