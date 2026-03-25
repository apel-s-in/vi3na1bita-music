import { bindProfileActions } from './actions.js';
import { bindProfileLiveBindings } from './live-bindings.js';
import { bindProfileAccount } from './account-bindings.js';

export const bindProfileTabControllers = ({ ctx, container, achView, profile, metaDB, cloudSync, tokens, onProfileChanged, reloadProfile } = {}) => {
  if (!container) return;

  bindProfileAccount({
    container,
    profile,
    metaDB,
    onProfileChanged
  });

  bindProfileLiveBindings({
    ctx,
    getContainer: () => document.getElementById('track-list'),
    achView
  });

  bindProfileActions({
    ctx,
    container,
    achView,
    metaDB,
    cloudSync,
    tokens,
    reloadProfile
  });
};

export default { bindProfileTabControllers };
