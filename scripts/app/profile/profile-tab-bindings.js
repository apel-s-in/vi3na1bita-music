import { bindProfileActions } from './actions.js';
import { bindProfileLiveBindings } from './live-bindings.js';
import { bindProfileAccount } from './account-bindings.js';

export const bindProfileTabControllers = ({ ctx, container, achView, profile, metaDB, tokens, onProfileChanged, reloadProfile } = {}) => {
  if (!container) return;
  bindProfileAccount({ container, profile, metaDB, onProfileChanged });
  bindProfileLiveBindings({ ctx, getContainer: () => document.getElementById('track-list'), achView });
  bindProfileActions({ ctx, container, achView, metaDB, tokens, reloadProfile });
};
export default { bindProfileTabControllers };
