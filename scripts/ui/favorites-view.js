// scripts/ui/favorites-view.js
import { buildFavoritesModel } from "./favorites.js";

function qs(sel, root = document) { return root.querySelector(sel); }
function safeStr(x) { return String(x ?? "").trim(); }

const PlayGuard = { ts: 0 };

function showInactiveFavoriteModal({ uid, title }) {
  if (window.ModalTemplates?.show) {
    window.ModalTemplates.show("inactiveFavorite", { uid, title });
    return;
  }
  const ok = confirm(`Трек неактивен: "${title || uid}".\n\nУдалить из избранного?`);
  if (ok) window.playerCore?.removeFavoriteRef?.(uid);
}

function renderRow(track) {
  const inactive = !!track.__inactive;
  return `
    <div class="fav-row ${inactive ? "inactive" : ""}" data-uid="${track.uid}">
      <button class="like-star ${inactive ? "" : "liked"}" type="button">${inactive ? "☆" : "★"}</button>
      <div class="fav-title">${track.title || ""}</div>
    </div>
  `;
}

function ensureRoot() {
  let panel = qs("#favorites-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "favorites-panel";
    panel.innerHTML = `<h2>Избранное</h2><div id="favorites-list"></div>`;
    const root = qs("#content") || document.body;
    root.prepend(panel);
  }
  return panel;
}

function bind(panel) {
  if (panel.__bound) return;
  panel.__bound = true;

  panel.addEventListener("click", async (e) => {
    const row = e.target.closest?.(".fav-row");
    if (!row) return;
    const uid = safeStr(row.getAttribute("data-uid"));
    if (!uid) return;

    const pc = window.playerCore;
    if (!pc) return;

    // star click
    if (e.target.closest?.(".like-star")) {
      e.preventDefault();
      e.stopPropagation();
      pc.toggleFavorite(uid, { source: "favorites" });
      FavoritesUI.renderFavoritesList(buildFavoritesModel());
      return;
    }

    // row click -> play if active
    if (!pc.isFavorite(uid)) {
      const model = buildFavoritesModel();
      const t = model.find((x) => x.uid === uid);
      showInactiveFavoriteModal({ uid, title: t?.title });
      return;
    }

    // anti-double-play
    const now = Date.now();
    if ((now - PlayGuard.ts) < 250) return;
    PlayGuard.ts = now;

    // find active index in active-only list
    const model = buildFavoritesModel();
    const active = model.filter((x) => x.__active);
    const idx = active.findIndex((x) => x.uid === uid);
    if (idx < 0) return;

    await window.AlbumsManager?.ensureFavoritesPlayback?.(idx);
  });
}

export const FavoritesUI = {
  renderFavoritesList(model) {
    const panel = ensureRoot();
    const list = qs("#favorites-list", panel);
    const html = (model || []).map(renderRow).join("");
    list.innerHTML = html || `<div class="muted">Нет треков в избранном</div>`;
    bind(panel);
  },
};

window.FavoritesUI = FavoritesUI;
export default FavoritesUI;
