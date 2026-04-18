// scripts/core/yandex-auth.js Яндекс OAuth 2.0 (Implicit Flow) — авторизация без бэкенда. Хранит токен, профиль, displayName привязанный к yandexId. НЕ влияет на воспроизведение, статистику и офлайн-режим.
const CLIENT_ID='70c0b7256956440eb5b55866d740ffae',REDIRECT_URI='https://vi3na1bita.website.yandexcloud.net/oauth-callback.html',LS_TOKEN='yandex:token',LS_TOKEN_EXP='yandex:token_exp',LS_TOKEN_SCOPE='yandex:token_scope',LS_PROFILE='yandex:profile',LS_AUTO_RELOGIN='yandex:auto_relogin',LS_FORCE_CONFIRM_NEXT='yandex:force_confirm_next',REQUIRED_SCOPES=['login:info','login:email','cloud_api:disk.app_folder'];
const read=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},write=(k,v)=>localStorage.setItem(k,JSON.stringify(v)),del=k=>localStorage.removeItem(k);
export const YandexAuth={
  getToken:()=>localStorage.getItem(LS_TOKEN)||null,
  getExpiry:()=>Number(localStorage.getItem(LS_TOKEN_EXP)||0),
  isTokenAlive(){const e=this.getExpiry();return!!this.getToken()&&(e===0||Date.now()<e)},
  getSessionStatus(){return!this.getToken()?'logged_out':!this.isTokenAlive()?'expired':'active'},
  getProfile:()=>read(LS_PROFILE)||null,
  getGrantedScopes:()=>String(localStorage.getItem(LS_TOKEN_SCOPE)||'').trim().split(/\s+/).filter(Boolean),
  hasScope(s){return this.getGrantedScopes().includes(String(s||'').trim())},
  hasDiskAccess(){return this.hasScope('cloud_api:disk.app_folder')||this.hasScope('cloud_api:disk.read')||this.hasScope('cloud_api:disk.write')},
  isAutoRelogin:()=>localStorage.getItem(LS_AUTO_RELOGIN)==='1',
  setAutoRelogin(v){localStorage.setItem(LS_AUTO_RELOGIN,v?'1':'0')},
  login(o={}){
    if(CLIENT_ID==='YOUR_YANDEX_CLIENT_ID')return window.NotificationSystem?.warning('ClientID не настроен.');
    const fc=(!!o?.forceConfirm||localStorage.getItem(LS_FORCE_CONFIRM_NEXT)==='1')?'1':'0',sc=encodeURIComponent(REQUIRED_SCOPES.join(' ')),url=`https://oauth.yandex.ru/authorize?response_type=token&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&force_confirm=${fc}&scope=${sc}`,w=520,h=620,l=Math.round(window.screenX+(window.outerWidth-w)/2),t=Math.round(window.screenY+(window.outerHeight-h)/2),p=window.open(url,'yandex_oauth',`width=${w},height=${h},left=${l},top=${t},resizable=yes,scrollbars=yes`);
    if(!p)return window.NotificationSystem?.info('Разрешите всплывающие окна для входа через Яндекс.');
    const onMsg=async e=>{
      if(e.origin!==window.location.origin||!e.data||e.data.type!=='YANDEX_OAUTH_CALLBACK')return;
      window.removeEventListener('message',onMsg);clearTimeout(tId);clearInterval(cC);try{if(!p.closed)p.close()}catch{}
      const{token:tk,expiresIn:ex,error:er,scope:s}=e.data;
      if(er||!tk)return window.NotificationSystem?.error('Ошибка авторизации Яндекс: '+(er||'нет токена'));
      const exp=Number(ex)>0?Date.now()+Number(ex)*1000:0;
      localStorage.setItem(LS_TOKEN,tk);localStorage.setItem(LS_TOKEN_EXP,String(exp));s?localStorage.setItem(LS_TOKEN_SCOPE,String(s).trim()):localStorage.removeItem(LS_TOKEN_SCOPE);localStorage.removeItem(LS_FORCE_CONFIRM_NEXT);
      await new Promise(r=>setTimeout(r,200));const pr=await this.fetchYandexProfile(tk);if(pr)await this._onFirstLogin(pr,tk);
    };
    window.addEventListener('message',onMsg);
    const tId=setTimeout(()=>{window.removeEventListener('message',onMsg);clearInterval(cC);try{if(!p.closed)p.close()}catch{}window.NotificationSystem?.warning('Время авторизации истекло. Попробуйте снова.')},300000);
    const cC=setInterval(()=>{if(p.closed){clearInterval(cC);clearTimeout(tId);window.removeEventListener('message',onMsg)}},1000);
  },
  logout(){del(LS_TOKEN);del(LS_TOKEN_EXP);del(LS_TOKEN_SCOPE);del(LS_PROFILE);localStorage.setItem(LS_FORCE_CONFIRM_NEXT,'1');try{localStorage.removeItem('yandex:last_backup_check')}catch{}window.dispatchEvent(new CustomEvent('yandex:auth:changed',{detail:{status:'logged_out'}}));window.NotificationSystem?.info('Вы вышли из аккаунта Яндекс')},
  async fetchYandexProfile(t){try{const r=await fetch('https://login.yandex.ru/info?format=json',{headers:{'Authorization':`OAuth ${t}`}});return r.ok?await r.json():null}catch{return null}},
  async _onFirstLogin(yP,t){
    const yId=String(yP.id||'').trim(),rN=String(yP.real_name||yP.display_name||yP.login||'').trim(),lg=String(yP.login||'').trim(),av=yP.default_avatar_id?`https://avatars.yandex.net/get-yapic/${yP.default_avatar_id}/islands-200`:null;
    write(LS_PROFILE,{yandexId:yId,displayName:rN||lg,realName:rN,login:lg,avatar:av,lastSync:Date.now()});
    window.dispatchEvent(new CustomEvent('yandex:auth:changed',{detail:{status:'active',profile:read(LS_PROFILE),isFreshLogin:true}}));
    this._showNamePickModal(rN,lg);
  },
  _showNamePickModal(rN,lg){
    if(!window.Modals?.open)return;const sg=rN||lg||'Слушатель',esc=s=>window.Utils?.escapeHtml?.(String(s||''))||String(s||''),m=window.Modals.open({title:'👋 Добро пожаловать!',maxWidth:400,bodyHtml:`<div style="color:#9db7dd;margin-bottom:16px;line-height:1.5">Вы вошли через Яндекс.<br>Как вас отображать в приложении?</div><div style="margin-bottom:14px"><label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Ваше имя</label><input type="text" id="ya-display-name" style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:16px;outline:none" maxlength="20" placeholder="${esc(sg)}" value="${esc(sg)}" autocomplete="off"><div style="font-size:11px;color:#666;margin-top:6px">Или оставьте как есть — ${esc(sg)}</div></div><div class="om-actions"><button class="modal-action-btn online" id="ya-name-save" style="flex:1;justify-content:center">Сохранить</button></div>`}),i=m.querySelector('#ya-display-name'),b=m.querySelector('#ya-name-save');
    setTimeout(()=>i?.focus(),100);
    const sv=async()=>{try{window.playerCore?._persistPlaybackState?.(true)}catch{}const n=i?.value?.trim()||sg,p=read(LS_PROFILE)||{};write(LS_PROFILE,{...p,displayName:n});window.dispatchEvent(new CustomEvent('yandex:auth:changed',{detail:{status:'active',profile:read(LS_PROFILE),isFreshLogin:true,phase:'name_saved'}}));window.NotificationSystem?.success(`Имя сохранено: ${n} ✅`);m.remove();setTimeout(()=>{try{window.PlayerUI?.switchAlbumInstantly?.();window.PlayerUI?.updateMiniHeader?.();window.PlayerUI?.updatePlaylistFiltering?.()}catch{}},120);};
    b?.addEventListener('click',sv);i?.addEventListener('keydown',e=>e.key==='Enter'&&sv());
  },
  updateDisplayName(n){const p=read(LS_PROFILE);if(!p)return;write(LS_PROFILE,{...p,displayName:String(n||'').trim()||p.displayName});window.dispatchEvent(new CustomEvent('yandex:auth:changed',{detail:{status:'active',profile:read(LS_PROFILE)}}))},
  checkAutoRelogin(){if(this.isAutoRelogin()&&this.getSessionStatus()==='expired')window.dispatchEvent(new CustomEvent('yandex:auth:changed',{detail:{status:'expired',needsRelogin:true}}))}
};
window.YandexAuth=YandexAuth;export default YandexAuth;
