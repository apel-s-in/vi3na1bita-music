import { metaDB } from './meta-db.js';

export class AchievementEngine {
  constructor() {
    this.achievements = this._createList();
    window.addEventListener('stats:updated', () => this.check());
  }

  _createList() {
    const list = [
      { id: 'first_listen', name: 'Первый шаг', desc: 'Прослушан 1 трек полностью', icon: '🎵', check: s => (s.globalFullListens?.value || 0) >= 1 },
      { id: 'night_owl', name: 'Полуночник', desc: 'Слушал музыку после 00:00', icon: '🦉', check: s => s.special?.nightOwl }
    ];
    // Динамическая генерация 100 уровней "Аудиофила"
    for (let i = 1; i <= 100; i++) {
      list.push({
        id: `level_${i}`,
        name: `Аудиофил: Уровень ${i}`,
        desc: `Всего прослушано: ${i * 5} полных треков`,
        icon: i % 10 === 0 ? '🏆' : '🎧',
        check: s => (s.globalFullListens?.value || 0) >= (i * 5)
      });
    }
    return list;
  }

  async check() {
    const stats = {
      globalFullListens: await metaDB.getStat('globalFullListens'),
      totalListenTime: await metaDB.getStat('totalListenTime'),
      features: await metaDB.getStat('features'),
      special: await metaDB.getStat('special') || { details: {} }
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

  broadcast(unlocked) {
    window.dispatchEvent(new CustomEvent('achievements:updated', { 
      detail: { total: this.achievements.length, unlocked: Object.keys(unlocked).length, items: unlocked } 
    }));
  }
}
