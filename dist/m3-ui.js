import {renderMarkdown,renderMarkdownDocument} from './markdown.js?v=20261021225303391';
import {createBodyEditor,languageSelect} from './m3-editor.js?v=20261021225303391';
import {createReplyMedia} from './m3-media.js?v=20261021225303391';
import {createReplyWriting} from './reply-writing.js?v=20261021225303391';
import {formatContentTime} from './content-time.js?v=20261021225303391';

const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const action=(text,handler,className='')=>{const node=el('button',text,className);node.type='button';node.onclick=handler;return node;};
const bodyInto=(node,content)=>{if(content.bodyFormat==='markdown')renderMarkdown(node,content.body);else node.textContent=content.body||'';};
const path=content=>'/api/content/'+content.kind+'/'+encodeURIComponent(content.id);
const cleanRef=ref=>({kind:ref.kind,id:ref.id,version:ref.version,excerpt:ref.excerpt});

export function createContentUI({root,topic,posts,api,t,getUser,getLanguage,onChanged,onHidden,onLayout,onAuth,onReplyState=()=>{},navigateWrite,replyState={},toast=()=>{}}){
 const lifecycle=new AbortController(),options={signal:lifecycle.signal};
 let disposed=false,posting=false,published=false,writing=null,editDraft=replyState.editDraft||null;
 const actor=getUser()?.id||null,dialogs=new Set(),editors=new Set(),translations=new Map();
 const current=()=>!disposed&&(getUser()?.id||null)===actor;
 const request=(url,config={})=>api(url,{...config,signal:lifecycle.signal});
 const input=root.querySelector('#reply-text'),send=root.querySelector('#send-reply'),replyHost=root.querySelector('#topic-reply-editor');
 const state={language:replyState.language||'und',quotes:(replyState.quotes||[]).map(cleanRef),clientRequestId:replyState.clientRequestId||crypto.randomUUID(),pending:replyState.pending||null};
 input.value=replyState.body||'';input.maxLength=6000;
 const refs=el('div',undefined,'m3-draft-quotes');root.querySelector('#reply-quote').hidden=true;root.querySelector('#cancel-quote').hidden=true;replyHost.insertBefore(refs,input);
 const meta=el('label',t('m3Language'),'m3-language-field'),language=languageSelect(t,state.language);meta.append(language);replyHost.insertBefore(meta,input);
 const error=root.querySelector('#reply-error');error.setAttribute('role','alert');
 const problem=key=>{error.textContent=t(key);error.hidden=false;};
 const snapshot=()=>published?{body:'',language:'und',quotes:[],attachmentIds:[],clientRequestId:crypto.randomUUID()}:({body:input.value,language:language.value,quotes:state.quotes.map(cleanRef),attachmentIds:media.getIds(),mediaState:media.getState(),clientRequestId:state.clientRequestId,pending:state.pending?{...state.pending}:null,editDraft:editDraft?{...editDraft}:null,fullscreen:writing?.isExpanded()||false});
 const changed=()=>{error.hidden=true;writing?.refresh();onReplyState(snapshot());};
 const editor=createBodyEditor({textarea:input,host:replyHost,t,onChange:changed,onSubmit:submitReply,onPreviewChange:()=>writing?.refresh(),disabled:()=>posting||!!state.pending,maxLength:6000});editors.add(editor);
 const media=createReplyMedia({host:replyHost,t,api:request,getOwner:()=>getUser()?.id||null,getDisabled:()=>posting||!!state.pending,onChange:changed,ids:replyState.attachmentIds||[],saved:replyState.mediaState||[]});
 function controls(){editor.refresh();media.refresh();language.disabled=posting||!!state.pending;send.disabled=posting;send.textContent=t(posting?'composePublishing':state.pending?'m3ReplyRetry':'sendReply');refs.querySelectorAll('button').forEach(button=>button.disabled=posting||!!state.pending);}
 function languageName(code){if(!code||code==='und')return t('m3Unknown');try{return new Intl.DisplayNames([getLanguage()],{type:'language'}).of(code)||code;}catch{return code;}}
 function quoteMarkup(container,values,editable=false){container.replaceChildren();for(const ref of values){const block=el('blockquote',undefined,'quote m3-source-quote');if(ref.available===false){block.append(el('p',t('m3QuoteRemoved')));container.append(block);continue;}block.append(el('p',ref.excerpt||''));const row=el('div',undefined,'m3-quote-actions');if(ref.author)row.append(el('span',ref.author));row.append(action(t('m3Source'),()=>openSource(ref)));if(editable)row.append(action(t('m3RemoveQuote'),()=>{if(posting||state.pending)return;state.quotes=state.quotes.filter(item=>item!==ref);quoteMarkup(refs,state.quotes,true);changed();}));block.append(row);container.append(block);}}
 function addQuote(content,text){if(!current()||posting||state.pending)return;if(!text?.trim()||text.length>1500||state.quotes.length>=6){toast(t('m3QuoteLimit'));return;}const ref={kind:content.kind,id:content.id,version:content.version||1,excerpt:text.trim(),author:content.author};if(!state.quotes.some(item=>item.kind===ref.kind&&item.id===ref.id&&item.version===ref.version&&item.excerpt===ref.excerpt))state.quotes.push(ref);quoteMarkup(refs,state.quotes,true);changed();navigateWrite();}
 function dialog(title,trigger){const modal=el('dialog',undefined,'m3-dialog');const heading=el('header',undefined,'m3-dialog-heading');heading.append(el('h2',title),action(t('close'),()=>modal.close(),'m3-close'));const body=el('div',undefined,'m3-dialog-body');modal.append(heading,body);document.body.append(modal);dialogs.add(modal);document.body.classList.add('m3-dialog-open');modal.addEventListener('close',()=>{dialogs.delete(modal);modal.remove();if(!dialogs.size)document.body.classList.remove('m3-dialog-open');if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});modal.showModal();return {modal,body};}
 async function openSource(ref){const {modal,body}=dialog(t('m3Source'),document.activeElement);body.append(el('p',t('loading')));try{const result=await request(path(ref)+'/source');if(!current()||!modal.open)return;const content=result.content;body.replaceChildren();body.append(el('p',content.author+' · '+t('m3Version',{version:content.version}),'m3-content-meta'));if(content.title)body.append(el('h3',content.title));const text=el('div',undefined,'post-body markdown-body');bodyInto(text,content);body.append(text);if(ref.version!==content.version)body.prepend(el('p',t('m3Version',{version:ref.version})+' → '+t('m3Version',{version:content.version}),'m3-content-meta'));}catch{if(current()&&modal.open)body.replaceChildren(el('p',t('m3QuoteRemoved')));}}
 async function history(content){
  const {modal,body}=dialog(t('m3History'),document.activeElement);modal.classList.add('m3-history-dialog');
  const notice=el('p',t('historyPrivate'),'m3-history-notice'),list=el('div',undefined,'m3-history-list'),status=el('p',undefined,'form-error'),more=action(t('historyOlder'),()=>load());status.hidden=true;status.setAttribute('role','status');body.append(notice,list,status,more);
  let before=null,loading=false,first=true;
  function revisionCard(revision,currentVersion){
   const section=el('details',undefined,'m3-history-entry'),summary=el('summary'),heading=el('span',undefined,'m3-history-version');heading.append(el('strong',t('m3Version',{version:revision.version})));
   if(revision.version===currentVersion)heading.append(el('span',t('historyCurrent'),'m3-history-badge'));else if(revision.version===1)heading.append(el('span',t('historyOriginal'),'m3-history-badge'));
   const meta=el('span',undefined,'m3-history-info'),time=formatContentTime(revision.editedAt,getLanguage());if(time){const when=el('time',time.label);when.dateTime=time.datetime;meta.append(when);}if(revision.editor)meta.append(el('span',t('historyBy',{name:revision.editor})));
   summary.append(heading,meta);section.append(summary);
   const panel=el('div',undefined,'m3-history-content');if(revision.title)panel.append(el('h3',revision.title));
   const text=el('div',undefined,'post-body markdown-body');bodyInto(text,revision);panel.append(text);
   const source=el('pre',undefined,'m3-history-source');source.textContent=revision.body;source.hidden=true;let showingSource=false;
   const toggle=action(t('historySource'),()=>{showingSource=!showingSource;source.hidden=!showingSource;text.hidden=showingSource;toggle.textContent=t(showingSource?'historyRendered':'historySource');toggle.setAttribute('aria-pressed',String(showingSource));},'m3-history-toggle');toggle.setAttribute('aria-pressed','false');panel.append(toggle,source);section.append(panel);return section;
  }
  async function load(){
   if(loading||!current()||!modal.open)return;loading=true;more.disabled=true;more.textContent=t('loading');status.hidden=true;
   try{const result=await request(path(content)+'/history'+(before?'?beforeVersion='+before:''));if(!current()||!modal.open)return;
    if(first){list.replaceChildren();first=false;if(!result.revisions?.length)list.append(el('p',t('m3EmptyHistory')));}
    for(const revision of result.revisions||[])list.append(revisionCard(revision,result.currentVersion||content.version));
    before=result.nextBeforeVersion;more.hidden=!before;
   }catch{if(current()&&modal.open){status.textContent=t('m3Error');status.hidden=false;more.hidden=false;more.textContent=t('m3Retry');}}
   finally{if(current()&&modal.open){loading=false;more.disabled=false;if(status.hidden)more.textContent=t('historyOlder');}}
  }
  await load();
 }
 async function edit(content,retained=null){
  const {modal,body}=dialog(t('m3Edit'),document.activeElement);body.append(el('p',t('loading')));let formEditor;
  modal.addEventListener('close',()=>{formEditor?.destroy();editors.delete(formEditor);if(current()&&editDraft)onReplyState(snapshot());},{once:true});
  try{const result=await request(path(content)+'/source');if(!current()||!modal.open)return;const source=result.content;const draft=retained||(editDraft?.kind===source.kind&&editDraft.id===source.id&&editDraft.owner===actor?editDraft:null)||{kind:source.kind,id:source.id,owner:actor,version:source.version,body:source.body,title:source.title,language:source.language,bodyFormat:source.bodyFormat};editDraft={...draft};body.replaceChildren();
   const title=source.kind==='topic'?el('input'):null;if(title){title.type='text';title.maxLength=140;title.value=draft.title||'';title.setAttribute('aria-label',t('title'));body.append(title);}
   const langLabel=el('label',t('m3Language'),'m3-language-field'),lang=languageSelect(t,draft.language||'und');langLabel.append(lang);body.append(langLabel);
   const text=el('textarea');text.value=draft.body||'';text.setAttribute('aria-label',t('body'));body.append(text);
   const notice=el('p',undefined,'form-error');notice.hidden=true;notice.setAttribute('role','alert');body.append(notice);
   if(source.attachments?.length)body.append(el('p',t('m3ImmutableImages'),'m3-content-meta'));
   const footer=el('div',undefined,'m3-dialog-actions'),save=action(t('m3Save'),saveChanges,'dark-button'),latest=action(t('m3Latest'),()=>openSource(content));latest.hidden=true;const merge=action(t('m3MergeLatest'),mergeLatest);merge.hidden=true;footer.append(latest,merge,action(t('m3Cancel'),()=>modal.close()),save);body.append(footer);
   let saving=false,conflict=draft.version!==source.version;
   const keep=()=>{editDraft={...draft,body:text.value,title:title?.value,language:lang.value,bodyFormat:text.value===source.body&&draft.bodyFormat==='plain'?'plain':'markdown'};};
   formEditor=createBodyEditor({textarea:text,host:body,t,onChange:keep,onSubmit:saveChanges,disabled:()=>saving,maxLength:source.kind==='topic'?12000:6000});editors.add(formEditor);title?.addEventListener('input',keep,options);lang.addEventListener('change',keep,options);keep();
   if(conflict){notice.textContent=t('m3Conflict');notice.hidden=false;latest.hidden=false;merge.hidden=false;save.disabled=true;}
   async function mergeLatest(){
    if(!current()||saving||!conflict)return;merge.disabled=true;keep();
    try{const result=await request(path(source)+'/source');if(!current()||!modal.open)return;const latest=result.content;let comparison=body.querySelector('.m3-merge-comparison');if(!comparison){comparison=el('section',undefined,'m3-merge-comparison');footer.before(comparison);}comparison.replaceChildren(el('h3',t('m3Latest')));if(latest.title)comparison.append(el('h4',latest.title));const latestBody=el('div',undefined,'post-body markdown-body');bodyInto(latestBody,latest);comparison.append(latestBody);draft.version=latest.version;conflict=false;keep();notice.textContent=t('m3MergeReview');notice.hidden=false;merge.hidden=true;latest.hidden=true;save.disabled=false;text.focus();}
    catch{if(current()&&modal.open){notice.textContent=t('m3Error');notice.hidden=false;}}
    finally{if(current()&&modal.open)merge.disabled=false;}
   }
   async function saveChanges(){if(!current()||saving||conflict)return;keep();const submitted={...editDraft};saving=true;save.disabled=true;save.textContent=t('m3Saving');formEditor.refresh();lang.disabled=true;if(title)title.readOnly=true;
    try{await request(path(source)+'/edit',{method:'POST',body:JSON.stringify({expectedVersion:submitted.version,expectedUserId:actor,body:submitted.body,bodyFormat:submitted.bodyFormat,language:submitted.language,...(source.kind==='topic'?{title:submitted.title}:{})})});if(!current()||!modal.open)return;editDraft=null;modal.close();toast(t('m3Saved'));await onChanged();}
    catch(error){if(!current()||!modal.open)return;conflict=error.code==='revision_conflict';notice.textContent=t(conflict?'m3Conflict':'m3Error');notice.hidden=false;latest.hidden=!conflict;merge.hidden=!conflict;}
    finally{if(current()&&modal.open){saving=false;save.disabled=conflict;save.textContent=t('m3Save');formEditor.refresh();lang.disabled=false;if(title)title.readOnly=false;}}
   }
  }catch{if(current()&&modal.open)body.replaceChildren(el('p',t('m3Error')));}
 }
 function hide(content){const {modal,body}=dialog(t('m3Hide'),document.activeElement);body.append(el('p',t('m3HideConfirm')),el('p',t('m3ContentId')+': '+content.id,'m3-content-meta'));const error=el('p',undefined,'form-error');error.hidden=true;const confirm=action(t('m3Hide'),async()=>{if(!current())return;confirm.disabled=true;try{await request(path(content)+'/visibility',{method:'POST',body:JSON.stringify({hidden:true,expectedUserId:actor})});if(!current())return;modal.close();await onHidden(content);}catch{if(current()&&modal.open){error.textContent=t('m3Error');error.hidden=false;confirm.disabled=false;}}},'m3-danger');body.append(error,action(t('m3Cancel'),()=>modal.close()),confirm);}
 async function hiddenReplies(){const {modal,body}=dialog(t('m3HiddenReplies'),document.activeElement);body.append(el('p',t('loading')));try{const result=await request('/api/content/topic/'+encodeURIComponent(topic.id)+'/hidden-replies');if(!current()||!modal.open)return;body.replaceChildren();if(!result.posts?.length)body.append(el('p',t('m3NoHiddenReplies')));for(const post of result.posts||[]){const row=el('div',undefined,'m3-hidden-reply');row.append(el('span',post.author+' · '+post.id));const restore=action(t('m3RestoreReply'),async()=>{restore.disabled=true;try{await request('/api/content/post/'+encodeURIComponent(post.id)+'/visibility',{method:'POST',body:JSON.stringify({hidden:false,expectedUserId:actor})});if(!current()||!modal.open)return;row.remove();toast(t('m3Restored'));await onChanged();}catch{if(current()&&modal.open){restore.disabled=false;row.append(el('p',t('m3Error'),'form-error'));}}});row.append(restore);body.append(row);}}catch{if(current()&&modal.open)body.replaceChildren(el('p',t('m3Error')));}}
 async function submitReply(){
  if(!current()||posting)return;if(!input.value.trim()){problem('required');return;}
  if(!actor){onReplyState(snapshot());onAuth();return;}if(media.isBusy()){problem('m3BusyImages');return;}
  posting=true;controls();
  if(!state.pending){if(!await media.renew()||!current()){if(current()){posting=false;controls();problem('m3BusyImages');}return;}state.pending={body:input.value,bodyFormat:'markdown',language:language.value,expectedUserId:actor,clientRequestId:state.clientRequestId,attachmentIds:media.getIds(),quotes:state.quotes.map(cleanRef)};}
  posting=true;error.hidden=true;controls();onReplyState(snapshot());
  try{await request('/api/topics/'+encodeURIComponent(topic.id)+'/replies',{method:'POST',body:JSON.stringify(state.pending)});if(!current())return;published=true;input.value='';state.quotes=[];state.pending=null;onReplyState(snapshot());toast(t('replied'));await onChanged('latest');}
  catch(error){if(!current())return;if(error.status===401){state.pending=null;onReplyState(snapshot());onAuth();return;}const quoteConflict=error.code==='quote_version_conflict';if(quoteConflict||(error.status>=400&&error.status<500&&error.status!==409)){state.pending=null;state.clientRequestId=crypto.randomUUID();}problem(quoteConflict?'m3QuoteConflict':error.code==='revision_conflict'?'m3Conflict':state.pending?'m3ReplyFrozen':'m3Error');onReplyState(snapshot());}
  finally{if(current()){posting=false;controls();}}
 }
 language.onchange=()=>{state.language=language.value;changed();};send.onclick=submitReply;
 function attachPost(article,post,index){
  const content={...post,kind:index===0?'topic':'post',id:index===0?topic.id:post.id,topicId:topic.id,version:Number(post.version||topic.version)||1,...(index===0?{title:topic.title,userId:post.userId||topic.userId,language:topic.language||post.language}:{} )};
  const body=article.querySelector('.post-body'),tools=article.querySelector('.post-tools');article.dataset.contentKind=content.kind;article.dataset.contentId=content.id;article.dataset.contentVersion=String(content.version);body.dataset.original='true';
  const oldQuote=tools.querySelector('.quote-post');oldQuote.onclick=()=>{if(body.dataset.original!=='true'){toast(t('m3QuoteOriginal'));return;}addQuote(content,body.innerText.slice(0,1500));};
  const meta=el('div',t('m3Language')+': '+languageName(content.language),'m3-content-meta');
  const editedTime=formatContentTime(content.editedAt,getLanguage());if(editedTime){const edited=el('span',undefined,'m3-edited-at'),time=el('time',editedTime.label);time.dateTime=editedTime.datetime;edited.append(el('span',t('editedAt')+' '),time,el('span',' · v'+content.version));meta.append(edited);}body.before(meta);
  if(post.quoteRefs?.length){const quotes=el('div',undefined,'m3-published-quotes');quoteMarkup(quotes,post.quoteRefs);body.before(quotes);}
  const select=languageSelect(t,getLanguage());select.querySelector('option[value="und"]')?.remove();select.className='m3-target-language';select.setAttribute('aria-label',t('m3Translate'));
  const original=action(t('m3Original'),reset),translate=action(t('m3Translate'),translatePost),status=el('span',undefined,'m3-translation-status');original.hidden=true;status.setAttribute('role','status');tools.append(select,translate,original,status);
  const translation={generation:0,controller:null};translations.set(content.kind+':'+content.id,translation);
  function reset(){translation.generation++;translation.controller?.abort();translate.disabled=false;translate.textContent=t('m3Translate');original.hidden=true;status.textContent='';bodyInto(body,content);body.dataset.original='true';onLayout();}
  select.onchange=reset;
  async function translatePost(){const generation=++translation.generation,target=select.value;translation.controller?.abort();translation.controller=new AbortController();translate.disabled=true;translate.textContent=t('m3Translating');status.textContent='';
   try{const result=await api(path(content)+'/translate',{method:'POST',signal:translation.controller.signal,body:JSON.stringify({target,expectedVersion:content.version})});if(!current()||generation!==translation.generation||select.value!==target)return;const value=result.content;if(value.version!==content.version)throw new Error('stale_version');if(value.bodyFormat==='markdown')renderMarkdownDocument(body,value.document);else body.textContent=value.body||'';body.dataset.original=value.automatic?'false':'true';original.hidden=!value.automatic;status.textContent=value.automatic?t('m3Automatic')+' · '+languageName(value.sourceLanguage)+' → '+languageName(target):'';translate.textContent=t('m3Translate');onLayout();}
   catch(error){if(!current()||generation!==translation.generation)return;bodyInto(body,content);body.dataset.original='true';original.hidden=true;status.textContent=t(error.status===429?'rateLimited':'m3TranslationFailed');translate.textContent=t('m3Retry');onLayout();}
   finally{if(current()&&generation===translation.generation)translate.disabled=false;}
  }
  if(actor&&(actor===content.userId||getUser()?.role==='admin')){tools.append(action(t('m3Edit'),()=>edit(content)),action(t('m3History'),()=>history(content)),action(t('m3Hide'),()=>hide(content)));}
 }
 [...root.querySelectorAll('.post')].forEach((article,index)=>attachPost(article,posts[index],index));
 const selectionButton=action(t('m3QuoteSelection'),()=>{const selected=selection;if(selected){selection=null;selectionButton.hidden=true;addQuote(selected.content,selected.text);}},'m3-selection-quote');selectionButton.hidden=true;replyHost.before(selectionButton);let selection=null;
 root.addEventListener('mouseup',captureSelection,options);root.addEventListener('keyup',captureSelection,options);root.addEventListener('touchend',captureSelection,options);
 function captureSelection(){const selected=window.getSelection();if(!selected||selected.isCollapsed||selected.rangeCount!==1){selectionButton.hidden=true;selection=null;return;}const range=selected.getRangeAt(0),start=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,end=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;
  const body=start?.closest('.post-body');if(!body||!body.contains(end)||!root.contains(body)||body.dataset.original!=='true'){selection=null;selectionButton.hidden=true;return;}const article=body.closest('.post'),index=[...root.querySelectorAll('.post')].indexOf(article),post=posts[index];selection={text:selected.toString(),content:{kind:index===0?'topic':'post',id:index===0?topic.id:post.id,version:Number(post.version||topic.version)||1,author:post.author}};selectionButton.hidden=false;const rect=range.getBoundingClientRect();selectionButton.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-220))+'px';selectionButton.style.top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-100))+'px';
 }
 selectionButton.addEventListener('pointerdown',event=>event.preventDefault(),options);
 root.addEventListener('click',event=>{const link=event.target.closest('.topic-image-gallery a');if(!link||!root.contains(link))return;const links=[...link.parentElement.querySelectorAll('a')].filter(value=>/^\/api\/topic-attachments\/[a-f0-9-]{36}$/i.test(value.getAttribute('href')||''));if(!links.includes(link))return;event.preventDefault();lightbox(links,links.indexOf(link));},options);
 function lightbox(links,index){const {modal,body}=dialog(t('m3OpenImage'),document.activeElement);modal.classList.add('m3-lightbox');const img=el('img'),count=el('p',undefined,'m3-content-meta'),open=el('a',t('m3OpenImage'));open.target='_blank';open.rel='noopener noreferrer';const row=el('div',undefined,'m3-dialog-actions');row.append(action(t('m3Previous'),()=>show(index-1)),count,action(t('m3Next'),()=>show(index+1)),open);body.append(img,row);function show(value){index=(value+links.length)%links.length;img.src=links[index].href;img.alt=t('m3ImageCount',{current:index+1,total:links.length});count.textContent=img.alt;open.href=links[index].href;}modal.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();show(index-1);}else if(event.key==='ArrowRight'){event.preventDefault();show(index+1);}},{signal:lifecycle.signal});show(index);}
 if(getUser()?.role==='admin'){const manage=el('div',undefined,'m3-moderation');manage.append(action(t('m3HiddenReplies'),hiddenReplies));replyHost.append(manage);}
 writing=createReplyWriting({host:replyHost,textarea:input,editor,t,topicTitle:topic.title,expanded:replyState.fullscreen,onState:()=>{if(current())onReplyState(snapshot());}});
 quoteMarkup(refs,state.quotes,true);controls();if(editDraft?.owner===actor){const retained={...editDraft};queueMicrotask(()=>{if(current())edit({kind:retained.kind,id:retained.id},retained);});}
 return {getReplyState:snapshot,destroy(){disposed=true;lifecycle.abort();writing?.destroy();media.destroy();for(const editor of editors)editor.destroy();for(const state of translations.values())state.controller?.abort();for(const modal of [...dialogs])modal.close();selectionButton.remove();document.body.classList.remove('m3-dialog-open');}};
}
