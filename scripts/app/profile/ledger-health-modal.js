// UID.104_(Trust and eligibility state)_(публичная диагностика ledger health)_(hot/warm/head/seq/branch/warnings)
// UID.112_(Profile command center)_(личный кабинет показывает состояние доказательного журнала)_(без влияния на playback)

import { getLedgerHealth } from '../../analytics/event-integrity.js';
import { metaDB } from '../../analytics/meta-db.js';
import { esc, renderCloudSectionCard, fmtDateTime } from './cloud-card-renderers.js';

const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:#8ea8cc;font-size:12px">${esc(k)}</span><b style="color:#eaf2ff;font-size:12px;text-align:right;word-break:break-all">${esc(v)}</b></div>`;

export const openLedgerHealthModal = async () => {
  let cloudMeta = null;
  try { cloudMeta = JSON.parse(localStorage.getItem('yandex:last_backup_meta') || localStorage.getItem('yandex:last_backup_check') || 'null'); } catch {}
  const h = await getLedgerHealth({ db: metaDB, cloudMeta }).catch(e => ({ checkpoint: {}, hotCount: 0, warmCount: 0, totalCount: 0, branchState: 'error', warnings: [String(e?.message || 'ledger health failed')] }));
  const cp = h.checkpoint || {};
  window.Modals?.open?.({
    title: 'Диагностика журнала',
    maxWidth: 430,
    bodyHtml: `${renderCloudSectionCard({ title: 'Event Ledger', body: `
      ${row('Hot events', h.hotCount || 0)}
      ${row('Warm events', h.warmCount || 0)}
      ${row('Всего в локальном окне', h.totalCount || 0)}
      ${row('Chain ID', cp.chainId || '—')}
      ${row('Device seq', cp.deviceSeq || 0)}
      ${row('Last event hash', cp.headHash || '—')}
      ${row('Checkpoint updated', cp.updatedAt ? fmtDateTime(cp.updatedAt) : '—')}
      ${row('Cloud branch', h.branchState || 'cloud_unknown')}
      ${row('Cloud seq', h.cloudSeq || 0)}
      ${row('Cloud head', h.cloudHead || '—')}
    ` })}${renderCloudSectionCard({ title: 'Предупреждения', style: 'margin-top:10px', body: h.warnings?.length ? `<ul style="margin:0 0 0 18px;color:#ffb74d;font-size:12px;line-height:1.5">${h.warnings.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div style="font-size:12px;color:#81c784">Критичных предупреждений нет</div>' })}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Ledger — локальная проверяемая цепочка событий. Она не блокирует музыку и локальный прогресс, но станет основой будущей проверки достижений и призов.</div>`
  });
};

export default { openLedgerHealthModal };
