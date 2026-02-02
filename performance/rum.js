;(function(){
  // Неболезненная заглушка: чтобы <script src="./performance/rum.js"> не давал 404
  // и не ломал метрики. Если в custom.json появится endpoint — ваш код в index.html
  // вызовет initRUM(...) при наличии совпадающей функции.
  if (typeof window.initRUM !== 'function') {
    window.initRUM = function initRUM() { /* no-op */ };
  }
})();
