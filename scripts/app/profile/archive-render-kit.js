// UID.096_(Helper-first anti-duplication policy)_(archive UI render helpers)_(summary/branches/candidates/table в одном месте)
// UID.100_(Backup snapshot as life capsule)_(archive maintenance/restore/ledger используют общий renderer)_(без изменения логики)
// UID.112_(Profile command center)_(единый стиль archive diagnostics)_(меньше inline HTML)

import { esc, renderCloudSectionCard, renderKeyValueRow, renderWarnList } from './profile-render-kit.js';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const s = v => String(v == null ? '' : v).trim();

export const renderArchiveSummaryCard = (p = {}, { title = 'Archive summary', style = '' } = {}) => {
  const branches = p.branches || p.summary?.branches || [], totals = p.totals || {};
  return renderCloudSectionCard({ title, style, body: `
    ${renderKeyValueRow({ label:'Branches', value:totals.branches || p.summary?.branchesCount || branches.length || 0, wordBreak:false })}
    ${renderKeyValueRow({ label:'Segments', value:totals.segments || p.beforeItems || p.summary?.segmentsCount || 0, wordBreak:false })}
    ${renderKeyValueRow({ label:'Events in index', value:totals.events || p.summary?.eventCount || p.eventCount || 0, wordBreak:false })}
    ${renderKeyValueRow({ label:'Downloaded / restored', value:`${p.downloadedSegments || p.summary?.downloadedSegments || 0} seg · ${p.restoredEventCount || p.summary?.restoredEventCount || 0} events`, wordBreak:false })}
    ${renderKeyValueRow({ label:'Noise / legacy / duplicates', value:`${p.noiseEvents || p.summary?.noiseEvents || 0} / ${p.legacyEvents || p.summary?.legacyEvents || 0} / ${p.duplicateEvents || p.summary?.duplicateEvents || 0}`, wordBreak:false })}
    ${p.beforeItems != null ? renderKeyValueRow({ label:'Compact index', value:`${p.beforeItems || 0} → ${p.afterItems || 0}`, valueColor:n(p.afterItems) < n(p.beforeItems) ? '#81c784' : '#9db7dd', wordBreak:false }) : ''}
  ` });
};

export const renderArchiveBranchesList = (branches = [], { title = 'Branches', style = 'margin-top:10px' } = {}) =>
  renderCloudSectionCard({ title, style, body: branches.length ? branches.map(b => `<div class="profile-list-item"><div style="font-size:20px">🌿</div><div class="log-info"><div class="log-title">${esc(b.branchId || 'legacy')}</div><div class="log-desc">chain: ${esc(b.chainId || '—')} · seg: ${n(b.segments)} · seq: ${n(b.fromSeq)}–${n(b.toSeq)}</div><div class="log-desc">events: ${n(b.events)} · size: ${esc(b.sizeHuman || '—')} · legacy: ${n(b.legacySegments)}</div></div></div>`).join('') : '<div class="fav-empty">Branches не найдены</div>' });

export const renderArchiveCandidatesList = (cand = [], { title = 'Кандидаты на исключение/удаление', style = 'margin-top:10px', selectable = false } = {}) => {
  const body = cand.length ? (selectable ? cand.map(x => `<label class="profile-list-item" style="align-items:flex-start"><input type="checkbox" data-arch-candidate value="${esc(x.path || '')}" style="margin-top:4px;accent-color:#4daaff"><div class="log-info"><div class="log-title">${esc(x.reason || 'candidate')}</div><div class="log-desc">${esc(x.path || '')}</div><div class="log-desc">useful ${n(x.usefulEvents)}/${n(x.events)} · ${esc(x.sizeHuman || '')}</div></div></label>`).join('') : renderWarnList({ items:cand.map(x => `${x.reason}: ${x.path} · useful ${x.usefulEvents}/${x.events} · ${x.sizeHuman || ''}`), empty:'Кандидатов нет' })) : '<div style="font-size:12px;color:#81c784">Явных duplicate/noise сегментов не найдено</div>';
  return renderCloudSectionCard({ title, style, body });
};

export const renderArchiveInlineSummary = aI => !aI ? '' : `<div style="margin-top:9px;color:#9db7dd;font-size:11px;line-height:1.45">Event archive: <b>${aI.available?'доступен':'нет'}</b>${aI.available ? ` · branches: <b>${n(aI.branchesCount)}</b> · сегментов: <b>${n(aI.segmentsCount)}</b> · index events: <b>${n(aI.eventCount)}</b> · restored: <b>${n(aI.restoredEventCount || aI.downloadedEvents || 0)}</b> · maxSeq: <b>${n(aI.maxSeq)}</b>${aI.head ? ` · head: <b>${esc(s(aI.head).slice(0,16))}</b>` : ''}<br>legacy/noise/duplicates/overlap: <b>${n(aI.legacyEvents || aI.legacySegments || 0)} / ${n(aI.noiseEvents || 0)} / ${n(aI.duplicateEvents || aI.duplicateRanges || 0)} / ${n(aI.overlapSegments || 0)}</b>` : ''}</div>`;

export const renderArchiveBranchesTable = aI => {
  const b = Array.isArray(aI?.branches) ? aI.branches : [];
  if (!b.length) return '';
  return `<div style="margin-top:9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;overflow:hidden"><div style="display:grid;grid-template-columns:1.4fr .9fr .75fr .9fr;padding:7px 8px;background:rgba(255,255,255,.04);font-size:10px;color:#8ab8fd;font-weight:900;text-transform:uppercase;gap:6px"><span>branch</span><span>seq</span><span>events</span><span>legacy/noise</span></div>${b.slice(0,8).map(x => `<div style="display:grid;grid-template-columns:1.4fr .9fr .75fr .9fr;padding:7px 8px;border-top:1px solid rgba(255,255,255,.04);font-size:10.5px;color:#dceaff;gap:6px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(x.branchId || 'legacy')}">${esc(x.branchId || 'legacy')}</span><span>${n(x.fromSeq)}–${n(x.toSeq)}</span><span>${n(x.events)}</span><span>${n(x.legacySegments)} / ${n(x.noiseEvents || 0)}</span></div>`).join('')}</div>`;
};

export default { renderArchiveSummaryCard, renderArchiveBranchesList, renderArchiveCandidatesList, renderArchiveInlineSummary, renderArchiveBranchesTable };
