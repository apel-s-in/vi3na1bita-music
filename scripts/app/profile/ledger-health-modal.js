// UID.104_(Trust and eligibility state)_(ledger health + trust summary)_(hot/warm/head/seq/branch/warnings/repair/trust)
// UID.112_(Profile command center)_(личный кабинет показывает состояние доказательного журнала)_(без влияния на playback)

import { getLedgerHealth, rebuildLedgerCheckpointFromEvents } from '../../analytics/event-integrity.js';
import { readTrustState, refreshTrustState } from '../../analytics/trust-state.js';
import { metaDB } from '../../analytics/meta-db.js';
import { esc, renderCloudSectionCard, fmtDateTime, renderInlineActions } from './profile-render-kit.js';

const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:#8ea8cc;font-size:12px">${esc(k)}</span><b style="color:#eaf2ff;font-size:12px;text-align:right;word-break:break-all">${esc(v)}</b></div>`;
const readCloudMeta = () => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; } };
const trustColor = st => st === 'suspicious' ? '#ff6b6b' : (st === 'review' ? '#ffb74d' : '#81c784');

const renderHealthHtml = ({ h, trust }) => {
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
  ` })}${renderCloudSectionCard({ title: 'Trust summary', style: 'margin-top:10px', body: `
    ${row('Статус', trust?.label || trust?.status || '—')}
    ${row('Score', `${trust?.score || 0}/100`)}
    ${row('Флаги', `${trust?.flags?.length || 0} · high: ${trust?.highCount || 0} · medium: ${trust?.mediumCount || 0}`)}
    <div style="height:6px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden;margin-top:8px"><div style="height:100%;width:${Math.max(0, Math.min(100, Number(trust?.score || 0)))}%;background:${trustColor(trust?.status)}"></div></div>
  ` })}${renderCloudSectionCard({ title: 'Предупреждения ledger', style: 'margin-top:10px', body: h.warnings?.length ? `<ul style="margin:0 0 0 18px;color:#ffb74d;font-size:12px;line-height:1.5">${h.warnings.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div style="font-size:12px;color:#81c784">Критичных предупреждений нет</div>' })}${renderInlineActions([{ text: 'Пересобрать checkpoint', attrs: 'data-ledger-repair="1"' }, { text: 'Обновить trust', primary: true, attrs: 'data-trust-refresh="1"' }])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Ledger и trust-state только диагностируют историю. Музыку, очередь и настройки воспроизведения не трогают.</div>`;
};

export const openLedgerHealthModal = async () => {
  const load = async () => ({
    h: await getLedgerHealth({ db: metaDB, cloudMeta: readCloudMeta() }).catch(e => ({ checkpoint: {}, hotCount: 0, warmCount: 0, totalCount: 0, branchState: 'error', warnings: [String(e?.message || 'ledger health failed')] })),
    trust: await readTrustState({ db: metaDB }).catch(() => ({ status: 'error', label: 'Trust недоступен', score: 0, flags: [] }))
  });
  const m = window.Modals?.open?.({ title: 'Диагностика журнала', maxWidth: 430, bodyHtml: renderHealthHtml(await load()) });
  m?.addEventListener('click', async e => {
    if (e.target.closest('[data-trust-refresh]')) {
      await refreshTrustState({ db: metaDB, reason: 'ledger_health_refresh' }).catch(() => null);
      if (m.isConnected) m.querySelector('.modal-body').innerHTML = renderHealthHtml(await load());
      return window.NotificationSystem?.success?.('Trust summary обновлён ✅');
    }
    if (!e.target.closest('[data-ledger-repair]')) return;
    window.Modals?.confirm?.({
      title: 'Пересобрать ledger checkpoint?',
      textHtml: 'Будет пересобрана локальная hash-chain из events_warm + events_hot. Это не влияет на воспроизведение и не очищает статистику.',
      confirmText: 'Пересобрать',
      cancelText: 'Отмена',
      onConfirm: async () => {
        try {
          await rebuildLedgerCheckpointFromEvents({ db: metaDB, reason: 'manual_health_repair' });
          await refreshTrustState({ db: metaDB, reason: 'after_ledger_repair' }).catch(() => null);
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
