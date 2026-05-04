// UID.004_(Stats as cache)_(statistics modal читает stats-state view model)_(без дублирования расчётов)
// UID.038_(Track profile modal)_(track modal вынесен в scripts/ui/track-statistics-modal.js)
// UID.094_(No-paralysis rule)_(statistics modal не влияет на playback)_(только чтение MetaDB и render)

import { metaDB } from '../analytics/meta-db.js';
import { buildStatsViewModel } from '../analytics/stats-state.js';
import { fmtAchTimerText } from './progress-formatters.js';
import { openTrackStatisticsModal } from './track-statistics-modal.js';

const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
const dur = s => window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(s || 0) : `${Math.floor((s || 0) / 60)}м`;

const renderTopTracks = rows => rows.length ? rows.map(s => {
  const tr = window.TrackRegistry?.getTrackByUid(s.uid);
  return tr ? `<div class="sm-top-row" data-uid="${esc(s.uid)}"><span class="sm-top-title">${esc(tr.title)}</span><b class="sm-top-val">${s.globalFullListenCount || 0} раз</b></div>` : '';
}).join('') : '<div class="sm-empty">Слушайте музыку, чтобы увидеть топ</div>';

const renderAchievements = engine => {
  const achVal = engine?.unlocked || {};
  return (engine?.achievements || []).map(a => `<div class="ach-item ${achVal[a.id] ? '' : 'locked'} sm-ach-row"><div class="ach-icon sm-ach-icon ${achVal[a.id] ? '' : 'sm-ach-locked'}">${esc(a.icon)}</div><div class="sm-ach-main"><div class="sm-ach-name">${esc(a.name)}</div><div class="sm-ach-desc">${esc(a.desc)}${!achVal[a.id] && a.progressMeta ? ` · ${esc(fmtAchTimerText(a, 'remaining'))}` : ''}</div></div>${achVal[a.id] ? '<div class="sm-ach-ok">✓</div>' : ''}</div>`).join('') || '<div class="sm-empty">Достижения пока недоступны</div>';
};

export async function openStatisticsModal(uid = null) {
  if (uid || window.playerCore?.getCurrentTrackUid?.()) return openTrackStatisticsModal(uid);

  const vm = buildStatsViewModel(await metaDB.getAllStats());
  const engine = window.achievementEngine, f = vm.globalFeatures;

  window.Modals?.open?.({
    title: 'Профиль слушателя',
    maxWidth: 400,
    bodyHtml: `<div class="sm-note">Не удалось определить текущий трек. Показана общая статистика.</div><div class="stats-grid-compact sm-mb20"><div class="stat-box"><b>${vm.summary.totalFull}</b><span>Треков</span></div><div class="stat-box"><b>${dur(vm.summary.totalSec)}</b><span>В пути</span></div><div class="stat-box"><b>${String(vm.peakHour).padStart(2,'0')}:00</b><span>Пик активности</span></div><div class="stat-box"><b>${esc(vm.peakDaypart)}</b><span>Пик времени</span></div></div><div class="sm-card"><div class="sm-cap">🌙 ТАЙМЕР СНА</div><div>Срабатываний: <b>${f.sleep_timer || 0}</b></div><div>Установок: <b>${f.sleep_timer_set || 0}</b></div><div>Продлений: <b>${f.sleep_timer_extend || 0}</b></div><div>Отмен: <b>${f.sleep_timer_cancel || 0}</b></div><div>Сумма минут: <b>${f.sleep_timer_minutes_total || 0}</b></div></div><div class="sm-card-lg"><div class="sm-cap">🏆 ТОП 5 ТРЕКОВ</div>${renderTopTracks(vm.topFull)}</div><div class="sm-cap">ДОСТИЖЕНИЯ (${Object.keys(engine?.unlocked || {}).length}/${engine?.achievements?.length || 0})</div><div class="sm-ach-wrap">${renderAchievements(engine)}</div>`
  });

  window.AlbumsManager?.highlightCurrentTrack?.();
}

window.StatisticsModal = { openStatisticsModal, init: () => document.addEventListener('click', e => {
  const btn = e.target.closest('.stats-trigger');
  if (btn) openStatisticsModal(btn.dataset.uid);
}) };

export default { openStatisticsModal };
