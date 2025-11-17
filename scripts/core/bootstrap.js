// scripts/core/bootstrap.js
// PlayerCoreObserver — централизатор событий PlayerCore.
// Позволяет добавлять несколько наблюдателей без перезаписи pc.events.
// Глобальный API:
//   window.PlayerCoreObserver.add(observer) -> id
//   window.PlayerCoreObserver.remove(id)
//   window.PlayerCoreObserver.attach(pc?)  // переустановить диспетчер (обычно не нужно)

(function initPlayerCoreObserver(){
  if (window.PlayerCoreObserver) return;

  const observers = new Map(); // id -> { onPlay, onPause, onStop, onTick, onTrackChange, onEnd, onSleepTriggered }
  let nextId = 1;
  let attachedPc = null;

  function dispatch(name, args) {
    // Вызовы в порядке добавления — без исключений, каждую ловим локально
    for (const [, ob] of observers) {
      const fn = ob && ob[name];
      if (typeof fn === 'function') {
        try { fn.apply(null, args); } catch {}
      }
    }
  }

  function bindTo(pc) {
    if (!pc || typeof pc.on !== 'function') return;
    attachedPc = pc;
    pc.on({
      onPlay:           (t, i) => dispatch('onPlay', [t, i]),
      onPause:          (t, i) => dispatch('onPause', [t, i]),
      onStop:           (t, i) => dispatch('onStop', [t, i]),
      onTrackChange:    (t, i) => dispatch('onTrackChange', [t, i]),
      onEnd:            (t, i) => dispatch('onEnd', [t, i]),
      onTick:           (p, d) => dispatch('onTick', [p, d]),
      onSleepTriggered: (t, i) => dispatch('onSleepTriggered', [t, i])
    });
  }

  function ensureAttached() {
    if (attachedPc && window.playerCore === attachedPc) return;
    if (window.playerCore) {
      bindTo(window.playerCore);
    }
  }

  const API = {
    add(observer) {
      ensureAttached();
      const id = nextId++;
      observers.set(id, observer || {});
      // Переустановки pc.on не требуется — диспетчер уже навешан; просто начнём вызывать нового наблюдателя
      return id;
    },
    remove(id) {
      observers.delete(id);
    },
    attach(pc) {
      bindTo(pc || window.playerCore || null);
    }
  };

  window.PlayerCoreObserver = API;

  // Попробуем привязаться, когда адаптер загрузится
  const id = setInterval(() => {
    if (window.playerCore) {
      try { bindTo(window.playerCore); } catch {}
      clearInterval(id);
    }
  }, 200);
  setTimeout(() => clearInterval(id), 10000);
})();

