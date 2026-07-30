(function(W,D){
  'use strict';
  const $=id=>D.getElementById(id),LS=localStorage,K='promocode',isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent)&&!W.MSStream;
  let bound=false,unlocked=false,retries=0,retryTimer=0;

  const unlock=()=>{
    if(unlocked)return true;
    unlocked=true;
    clearTimeout(retryTimer);
    $('promocode-block')?.classList.add('hidden');
    $('main-block')?.classList.remove('hidden');
    const init=()=>{
      if(typeof W.app?.initialize!=='function')return false;
      W.app.initialize();
      return true;
    };
    if(!init()){
      let attempts=0;
      const timer=setInterval(()=>{
        if(init()||++attempts>100)clearInterval(timer);
      },50);
    }
    return true;
  };

  const bind=()=>{
    if(unlocked)return true;
    if(!W.APP_CONFIG&&retries++<120){
      clearTimeout(retryTimer);
      retryTimer=setTimeout(bind,25);
      return false;
    }
    const code=String(W.APP_CONFIG?.PROMOCODE||'').trim(),input=$('promo-inp');
    if(!code||LS.getItem(K)===code)return unlock();
    if(bound)return false;
    bound=true;
    const check=()=>{
      if(input?.value.trim()===code){
        LS.setItem(K,code);
        unlock();
        input.blur();
        return;
      }
      if(!input)return;
      const error=$('promo-error');
      if(error)error.textContent='❌ Неверный промокод';
      input.classList.add('error');
      setTimeout(()=>{
        if(error)error.textContent='';
        input.classList.remove('error');
      },2000);
    };
    $('promo-btn')?.addEventListener('click',check);
    input?.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.keyCode!==13)return;
      event.preventDefault();
      check();
    });
    setTimeout(()=>input&&!input.disabled&&input.focus(),100);
    return false;
  };

  W.PromocodeGate={
    refresh:bind,
    isUnlocked:()=>unlocked
  };

  const start=()=>{
    if(isIOS)D.body.classList.add('ios');
    bind();
  };

  if(D.readyState==='complete')queueMicrotask(start);
  else W.addEventListener('load',start,{once:true});
})(window,document);
