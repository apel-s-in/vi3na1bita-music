import { getBackupConflictPolicy } from './storage-merge-utils.js';
import {
  mergeFavoritePair,
  normalizeFavoriteItem
} from './favorite-state-contract.js';

const parseRows = raw => {
  try {
    const rows = JSON.parse(raw || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

export const mergeFavoritesStorageSafe = (
  localRaw,
  remoteRaw,
  policy = getBackupConflictPolicy()
) => {
  const items = new Map();

  [...parseRows(localRaw), ...parseRows(remoteRaw)]
    .map(item => normalizeFavoriteItem(item))
    .filter(Boolean)
    .forEach(item => {
      items.set(
        item.uid,
        items.has(item.uid)
          ? mergeFavoritePair(
              items.get(item.uid),
              item,
              policy
            )
          : item
      );
    });

  return JSON.stringify([...items.values()]);
};

export default {
  mergeFavoritesStorageSafe
};
