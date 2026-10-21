import {createM5Admin} from './m5-admin.js?v=20261021232645283';
import {m5Dictionaries} from './m5-i18n.js?v=20261021232645283';
import {ensureLanguageOption} from './language-ui.js?v=20261021232645283';
import {createLanguagePreferences,readLanguagePreference} from './preferences.js?v=20261021232645283';
import {resolveLocale} from './locale.js?v=20261021232645283';
import {dictionaries} from './admin-i18n.js?v=20261021232645283';

for(const [language,copy]of Object.entries(m5Dictionaries))Object.assign(dictionaries[language],copy,{directory:copy.m5Directory,insights:copy.m5Insights});
const $=selector=>document.querySelector(selector);
const views=['overview','topics','users','reports','contacts','audit','directory','insights'];
const readPreference=()=>readLanguagePreference();
const state={user:null,view:views.includes(location.hash.slice(1))?location.hash.slice(1):'overview',preference:readPreference(),language:'zh-CN',dictionary:dictionaries['zh-CN'],translationUnavailable:false,topicsQuery:'',usersQuery:'',status:'all',writeBusy:false,auditBefore:null,auditAction:''};
let viewRequest=0,languageRequest=0;
const m5Admin=createM5Admin({request,t:(...args)=>t(...args),getUser:()=>state.user,getLanguage:()=>state.language,onError:message=>showError(message),onUnauthorized:handlePermission});
const t=(key,values={})=>String(state.dictionary[key]??dictionaries.en[key]??key).replace(/\{(\w+)\}/g,(_,name)=>values[name]??`{${name}}`);
const preferences=createLanguagePreferences({api:request,onChange:value=>setLanguage(value),onError:()=>showError(t('preferenceSaveError'))});
const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=String(text);return el;};
const button=(label,action,className='button')=>{const el=element('button',className,label);el.type='button';el.addEventListener('click',action);return el;};
const date=value=>{const stamp=new Date(value);if(!Number.isFinite(stamp.getTime()))return '—';try{return new Intl.DateTimeFormat(state.language,{dateStyle:'medium',timeStyle:'short'}).format(stamp);}catch{return stamp.toISOString().slice(0,16).replace('T',' ');}};
const number=value=>new Intl.NumberFormat(state.language).format(Number(value)||0);

// Transport and static dictionary helpers are kept separate from private view data.
async function request(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 let response;
 try{
  response=await fetch(path,{...options,credentials:'same-origin',signal:controller.signal,headers:{...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...options.headers}});
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('invalid_response'),{status:response.status});}
  if(!result||typeof result!=='object'||Array.isArray(result))throw Object.assign(new Error('invalid_response'),{status:response.status});
  if(!response.ok)throw Object.assign(new Error(result.code||result.error||'request_failed'),{status:response.status,code:result.code||result.error});
  return result;
 }catch(error){
  if(error.status)throw error;
  throw Object.assign(new Error('network_error'),{network:true});
 }finally{clearTimeout(timer);}
}
async function loadLanguage(preference,languages){
 const resolved=resolveLocale(preference,languages);
 if(!resolved.automatic)return {language:resolved.language,dictionary:dictionaries[resolved.source],automatic:false,unavailable:false};
 // This payload is always the public interface dictionary. Never add view data.
 try{
  const result=await request('/api/translate',{method:'POST',body:JSON.stringify({target:resolved.language,source:'en',items:dictionaries.en})});
  if(!result.items||typeof result.items!=='object'||Array.isArray(result.items)||result.unavailable||Object.keys(dictionaries.en).some(key=>typeof result.items[key]!=='string'))throw new Error('translation_unavailable');
  const dictionary=Object.fromEntries(Object.keys(dictionaries.en).map(key=>[key,result.items[key]]));
  return {language:resolved.language,dictionary,automatic:true,unavailable:false};
 }catch{return {language:resolved.language,dictionary:dictionaries.en,automatic:false,unavailable:true};}
}

function showGate(message,canLogin=false,retry=false){
 m5Admin.leave();
 viewRequest++;state.writeBusy=false;$('#admin-layout').hidden=true;$('#admin-content').replaceChildren();$('#view-status').hidden=true;
 const gate=$('#admin-gate');gate.hidden=false;gate.replaceChildren(element('p','',message));
 const link=element('a','',t(canLogin?'login':'back'));link.href=canLogin?'/account/login?return=%2Fadmin':'/';gate.append(link);
 if(retry)gate.append(button(t('retry'),initialize,'button'));
}
function showError(message,action){
 const status=$('#view-status');status.replaceChildren(element('span','',message));if(action)status.append(button(t('retry'),action));status.hidden=false;
}
function handlePermission(error){
 if(error.status===401){state.user=null;showGate(t('sessionEnded'),true);return true;}
 if(error.status===403&&(!error.code||['forbidden','account_banned'].includes(error.code))){state.user=null;showGate(t(error.code==='account_banned'?'accountBanned':'forbidden'));return true;}
 return false;
}
function renderLabels(){
 document.documentElement.lang=state.translationUnavailable?'en':state.language;document.title=t('admin')+' · Japan Life Base';
 document.querySelector('.admin-sidebar nav').setAttribute('aria-label',t('admin'));
 document.querySelectorAll('[data-label]').forEach(el=>el.textContent=t(el.dataset.label));
 document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
 $('#admin-language').querySelector('[value="system"]').textContent=t('system');ensureLanguageOption($('#admin-language'),state.preference,state.language);$('#admin-language').value=state.preference;
 $('#view-heading').textContent=t(state.view);$('#admin-identity').textContent=state.user?.name||'';
 document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===state.view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
}
async function setLanguage(preference){
 const ticket=++languageRequest;state.preference=preference;
 $('#admin-language').disabled=true;
 const result=await loadLanguage(preference,navigator.languages||[]);
 if(ticket!==languageRequest)return;
 Object.assign(state,{language:result.language,dictionary:result.dictionary,translationUnavailable:result.unavailable});
 renderLabels();$('#admin-language').disabled=false;renderLanguageSuggestion();
 const notice=$('#translation-notice');notice.hidden=!(result.automatic||result.unavailable);notice.textContent=result.unavailable?t('translationUnavailable'):result.automatic?t('machine'):'';
 if(state.user?.role==='admin'){ $('#admin-gate').hidden=true;$('#admin-layout').hidden=false;await loadView(); }
 else showGate(t(state.user?'forbidden':'loginRequired'),!state.user);
}
function makeTable(columns){
 const wrap=element('div','table-wrap'),table=element('table','admin-table'),head=element('thead'),row=element('tr'),body=element('tbody');
 for(const [key,className]of columns){const th=element('th',className,t(key));th.scope='col';row.append(th);}head.append(row);table.append(head,body);wrap.append(table);return {wrap,body};
}
function cell(row,key,className,value){const td=element('td',className);td.dataset.label=t(key);if(value instanceof Node)td.append(value);else if(value!==undefined)td.textContent=String(value);row.append(td);return td;}
function badge(key,extra=''){return element('span','badge '+extra,t(key));}
function topicLink(topic){const a=element('a','',topic.title||topic.id);a.href='/t/'+encodeURIComponent(topic.id);return a;}
function listNote(){return element('p','admin-note',t('shownLimit'));}
function empty(){return element('p','empty-state',t('empty'));}

function renderOverview(data){
 const fragment=document.createDocumentFragment(),grid=element('div','stat-grid');
 if(!data.counts||['users','topics','hiddenTopics','replies','contacts','reports'].some(key=>!Number.isSafeInteger(data.counts[key])||data.counts[key]<0))throw new Error('invalid_response');
 for(const [field,label]of [['users','members'],['topics','totalTopics'],['hiddenTopics','hiddenTopics'],['replies','totalReplies'],['reports','totalReports'],['contacts','totalContacts']]){
  const card=element('article','stat-card');card.append(element('span','stat-label',t(label)),element('strong','stat-number',number(data.counts?.[field])));grid.append(card);
 }fragment.append(grid);return fragment;
}
function queryForm(kind){
 const form=element('form','admin-toolbar'),input=element('input');input.type='search';input.maxLength=200;input.name='query';input.placeholder=t(kind==='topics'?'topicSearch':'userSearch');input.setAttribute('aria-label',input.placeholder);input.value=state[kind+'Query'];form.append(input);
 let select;
 if(kind==='topics'){select=element('select');select.name='status';select.setAttribute('aria-label',t('visible'));for(const key of ['all','visible','hidden']){const option=element('option','',t(key));option.value=key;select.append(option);}select.value=state.status;form.append(select);}
 const submit=element('button','button primary',t('search'));submit.type='submit';form.append(submit);
 form.addEventListener('submit',event=>{event.preventDefault();if(state.writeBusy)return;state[kind+'Query']=input.value.trim();if(select)state.status=select.value;loadView();});
 return form;
}
function renderTopics(data){
 const fragment=document.createDocumentFragment();fragment.append(queryForm('topics'));
 if(!data.topics?.length){fragment.append(empty());return fragment;}
 const table=makeTable([['topic','topic-title-cell'],['visible','topic-state-cell'],['author','topic-author-cell'],['replies','topic-reply-cell'],['updated','topic-time-cell'],['actions','topic-actions-cell']]);
 for(const topic of data.topics){
  const row=element('tr'),title=element('div','cell-title');if(topic.hidden)title.textContent=topic.title;else title.append(topicLink(topic));
  const titleCell=cell(row,'topic','topic-title-cell',title);titleCell.append(element('span','cell-meta',topic.id));
  const statuses=element('div');statuses.append(badge(topic.hidden?'hidden':'visible',topic.hidden?'hidden-status':''));if(topic.pinned)statuses.append(badge('pinned','neutral'));if(topic.seed)statuses.append(badge('sample','neutral'));cell(row,'visible','topic-state-cell',statuses);
  cell(row,'author','topic-author-cell',topic.author);cell(row,'replies','topic-reply-cell',number(topic.replies));cell(row,'updated','topic-time-cell',date(topic.updatedAt||topic.createdAt));
  const actions=element('div','row-actions');actions.append(button(t(topic.hidden?'restore':'hide'),()=>updateTopic(topic.id,{hidden:!topic.hidden}),'button '+(topic.hidden?'':'warning')),button(t(topic.pinned?'unpin':'pin'),()=>updateTopic(topic.id,{pinned:!topic.pinned})));
  cell(row,'actions','topic-actions-cell',actions);table.body.append(row);
 }fragment.append(table.wrap,listNote());return fragment;
}
function renderUsers(data){
 const fragment=document.createDocumentFragment();fragment.append(queryForm('users'));
 if(!data.users?.length){fragment.append(empty());return fragment;}
 const table=makeTable([['name','user-name-cell'],['email','user-email-cell'],['role','user-role-cell'],['moderation','user-moderation-cell'],['created','user-created-cell'],['actions','user-actions-cell']]);
 for(const user of data.users){
  const row=element('tr');cell(row,'name','user-name-cell',user.name);cell(row,'email','user-email-cell',user.email);cell(row,'role','user-role-cell',t(user.role==='admin'?'administrator':'member'));
  const statuses=element('div');statuses.append(badge(user.banned?'banned':'activeUser',user.banned?'hidden-status':''));if(user.muted)statuses.append(badge('muted','hidden-status'));statuses.append(badge(user.emailVerified?'verified':'unverified','neutral'));cell(row,'moderation','user-moderation-cell',statuses);cell(row,'created','user-created-cell',date(user.createdAt));
  const actions=element('div','row-actions');
  if(user.id===state.user.id||user.role==='admin')actions.append(element('span','admin-note',t('protectedUser')));
  else for(const [field,key,value]of [['banned',user.banned?'unban':'ban',!user.banned],['muted',user.muted?'unmute':'mute',!user.muted]])actions.append(button(t(key),()=>{if(window.confirm(t('confirmUserChange',{action:t(key),name:user.name})))writeChange('/api/admin/users/'+encodeURIComponent(user.id),{[field]:value});},'button warning'));
  cell(row,'actions','user-actions-cell',actions);table.body.append(row);
 }fragment.append(table.wrap,listNote());return fragment;
}
function renderInbox(data){
 const fragment=document.createDocumentFragment(),contacts=state.view==='contacts',items=contacts?data.contacts:data.reports;
 if(contacts)fragment.append(element('p','admin-note',t('noMail')));
 if(!items?.length){fragment.append(empty());return fragment;}
 const list=element('div','inbox-list');
 for(const item of items){
  const article=element('article','inbox-item'),heading=element('div','inbox-heading'),stamp=element('time','',date(item.created_at));stamp.dateTime=item.created_at;
  heading.append(element('h2','',contacts?item.name:t('topic')+' · '+item.topic_id),stamp);article.append(heading);
  const meta=element('div','inbox-meta');if(contacts)meta.append(element('span','',item.email));else meta.append(element('span','',t('user')+' · '+item.user_id));meta.append(element('span','cell-meta',item.id));article.append(meta,element('p','inbox-message',contacts?item.message:item.reason));if(!contacts){
   const controls=element('div','admin-toolbar'),label=element('label','',t('reportStatus')),select=element('select');select.setAttribute('aria-label',t('reportStatus'));
   for(const key of ['open','reviewing','resolved','dismissed']){const option=element('option','',t(key));option.value=key;select.append(option);}select.value=item.status||'open';label.append(select);controls.append(label,button(t('save'),()=>writeChange('/api/admin/reports/'+encodeURIComponent(item.id),{status:select.value}),'button primary'));article.append(controls);
   if(item.reviewedBy)article.append(element('p','admin-note',t('reviewedBy')+' · '+item.reviewedBy+' · '+date(item.reviewedAt)));
  }list.append(article);
 }fragment.append(list,listNote());return fragment;
}
function renderAudit(data){
 const fragment=document.createDocumentFragment(),form=element('form','admin-toolbar'),input=element('select');input.name='action';input.setAttribute('aria-label',t('auditFilter'));for(const action of ['','moderate','author_hide','operator_hide','operator_restore','restrict_user','review_report']){const option=element('option','',t(action?'audit_'+action:'auditAll'));option.value=action;input.append(option);}input.value=state.auditAction;form.append(input);const submit=element('button','button',t('search'));submit.type='submit';form.append(submit);if(state.auditBefore)form.append(button(t('auditNewest'),()=>{state.auditBefore=null;loadView();}));form.onsubmit=event=>{event.preventDefault();if(state.writeBusy)return;state.auditAction=input.value.trim();state.auditBefore=null;loadView();};fragment.append(form);
 if(!data.actions?.length){fragment.append(empty());return fragment;}
 const list=element('div','inbox-list');for(const item of data.actions){const card=element('article','inbox-item'),heading=element('div','inbox-heading');heading.append(element('h2','',state.dictionary['audit_'+item.action]||item.action),element('time','',date(item.createdAt)));card.append(heading,element('p','admin-note',t('auditActor')+' · '+item.userId+(item.topicId?' · '+t('topic')+' '+item.topicId:'')));const details=element('details','audit-details');details.append(element('summary','',t('auditDetails')),element('pre','',JSON.stringify(item.details??{},null,2)));card.append(details);list.append(card);}fragment.append(list);
 if(data.nextCursor)fragment.append(button(t('auditMore'),()=>{state.auditBefore=data.nextCursor;loadView();}));return fragment;
}
async function loadView(){
 if(state.user?.role!=='admin'||state.writeBusy)return;
 const ticket=++viewRequest,view=state.view,content=$('#admin-content');content.setAttribute('aria-busy','true');$('#view-status').hidden=true;
 if(!content.childElementCount)content.append(element('p','loading-state',t('loading')));
 m5Admin.leave();if(view==='directory'||view==='insights'){await m5Admin[view](content);if(ticket===viewRequest)content.setAttribute('aria-busy','false');return;}
 let path='/api/admin/'+view;
 if(view==='topics')path+='?'+new URLSearchParams({query:state.topicsQuery,status:state.status});
 if(view==='audit')path+='?'+new URLSearchParams({...state.auditBefore?{before:state.auditBefore}:{},...state.auditAction?{action:state.auditAction}:{}});
 if(view==='users')path+='?'+new URLSearchParams({query:state.usersQuery});
 if(view==='reports'||view==='contacts')path='/api/admin/inbox';
 try{
  const data=await request(path);if(ticket!==viewRequest||state.user?.role!=='admin')return;
  const result=view==='overview'?renderOverview(data):view==='topics'?renderTopics(data):view==='users'?renderUsers(data):view==='audit'?renderAudit(data):renderInbox(data);content.replaceChildren(result);
 }catch(error){if(ticket!==viewRequest)return;if(content.querySelector('.loading-state'))content.replaceChildren();if(!handlePermission(error))showError(t('error'),loadView);}
 finally{if(ticket===viewRequest)content.setAttribute('aria-busy','false');}
}
async function updateTopic(id,change){return writeChange('/api/admin/topics/'+encodeURIComponent(id),change);}
async function writeChange(path,change){
 if(state.writeBusy||state.user?.role!=='admin')return;
 state.writeBusy=true;$('#view-status').hidden=true;$('#admin-language').disabled=true;document.querySelectorAll('#admin-content button,[data-view]').forEach(el=>el.disabled=true);
 try{await request(path,{method:'POST',body:JSON.stringify(change)});}
 catch(error){if(!handlePermission(error))showError(t(['protected_admin','cannot_restrict_self'].includes(error.code)?'protected_account':error.code==='invalid_status'?'invalid_status':'saveError'));return;}
 finally{state.writeBusy=false;$('#admin-language').disabled=false;document.querySelectorAll('#admin-content button,[data-view]').forEach(el=>el.disabled=false);}
 await loadView();
}
function changeView(view){
 if(!views.includes(view)||state.writeBusy||state.user?.role!=='admin')return;
 state.view=view;history.replaceState(null,'','#'+view);$('#admin-content').replaceChildren();renderLabels();loadView();
}
async function initialize(){
 try{const result=await request('/api/session');state.user=result.user||null;await preferences.setUser(state.user);await setLanguage(preferences.preference);}
 catch{showGate(t('error'),false,true);}
}
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>changeView(el.dataset.view)));
$('#admin-language').addEventListener('change',event=>{if(!state.writeBusy)preferences.choose(event.target.value);});
window.addEventListener('pagehide',()=>{m5Admin.leave();viewRequest++;state.user=null;preferences.setUser(null);$('#admin-content').replaceChildren();$('#admin-layout').hidden=true;});
window.addEventListener('pageshow',event=>{if(event.persisted)initialize();});
for(const language of navigator.languages||[]){const resolved=resolveLocale(language,[]).language;if(![...$('#admin-language').options].some(option=>option.value===resolved)){const option=element('option','',resolved);option.value=resolved;$('#admin-language').append(option);}}
function renderLanguageSuggestion(){
 const host=$('#language-suggestion');if(!host)return;host.replaceChildren();host.hidden=true;if(preferences.explicit)return;
 const language=resolveLocale('system',navigator.languages||[]).language;if(language===state.language)return;
 const name=new Intl.DisplayNames([state.language],{type:'language'}).of(language)||language;host.append(element('span','',t('browserLanguage',{language:name})),button(t('useBrowserLanguage'),()=>preferences.choose(language)));host.hidden=false;
}
initialize();
