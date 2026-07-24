import { bindProfileActions } from './actions.js';
import { bindProfileLiveBindings } from './live-bindings.js';
import { bindProfileAccount } from './account-bindings.js';

export const bindProfileTabControllers = ({ ctx, container, achView, profile, metaDB, onProfileChanged, reloadProfile } = {}) => {
  if (!container) return;
  ctx._profileAchievementsView = achView;
  bindProfileAccount({ container, profile, metaDB, onProfileChanged });
  bindProfileLiveBindings({ ctx, getContainer: () => document.getElementById('track-list'), metaDB });
  bindProfileActions({ ctx, container, achView, reloadProfile });
};

export default { bindProfileTabControllers };
