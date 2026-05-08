// UID.104_(Trust and eligibility state)_(ledger health + trust summary)_(hot/warm/head/seq/branch/warnings/repair/trust)
// UID.112_(Profile command center)_(личный кабинет показывает состояние доказательного журнала)_(без влияния на playback)

import { getLedgerHealth, rebuildLedgerCheckpointFromEvents } from '../../analytics/event-integrity.js';
import { readTrustState, refreshTrustState } from '../../analytics/trust-state.js';
import { metaDB } from '../../analytics/meta-db.js';
import { renderCloudSectionCard, fmtDateTime, renderInlineActions, renderKeyValueRow, renderWarnList, renderScoreBar } from './profile-render-kit.js';

const readCloudMeta = () => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; } };

const renderHealthHtml = ({ h, trust }) => {
  const cp = h.checkpoint || {};
  return `${renderCloudSectionCard({ title: 'Event Ledger', body: `
    ${renderKeyValueRow({ label:'Hot events', value:h.hotCount || 0 })}
    ${renderKeyValueRow({ label:'Warm events', value:h.warmCount || 0 })}
    ${renderKeyValueRow({ label:'Всего в локальном окне', value:h.totalCount || 0 })}
    ${renderKeyValueRow({ label:'Chain ID', value:cp.chainId || '—' })}
    ${renderKeyValueRow({ label:'Device seq', value:cp.deviceSeq || 0 })}
    ${renderKeyValueRow({ label:'Last event hash', value:cp.headHash || '—' })}
    ${renderKeyValueRow({ label:'Checkpoint updated', value:cp.updatedAt ? fmtDateTime(cp.updatedAt) : '—' })}
    ${renderKeyValueRow({ label:'Cloud branch', value:h.branchState || 'cloud_unknown' })}
    ${renderKeyValueRow({ label:'Cloud seq', value:h.cloudSeq || 0 })}
    ${renderKeyValueRow({ label:'Cloud head', value:h.cloudHead || '—' })}
    ${renderKeyValueRow({ label:'Last repair', value:h.lastRepairAt ? `${fmtDateTime(h.lastRepairAt)} · ${h.repairReason || 'repair'} · ${h.repairedEvents || 0} events` : '—' })}
  ` })}${renderCloudSectionCard({ title:'Trust summary', style:'margin-top:10px', body: `
    ${renderKeyValueRow({ label:'Статус', value:trust?.label || trust?.status || '—' })}
    ${renderKeyValueRow({ label:'Score', value:`${trust?.score || 0}/100` })}
    ${renderKeyValueRow({ label:'Флаги', value:`${trust?.flags?.length || 0} · high: ${trust?.highCount || 0} · medium: ${trust?.mediumCount || 0}` })}
    ${renderScoreBar({ score:trust?.score || 0, status:trust?.status || 'ok' })}
  ` })}${renderCloudSectionCard({ title:'Предупреждения ledger', style:'margin-top:10px', body: renderWarnList({ items:h.warnings || [] }) })}${renderInlineActions([{ text:'Пересобрать checkpoint', attrs:'data-ledger-repair="1"' }, { text:'Обновить trust', primary:true, attrs:'data-trust-refresh="1"' }])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Ledger и trust-state только диагностируют историю. Музыку, очередь и настройки воспроизведения не трогают.</div>`;
};

export const openLedgerHealthModal = async () => {
  const load = async () => ({
    h: await getLedgerHealth({ db: metaDB, cloudMeta: readCloudMeta() }).catch(e => ({ checkpoint:{}, hotCount:0, warmCount:0, totalCount:0, branchState:'error', warnings:[String(e?.message || 'ledger health failed')] })),
    trust: await readTrustState({ db: metaDB }).catch(() => ({ status:'error', label:'Trust недоступен', score:0, flags:[] }))
  });
  const m = window.Modals?.open?.({ title:'Диагностика журнала', maxWidth:430, bodyHtml:renderHealthHtml(await load()) });
  m?.addEventListener('click', async e => {
    if (e.target.closest('[data-trust-refresh]')) {
      await refreshTrustState({ db: metaDB, reason:'ledger_health_refresh' }).catch(() => null);
      if (m.isConnected) m.querySelector('.modal-body').innerHTML = renderHealthHtml(await load());
      return window.NotificationSystem?.success?.('Trust summary обновлён ✅');
    }
    if (!e.target.closest('[data-ledger-repair]')) return;
    window.Modals?.confirm?.({
      title:'Пересобрать ledger checkpoint?',
      textHtml:'Будет пересобрана локальная hash-chain из events_warm + events_hot. Это не влияет на воспроизведение и не очищает статистику.',
      confirmText:'Пересобрать',
      cancelText:'Отмена',
      onConfirm:async () => {
        try {
          await rebuildLedgerCheckpointFromEvents({ db: metaDB, reason:'manual_health_repair' });
          await refreshTrustState({ db: metaDB, reason:'after_ledger_repair' }).catch(() => null);
          if (m.isConnected) m.querySelector('.modal-body').innerHTML = renderHealthHtml(await load());
          window.NotificationSystem?.success?.('Ledger checkpoint пересобран ✅');
        } catch (err) { window.NotificationSystem?.error?.('Repair не удался: ' + String(err?.message || '')); }
      }
    });
  });
};

export default { openLedgerHealthModal };
