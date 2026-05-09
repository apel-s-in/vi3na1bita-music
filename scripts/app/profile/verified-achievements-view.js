// UID.111_(Prize/global achievements distinction)_(показывать verified слой отдельно от локальных ачивок)_(local не блокируется)
// UID.112_(Profile command center)_(Проверенные достижения / Готово к claim / Нужна проверка)_(центр внешней валидности)
// UID.094_(No-paralysis rule)_(verified UI не влияет на playback)_(только render + Cloud Function calls)

import { readVerifiedAchievementState, refreshVerifiedAchievementState } from '../../analytics/verified-achievement-state.js';
import { metaDB } from '../../analytics/meta-db.js';
import { esc, fmtDateTime, renderCloudSectionCard, renderKeyValueRow, renderStatusPill } from './profile-render-kit.js';

const tone = r => r.suspicious ? 'warn' : (r.claimable ? 'ok' : (r.verified ? 'info' : 'muted'));
const label = r => r.claimable ? 'Готово к claim' : r.suspicious ? 'Нужна проверка' : r.verified ? 'Проверено' : r.synced ? 'Синхронизировано' : 'Локально';
const row = r => `<div class="profile-list-item"><div style="font-size:20px">${r.claimable?'🎁':r.verified?'✅':r.suspicious?'⚠️':'🏆'}</div><div class="log-info"><div class="log-title">${esc(window.achievementEngine?.dict?.[r.id]?.ui?.name || r.id)} ${renderStatusPill({ text: label(r), tone: tone(r) })}</div><div class="log-desc">${esc(r.reason || r.status || '')}${r.unlockedAt ? ` · ${fmtDateTime(r.unlockedAt)}` : ''}</div></div>${r.claimable ? `<button class="om-btn om-btn--primary" data-claim-prepare="${esc(r.id)}">Claim</button>` : ''}</div>`;

const renderSummary = st => [['Локально открыто', st?.summary?.totalLocalUnlocked || 0], ['Синхронизировано', st?.summary?.synced || 0], ['Проверено сервером', st?.summary?.verified || 0], ['Готово к claim', st?.summary?.claimable || 0, '#81c784'], ['Нужна проверка', st?.summary?.suspicious || 0, st?.summary?.suspicious ? '#ffb74d' : '#9db7dd'], ['Статус сервера', st?.serverOk ? 'доступен' : (st?.serverError || 'нет проверки')]].map(([label, value, valueColor]) => renderKeyValueRow({ label, value, valueColor, wordBreak:false })).join('');
const render = st => {
  const items = st?.items || [], claim = items.filter(x => x.claimable), susp = items.filter(x => x.suspicious), ver = items.filter(x => x.verified && !x.claimable && !x.suspicious);
  return `${renderCloudSectionCard({ title:'Проверенные достижения', body: renderSummary(st) })}${renderCloudSectionCard({ title:'Готово к claim', style:'margin-top:10px', body: claim.length ? claim.map(row).join('') : '<div class="fav-empty">Пока нет claimable достижений</div>' })}${renderCloudSectionCard({ title:'Нужна проверка', style:'margin-top:10px', body: susp.length ? susp.map(row).join('') : '<div style="font-size:12px;color:#81c784">Подозрительных verified-флагов нет</div>' })}${renderCloudSectionCard({ title:'Проверено', style:'margin-top:10px', body: ver.length ? ver.slice(0, 8).map(row).join('') : '<div class="fav-empty">Проверенных достижений пока нет</div>' })}<div class="profile-inline-actions"><button class="modal-action-btn online" data-verified-refresh="1">Обновить verified</button></div><div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Локальные достижения не блокируются. Server validation нужна только для внешних призов/claim.</div>`;
};

export const renderVerifiedAchievementsSection = async ({ container } = {}) => {
  const root = container?.querySelector?.('#prof-verified-achievements');
  if (!root) return false;
  const load = async (force = false) => force ? refreshVerifiedAchievementState({ db: metaDB }) : readVerifiedAchievementState({ db: metaDB });
  root.innerHTML = render(await load(false).catch(() => ({ summary:{}, items:[], serverOk:false, serverError:'verify_unavailable' })));
  if (root._verifiedBound) return true;
  root._verifiedBound = true;
  root.addEventListener('click', async e => {
    if (e.target.closest('[data-verified-refresh]')) {
      root.innerHTML = render(await load(true).catch(err => ({ summary:{}, items:[], serverOk:false, serverError:String(err?.message || '') })));
      window.NotificationSystem?.success?.('Verified обновлён ✅');
      return;
    }
    const id = e.target.closest('[data-claim-prepare]')?.dataset.claimPrepare;
    if (!id) return;
    try {
      const token = window.YandexAuth?.getToken?.();
      const r = await window.YandexDisk?.prepareClaim?.(token, id);
      window.Modals?.open?.({ title:'Claim', maxWidth:390, bodyHtml:`${renderCloudSectionCard({ title:'Claim request', body: `
        ${renderKeyValueRow({ label:'Achievement', value:id })}
        ${renderKeyValueRow({ label:'Claim ID', value:r?.claimId || '—' })}
        ${renderKeyValueRow({ label:'Status', value:r?.status || '—' })}
        ${renderKeyValueRow({ label:'Result', value:r?.result || '—' })}
      ` })}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Это подготовка claim. Финальная выдача приза позже будет отдельным серверным процессом.</div>` });
    } catch (err) {
      window.NotificationSystem?.error?.('Claim prepare не удался: ' + String(err?.message || ''));
    }
  });
  return true;
};

export default { renderVerifiedAchievementsSection };
