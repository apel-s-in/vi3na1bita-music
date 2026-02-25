import { metaDB } from './meta-db.js';

export class AchievementEngine {
  constructor() {
    this.achievements = this._createList();
    window.addEventListener('stats:updated', () => this.check());
  }

  _createList() {
    const list = [
      { id: 'first_blood', name: 'Искра', desc: 'Прослушан 1 трек полностью', icon: '🔥', check: s => s.listens >= 1 },
      { id: 'streak_3', name: 'Меломан', desc: 'Слушал 3 дня подряд', icon: '⚡', check: s => s.streak >= 3 },
      { id: 'streak_7', name: 'В ритме недели', desc: 'Слушал 7 дней подряд', icon: '📅', check: s => s.streak >= 7 },
      { id: 'streak_30', name: 'Легенда', desc: 'Слушал 30 дней подряд', icon: '👑', check: s => s.streak >= 30 },
      { id: 'night_owl', name: 'Ночной дозор', desc: 'Слушал музыку ночью', icon: '🦉', check: s => new Date().getHours() < 5 },
      { id: 'early_bird', name: 'Ранняя пташка', desc: 'Слушал музыку с утра', icon: '🌅', check: s => new Date().getHours() >= 5 && new Date().getHours() <= 8 },
      { id: 'time_10h', name: 'Путешественник', desc: 'Проведено в приложении более 10 часов', icon: '⏳', check: s => s.time >= 36000 },
      { id: 'offline_master', name: 'Бункер', desc: 'Включен офлайн-режим', icon: '🔒', check: s => window.OfflineManager?.getMode?.() === 'R1' || window.OfflineManager?.getMode?.() === 'R2' },
      { id: 'lyrics_reader', name: 'Поэт', desc: 'Использовал функцию полного текста', icon: '📝', check: s => s.feats['lyrics_modal'] },
      { id: 'anim_lover', name: 'Цветомузыка', desc: 'Включил анимацию лирики', icon: '✨', check: s => s.feats['anim_on'] }
    ];
    
    // Динамическая генерация уровней "Аудиофила" до 100
    for (let i = 1; i <= 90; i++) {
      let icon = '🎧';
      if (i % 10 === 0) icon = '🥉';
      if (i % 25 === 0) icon = '🥈';
      if (i % 50 === 0) icon = '🥇';
      if (i === 90) icon = '💎';
      
      list.push({
        id: `level_${i}`,
        name: `Аудиофил: Уровень ${i}`,
        desc: `Всего полных прослушиваний: ${i * 10}`,
        icon,
        check: s => s.listens >= (i * 10)
      });
    }
    return list;
  }

  async check() {
    const s_listens = await metaDB.getStat('globalFullListens');
    const s_time = await metaDB.getStat('totalListenTime');
    const s_feats = await metaDB.getStat('features');
    const s_streak = await metaDB.getStat('dailyStreak');
    
    const statsObj = {
      listens: s_listens?.value || 0,
      time: s_time?.value || 0,
      feats: s_feats?.details || {},
      streak: s_streak?.value || 0
    };

    const unlocked = (await metaDB.getStat('unlocked_achievements'))?.details || {};
    let changed = false;

    for (const ach of this.achievements) {
      if (!unlocked[ach.id] && ach.check(stats)) {
        unlocked[ach.id] = Date.now();
        changed = true;
        window.NotificationSystem?.success(`🏆 Достижение: ${ach.name}`);
      }
    }

    if (changed) {
      await metaDB.updateStat('unlocked_achievements', (s) => { s.details = unlocked; s.value = Object.keys(unlocked).length; return s; });
      this.broadcast(unlocked);
    }
  }

  async broadcast(unlocked) {
    const s_streak = await metaDB.getStat('dailyStreak');
    window.dispatchEvent(new CustomEvent('achievements:updated', { 
      detail: { 
        total: this.achievements.length, 
        unlocked: Object.keys(unlocked).length, 
        items: unlocked,
        streak: s_streak?.value || 0 
      } 
    }));
  }
}
