// UID.099_(Multi-device sync model)_(локальный журнал sync revisions для отладки autosync)_(последние попытки, hash, domains, uploaded flags) UID.100_(Backup snapshot as life capsule)_(пользователь должен видеть что реально сохранялось)_(compact status в account UI)
const KEY = 'backup:sync_revisions:v1', s = v => String(v == null ? '' : v).trim(), n = v => Number.isFinite(Number(v)) ? Number(v) : 0, jp = (r, fb = []) => { try { return JSON.parse(r || ''); } catch { return fb; } };
export const readSyncRevisions = () => Array.isArray(jp(localStorage.getItem(KEY), [])) ? jp(localStorage.getItem(KEY), []) : [];
export const recordSyncRevision = ({ hash='', timestamp=Date.now(), domains=[], uploadedShared=false, uploadedDevice=false, reason='autosync', ok=true, error='' } = {}) => {
  const row = { hash: s(hash).slice(0, 16), timestamp: n(timestamp) || Date.now(), domains: [...new Set((Array.isArray(domains) ? domains : []).map(s).filter(Boolean))].slice(0, 8), uploadedShared: !!uploadedShared, uploadedDevice: !!uploadedDevice, reason: s(reason || 'autosync'), ok: !!ok, error: s(error).slice(0, 160) };
  try { localStorage.setItem(KEY, JSON.stringify([row, ...readSyncRevisions()].slice(0, 5))); window.dispatchEvent(new CustomEvent('backup:sync:revision', { detail: row })); } catch {} return row;
};
export const getSyncStatusLine = () => {
  const r = readSyncRevisions()[0]; if (!r) return 'ещё не сохранялось';
  const time = r.timestamp ? new Date(r.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
  if (!r.ok) return `ошибка ${time}${r.error ? ` · ${r.error}` : ''}`;
  return `сохранено ${time}${r.domains?.length ? ` · изменены: ${r.domains.join(', ')}` : ''}${r.uploadedDevice ? ' · device' : ''}`;
};
export default { readSyncRevisions, recordSyncRevision, getSyncStatusLine };
