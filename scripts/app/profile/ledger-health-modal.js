// UID.104_(Trust and eligibility state)_(публичная диагностика ledger health)_(hot/warm/head/seq/branch/warnings/repair)
// UID.112_(Profile command center)_(личный кабинет показывает состояние доказательного журнала)_(без влияния на playback)

import { getLedgerHealth, rebuildLedgerCheckpointFromEvents } from '../../analytics/event-integrity.js';
import { metaDB } from '../../analytics/meta-db.js';
import { esc, renderCloudSectionCard, fmtDateTime, renderInlineActions } from './profile-render-kit.js';

const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:#8ea8cc;font-size:12px">${esc(k)}</span><b style="color:#eaf2ff;font-size:12px;text-align:right;word-break:break-all">${esc(v)}</b></div>`;

const readCloudMeta = () => {
  try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; }
};

const renderHealthHtml = h => {
  const cp = h.checkpoint || {};
  return `${renderCloudSectionCard({ title: 'Event Ledger', body: `
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
    ${row('Last repair', h.lastRepairAt ? `${fmtDateTime(h.lastRepairAt)} · ${h.repairReason || 'repair'} · ${h.repairedEvents || 0} events` : '—')}
  ` })}${renderCloudSectionCard({ title: 'Предупреждения', style: 'margin-top:10px', body: h.warnings?.length ? `<ul style="margin:0 0 0 18px;color:#ffb74d;font-size:12px;line-height:1.5">${h.warnings.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div style="font-size:12px;color:#81c784">Критичных предупреждений нет</div>' })}${renderInlineActions([{ text: 'Пересобрать checkpoint', attrs: 'data-ledger-repair="1"' }])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Repair пересобирает ledger checkpoint из локальных events_warm + events_hot. Музыку, очередь и настройки воспроизведения не трогает.</div>`;
};

export const openLedgerHealthModal = async () => {
  const load = () => getLedgerHealth({ db: metaDB, cloudMeta: readCloudMeta() }).catch(e => ({ checkpoint: {}, hotCount: 0, warmCount: 0, totalCount: 0, branchState: 'error', warnings: [String(e?.message || 'ledger health failed')] }));
  const m = window.Modals?.open?.({ title: 'Диагностика журнала', maxWidth: 430, bodyHtml: renderHealthHtml(await load()) });
  m?.addEventListener('click', async e => {
    if (!e.target.closest('[data-ledger-repair]')) return;
    window.Modals?.confirm?.({
      title: 'Пересобрать ledger checkpoint?',
      textHtml: 'Будет пересобрана локальная hash-chain из events_warm + events_hot. Это не влияет на воспроизведение и не очищает статистику.',
      confirmText: 'Пересобрать',
      cancelText: 'Отмена',
      onConfirm: async () => {
        try {
          await rebuildLedgerCheckpointFromEvents({ db: metaDB, reason: 'manual_health_repair' });
          if (m.isConnected) m.querySelector('.modal-body').innerHTML = renderHealthHtml(await load());
          window.NotificationSystem?.success?.('Ledger checkpoint пересобран ✅');
        } catch (err) {
          window.NotificationSystem?.error?.('Repair не удался: ' + String(err?.message || ''));
        }
      }
    });
  });
};

export default { openLedgerHealthModal };
