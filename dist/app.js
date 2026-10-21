import {applyDirectory,getDirectory,categoryLabel,tagLabel} from './community-directory.js?v=20261021225303391';
import {m5Dictionaries} from './m5-i18n.js?v=20261021225303391';
import {createM5UI,searchURL} from './m5-ui.js?v=20261021225303391';
import {createLanguagePreferences,readLanguagePreference} from './preferences.js?v=20261021225303391';
import {renderLanguageSuggestion,ensureLanguageOption} from './language-ui.js?v=20261021225303391';
import {categories,avatarColors} from './topics.js?v=20261021225303391';
import {selectTopics} from './select-topics.js?v=20261021225303391';
import {icon} from './icons.js?v=20261021225303391';
import {dictionaries,loadDictionary} from './i18n.js?v=20261021225303391';
import {resolveLocale,relativeTime,communityContentLanguage} from './locale.js?v=20261021225303391';
import {createAuthUI,isAccountRoute,safeReturn} from './auth-ui.js?v=20261021225303391';
import {createContentUI} from './m3-ui.js?v=20261021225303391';
import {m3Dictionaries} from './m3-i18n.js?v=20261021225303391';
import {createCommunityInteractionsUI} from './m4-ui.js?v=20261021225303391';
import {m4Dictionaries} from './m4-i18n.js?v=20261021225303391';
import {createComposer} from './composer.js?v=20261021225303391';
import {composerDictionaries} from './composer-i18n.js?v=20261021225303391';
import {renderMarkdown} from './markdown.js?v=20261021225303391';
import {createReadingNavigation} from './reading-nav.js?v=20261021225303391';
import {topicTags} from './topic-tags.js?v=20261021225303391';
for(const [language,copy] of Object.entries(composerDictionaries))Object.assign(dictionaries[language],copy);

for(const [language,copy] of Object.entries(m3Dictionaries))Object.assign(dictionaries[language],copy);
for(const [language,copy] of Object.entries(m4Dictionaries))Object.assign(dictionaries[language],copy);
for(const [language,copy] of Object.entries(m5Dictionaries))Object.assign(dictionaries[language],copy);
const $=s=>document.querySelector(s);
const drawerQuery=matchMedia('(width < 1100px)');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stored=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const persist=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const requestedTag=new URLSearchParams(location.search).get('tag');
const state={category:'all',tag:topicTags.some(tag=>tag.id===requestedTag)?requestedTag:null,query:'',sort:'latest',solved:'all',limit:12,unanswered:false,showBanner:stored('jlb-banner')!=='hidden',user:null,topicId:null,scrollY:0,topics:[],loading:true,error:null,language:'zh-CN',dictionary:dictionaries['zh-CN'],uiAutomatic:false,uiUnavailable:false,original:false,translation:{},preference:readLanguagePreference()};
let quote=null,toastTimer=null,listRequest=0,detailRequest=0,languageRequest=0,savedReplyDraft=null,composer=null,authAfter=null,initialReady=false,privateRequest=0;
const replyDrafts=new Map();
const replyDraftKey=(topicId,owner=state.user?.id||null)=>JSON.stringify([owner,topicId]);
let contentUI=null,interactionsUI=null,disposeInteractions=null,m5UI=null;
let readingNavigation=null,readingState={topicId:null,window:'first',bookmark:null};
const t=(key,values={})=>String(state.dictionary[values.count===1&&state.dictionary[key+'One']?key+'One':key]??dictionaries.en[key]??key).replace(/\{(\w+)\}/g,(_,k)=>values[k]??`{${k}}`);
const svgInit=(parent=document)=>parent.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const avatarPalette=[...avatarColors,['#e4e8f2','#7484a8'],['#f0e4ec','#99758c']];
const avatar=p=>{const [bg,fg]=avatarPalette[Math.abs(Number(p.tone)||0)%avatarPalette.length];const url=typeof p.avatarUrl==='string'&&/^\/api\/avatars\/[A-Za-z0-9_-]+\/[A-Fa-f0-9]{1,128}$/.test(p.avatarUrl)?p.avatarUrl:null;return `<span class="avatar" style="--av-bg:${bg};--av-fg:${fg}" aria-hidden="true"><span>${escape(p.avatar||Array.from(p.name||p.author||'?')[0])}</span>${url?`<img data-avatar-image src="${escape(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</span>`;};
const categoryTag=id=>{const c=categories[id]||categories.daily;return `<button class="category-tag" data-category="${escape(id)}" style="--cat:${c.color};--tag-bg:${c.bg};--tag-fg:${c.fg}"><span class="category-marker"></span>${escape(categoryLabel(id,state.language,t))}</button>`;};
const tagName=id=>tagLabel(id,state.language,t);
const topicTagMarkup=ids=>(Array.isArray(ids)?ids:[]).filter(id=>topicTags.some(tag=>tag.id===id)).slice(0,5).map(id=>`<button type="button" class="topic-tag" data-topic-tag="${escape(id)}">${escape(tagName(id))}</button>`).join('');
function bindTopicTags(parent){parent.querySelectorAll('[data-topic-tag]').forEach(button=>button.onclick=()=>setTag(button.dataset.topicTag));}
function attachmentGallery(items){
 const gallery=document.createElement('div');gallery.className='topic-image-gallery';
 for(const item of (Array.isArray(items)?items:[]).slice(0,5)){
  if(typeof item.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(item.id))continue;
  const url='/api/topic-attachments/'+item.id,link=document.createElement('a'),image=document.createElement('img');
  link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',t('viewFullImage',{count:gallery.childElementCount+1}));
  image.src=url;image.alt=t('composeImage',{count:gallery.childElementCount+1});image.loading='lazy';image.decoding='async';
  if(Number.isInteger(item.width)&&item.width>0&&item.width<=2048)image.width=item.width;
  if(Number.isInteger(item.height)&&item.height>0&&item.height<=2048)image.height=item.height;
  link.append(image);gallery.append(link);
 }
 return gallery;
}
const dataLanguage=()=> 'original';
const time=date=>relativeTime(date,state.language);

function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
function errorText(error){if(error.code==='account_banned')return t('accountBanned');if(error.code==='account_muted')return t('accountMuted');if(error.status===401)return t('sessionExpired');if(error.status===429)return t('rateLimited');if(error.code==='invalid_credentials')return t('authInvalid');if(error.code==='email_exists'||error.status===409)return t('emailExists');return t(error.network||error.status>=500?'connectionError':'requestError');}
async function api(path,options={}){
 let response;
 try{response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});}catch{throw Object.assign(new Error('network'),{network:true});}
 let result;try{result=await response.json();}catch{throw Object.assign(new Error('network'),{network:true});}
 if(!response.ok)throw Object.assign(new Error(result.error||'request_failed'),{status:response.status,code:result.code,retryAfter:Number(result.retryAfter)||Number(response.headers.get('Retry-After'))||undefined,resendAt:result.resendAt,remainingAttempts:result.remainingAttempts});
 return result;
}
const preferences=createLanguagePreferences({api,onChange:value=>setLanguage(value),onError:()=>toast(t('preferenceSaveError'))});
function applyUser(user){if((state.user?.id||null)!==(user?.id||null)){disposeContent();const anonymous=!state.user&&user?savedReplyDraft:null;replyDrafts.clear();savedReplyDraft=anonymous?.owner===null?{...anonymous,owner:user.id,pending:null,attachmentIds:[],editDraft:null}:null;if(savedReplyDraft)replyDrafts.set(replyDraftKey(savedReplyDraft.topicId,user.id),savedReplyDraft);detailRequest++;}state.user=user;m5UI?.setUser();composer?.setUser(user);renderAccounts();return preferences.setUser(user);}
function clearPrivateData(){disposeContent();detailRequest++;privateRequest++;savedReplyDraft=null;replyDrafts.clear();composer?.logout();authAfter=null;quote=null;interactionsUI?.refreshIdentity();if(dialog.open)dialog.close();$('#dialog-body').replaceChildren();}
function navigatePage(url){composer?.suspend();if(dialog.open)dialog.close();history.pushState(null,'',url);closeFilter();closeDrawer();renderRoute();window.scrollTo({top:0});}
function continueAuth(target,intent){const callback=authAfter;authAfter=null;const destination=safeReturn(target);if(destination==='/admin'){location.assign(destination);return;}navigatePage(destination);if(callback)callback();else if(intent==='compose')openComposer();else if(['topics','messages','bookmarks'].includes(intent))openPersonal(intent);}
let accountIdentity=null;
const authUI=createAuthUI({host:$('#account-view'),api,t,getUser:()=>state.user,getIdentity:()=>accountIdentity,onAccountRender:host=>m5UI?.mountSettings(host),onUser:user=>{applyUser(user);loadTopics();},avatar,navigate:navigatePage,onContinue:continueAuth,onLogout:clearPrivateData,beforeLogout:()=>composer?.beforeLogout()??true,getLanguage:()=>state.language});
function syncSidebar(){const hidden=document.body.classList.contains('composer-open')||(drawerQuery.matches?!document.body.classList.contains('drawer-open'):document.body.classList.contains('nav-collapsed'));$('#sidebar').inert=hidden;$('#sidebar').setAttribute('aria-hidden',String(hidden));}
function closeDrawer(){document.body.classList.remove('drawer-open');syncSidebar();$('#drawer-shade').hidden=true;$('#menu-toggle').setAttribute('aria-expanded',String(!drawerQuery.matches&&!document.body.classList.contains('nav-collapsed')));}
function closeFilter(){$('#filter-popover').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false');}
function bindCategories(parent){parent.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>setCategory(b.dataset.category)));}
function updateTranslation(translation=state.translation){state.translation=translation;const unavailable=state.uiUnavailable||translation.unavailable,automatic=state.uiAutomatic||translation.automatic;$('#translation-notice').hidden=!(unavailable||automatic||state.original);$('#translation-label').textContent=unavailable?t('translationUnavailable')+(state.uiUnavailable?' '+t('interfaceEnglish'):''):automatic?t('machineNote'):t('showOriginal');$('#original-toggle').textContent=state.original?t('showTranslation'):t('showOriginal');$('#original-toggle').hidden=!(translation.automatic||translation.unavailable||state.original);}
function renderAccounts(){const adminEntry=document.getElementById('admin-entry');if(adminEntry)adminEntry.hidden=state.user?.role!=='admin';const box=$('#account-actions');box.innerHTML=state.user?`<button class="pill" id="my-account" aria-label="${escape(t('account')+': '+state.user.name)}">${avatar(state.user)}</button>`:`<button class="pill" data-auth="register">${escape(t('register'))}</button><button class="pill" data-auth="login">${escape(t('login'))}</button>`;box.querySelectorAll('[data-auth]').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.auth)));if(state.user)$('#my-account').onclick=()=>{const p=new URLSearchParams();const target=isAccountRoute(location.pathname)?safeReturn(new URLSearchParams(location.search).get('return')):safeReturn(location.pathname+location.search+location.hash);if(target!=='/')p.set('return',target);navigatePage('/account'+(p.size?'?'+p:''));};interactionsUI?.refreshIdentity();}
function applyLanguage(){composer?.refreshLanguage();document.documentElement.lang=state.uiUnavailable?'en':state.language;document.title='Japan Life Base';document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));$('#search-input').placeholder=t('search');$('#search-input').ariaLabel=t('search');$('#menu-toggle').ariaLabel=t('menu');$('#filter-toggle').ariaLabel=t('searchSettings');$('#banner-close').ariaLabel=t('close');$('#assistant-close').ariaLabel=t('close');$('#dialog-close').ariaLabel=t('close');$('#chat-input').placeholder=t('search');$('#chat-input').ariaLabel=t('search');$('#language-select').querySelector('[value="system"]').textContent=t('system');const label=new Intl.DisplayNames([state.uiUnavailable?'en':state.language],{type:'language'});$('#locale-label').textContent=label.of(state.language)||state.language;$('#category-links').innerHTML=Object.entries(categories).filter(([id,c])=>c.active!==false).map(([id,c])=>`<button class="side-link" data-category="${id}"><span class="category-marker" style="--cat:${c.color}"></span>${escape(categoryLabel(id,state.language,t))}</button>`).join('');$('#category-select').innerHTML=`<option value="all">${escape(t('allCategories'))}</option>`+Object.keys(categories).filter(id=>categories[id].active!==false||id===state.category).map(id=>`<option value="${id}">${escape(categoryLabel(id,state.language,t))}</option>`).join('');bindCategories($('#category-links'));ensureLanguageOption($('#language-select'),state.preference,state.language);$('#language-select').value=state.preference;renderAccounts();updateTranslation();svgInit();}
async function setLanguage(preference){
 const ticket=++languageRequest,route=location.pathname+location.search+location.hash,scroll=window.scrollY;
 const reply=$('#reply-text'),replyFocused=reply===document.activeElement,replySelection=reply?[reply.selectionStart,reply.selectionEnd]:null;
 saveReplyState();
 state.preference=preference;const resolved=resolveLocale(preference,navigator.languages);state.language=resolved.language;state.dictionary=dictionaries[resolved.source];state.uiAutomatic=false;state.uiUnavailable=false;state.original=false;applyLanguage();
 renderLanguageSuggestion($('#language-suggestion'),{preferences,language:state.language,languages:navigator.languages,t,onChoose:value=>preferences.choose(value)});
 if(resolved.automatic){$('#translation-notice').hidden=false;$('#translation-label').textContent=t('translationLoading');$('#original-toggle').hidden=true;try{const result=await loadDictionary(resolved.language);if(ticket!==languageRequest)return;state.dictionary=result.dictionary;state.uiAutomatic=result.automatic;}catch{if(ticket!==languageRequest)return;state.dictionary=dictionaries.en;state.uiUnavailable=true;}}
 if(ticket!==languageRequest)return;applyLanguage();await loadTopics();
 if(ticket!==languageRequest||route!==location.pathname+location.search+location.hash)return;
 if(isAccountRoute(location.pathname)){if(initialReady)await authUI.refreshLanguage();}else await renderRoute();
 if(ticket!==languageRequest||route!==location.pathname+location.search+location.hash)return;
 window.scrollTo({top:scroll});if(replyFocused&&$('#reply-text')){$('#reply-text').focus({preventScroll:true});if(replySelection)$('#reply-text').setSelectionRange(...replySelection);}
}
async function loadTopics(){const ticket=++listRequest;state.loading=true;state.error=null;renderList();try{const result=await api(`/api/topics?lang=${encodeURIComponent(dataLanguage())}${state.tag?'&tag='+encodeURIComponent(state.tag):''}${state.solved!=='all'?'&solved='+state.solved:''}`);if(ticket!==listRequest)return;state.topics=(result.topics||[]).map(topic=>({...topic,minutes:Math.max(0,(Date.now()-Date.parse(topic.updatedAt||topic.createdAt))/60000)}));state.translation=result.translation||{};}catch(error){if(ticket!==listRequest)return;state.error=error;state.topics=[];}finally{if(ticket===listRequest){state.loading=false;renderList();updateTranslation();}}}
function setCategory(category){state.category=category;state.limit=12;state.unanswered=false;state.scrollY=0;closeDrawer();navigateHome();window.scrollTo({top:0});}
function renderList(){
 const filtered=state.unanswered?state.topics.filter(topic=>topic.replies===0):state.topics;const result=selectTopics(filtered,state);
 const list=$('#topic-list');list.replaceChildren();
 if(state.loading)list.innerHTML=`<div class="empty-state">${escape(t('loading'))}</div>`;
 else if(state.error){list.innerHTML=`<div class="empty-state"><strong>${escape(errorText(state.error))}</strong><button class="dark-button retry-button" id="retry-topics">${escape(t('retry'))}</button></div>`;$('#retry-topics').onclick=loadTopics;}
 else if(!result.total)list.innerHTML=`<div class="empty-state"><strong>${escape(t('emptyTitle'))}</strong>${escape(t('emptyBody'))}</div>`;
 else result.items.forEach(topic=>{const card=document.createElement('article');card.className=`topic-card${topic.pinned?' pinned':''}`;card.innerHTML=`${avatar(topic)}<div class="topic-content"><a class="topic-title" href="/t/${encodeURIComponent(topic.id)}" data-topic="${escape(topic.id)}">${topic.pinned?icon('pin'):''}<span>${escape(topic.title)}</span></a><div class="topic-meta">${categoryTag(topic.category)}<span class="reply-count" aria-label="${escape(t('repliesCount',{count:topic.replies||0}))}">${icon('reply')}${Number(topic.replies)||0}</span><span class="meta-author">${topic.authorHandle?`<a href="/u/${escape(topic.authorHandle)}" data-profile="${escape(topic.authorHandle)}">${escape(topic.author)}</a>`:escape(topic.author)}</span><span class="meta-separator">·</span><time class="meta-time" datetime="${escape(topic.updatedAt)}">${escape(time(topic.updatedAt||topic.createdAt))}</time>${topic.solved?`<span class="m4-solved-tag">${escape(t('m4Solved'))}</span>`:''}${topic.seed?`<span class="sample-tag">${escape(t('sample'))}</span>`:''}</div>${topicTagMarkup(topic.tagIds)?`<div class="topic-tags">${topicTagMarkup(topic.tagIds)}</div>`:''}${topic.attachments?.length?`<span class="topic-image-count">${escape(t('imagesCount',{count:topic.attachments.length}))}</span>`:''}${topic.pinned?`<p class="topic-excerpt">${escape(topic.excerpt)}</p><span class="pinned-badge">${icon('pin')}${escape(t('pinned'))}</span>`:''}</div>`;card.querySelector('[data-topic]').onclick=e=>{e.preventDefault();openTopic(topic.id);};bindCategories(card);bindTopicTags(card);list.append(card);});
 $('#load-more').hidden=state.loading||!!state.error||!result.hasMore;$('#end-note').hidden=state.loading||!!state.error||result.hasMore||!result.total;$('#topic-total').textContent=state.loading?'':t('topicsCount',{count:result.total});const filters=state.query||state.category!=='all'||state.unanswered||state.tag||state.solved!=='all';$('#solved-filter').value=state.solved;$('#tag-filter-scope').hidden=!state.tag;$('#results-context').hidden=!filters;$('#results-label').textContent=[state.category!=='all'?categoryLabel(state.category,state.language,t):'',state.tag?t('tagFilter',{name:tagName(state.tag)}):'',state.query?`“${state.query}”`:'',state.unanswered?t('unanswered'):'',state.solved!=='all'?t(state.solved==='true'?'m4Solved':'m4Unsolved'):''].filter(Boolean).join(' · ');$('#announcement').hidden=!state.showBanner||!!filters;$('#banner-toggle').checked=state.showBanner;$('#category-select').value=state.category;document.querySelectorAll('[data-sort]').forEach(b=>{const active=b.dataset.sort===state.sort;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});document.querySelectorAll('#sidebar [data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category));$('[data-view="all"]').classList.toggle('active',state.category==='all'&&!state.unanswered);}
function navigateHome(){history.pushState(null,'','/'+(state.tag?'?tag='+encodeURIComponent(state.tag):''));renderRoute();}
function setTag(id){if(id!==null&&!topicTags.some(tag=>tag.id===id))return;state.tag=id;state.limit=12;state.scrollY=0;closeDrawer();navigateHome();loadTopics();window.scrollTo({top:0});}
function renderRoute(){
 disposeContent();m5UI?.leave();interactionsUI?.leaveRoute();readingNavigation?.destroy();readingNavigation=null;document.body.classList.remove('topic-reading');$('#reading-mobile').hidden=true;
 const path=location.pathname.replace(/\/$/,''),account=isAccountRoute(location.pathname),tool=['/denkikakaku','/moving-checklist'].includes(path),profile=path.match(/^\/u\/([a-z][a-z0-9_]{2,31})$/),search=path==='/search',topicPath=path.match(/^\/t\/([A-Za-z0-9_-]{1,100})$/);
 const id=!account&&!tool&&!profile&&!search?(topicPath?.[1]||new URLSearchParams(location.hash.slice(1)).get('topic')):null;
 const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.href='https://www.jp-lifebase.com'+(id?'/t/'+encodeURIComponent(id):'/');
 const description=document.querySelector('meta[name="description"]');if(description)description.content='Japan Life Base，在日本生活的讨论社区。';
 let robots=document.querySelector('meta[name="robots"]');if(account||profile||search){if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.append(robots);}robots.content='noindex, follow';}else if(robots)robots.remove();

 if(readingState.topicId!==id)readingState={topicId:id,window:'first',bookmark:null};
 $('#assistant-launcher').hidden=account||!!id||!!profile||search;if(id||account||profile||search)toggleAssistant(false);composer?.setRoute(account||!!profile||search);
 $('#account-view').hidden=!account;$('#tool-view').hidden=!tool;$('#list-view').hidden=tool||account||!!profile||search;$('#detail-view').hidden=!id;$('#m5-view').hidden=!profile&&!search;
 if(account){state.topicId=null;detailRequest++;if(initialReady)authUI.render();else $('#account-view').innerHTML=`<div class="empty-state" role="status">${escape(t('loading'))}</div>`;return;}authUI.leave();
 if(profile||search){state.topicId=null;detailRequest++;if(profile)m5UI?.renderProfile(profile[1]);else m5UI?.renderSearch();return;}
 if(tool){state.topicId=null;const denki=path==='/denkikakaku';$('#tool-view').innerHTML=`<a class="back-button" href="/">${icon('arrow-left')}${escape(t('backHome'))}</a><div class="tool-placeholder"><h1>${escape(t(denki?'electricityTool':'movingTool'))}</h1><p>${escape(t(denki?'electricityBody':'movingBody'))}</p></div>`;return;}
 const queryTag=new URLSearchParams(location.search).get('tag');if(!location.hash&&location.pathname==='/'&&state.tag!==(topicTags.some(tag=>tag.id===queryTag)?queryTag:null)){state.tag=topicTags.some(tag=>tag.id===queryTag)?queryTag:null;state.limit=12;loadTopics();}
 if(id){state.topicId=id;$('#list-view').hidden=true;return loadDetail(id);}state.topicId=null;quote=null;renderList();
}
function openTopic(id){state.scrollY=window.scrollY;quote=null;history.pushState(null,'',`/t/${encodeURIComponent(id)}`);renderRoute();closeFilter();closeDrawer();window.scrollTo({top:0});}
function saveReplyState(){if(contentUI&&state.topicId){savedReplyDraft={topicId:state.topicId,owner:state.user?.id||null,...contentUI.getReplyState()};replyDrafts.set(replyDraftKey(state.topicId),savedReplyDraft);}}
function disposeContent(){saveReplyState();disposeInteractions?.();disposeInteractions=null;contentUI?.destroy();contentUI=null;}
async function loadDetail(id,mode=readingState.window,jump=null){
 disposeContent();
 readingNavigation?.destroy();readingNavigation=null;$('#reading-mobile').hidden=true;
 const ticket=++detailRequest;$('#topic-detail').innerHTML='<div class="empty-state">'+escape(t('loading'))+'</div>';
 try{
  const result=await api('/api/topics/'+encodeURIComponent(id)+'?lang='+encodeURIComponent(dataLanguage())+'&replyWindow='+encodeURIComponent(mode));
  if(ticket!==detailRequest||state.topicId!==id)return;
  readingState.window=mode;renderDetail(result);updateTranslation(result.translation);
  if(jump)readingNavigation.navigate(jump,{rememberPosition:false});
  const sourcePost=new URLSearchParams(location.search).get('post');if(sourcePost&&/^[A-Za-z0-9_-]{1,100}$/.test(sourcePost)&&!jump)m5UI?.showSource({kind:'post',id:sourcePost,topicId:id});
 }catch(error){
  if(ticket!==detailRequest||state.topicId!==id)return;
  document.body.classList.remove('topic-reading');$('#topic-detail').innerHTML='<div class="empty-state"><strong>'+escape(errorText(error))+'</strong><button class="dark-button retry-button" id="retry-detail">'+escape(t('retry'))+'</button></div>';
  $('#retry-detail').onclick=()=>loadDetail(id,mode,jump);
 }
}
function renderDetail(result){
 const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=String(result.topic?.excerpt||result.topic?.title||'').slice(0,180);
 const topic=result.topic,root=$('#topic-detail'),mobile=$('#reading-mobile');
 document.title=topic.title+' · Japan Life Base';root.className='topic-reading-layout';root.dataset.topicId=topic.id;root.dataset.replyCount=String(topic.replies||0);
 const navButton=(action,key,primary=false,hidden=false)=>{
  const symbol={original:'book',replies:'message',latest:'chevron-down',write:'reply',return:'arrow-left'}[action]||'message';
  return '<button type="button" data-reading-action="'+action+'" class="reading-action'+(primary?' reading-primary':'')+(action==='return'?' reading-return':'')+'"'+(hidden?' hidden':'')+(action==='return'?' disabled':'')+' aria-label="'+escape(t(key,{count:topic.replies||0}))+'"><span class="reading-action-icon">'+icon(symbol)+'</span><span class="reading-action-label">'+escape(t(action==='replies'?'readingRepliesLabel':key))+'</span>'+(action==='replies'?'<span class="reading-count">'+Number(topic.replies||0)+'</span>':'')+'</button>';
 };
 root.innerHTML=[
  '<header class="reading-topic-header"><div class="reading-header-surface"><div class="reading-heading-group">',
  '<h1 class="detail-heading">'+escape(topic.title)+'</h1>',
  '<div class="detail-summary">'+categoryTag(topic.category)+topicTagMarkup(topic.tagIds)+'<button type="button" class="reading-count-button" data-reading-action="replies">'+icon('message')+escape(t('repliesCount',{count:topic.replies||0}))+'</button>'+(topic.seed?'<span class="sample-tag">'+escape(t('sample'))+'</span>':'')+'</div></div>',
  '<nav class="reading-nav" aria-label="'+escape(t('topicReadingNav'))+'"><span class="reading-nav-title">'+escape(t('topicReadingNav'))+'</span>'+navButton('original','readingOriginal')+navButton('replies','readingReplies')+navButton('latest','readingLatest',false,!topic.replies)+'<div class="reading-nav-footer">'+navButton('return','readingReturn')+navButton('write','readingWrite',true)+'</div></nav>',
  '</div></header><div class="topic-reading-main">',
  topic.seed?'<p class="form-note seed-notice">'+escape(t('sampleNotice'))+'</p>':'',
  '<div class="posts"><div class="original-post"></div><section id="topic-replies" class="topic-replies" aria-labelledby="replies-title"><div class="replies-heading"><h2 id="replies-title" tabindex="-1">'+escape(t('readingRepliesHeading',{count:topic.replies||0}))+'</h2>'+navButton('latest','readingLatest',false,!topic.replies)+'</div><p class="reply-window-note" hidden></p><div class="reply-posts"></div><div class="no-replies"'+(topic.replies?' hidden':'')+'><p>'+escape(t('readingNoReplies'))+'</p>'+navButton('write','readingFirstReply')+'</div></section></div>',
  '<section id="topic-reply-editor" class="reply-editor"><label for="reply-text">'+escape(t('reply'))+'</label><blockquote id="reply-quote" class="quote" hidden></blockquote><button class="plain-button" id="cancel-quote" hidden>'+escape(t('cancelQuote'))+'</button><textarea id="reply-text" placeholder="'+escape(t('replyPlaceholder'))+'" maxlength="5000"></textarea><div class="editor-actions"><button class="dark-button" id="send-reply">'+escape(t('sendReply'))+'</button></div><p class="form-error" id="reply-error" hidden></p></section></div>',
 ].join('');
 (result.posts||[]).forEach((post,index)=>{
  const el=document.createElement('article');el.className='post';el.tabIndex=-1;el.dataset.postId=post.id;
  if(index===0)el.id='topic-original';
  const floor=index===0?1:(result.replyWindow?.hasEarlier?Number(topic.replies)-Number(result.replyWindow.loaded):0)+index+1;
  el.innerHTML=avatar(post)+'<div><div class="post-header"><strong>'+escape(post.author)+'</strong>'+(index===0?'<span class="post-role">'+escape(t('originalPoster'))+'</span>':'')+'<time datetime="'+escape(post.createdAt)+'">'+escape(time(post.createdAt))+' · #'+floor+'</time></div>'+(post.quote?'<blockquote class="quote">'+escape(typeof post.quote==='string'?post.quote:[post.quote.author,post.quote.body].join(': '))+'</blockquote>':'')+'<div class="post-body">'+escape(post.body)+'</div><div class="post-tools"><button class="quote-post">'+icon('reply')+escape(t('reply'))+'</button></div></div>';
  if(/^[a-z][a-z0-9_]{2,31}$/.test(post.authorHandle||'')){const a=document.createElement('a');a.href='/u/'+post.authorHandle;a.dataset.profile=post.authorHandle;a.textContent=post.author;el.querySelector('.post-header strong').replaceChildren(a);}
  if(post.bodyFormat==='markdown'){const content=el.querySelector('.post-body');content.classList.add('markdown-body');renderMarkdown(content,post.body);}
  const images=index===0?topic.attachments:post.attachments;if(images?.length)el.querySelector('.post-body').after(attachmentGallery(images));

  root.querySelector(index===0?'.original-post':'.reply-posts').append(el);
 });
 if(result.replyWindow?.hasEarlier||result.replyWindow?.hasLater){const note=root.querySelector('.reply-window-note');note.hidden=false;note.textContent=t(result.replyWindow.hasEarlier?'readingLatestWindow':'readingMoreReplies',{count:result.replyWindow.loaded});}

 mobile.innerHTML='<button type="button" class="reading-action" data-reading-mobile-left data-reading-action="replies"><span class="reading-action-icon">'+icon('message')+'</span><span class="reading-action-label">'+escape(t('readingRepliesLabel'))+'</span><span class="reading-count">'+Number(topic.replies||0)+'</span></button>'+navButton('write','readingWrite',true);
 mobile.hidden=false;document.body.classList.add('topic-reading');
 function mountReading(){const bookmark=readingNavigation?.getBookmark()||readingState.bookmark;readingNavigation?.destroy();readingNavigation=createReadingNavigation({root,mobile,t,bookmark,replyInput:document.getElementById('reply-text'),onBookmark:point=>{readingState.bookmark=point?{...point,window:readingState.window}:null;},onWindow:action=>{
  const mode=action==='return'?readingState.bookmark?.window:action==='latest'?'latest':action==='replies'?'first':null;
  const needed=mode&&mode!==readingState.window&&(action==='return'||action==='latest'&&result.replyWindow?.hasLater||action==='replies'&&result.replyWindow?.hasEarlier);
  if(!needed)return false;
  loadDetail(topic.id,mode,action);return true;
 }});}
 mountReading();
 bindCategories(root);bindTopicTags(root);
 contentUI=createContentUI({root,topic,posts:result.posts||[],api,t,getUser:()=>state.user,getLanguage:()=>state.language,replyState:replyDrafts.get(replyDraftKey(topic.id))||{},onReplyState:value=>{savedReplyDraft={topicId:topic.id,owner:state.user?.id||null,...value};replyDrafts.set(replyDraftKey(topic.id),savedReplyDraft);},navigateWrite:()=>readingNavigation.navigate('write'),onLayout:mountReading,onAuth:()=>openAuth('login',null,'reply'),onChanged:async jump=>{const owner=state.user?.id||null,scroll=window.scrollY;await loadTopics();if(state.topicId===topic.id&&(state.user?.id||null)===owner){await loadDetail(topic.id,jump==='latest'?'latest':readingState.window,jump==='latest'?'latest':null);if(jump!=='latest')window.scrollTo({top:scroll,behavior:'instant'});}},onHidden:async content=>{const owner=state.user?.id||null,current=()=>state.topicId===topic.id&&(state.user?.id||null)===owner;if(!current())return;if(content.kind==='topic'){navigateHome();await loadTopics();}else{await loadTopics();if(current())await loadDetail(topic.id);}},toast});
 disposeInteractions=interactionsUI?.attachTopic({root,topic,posts:result.posts||[]})||null;mountReading();
}
const dialog=$('#site-dialog');
function openDialog(title,html){privateRequest++;$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;svgInit($('#dialog-body'));closeFilter();closeDrawer();if(!dialog.open)dialog.showModal();}
function showError(selector,message){const el=$(selector);if(el){el.textContent=message;el.hidden=false;}}
function requireAuth(after,intent=''){if(state.user)after();else openAuth('login',after,intent);}
function openAuth(mode,after,intent=''){saveReplyState();composer?.suspend();const previous=new URLSearchParams(location.search);const target=isAccountRoute(location.pathname)?safeReturn(previous.get('return')):safeReturn(location.pathname+location.search+location.hash);authAfter=after||null;authUI.open(mode,{target,intent:intent||previous.get('intent')||''});}
function openComposer(){closeFilter();closeDrawer();toggleAssistant(false);composer.open();}
composer=createComposer({api,t,getUser:()=>state.user,getCategory:()=>state.category,getLanguage:()=>state.language,categories,onClose:syncSidebar,onAuth:()=>{state.user=null;composer.setUser(null);renderAccounts();openAuth('login',openComposer,'compose');},onPublished:topic=>{openTopic(topic.id);loadTopics();toast(t('published'));},toast});
m5UI=createM5UI({api,t,getUser:()=>state.user,getLanguage:()=>state.language,navigate:navigatePage,openTopic,toast,host:$('#m5-view')});
interactionsUI=createCommunityInteractionsUI({api,t,getUser:()=>state.user,onAuth:intent=>openAuth('login',null,intent),onOpenTopic:openTopic,toast,onChange:value=>{
 const count=$('#notification-count');if(Object.hasOwn(value,'unreadCount')){count.hidden=!value.unreadCount;count.textContent=value.unreadCount>99?'99+':String(value.unreadCount||0);count.setAttribute('aria-label',t('m4Unread')+': '+String(value.unreadCount||0));}
 if(Object.hasOwn(value,'identity')){accountIdentity=value.identity;authUI.refreshIdentity();}
 if(value.topicId){const topic=state.topics.find(item=>item.id===value.topicId);if(topic)Object.assign(topic,{solved:value.solved,answerPostId:value.answerPostId});renderList();}
}});
async function openPersonal(kind){if(kind==='messages'||kind==='bookmarks'){closeDrawer();closeFilter();saveReplyState();if(kind==='messages')interactionsUI.openNotifications();else interactionsUI.openBookmarks();return;}requireAuth(async()=>{
 openDialog(t(kind==='topics'?'myTopics':'myMessages'),`<div class="empty-state">${escape(t('loading'))}</div>`);
 const ticket=++privateRequest;
 try{
  const result=await api(`/api/me/${kind}?lang=${encodeURIComponent(dataLanguage())}`);
  if(ticket!==privateRequest||!dialog.open)return;
  const items=kind==='topics'?result.topics:result.messages;
  $('#dialog-body').innerHTML=items.length?items.map(item=>`<button class="personal-topic" data-open="${escape(kind==='topics'?item.id:item.topicId)}"><strong>${escape(item.title||item.topicTitle)}</strong>${kind==='messages'?`<span>${escape(item.author)} · ${escape(item.body)}</span>`:''}<time>${escape(time(item.updatedAt||item.createdAt))}</time></button>`).join(''):`<p class="dialog-copy">${escape(t(kind==='topics'?'emptyMyTopics':'emptyMessages'))}</p>`;
  $('#dialog-body').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{dialog.close();openTopic(b.dataset.open);});
 }catch(error){if(ticket===privateRequest&&dialog.open)$('#dialog-body').innerHTML=`<p class="form-error">${escape(errorText(error))}</p>`;}
},kind);}
function openContact(){openDialog(t('contactTitle'),`<form id="contact-form"><label class="form-field">${escape(t('name'))}<input name="name" autocomplete="name" required maxlength="60" value="${escape(state.user?.name||'')}"></label><label class="form-field">${escape(t('email'))}<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label class="form-field">${escape(t('message'))}<textarea name="message" required minlength="5" maxlength="5000"></textarea></label><p class="form-note">${escape(t('contactNote'))}</p><p class="form-error" id="contact-error" hidden></p><button class="dark-button" type="submit">${escape(t('send'))}</button></form>`);$('#contact-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;try{await api('/api/contact',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});dialog.close();toast(t('contactSent'));}catch(error){showError('#contact-error',errorText(error));button.disabled=false;}};}
function reset(){const hadTag=Boolean(state.tag)||state.solved!=='all';state.solved='all';state.category='all';state.tag=null;state.query='';state.unanswered=false;state.limit=12;$('#search-input').value='';if(hadTag){if(location.pathname==='/'&&!location.hash)history.replaceState(null,'','/');loadTopics();}else renderList();}
function toggleAssistant(open){$('#topic-search-toggle').setAttribute('aria-expanded',String(open));$('#assistant-panel').hidden=!open;$('#assistant-launcher').setAttribute('aria-expanded',String(open));if(open)$('#chat-input').focus();}
$('#menu-toggle').onclick=()=>{if(drawerQuery.matches){const open=document.body.classList.toggle('drawer-open');$('#drawer-shade').hidden=!open;$('#menu-toggle').setAttribute('aria-expanded',String(open));syncSidebar();}else{const collapsed=document.body.classList.toggle('nav-collapsed');$('#menu-toggle').setAttribute('aria-expanded',String(!collapsed));syncSidebar();}};
$('#drawer-shade').onclick=closeDrawer;document.querySelectorAll('.section-toggle').forEach(button=>button.onclick=()=>{const open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));document.getElementById(button.getAttribute('aria-controls')).hidden=open;});
$('#guide-link').onclick=event=>{event.preventDefault();navigatePage($('#guide-link').getAttribute('href'));};
document.querySelectorAll('[data-info]').forEach(button=>button.onclick=e=>{e.preventDefault();openDialog(t(button.dataset.info),`<div class="dialog-copy"><p>${escape(t(button.dataset.info==='about'?'aboutBody':'guideBody'))}</p></div>`);});
document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{state.sort=button.dataset.sort;state.limit=12;state.unanswered=false;renderList();});
document.querySelectorAll('[data-filter-shortcut]').forEach(button=>button.onclick=()=>{state.sort=button.dataset.filterShortcut==='popular'?'popular':'latest';state.unanswered=button.dataset.filterShortcut==='unanswered';state.limit=12;closeDrawer();navigateHome();window.scrollTo({top:0});});
$('[data-view="all"]').onclick=()=>{reset();state.sort='latest';setCategory('all');};$('.brand').onclick=e=>{e.preventDefault();reset();state.sort='latest';setCategory('all');};
$('#search-form').onsubmit=e=>{e.preventDefault();const q=$('#search-input').value.trim();navigatePage(searchURL({q}));$('#search-input').blur();closeFilter();};$('#search-input').oninput=()=>{};
$('#filter-toggle').onclick=()=>{const open=$('#filter-popover').hidden;$('#filter-popover').hidden=!open;$('#filter-toggle').setAttribute('aria-expanded',String(open));};$('#category-select').onchange=e=>setCategory(e.target.value);$('#banner-toggle').onchange=e=>{state.showBanner=e.target.checked;persist('jlb-banner',state.showBanner?'visible':'hidden');renderList();};$('#banner-close').onclick=()=>{state.showBanner=false;persist('jlb-banner','hidden');renderList();};$('#clear-filters').onclick=reset;$('#reset-list').onclick=reset;$('#load-more').onclick=()=>{state.limit+=6;renderList();};
$('#banner-topic').onclick=()=>openTopic('electricity');$('#side-promo').onclick=()=>{reset();navigateHome();};$('#new-topic').onclick=()=>requireAuth(openComposer,'compose');$('#my-topics').onclick=()=>openPersonal('topics');$('#my-messages').onclick=()=>openPersonal('messages');$('#my-bookmarks').onclick=()=>openPersonal('bookmarks');$('#solved-filter').onchange=e=>{state.solved=e.target.value;state.limit=12;loadTopics();};$('#back-to-list').onclick=()=>{navigateHome();window.scrollTo({top:state.scrollY});};$('#contact-button').onclick=openContact;
$('#dialog-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
$('#topic-search-toggle').onclick=()=>toggleAssistant($('#assistant-panel').hidden);$('#assistant-launcher').onclick=()=>toggleAssistant($('#assistant-panel').hidden);$('#assistant-close').onclick=()=>toggleAssistant(false);$('#chat-form').onsubmit=e=>{e.preventDefault();const q=$('#chat-input').value.trim();if(!q)return;toggleAssistant(false);navigatePage(searchURL({q}));};
$('#language-select').onchange=e=>preferences.choose(e.target.value);$('#original-toggle').onclick=async()=>{state.original=!state.original;await loadTopics();if(state.topicId)await loadDetail(state.topicId);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const drawer=document.body.classList.contains('drawer-open');closeDrawer();if(drawer)$('#menu-toggle').focus();closeFilter();toggleAssistant(false);}});document.addEventListener('click',e=>{if(!$('#filter-popover').hidden&&!$('#filter-popover').contains(e.target)&&!$('#filter-toggle').contains(e.target))closeFilter();});document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&e.target.hasAttribute('data-avatar-image'))e.target.remove();},true);drawerQuery.addEventListener('change',()=>{document.body.classList.remove('nav-collapsed');closeDrawer();closeFilter();});window.addEventListener('popstate',()=>{composer?.suspend();renderRoute();});bindCategories($('#channel-links'));
for(const language of navigator.languages||[]){const resolved=resolveLocale(language,[]).language;if(![...$('#language-select').options].some(option=>option.value===resolved)){const option=document.createElement('option');option.value=resolved;option.textContent=new Intl.DisplayNames([resolved],{type:'language'}).of(resolved);$('#language-select').append(option);}}
document.addEventListener('click',event=>{const link=event.target.closest?.('[data-profile]');if(link){event.preventDefault();navigatePage('/u/'+link.dataset.profile);}});
svgInit();closeDrawer();renderRoute();const sessionReady=api('/api/session').then(result=>{return applyUser(result.user);}).catch(()=>{});const directoryReady=api('/api/directory').then(result=>{applyDirectory(result);applyLanguage();composer?.refreshDirectory();}).catch(()=>toast(t('m5DirectoryUnavailable')));Promise.allSettled([sessionReady,setLanguage(state.preference),directoryReady]).then(()=>{initialReady=true;renderRoute();if(location.hash==='#contact'){history.replaceState(null,'','/');openContact();}});



