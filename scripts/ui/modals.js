// scripts/ui/modals.js (ESM)
// Универсальная система управления модальными окнами.

(function(){
  function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const doShow = show === undefined ? !modal.classList.contains('active') : show;
    modal.classList.toggle('active', doShow);
    
    // Закрытие по клику на фон
    if(doShow) {
        modal.addEventListener('click', e => {
            if(e.target === modal) {
                toggleModal(modalId, false);
            }
        });
    }
  }

  // Экспорт
  window.toggleModal = toggleModal;
})();
