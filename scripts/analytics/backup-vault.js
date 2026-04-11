// UID.003_(Event log truth)_(держать backup честным и пересчитываемым)_(backup должен оставаться event-log-centric) // UID.073_(Hybrid sync orchestrator)_(подготовить backup как transport-слой для multi-provider sync)_(future orchestration жить отдельно от vault) // UID.089_(Future MetaDB stores)_(расширить backup listener/provider/recommendation/collection state)_(когда intel stores начнут наполняться, vault должен включить их без ломки формата)
import { metaDB } from './meta-db.js';

export class BackupVault {
  static _lsKeys() {
    return [
      '__favorites_v2__',
      'sc3:playlists',
      'sc3:default',
      'sc3:activeId',
      'sc3:ui_v2',
      'sc3:albumColors',
      'sourcePref',
      'favoritesOnlyMode',
      'qualityMode:v1',
      'offline:mode:v1',
      'offline:cacheQuality:v1',
      'cloud:listenThreshold',
      'cloud:ttlDays',
      'playerVolume',
      'playerStateV2',
      'lyricsViewMode',
      'lyricsAnimationEnabled',
      'lyricsShowAnimBtn',
      'logoPulseEnabled',
      'logoPulsePreset',
      'logoPulseIntensity',
      'logoPulseDebug',
      'profileShowControls',
      'dl_format_v1',
      'app:first-install-ts',
      'sleepTimerState:v2'
    ];
  }

  static async buildBackupObject() {
    const [
      stats, warm, achievements, streaks, userProfile, userProfileRpg,
      listenerProfile, providerIdentity, hybridSync, recommendationState, collectionState, intelRuntime
    ] = await Promise.all([
      metaDB.getAllStats(),
      metaDB.getEvents('events_warm'),
      metaDB.getGlobal('unlocked_achievements'),
      metaDB.getGlobal('global_streak'),
      metaDB.getGlobal('user_profile'),
      metaDB.getGlobal('user_profile_rpg'),
      metaDB.getStoreAll('listener_profile').catch(() => []),
      metaDB.getStoreAll('provider_identity').catch(() => []),
      metaDB.getStoreAll('hybrid_sync').catch(() => []),
      metaDB.getStoreAll('recommendation_state').catch(() => []),
      metaDB.getStoreAll('collection_state').catch(() => []),
      metaDB.getStoreAll('intel_runtime').catch(() => [])
    ]);

    const local = this._lsKeys().reduce((acc, key) => {
      const val = localStorage.getItem(key);
      if (val != null) acc[key] = val;
      return acc;
    }, {});

    return {
      version: '5.0',
      timestamp: Date.now(),
      deviceHash: localStorage.getItem('deviceHash'),
      appVersion: window.APP_CONFIG?.APP_VERSION || null,
      data: {
        stats,
        eventLog: { warm },
        achievements: achievements?.value || {},
        streaks: streaks?.value || {},
        userProfile: userProfile?.value || { name: 'Слушатель', avatar: '😎' },
        userProfileRpg: userProfileRpg?.value || { xp: 0, level: 1 },
        localStorage: local,
        intel: {
          listenerProfile,
          providerIdentity,
          hybridSync,
          recommendationState,
          collectionState,
          intelRuntime
        }
      }
    };
  }

  static async exportData() {
    const data = await this.buildBackupObject(), url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = `vi3na1bita_backup_${new Date().toISOString().split('T')[0]}.vi3bak`; a.click(); URL.revokeObjectURL(url);
    if (window.eventLogger) { window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup' }); window.dispatchEvent(new CustomEvent('analytics:forceFlush')); }
  }

  static async importData(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = async e => {
        try {
          const b = JSON.parse(e.target.result);
          if (!b.data?.eventLog) throw new Error('Invalid format v5.0 required');

          const seen = new Set();
          const merged = [...await metaDB.getEvents('events_warm'), ...(b.data.eventLog.warm || [])]
            .filter(ev => ev?.eventId && !seen.has(ev.eventId) && seen.add(ev.eventId))
            .sort((x, y) => x.timestamp - y.timestamp);

          await metaDB.clearEvents('events_warm');
          await metaDB.addEvents(merged, 'events_warm');

          for (const s of (b.data.stats || [])) await metaDB.tx('stats', 'readwrite', st => st.put(s));

          if (b.data.achievements) await metaDB.setGlobal('unlocked_achievements', b.data.achievements);
          if (b.data.streaks) await metaDB.setGlobal('global_streak', b.data.streaks);
          if (b.data.userProfile) await metaDB.setGlobal('user_profile', b.data.userProfile);
          if (b.data.userProfileRpg) await metaDB.setGlobal('user_profile_rpg', b.data.userProfileRpg);

          for (const [k, v] of Object.entries(b.data.localStorage || {})) {
            try { localStorage.setItem(k, v); } catch {}
          }

          const intel = b.data.intel || {};
          const writeStoreAll = async (store, rows) => {
            if (!Array.isArray(rows) || !rows.length) return;
            await metaDB.tx(store, 'readwrite', s => rows.forEach(row => s.put(row)));
          };

          await writeStoreAll('listener_profile', intel.listenerProfile);
          await writeStoreAll('provider_identity', intel.providerIdentity);
          await writeStoreAll('hybrid_sync', intel.hybridSync);
          await writeStoreAll('recommendation_state', intel.recommendationState);
          await writeStoreAll('collection_state', intel.collectionState);
          await writeStoreAll('intel_runtime', intel.intelRuntime);

          window.dispatchEvent(new CustomEvent('stats:updated'));
          res(true);
        } catch (err) { rej(err); }
      };
      r.readAsText(file);
    });
  }
}
