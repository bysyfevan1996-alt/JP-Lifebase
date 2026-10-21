import {topicTags} from './topic-tags.js?v=20261021232645283';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes=new Set(['/account','/account/login','/account/register','/account/verify','/account/forgot-password','/account/reset-password']);
const intents=new Set(['compose','reply','topics','messages']);
export const isAccountRoute=path=>routes.has(path.replace(/\/$/,''));
export function safeReturn(value){
 if(value==='/'||value==='/admin')return value;
 if(typeof value==='string'&&/^\/t\/[A-Za-z0-9_-]{1,100}(?:\?post=[A-Za-z0-9_-]{1,100})?$/.test(value))return value;
 if(typeof value==='string'&&/^\/u\/[a-z][a-z0-9_]{2,31}$/.test(value))return value;
 if(typeof value==='string'&&/^\/search(?:\?[^#]*)?$/.test(value)&&value.length<=2000)return value;
 if(typeof value==='string'&&/^\/#topic=[A-Za-z0-9%_-]{1,240}$/.test(value))return value;
 if(typeof value==='string'){const match=value.match(/^\/\?tag=([a-z]+)$/);if(match&&topicTags.some(tag=>tag.id===match[1]))return value;}
 return '/';
}

// The server owns the challenge, grant, expiration and resend time. This module
// retains only display state and an optional processed avatar in memory.
export function createAuthUI({host,api,t,getUser,onUser,avatar,navigate,onContinue,onLogout,beforeLogout=()=>true,getLanguage,getIdentity=()=>null,onAccountRender=()=>{}}){
 let pendingLanguageRefresh=false,repainting=false,refreshView=null,generation=0,timer=null,flow=null,busy=false,writePending=false,avatarBusy=false,avatarData=null,avatarChanged=false,avatarVersion=0,previewVersion=0;
 const $=selector=>host.querySelector(selector);
 const post=(path,body={})=>api(path,{method:'POST',body:JSON.stringify(body)});
 const context=()=>{const p=new URLSearchParams(location.search);return {target:safeReturn(p.get('return')),intent:intents.has(p.get('intent'))?p.get('intent'):''};};
 const routeURL=path=>{const {target,intent}=context();const p=new URLSearchParams();if(target!=='/')p.set('return',target);if(intent)p.set('intent',intent);return path+(p.size?'?'+p:'');};
 const go=path=>navigate(routeURL(path));
 const copy=key=>escape(t(key));
 const errorMap={invalid_email:'authEmailInvalid',invalid_credentials:'authInvalid',code_invalid:'authCodeInvalid',code_expired:'authCodeExpired',code_locked:'authCodeLocked',flow_expired:'authFlowExpired',mail_unavailable:'authMailFailed',mail_send_failed:'authMailFailed',invalid_name:'authNameRules',reserved_name:'authReservedName',name_taken:'authNameTaken',email_exists:'emailExists',password_length:'authPasswordLength',invalid_avatar:'authInvalidAvatar',account_banned:'accountBanned',account_muted:'accountMuted'};
 function errorText(error){
  if(error.code==='resend_cooldown'||error.status===429)return t('authWait',{seconds:Math.max(1,Math.ceil(Number(error.retryAfter)||((Number(error.resendAt)-Date.now())/1000)||180))});
  if(errorMap[error.code])return t(errorMap[error.code]);
  if(error.status===401)return t('sessionExpired');
  return t(error.network||error.status>=500?'connectionError':'requestError');
 }
 function showError(error,field){
  const el=$('#auth-error');if(!el)return;
  el.textContent=typeof error==='string'?error:errorText(error);
  if(Number.isFinite(error?.remainingAttempts))el.textContent+=' '+t('authCodeAttempts',{count:error.remainingAttempts});
  el.hidden=false;
  const input=field?host.querySelector(`[name="${field}"]`):null;
  if(input){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby','auth-error');input.focus();}
  if(error?.resendAt&&flow)flow.resendAt=Number(error.resendAt);
  else if(error?.status===429&&flow&&error.retryAfter)flow.resendAt=Math.max(Number(flow.resendAt)||0,Date.now()+Number(error.retryAfter)*1000);
  if(error?.code==='flow_expired'){
   const restart=flow?.purpose==='legacy'?'/account':flow?.purpose==='reset'?'/account/forgot-password':'/account/register';
   const link=document.createElement('a');link.className='auth-link';link.href=routeURL(restart);link.textContent=t('authExpiredRestart');link.onclick=e=>{e.preventDefault();go(restart);};el.append(document.createElement('br'),link);
  }
  updateClock();
 }
 function setBusy(value){
  busy=value;const locked=busy||writePending;host.setAttribute('aria-busy',String(locked||avatarBusy));
  host.querySelectorAll('button,input').forEach(el=>{if(el.id!=='auth-resend')el.disabled=locked;});
  if($('#auth-avatar-save'))$('#auth-avatar-save').disabled=locked||avatarBusy||!avatarChanged;
  const button=$('[data-primary]');
  if(button){if(locked&&!button.dataset.label)button.dataset.label=button.textContent;button.textContent=locked?t('authProcessing'):(button.dataset.label||button.textContent);button.disabled=locked||avatarBusy;}
  updateClock();
 }
 async function run(action,field){
  if(writePending||busy||avatarBusy)return;const version=generation;writePending=true;setBusy(true);const err=$('#auth-error');if(err)err.hidden=true;
  try{await action(version);}catch(error){if(version===generation)showError(error,field||({invalid_name:'name',reserved_name:'name',name_taken:'name',invalid_email:'email',invalid_credentials:'password',password_length:'password',code_invalid:'code',code_expired:'code',code_locked:'code'}[error.code]));}
  finally{writePending=false;setBusy(false);if(pendingLanguageRefresh)void refreshLanguage();}
 }
 async function reconcileStaleFlow(version){
  if(version===generation)return false;
  // A late response can replace the HttpOnly flow cookie even after navigation.
  // Read the server's current flow before allowing the visible code form again.
  if(isAccountRoute(location.pathname))await render();
  return true;
 }
 function frame(title,intro,body,{step,notice}={}){
  document.title=t(title)+' · Japan Life Base';
  host.innerHTML=`<button class="back-button" id="auth-back">← ${copy('backHome')}</button><div class="auth-layout"><section class="auth-card" aria-labelledby="auth-title"><nav class="auth-tabs" aria-label="${copy('account')}"><a href="${escape(routeURL('/account/login'))}" data-account-route="/account/login" class="${location.pathname==='/account/login'?'selected':''}">${copy('login')}</a><a href="${escape(routeURL('/account/register'))}" data-account-route="/account/register" class="${location.pathname==='/account/register'?'selected':''}">${copy('register')}</a></nav>${step?`<p class="auth-step">${escape(t('authStep',{step}))}</p>`:''}<h1 id="auth-title" tabindex="-1">${copy(title)}</h1>${intro?`<p class="auth-intro">${copy(intro)}</p>`:''}${notice?`<p class="auth-notice" role="status">${copy(notice)}</p>`:''}${body}<p class="auth-private-note">${copy('authEmailPublicNote')}</p></section></div>`;
  $('#auth-back').onclick=()=>navigate(context().target);
  host.querySelectorAll('[data-account-route]').forEach(el=>el.onclick=e=>{e.preventDefault();go(el.dataset.accountRoute);});
  host.querySelectorAll('[data-show-password]').forEach(el=>el.onclick=()=>{const input=$(`[name="${el.dataset.showPassword}"]`),show=input.type==='password';input.type=show?'text':'password';el.textContent=t(show?'authHidePassword':'authShowPassword');el.setAttribute('aria-pressed',String(show));});
  host.querySelectorAll('input').forEach(el=>el.addEventListener('input',()=>{el.removeAttribute('aria-invalid');if(el.getAttribute('aria-describedby')==='auth-error')el.removeAttribute('aria-describedby');}));
  setBusy(busy);
  if(!repainting)requestAnimationFrame(()=>$('#auth-title')?.focus({preventScroll:true}));
 }
 const errorBox=()=>'<p class="auth-error" id="auth-error" role="alert" hidden></p>';
 const primary=key=>`<button class="dark-button auth-primary" type="submit" data-primary>${copy(key)}</button>`;
 const password=(name='password',label='password',current=false)=>`<label class="auth-field" for="auth-${name}">${copy(label)}</label><div class="auth-password"><input id="auth-${name}" name="${name}" type="password" required autocomplete="${current?'current-password':'new-password'}" ${current?'':'minlength="12" maxlength="128"'}><button type="button" data-show-password="${name}" aria-pressed="false" aria-controls="auth-${name}">${copy('authShowPassword')}</button></div>`;
 const emailField=value=>`<label class="auth-field" for="auth-email">${copy('email')}</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" value="${escape(value||'')}">`;
 function login(notice){refreshView=()=>login(notice);
  frame('loginTitle','',`<form id="auth-form">${emailField('')}${password('password','password',true)}<div class="auth-align-end"><a href="${escape(routeURL('/account/forgot-password'))}" data-account-route="/account/forgot-password" class="auth-link">${copy('authForgot')}</a></div>${errorBox()}${primary('login')}</form><p class="auth-under">${copy('authNewHere')} <a class="auth-link" href="${escape(routeURL('/account/register'))}" data-account-route="/account/register">${copy('register')}</a></p>`,{notice});
  $('#auth-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget,body=Object.fromEntries(new FormData(form));run(async version=>{const result=await post('/api/login',body);onUser(result.user);if(version===generation)success('loggedIn',!result.user.emailVerified?'authLegacyHelp':null);});};
 }
 function emailStart(purpose){refreshView=()=>emailStart(purpose);
  const reset=purpose==='reset';
  frame(reset?'authResetTitle':'joinTitle',reset?'authForgotIntro':'authEmailIntro',`<form id="auth-form">${emailField('')}${errorBox()}${primary('authSendCode')}</form><p class="auth-under">${copy('authAlready')} <a class="auth-link" href="${escape(routeURL('/account/login'))}" data-account-route="/account/login">${copy('login')}</a></p>`,{step:reset?null:1});
  $('#auth-form').onsubmit=e=>{e.preventDefault();const email=new FormData(e.currentTarget).get('email');run(async version=>{const result=await post(reset?'/api/auth/password/start':'/api/auth/register/start',{email,language:getLanguage()});if(await reconcileStaleFlow(version))return;flow=result;avatarData=null;avatarChanged=false;go('/account/verify');},'email');};
 }
 function updateClock(){
  const button=$('#auth-resend'),expiry=$('#auth-expiry');
  if(button&&flow){const remaining=Math.max(0,Math.ceil((Number(flow.resendAt)-Date.now())/1000));button.disabled=busy||writePending||remaining>0;button.textContent=remaining?t('authResendIn',{seconds:remaining}):t('authResend');}
  if(expiry&&flow){const remaining=Math.max(0,Math.ceil((Number(flow.expiresAt)-Date.now())/1000));expiry.textContent=remaining?t('authExpires',{seconds:remaining}):t('authCodeExpired');}
 }
 function verification(){refreshView=()=>verification();
  const reset=flow.purpose==='reset',legacy=flow.purpose==='legacy';
  const registeredHelp=!reset&&!legacy?`<p class="auth-help">${copy('authRegisteredHelp')} <a class="auth-link" href="${escape(routeURL('/account/login'))}" data-account-route="/account/login">${copy('login')}</a> · <a class="auth-link" href="${escape(routeURL('/account/forgot-password'))}" data-account-route="/account/forgot-password">${copy('authResetTitle')}</a></p>`:'';
  frame(reset?'authResetTitle':'authVerifyTitle','',`<p class="auth-intro">${escape(t('authCodeIntro',{email:flow.email}))}</p>${reset?`<p class="auth-help">${copy('authForgotIntro')}</p>`:''}${registeredHelp}<form id="auth-form"><label class="auth-field" for="auth-code">${copy('authCode')}</label><input class="auth-code" id="auth-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required aria-describedby="auth-code-help"><p class="auth-help" id="auth-code-help">${copy('authCodeHelp')}</p><p class="auth-help" id="auth-expiry" aria-live="off"></p>${errorBox()}${primary('authContinue')}</form><div class="auth-resend-row"><button class="auth-link" id="auth-resend">${copy('authResend')}</button><button class="auth-link" id="auth-change-email">${copy(legacy?'cancelQuote':'authChangeEmail')}</button></div><p class="auth-help auth-spam">${copy('authCheckSpam')}</p>`,{step:reset||legacy?null:2});
  // One field supports full-code paste and operating-system OTP autofill.
  $('#auth-code').oninput=e=>{e.target.value=e.target.value.replace(/[^0-9]/g,'').slice(0,6);e.target.removeAttribute('aria-invalid');};
  $('#auth-form').onsubmit=e=>{e.preventDefault();const code=new FormData(e.currentTarget).get('code');run(async version=>{const result=await post('/api/auth/verify',{code});if(await reconcileStaleFlow(version))return;flow={...flow,...result};if(result.user)onUser(result.user);if(result.step==='complete')success('authVerified');else go(result.step==='password'?'/account/reset-password':'/account/register');},'code');};
  $('#auth-resend').onclick=()=>run(async version=>{const result=await post('/api/auth/resend',{language:getLanguage()});if(await reconcileStaleFlow(version))return;flow=result;$('#auth-code').value='';updateClock();});
  $('#auth-change-email').textContent=t(legacy?'account':'authChangeEmail');
  $('#auth-change-email').onclick=()=>run(async version=>{await post('/api/auth/cancel');flow=null;avatarData=null;avatarChanged=false;if(version===generation)go(legacy?'/account':reset?'/account/forgot-password':'/account/register');});
  timer=setInterval(updateClock,1000);updateClock();
 }
 function avatarPicker(person,forAccount=false){
  return `<div class="auth-avatar-picker"><div id="auth-avatar-preview" class="auth-avatar-preview">${avatar(person)}</div><div><label class="auth-link auth-upload" for="auth-avatar-file">${copy('authChooseAvatar')}</label><input class="visually-hidden" id="auth-avatar-file" type="file" accept="image/jpeg,image/png,image/webp"><button class="auth-link" type="button" id="auth-avatar-default">${copy('authDefaultAvatar')}</button></div></div><p class="auth-help">${copy('authAvatarHelp')}</p>${forAccount?`<button class="auth-secondary" id="auth-avatar-save" type="button" disabled>${copy('authSaveAvatar')}</button>`:''}`;
 }
 async function previewAvatar(person){
  const el=$('#auth-avatar-preview');if(!el)return;const version=++previewVersion;
  if(person.avatar===undefined){
   const name=String(person.name||person.author||'').trim().normalize('NFC');let initial='?';
   const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(name)].map(p=>p.segment):Array.from(name);
   initial=parts.find(s=>s.replace(/[\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu,''))||'?';
   person={...person,avatar:initial,tone:0};
   try{person.tone=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name)))[0]%8;}catch{}
  }
  if(version!==previewVersion||!el.isConnected)return;
  el.innerHTML=avatar(person);
  if(avatarChanged&&avatarData){const image=document.createElement('img');image.src=avatarData;image.alt='';el.replaceChildren(image);}
 }
 function bindAvatar(getPerson,forAccount=false){
  const input=$('#auth-avatar-file');
  input.onchange=async()=>{
   const file=input.files?.[0];if(!file)return;const version=++avatarVersion,current=generation;
   input.value='';avatarBusy=true;setBusy(busy);
   try{const data=await prepareAvatar(file);if(version!==avatarVersion||current!==generation)return;avatarData=data;avatarChanged=true;previewAvatar(getPerson());const err=$('#auth-error');if(err)err.hidden=true;}
   catch(error){if(version===avatarVersion&&current===generation)showError({code:'invalid_avatar'});}
   finally{if(version===avatarVersion&&current===generation){avatarBusy=false;setBusy(busy);if(pendingLanguageRefresh)void refreshLanguage();}}
  };
  $('#auth-avatar-default').onclick=()=>{avatarVersion++;input.value='';avatarBusy=false;avatarData=null;avatarChanged=true;previewAvatar({...getPerson(),avatarUrl:null});setBusy(busy);};
  if(forAccount)$('#auth-avatar-save').onclick=()=>run(async version=>{const result=await post('/api/me/avatar',{avatarData});if(version!==generation)return;onUser(result.user);avatarChanged=false;avatarData=null;account('authAvatarSaved');});
 }
 function profile(){refreshView=()=>profile();
  frame('authProfileTitle','authProfileIntro',`<div class="auth-verified">✓ ${escape(flow.email)} <span>${copy('authVerified')}</span></div><button class="auth-link auth-change-profile-email" type="button" id="auth-change-email">${copy('authChangeEmail')}</button><form id="auth-form"><label class="auth-field" for="auth-name">${copy('name')}</label><input id="auth-name" name="name" autocomplete="nickname" required minlength="2" maxlength="40" aria-describedby="auth-name-help"><p class="auth-help" id="auth-name-help">${copy('authNameRules')}</p><p class="auth-field">${copy('authAvatar')}</p>${avatarPicker({name:'?',author:'?'})}${password()}<p class="auth-help">${copy('authPasswordRules')}</p>${errorBox()}${primary('authComplete')}</form>`,{step:3});
  const person=()=>({name:$('#auth-name').value||'?',author:$('#auth-name').value||'?'});
  bindAvatar(person);previewAvatar(person());$('#auth-name').addEventListener('input',()=>{if(!avatarData)previewAvatar(person());});
  $('#auth-change-email').onclick=()=>run(async version=>{await post('/api/auth/cancel');flow=null;avatarData=null;avatarChanged=false;if(version===generation)go('/account/register');});
  $('#auth-form').onsubmit=e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));if(avatarData)body.avatarData=avatarData;run(async version=>{const result=await post('/api/register',body);onUser(result.user);flow=null;avatarData=null;avatarChanged=false;if(version===generation)success('registered');});};
 }
 function newPassword(){refreshView=()=>newPassword();
  frame('authResetTitle','authResetIntro',`<form id="auth-form">${password('password','authNewPassword')}<p class="auth-help">${copy('authPasswordRules')}</p>${password('confirmPassword','authConfirmPassword')}${errorBox()}${primary('authSavePassword')}</form>`);
  $('#auth-form').onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));if(values.password!==values.confirmPassword){showError(t('authPasswordMismatch'),'confirmPassword');return;}run(async version=>{await post('/api/auth/password/complete',{password:values.password});flow=null;onUser(null);onLogout();if(version===generation){go('/account/login');queueMicrotask(()=>login('authResetSuccess'));}});};
 }
 function legacy(){refreshView=()=>legacy();
  const user=getUser();if(!user){login();return;}if(user.emailVerified){account();return;}
  frame('authLegacyTitle','authLegacyPassword',`<p class="auth-verified auth-pending">${escape(user.email)} <span>${copy('authUnverified')}</span></p><p class="auth-help">${copy('authLegacyHelp')}</p><form id="auth-form">${password('password','password',true)}${errorBox()}${primary('authSendCode')}</form>`);
  $('#auth-form').onsubmit=e=>{e.preventDefault();const password=new FormData(e.currentTarget).get('password');run(async version=>{const result=await post('/api/auth/email/start',{password,language:getLanguage()});if(await reconcileStaleFlow(version))return;flow=result;go('/account/verify');},'password');};
 }
 function refreshIdentity(){
  const row=$('#auth-handle-row'),value=$('#auth-handle');if(!row||!value)return;
  const user=getUser(),identity=getIdentity(),valid=location.pathname.replace(/\/$/,'')==='/account'&&!!user&&identity?.id===user.id&&/^[a-z][a-z0-9_]{2,31}$/.test(identity?.handle||'');
  row.hidden=!valid;value.textContent=valid?'@'+identity.handle:'';
 }
 function account(notice){refreshView=()=>account(notice);
  const user=getUser();if(!user){login();return;}
  frame('account','',`<div class="auth-account-summary">${avatar(user)}<div><strong>${escape(user.name)}</strong><span class="auth-status${user.emailVerified?'':' auth-pending'}">${copy(user.emailVerified?'authVerified':'authUnverified')}</span></div></div><dl class="auth-details"><div><dt>${copy('name')}</dt><dd>${escape(user.name)}</dd></div><div><dt>${copy('email')}</dt><dd>${escape(user.email)}</dd></div><div id="auth-handle-row" hidden><dt>${copy('m4AccountHandle')}</dt><dd id="auth-handle"></dd></div></dl>${!user.emailVerified?`<p class="auth-help">${copy('authLegacyHelp')}</p><button class="auth-secondary" id="auth-legacy">${copy('authVerifyNow')}</button>`:''}<h2 class="auth-subheading">${copy('authAvatar')}</h2>${avatarPicker(user,true)}${errorBox()}${user.emailVerified?`<a class="auth-secondary" href="${escape(routeURL('/account/forgot-password'))}" data-account-route="/account/forgot-password">${copy('authResetTitle')}</a>`:''}<button class="auth-link auth-logout" id="auth-logout">${copy('logout')}</button>`,{notice});
  refreshIdentity();onAccountRender(host);
  bindAvatar(()=>({...getUser(),avatarUrl:avatarChanged?null:getUser().avatarUrl}),true);
  if($('#auth-legacy'))$('#auth-legacy').onclick=legacy;
  $('#auth-logout').onclick=()=>run(async version=>{if(!await beforeLogout())return;await post('/api/logout');onUser(null);onLogout();avatarData=null;avatarChanged=false;if(version===generation)go('/account/login');});
 }
 function success(title,notice){refreshView=()=>success(title,notice);
  clearInterval(timer);frame(title,'authAccountReady',`<div class="auth-success" aria-hidden="true">✓</div><div class="auth-account-summary">${avatar(getUser()||{})}<strong>${escape(getUser()?.name||'')}</strong></div><button class="dark-button auth-primary" id="auth-continue">${copy(continueKey())}</button><a class="auth-secondary" href="${escape(routeURL('/account'))}" data-account-route="/account">${copy('account')}</a>`,{notice});
  $('#auth-continue').onclick=()=>{const c=context();onContinue(c.target,c.intent);};
 }
 function continueKey(){const c=context();if(c.target==='/admin')return 'adminPanel';return ({compose:'authContinueCompose',reply:'authContinueTopic',topics:'authContinueTopics',messages:'authContinueMessages'}[c.intent])||(c.target!=='/'?'authContinueTopic':'backHome');}
 function missing(){refreshView=()=>missing();
  frame('authVerifyTitle','authNoFlow',`${errorBox()}<a class="auth-secondary" href="${escape(routeURL('/account/register'))}" data-account-route="/account/register">${copy('authRestart')}</a><a class="auth-secondary" href="${escape(routeURL('/account/forgot-password'))}" data-account-route="/account/forgot-password">${copy('authResetTitle')}</a>`);
 }
 async function render(){
  const current=++generation;clearInterval(timer);timer=null;busy=false;avatarBusy=false;avatarVersion++;host.setAttribute('aria-busy','false');
  const path=location.pathname.replace(/\/$/,'');
  if(!isAccountRoute(path)){host.replaceChildren();avatarData=null;avatarChanged=false;return;}
  document.title=t(path==='/account/login'?'loginTitle':path==='/account'?'account':'authVerifyTitle')+' · Japan Life Base';
  if(path==='/account/login'){avatarData=null;avatarChanged=false;login();return;}
  if(path==='/account'){avatarData=null;avatarChanged=false;account();return;}
  host.innerHTML=`<div class="empty-state" role="status">${copy('loading')}</div>`;
  try{
   const result=await api('/api/auth/flow');if(current!==generation)return;flow=result.flow;
   if(path==='/account/forgot-password'){avatarData=null;avatarChanged=false;emailStart('reset');}
   else if(path==='/account/register'&&flow?.purpose==='register'&&flow.step==='profile')profile();
   else if(path==='/account/register')emailStart('register');
   else if(flow?.step==='code')verification();
   else if(flow?.purpose==='register'&&flow.step==='profile')profile();
   else if(flow?.purpose==='reset'&&flow.step==='password')newPassword();
   else missing();
  }catch(error){if(current!==generation)return;frame('account','',`${errorBox()}<button class="auth-secondary" id="auth-retry">${copy('retry')}</button>`);showError(error);$('#auth-retry').onclick=render;}
 }
 async function refreshLanguage(){
  if(!refreshView)return;if(busy||writePending||avatarBusy){pendingLanguageRefresh=true;return;}pendingLanguageRefresh=false;
  const fields=[...host.querySelectorAll('input')].map(el=>({id:el.id,value:el.value,type:el.type,checked:el.checked,start:el.selectionStart,end:el.selectionEnd,active:el===document.activeElement}));
  clearInterval(timer);timer=null;repainting=true;try{refreshView();}finally{repainting=false;}
  for(const field of fields){const el=field.id?host.querySelector('#'+field.id):null;if(!el||field.type==='file')continue;el.value=field.value;el.checked=field.checked;if(field.active){el.focus({preventScroll:true});if(typeof el.setSelectionRange==='function'&&field.start!==null)el.setSelectionRange(field.start,field.end);}}
  if(avatarData)previewAvatar(getUser()||{name:$('#auth-name')?.value||'?'});
 }
 return {render,refreshLanguage,refreshIdentity,leave(){refreshView=null;generation++;avatarVersion++;clearInterval(timer);timer=null;busy=false;avatarBusy=false;avatarData=null;avatarChanged=false;host.replaceChildren();},open(mode,{target='/',intent=''}={}){const p=new URLSearchParams();target=safeReturn(target);if(target!=='/')p.set('return',target);if(intents.has(intent))p.set('intent',intent);navigate(`/account/${mode==='register'?'register':'login'}${p.size?'?'+p:''}`);}};
}

// Decode on this device without creating blob image URLs, preserving the site's
// image CSP. Only the cropped PNG is sent to the server.
export async function prepareAvatar(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||!Number.isFinite(file.size)||file.size<=0||file.size>5*1024*1024)throw new Error('invalid_avatar');
 const bitmap=await createImageBitmap(file);
 try{
  const width=bitmap.width,height=bitmap.height;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>16384||height>16384||width*height>40000000)throw new Error('invalid_avatar');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('invalid_avatar');
  const side=Math.min(width,height);
  ctx.drawImage(bitmap,(width-side)/2,(height-side)/2,side,side,0,0,128,128);
  const data=canvas.toDataURL('image/png');
  if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data)||atob(data.slice(data.indexOf(',')+1)).length>90*1024)throw new Error('invalid_avatar');
  return data;
 }finally{bitmap.close();}
}
