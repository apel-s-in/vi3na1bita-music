// UID.104_(Trust and eligibility state)_(ledger health + trust summary + server verify)_(hot/warm/head/seq/branch/warnings/repair/trust)
// UID.112_(Profile command center)_(личный кабинет показывает состояние доказательного журнала)_(без влияния на playback)

import { getLedgerHealth, rebuildLedgerCheckpointFromEvents } from '../../analytics/event-integrity.js';
import { readTrustState, refreshTrustState } from '../../analytics/trust-state.js';
import { metaDB } from '../../analytics/meta-db.js';
import { renderCloudSectionCard, fmtDateTime, renderInlineActions, renderKeyValueRow, renderWarnList, renderScoreBar } from './profile-render-kit.js';
import { renderArchiveSummaryCard } from './archive-render-kit.js';

const readCloudMeta = () => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; } };

const renderServerVerify = v => !v ? '' : `${renderCloudSectionCard({ title:'Server-side ledger verify', style:'margin-top:10px', body: `
  ${renderKeyValueRow({ label:'Статус', value:v.status || '—', valueColor:v.ok ? '#81c784' : '#ffb74d' })}
  ${renderKeyValueRow({ label:'Payload hash', value:v.payload?.reason || '—' })}
  ${renderKeyValueRow({ label:'Event hashes', value:`checked: ${v.eventHashes?.checked || 0} · broken: ${v.eventHashes?.broken || 0}` })}
  ${renderKeyValueRow({ label:'Chains', value:`${v.eventChain?.chains || 0} · links: ${v.eventChain?.checkedLinks || 0} · broken: ${v.eventChain?.brokenLinks || 0}` })}
  ${renderKeyValueRow({ label:'Archivable head', value:v.archivableLedgerHead ? `${String(v.archivableLedgerHead).slice(0,16)} · reachable: ${v.archivableReachable ? 'yes' : 'no'}` : '—', valueColor:v.archivableReachable === false ? '#ffb74d' : '#9db7dd' })}
` })}${renderArchiveSummaryCard({ totals:{ segments:v.archive?.segmentsCount || 0, events:v.archive?.eventCount || 0 }, downloadedSegments:v.archive?.downloadedSegments || 0, restoredEventCount:v.archive?.eventCount || 0 }, { title:'Server archive coverage', style:'margin-top:10px' })}`;

const renderHealthHtml = ({ h, trust, server = null }) => {
  const cp = h.checkpoint || {};
  return `${renderCloudSectionCard({ title:'Event Ledger', body: `
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
  ` })}${renderServerVerify(server)}${renderCloudSectionCard({ title:'Предупреждения ledger', style:'margin-top:10px', body: renderWarnList({ items:h.warnings || [] }) })}${renderInlineActions([{ text:'Пересобрать checkpoint', attrs:'data-ledger-repair="1"' }, { text:'Обновить trust', attrs:'data-trust-refresh="1"' }, { text:'Проверить ledger server-side', primary:true, attrs:'data-ledger-server="1"' }])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Ledger/trust/server verify только диагностируют историю. Музыку, очередь и настройки воспроизведения не трогают.</div>`;
};

export const openLedgerHealthModal = async () => {
  let server = null;
  const load = async () => ({
    h: await getLedgerHealth({ db: metaDB, cloudMeta: readCloudMeta() }).catch(e => ({ checkpoint:{}, hotCount:0, warmCount:0, totalCount:0, branchState:'error', warnings:[String(e?.message || 'ledger health failed')] })),
    trust: await readTrustState({ db: metaDB }).catch(() => ({ status:'error', label:'Trust недоступен', score:0, flags:[] })),
    server
  });
  const m = window.Modals?.open?.({ title:'Диагностика журнала', maxWidth:430, bodyHtml:renderHealthHtml(await load()) });
  m?.addEventListener('click', async e => {
    if (e.target.closest('[data-ledger-server]')) {
      try {
        const t = window.YandexAuth?.getToken?.();
        server = await window.YandexDisk?.verifyLedger?.(t);
        if (m.isConnected) m.querySelector('.modal-body').innerHTML = renderHealthHtml(await load());
        window.NotificationSystem?.success?.('Server-side ledger verify выполнен ✅');
      } catch (err) { window.NotificationSystem?.error?.('Server verify не удался: ' + String(err?.message || '')); }
      return;
    }
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
