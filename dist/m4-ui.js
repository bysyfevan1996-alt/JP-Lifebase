import {categoryLabel} from './community-directory.js?v=20261021225303391';
import {renderMarkdown} from './markdown.js?v=20261021225303391';
import {formatContentTime} from './content-time.js?v=20261021225303391';

const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const button=(text,work,className='m4-button')=>{const node=element('button',text,className);node.type='button';node.onclick=work;return node;};
const validHandle=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{2,31}$/.test(value);
const time=value=>formatContentTime(value,document.documentElement.lang||'en')?.label||'';
const noticeKeys={mention:'m4NoticeMention',quote:'m4NoticeQuote',reply:'m4NoticeReply',reaction:'m4NoticeReaction',answer:'m4NoticeAnswer'};
const subscriptionKeys={watching:['m4Watching','m4WatchingHint'],tracking:['m4Tracking','m4TrackingHint'],normal:['m4Normal','m4NormalHint'],muted:['m4Muted','m4MutedHint']};

export function createCommunityInteractionsUI({api,t,getUser,onAuth,onOpenTopic,toast=()=>{},onChange=()=>{}}){
 let disposed=false,actor=undefined,generation=0,identity=null,unreadCount=0,polling=false,identityLoading=false;
 let controller=new AbortController();const dialogs=new Set(),topics=new Set();
 const current=(owner,ticket)=>!disposed&&(getUser()?.id||null)===owner&&generation===ticket;
 const request=(url,config={})=>api(url,{...config,signal:config.signal||controller.signal});
 const update=()=>{if(!disposed)onChange({identity,unreadCount});};
 const write=(url,data,owner,signal)=>request(url,{method:'POST',signal,body:JSON.stringify({...data,expectedUserId:owner})});
 function fail(error){return t(error?.code==='account_muted'?'accountMuted':error?.status===401?'sessionExpired':error?.status===429?'rateLimited':'m4ActionError');}
 function modal(title,trigger=document.activeElement){
  const node=element('dialog',undefined,'m4-modal'),header=element('header',undefined,'m4-modal-header'),body=element('div',undefined,'m4-modal-body');
  header.append(element('h2',title),button(t('close'),()=>node.close(),'m4-modal-close'));node.append(header,body);document.body.append(node);dialogs.add(node);document.body.classList.add('m4-modal-open');
  node.addEventListener('close',()=>{dialogs.delete(node);node.remove();if(!dialogs.size)document.body.classList.remove('m4-modal-open');if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});node.showModal();return {node,body};
 }
 function closeDialogs(){for(const value of [...dialogs])value.close();}
 function askAuth(intent=''){closeDialogs();onAuth(intent);}
 async function poll(){
  if(disposed||polling||!getUser()||document.hidden)return;
  const owner=getUser().id,ticket=generation;polling=true;
  try{const result=await request('/api/me/notifications?unread=1');if(current(owner,ticket)){unreadCount=Number(result.unreadCount)||0;update();}}catch{}finally{if(ticket===generation)polling=false;}
 }
 async function refreshIdentity(){
  if(disposed)return;const next=getUser()?.id||null;
  if(next!==actor){actor=next;generation++;controller.abort();controller=new AbortController();polling=false;identityLoading=false;identity=null;unreadCount=0;closeDialogs();for(const dispose of [...topics])dispose();update();}
  if(!next){update();return;}
  const ticket=generation;
  if(!identity&&!identityLoading){identityLoading=true;try{const result=await request('/api/me/identity');if(current(next,ticket)){identity=result.identity;update();}}catch{}finally{if(ticket===generation)identityLoading=false;}}
  await poll();
 }
 const visibility=()=>{if(!document.hidden)poll();};document.addEventListener('visibilitychange',visibility);const timer=setInterval(poll,60000);
 function errorRow(host,error,retry){const row=element('div',undefined,'m4-topic-error');row.append(element('span',fail(error)),button(t('retry'),retry));host.append(row);return row;}
 async function source(ref,trigger){
  const owner=getUser()?.id||null,ticket=generation,{node,body}=modal(t('m3Source'),trigger);body.append(element('p',t('loading'),'m4-empty'));
  try{const result=await request('/api/content/'+ref.kind+'/'+encodeURIComponent(ref.contentId||ref.id)+'/source');if(!current(owner,ticket)||!node.open)return;
   const content=result.content;body.replaceChildren();if(content.title)body.append(element('h3',content.title,'m4-source-heading'));
   body.append(element('p',content.author+' · '+time(content.editedAt||content.createdAt),'m4-source-meta'));const text=element('div',undefined,'m4-source-body');
   if(content.bodyFormat==='markdown'){text.classList.add('markdown-body');renderMarkdown(text,content.body);}else text.textContent=content.body;
   const footer=element('div',undefined,'m4-source-footer');footer.append(button(t('m4OpenTopic'),()=>{closeDialogs();onOpenTopic(content.topicId);}));body.append(text,footer);
  }catch(error){if(current(owner,ticket)&&node.open){body.replaceChildren(element('p',error.status===404?t('m4Unavailable'):fail(error),'m4-modal-error'));if(error.status!==404)body.append(button(t('retry'),()=>{node.close();source(ref,trigger);}));}}
 }
 function openNotifications(){
  if(!getUser()){askAuth('messages');return;}const owner=getUser().id,ticket=generation,{node,body}=modal(t('m4Notifications'));
  const toolbar=element('div',undefined,'m4-inbox-toolbar'),tabs=element('div',undefined,'m4-inbox-tabs'),all=button(t('m4All'),()=>switchFilter(false)),unread=button(t('m4Unread'),()=>switchFilter(true)),markAll=button(t('m4ReadAll'),markEverything);
  tabs.append(all,unread);toolbar.append(tabs,markAll);const list=element('div'),status=element('p',undefined,'m4-modal-error'),more=button(t('loadMore'),()=>load(false),'m4-button m4-load-more');body.append(toolbar,list,status,more);status.hidden=more.hidden=true;
  let onlyUnread=false,cursor=null,busy=false,loadId=0,empty=null;const known=new Set();
  const alive=()=>current(owner,ticket)&&node.open;
  function switchFilter(value){onlyUnread=value;load(true);}
  function emptyState(){if(!cursor&&!list.children.length){empty=element('p',t('m4NoNotifications'),'m4-empty');list.append(empty);}}
  async function mark(ids){const result=await write('/api/me/notifications/read',{ids},owner);if(!alive())return;unreadCount=Number(result.unreadCount)||0;update();}
  async function markEverything(){if(busy||!alive())return;markAll.disabled=true;try{const result=await write('/api/me/notifications/read',{all:true},owner);if(!alive())return;unreadCount=Number(result.unreadCount)||0;update();load(true);}catch(error){if(alive()){status.textContent=fail(error);status.hidden=false;}}finally{if(alive())markAll.disabled=false;}}
  async function load(reset){
   const attempt=++loadId;busy=true;more.disabled=true;status.hidden=true;all.setAttribute('aria-pressed',String(!onlyUnread));unread.setAttribute('aria-pressed',String(onlyUnread));
   if(reset){cursor=null;empty=null;known.clear();list.replaceChildren(element('p',t('loading'),'m4-empty'));more.hidden=true;}
   try{const result=await request('/api/me/notifications?'+new URLSearchParams({...onlyUnread?{unread:'1'}:{},...cursor?{cursor}:{} }));if(!alive()||attempt!==loadId)return;
    if(reset)list.replaceChildren();unreadCount=Number(result.unreadCount)||0;update();
    for(const item of result.notifications||[]){if(known.has(item.id))continue;known.add(item.id);empty?.remove();empty=null;let read=null;const row=element('article',undefined,'m4-notification'+(item.readAt?' m4-read':''));function reflectRead(){item.readAt=item.readAt||true;row.classList.add('m4-read');read?.remove();if(onlyUnread){row.remove();emptyState();}}const open=button('',async()=>{try{if(!item.readAt)await mark([item.id]);if(!alive())return;reflectRead();source(item,open);}catch(error){if(alive()){status.textContent=fail(error);status.hidden=false;}}},'m4-notification-open');
     const heading=element('strong',item.topicTitle),summary=element('span',(item.actor?.name||'')+' '+t(noticeKeys[item.type]||'m4NoticeReply'));open.append(heading,summary);const stamp=element('time',time(item.createdAt));stamp.dateTime=item.createdAt;open.append(stamp);
     const actions=element('div',undefined,'m4-inbox-actions');if(!item.readAt){read=button(t('m4MarkRead'),async()=>{read.disabled=true;try{await mark([item.id]);if(!alive())return;reflectRead();}catch(error){if(alive()){read.disabled=false;status.textContent=fail(error);status.hidden=false;}}});actions.append(read);}row.append(open,actions);list.append(row);
    }
    cursor=result.nextCursor||null;more.hidden=!cursor;more.textContent=t('loadMore');emptyState();
   }catch(error){if(alive()&&attempt===loadId){if(reset)list.replaceChildren();status.textContent=fail(error);status.hidden=false;more.hidden=false;more.textContent=t('retry');}}
   finally{if(alive()&&attempt===loadId){busy=false;more.disabled=false;}}
  }
  load(true);
 }
 function openBookmarks(){
  if(!getUser()){askAuth('bookmarks');return;}const owner=getUser().id,ticket=generation,{node,body}=modal(t('m4Bookmarks')),list=element('div'),status=element('p',undefined,'m4-modal-error'),more=button(t('loadMore'),load,'m4-button m4-load-more');body.append(list,status,more);status.hidden=more.hidden=true;let cursor=null,busy=false,first=true;const seen=new Set(),alive=()=>current(owner,ticket)&&node.open;
  async function load(){if(busy||!alive())return;busy=true;more.disabled=true;status.hidden=true;if(first)list.replaceChildren(element('p',t('loading'),'m4-empty'));
   try{const result=await request('/api/me/bookmarks'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(!alive())return;if(first){list.replaceChildren();first=false;}for(const item of result.bookmarks||[]){if(seen.has(item.topicId))continue;seen.add(item.topicId);const row=button('',()=>{node.close();onOpenTopic(item.topicId);},'m4-notification-open');row.append(element('strong',item.title),element('span',categoryLabel(item.category,document.documentElement.lang,t)));const card=element('article',undefined,'m4-notification');card.append(row);list.append(card);}cursor=result.nextCursor||null;more.hidden=!cursor;more.textContent=t('loadMore');if(!seen.size)list.append(element('p',t('m4NoBookmarks'),'m4-empty'));}
   catch(error){if(alive()){status.textContent=fail(error);status.hidden=false;more.hidden=false;more.textContent=t('retry');}}finally{if(alive()){busy=false;more.disabled=false;}}
  }load();
 }
 function attachTopic({root,topic,posts}){
  const owner=getUser()?.id||null,ticket=generation,life=new AbortController();let active=true,interaction=null,changing=false;
  const alive=()=>active&&current(owner,ticket)&&root.isConnected;
  const controls=element('section',undefined,'m4-topic-controls'),actions=element('div',undefined,'m4-topic-actions'),hint=element('p',undefined,'m4-subscription-note'),error=element('div'),label=element('label'),select=element('select',undefined,'m4-subscription'),bookmark=button(t('m4Bookmark'),()=>change('bookmark',{bookmarked:!interaction?.bookmark})),answer=button(t('m4BestAnswer'),()=>interaction?.answerPostId&&source({kind:'post',id:interaction.answerPostId},answer)),newCount=element('span',undefined,'m4-seen-count'),seen=button(t('m4Seen'),()=>change('seen',{}));
  for(const [value,[key]]of Object.entries(subscriptionKeys)){const option=element('option',t(key));option.value=value;select.append(option);}select.setAttribute('aria-label',t('m4Subscription'));select.disabled=true;label.append(element('span',t('m4Subscription'),'m4-subscription-label'),select);actions.append(label,bookmark,answer,newCount,seen);controls.append(actions,hint,error);(root.querySelector('.reading-nav')?root.querySelector('.reading-nav').append(controls):root.querySelector('.posts').before(controls));bookmark.disabled=true;answer.hidden=seen.hidden=newCount.hidden=true;
  const answerButtons=[];
  function render(){if(!interaction||!alive())return;select.value=interaction.subscription||'normal';hint.textContent=t(subscriptionKeys[select.value]?.[1]||'m4NormalHint');select.title=hint.textContent;bookmark.textContent=t(interaction.bookmark?'m4Bookmarked':'m4Bookmark');bookmark.setAttribute('aria-pressed',String(!!interaction.bookmark));answer.hidden=!interaction.answerPostId;answer.textContent=t('m4Solved')+' · '+t('m4BestAnswer');newCount.textContent=t('m4NewReplies',{count:interaction.newReplies||0});newCount.hidden=seen.hidden=!owner||!interaction.newReplies;
   for(const entry of answerButtons){const chosen=interaction.answerPostId===entry.id;entry.marker.hidden=!chosen;entry.button.hidden=!interaction.canChooseAnswer;entry.button.textContent=t(chosen?'m4RemoveAnswer':'m4ChooseAnswer');entry.button.disabled=changing;entry.button.setAttribute('aria-pressed',String(chosen));}
   select.disabled=bookmark.disabled=changing;
  }
  async function load(){try{const result=await request('/api/topics/'+encodeURIComponent(topic.id)+'/interaction',{signal:life.signal});if(!alive())return;interaction=result.interaction;error.replaceChildren();render();}catch(e){if(alive()){error.replaceChildren();errorRow(error,e,load);}}}
  async function change(kind,data){if(!owner){askAuth();return;}if(changing||!alive())return;changing=true;select.disabled=bookmark.disabled=seen.disabled=true;error.replaceChildren();render();
   try{const result=await write('/api/topics/'+encodeURIComponent(topic.id)+'/'+kind,data,owner,life.signal);if(!alive())return;interaction=result.interaction;render();if(kind==='answer')onChange({topicId:topic.id,solved:!!interaction.answerPostId,answerPostId:interaction.answerPostId});}
   catch(e){if(alive())errorRow(error,e,()=>change(kind,data));}finally{if(alive()){changing=false;seen.disabled=false;render();}}
  }
  select.onchange=()=>change('subscription',{mode:select.value});
  function insertMention(handle){if(!alive()||!validHandle(handle))return;const input=document.getElementById('reply-text');if(!input||input.readOnly)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??start,value='@'+handle+' ';if(input.value.length-(end-start)+value.length>input.maxLength){toast(t('m4ActionError'));return;}if(input.hidden)document.querySelector('.reply-writing-tabs button')?.click();input.value=input.value.slice(0,start)+value+input.value.slice(end);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus({preventScroll:true});input.setSelectionRange(start+value.length,start+value.length);if(!document.body.classList.contains('reply-fullscreen-open'))input.scrollIntoView({block:'center',behavior:'smooth'});}
  const mounted=[];
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);entry.target.dispatchEvent(new Event('m4-load-reactions'));}},{rootMargin:'300px'}):null;
  [...root.querySelectorAll('.post')].forEach((article,index)=>{
   const post=posts[index],kind=index===0?'topic':'post',id=index===0?topic.id:post.id,postOwner=post.userId||index===0&&topic.userId,handle=post.authorHandle||index===0&&topic.authorHandle,header=article.querySelector('.post-header');
   if(validHandle(handle)){const tag=element('span','@'+handle,'m4-handle');header.querySelector('strong').after(tag);mounted.push(tag);if(postOwner!==owner){const mention=button('@',()=>owner?insertMention(handle):askAuth(),'m4-mention-button');mention.setAttribute('aria-label',t('m4Mention')+' @'+handle);tag.after(mention);mounted.push(mention);}}
   const row=element('div',undefined,'m4-post-interactions'),reactions=element('div',undefined,'m4-reactions'),problem=element('div');row.append(reactions);const state={mine:null,counts:{}},buttons=[];let busy=false,loaded=false;
   const base='/api/content/'+kind+'/'+encodeURIComponent(id)+'/reactions';
   function renderReactions(){for(const {value,node,count}of buttons){count.textContent=loaded?String(Number(state.counts[value])||0):'…';node.setAttribute('aria-pressed',String(state.mine===value));node.disabled=busy||!loaded||!!owner&&postOwner===owner;node.title=postOwner===owner?t('m4OwnReaction'):t({like:'m4Like',thanks:'m4Thanks',helpful:'m4Helpful'}[value]);}}
   for(const [value,key]of [['like','m4Like'],['thanks','m4Thanks'],['helpful','m4Helpful']]){const count=element('span','…','m4-reaction-count'),node=button(t(key),()=>react(state.mine===value?null:value),'m4-reaction');node.append(count);node.disabled=true;reactions.append(node);buttons.push({value,node,count});}
   async function loadReactions(){if(loaded||!alive())return;try{const result=await request(base,{signal:life.signal});if(!alive())return;Object.assign(state,result.reactions);loaded=true;problem.replaceChildren();renderReactions();}catch(e){if(alive()){problem.replaceChildren();errorRow(problem,e,loadReactions);}}}
   async function react(reaction){if(!owner){askAuth();return;}if(busy||!alive()||!loaded)return;busy=true;renderReactions();problem.replaceChildren();try{const result=await write(base,{reaction},owner,life.signal);if(!alive())return;Object.assign(state,result.reactions);}catch(e){if(alive())errorRow(problem,e,()=>react(reaction));}finally{if(alive()){busy=false;renderReactions();}}}
   if(index>0){const marker=element('p',t('m4BestAnswer'),'m4-answer-marker');marker.hidden=true;article.querySelector('.post-body').before(marker);const choose=button(t('m4ChooseAnswer'),()=>change('answer',{postId:interaction?.answerPostId===id?null:id}),'m4-answer-button');choose.hidden=true;row.append(choose);answerButtons.push({id,button:choose,marker});mounted.push(marker);}
   article.querySelector('.post-tools').after(row,problem);mounted.push(row,problem);article.addEventListener('m4-load-reactions',loadReactions,{signal:life.signal,once:true});if(observer)observer.observe(article);else loadReactions();
  });
  const replyMedia=document.getElementById('topic-reply-editor')?.querySelector('.m3-media');const picker=button('@ '+t('m4Mention'),()=>mentionPicker(insertMention,alive),'m4-mention-insert');replyMedia?.querySelector('button')?.after(picker);mounted.push(picker);
  function cleanup(){if(!active)return;active=false;life.abort();observer?.disconnect();controls.remove();for(const node of mounted)node.remove();topics.delete(cleanup);}topics.add(cleanup);load();return cleanup;
 }
 function mentionPicker(insert,topicAlive){
  if(!getUser()){askAuth();return;}const owner=getUser().id,ticket=generation,{node,body}=modal(t('m4Mention'));const form=element('form',undefined,'m4-mention-search'),input=element('input'),submit=button(t('search'),search),results=element('div'),note=element('p',t('m4MentionHint'),'m4-subscription-note');input.type='search';input.maxLength=32;input.placeholder=t('m4MentionSearch');input.setAttribute('aria-label',t('m4MentionSearch'));submit.type='submit';submit.onclick=null;form.append(input,submit);body.append(form,note,results);let sequence=0;
  form.onsubmit=event=>{event.preventDefault();search();};input.focus();async function search(){const attempt=++sequence,value=input.value.trim();results.replaceChildren();if(value.length<2){note.textContent=t('m4MentionHint');return;}note.textContent=t('loading');submit.disabled=true;
   try{const result=await request('/api/users/mentions?q='+encodeURIComponent(value));if(!current(owner,ticket)||!node.open||attempt!==sequence||!topicAlive())return;note.textContent=result.users?.length?'':t('m4NoUsers');for(const user of result.users||[]){if(!validHandle(user.handle))continue;const row=button(user.name,()=>{if(!topicAlive())return;node.close();insert(user.handle);},'m4-mention-result');row.append(element('span','@'+user.handle));results.append(row);}}
   catch(e){if(current(owner,ticket)&&node.open&&attempt===sequence)note.textContent=fail(e);}finally{if(current(owner,ticket)&&node.open&&attempt===sequence)submit.disabled=false;}
  }
 }
 return {refreshIdentity,openNotifications,openBookmarks,attachTopic,leaveRoute(){generation++;controller.abort();controller=new AbortController();polling=false;identityLoading=false;closeDialogs();for(const dispose of [...topics])dispose();queueMicrotask(()=>{if(!disposed)refreshIdentity();});},destroy(){if(disposed)return;disposed=true;generation++;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);for(const dispose of [...topics])dispose();closeDialogs();identity=null;unreadCount=0;}};
}
