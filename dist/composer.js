import {topicTags} from './topic-tags.js?v=20261022042008490';
import {categoryLabel,directoryReady} from './community-directory.js?v=20261022042008490';
import {formatMarkdown} from './m3-format.js?v=20261022042008490';
import {languageSelect} from './m3-editor.js?v=20261022042008490';
import {renderMarkdown} from './markdown.js?v=20261022042008490';
import {createDraftStore} from './compose-drafts.js?v=20261022042008490';
import {createComposerExtras} from './composer-extras.js?v=20261022042008490';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drawings = {
 pencil:'<path d="m16 3 5 5-11 11H5v-5L16 3Z"/><path d="m14 5 5 5M4 6H3v15h15v-2"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16.5v.1"/>',
 maximize:'<path d="M14 4h6v6M20 4l-6 6M10 20H4v-6M4 20l6-6"/>',
 minus:'<path d="M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',chevron:'<path d="m6 9 6 6 6-6"/>',
 link:'<path d="m10 13 4-4M9 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
 quote:'<path d="M4 6h6v7H6c0 3 1 4 4 5M14 6h6v7h-4c0 3 1 4 4 5"/>',code:'<path d="m7 7-5 5 5 5M17 7l5 5-5 5M14 4l-4 16"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
 emoji:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8.5 8.5h.01M15.5 8.5h.01"/>',more:'<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>'
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${drawings[name]}</svg>`;
const newId = () => crypto.randomUUID();

export function createComposer({api,t,getUser,getCategory,getLanguage,categories,onAuth,onPublished,toast,onClose=()=>{}}) {
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const store = createDraftStore({storage});
  const root = document.createElement('section');
  root.className = 'compose-root';
  root.id = 'topic-composer';
  const button = (id,key,art) => `<button type="button" id="write-${id}" class="icon-button" data-write-label="${key}">${svg(art)}</button>`;
  const format = (value,key,art,text='') => `<button type="button" class="tool-button" data-write-format="${value}" data-write-label="${key}">${art?svg(art):text}</button>`;
  root.innerHTML = `
    <div id="write-shade" class="scrim" hidden></div>
    <section id="write-sheet" class="composer" role="dialog" aria-modal="true" aria-labelledby="write-heading" tabindex="-1" hidden>
      <header class="composer-header"><div class="composer-title">${svg('pencil')}<h2 id="write-heading" data-write-copy="composeCreate"></h2></div>
        <div class="window-actions">${button('help','composeHelp','help')}${button('maximize','composeMaximize','maximize')}${button('minimize','composeMinimize','minus')}${button('close','composeClose','close')}</div></header>
      <form id="write-form" novalidate>
        <div class="metadata-row"><div class="category-field"><button type="button" id="write-category" class="metadata-button" aria-controls="write-category-menu" aria-expanded="false"><span class="category-dot"></span><span id="write-category-label"></span>${svg('chevron')}</button>
          <div id="write-category-menu" class="popover" hidden>${Object.entries(categories).filter(([id,c])=>id!=='site'&&c.active!==false).map(([id,c])=>`<button type="button" class="category-option" data-write-category="${escape(id)}"><span class="category-dot" style="background:${escape(c.color)}"></span><span data-write-copy="${escape(id)}"></span></button>`).join('')}</div></div>
          <div class="tags-field"><div id="write-tag-chips" class="tag-chips"></div><button type="button" id="write-tags" class="metadata-button" aria-controls="write-tags-menu" aria-expanded="false" data-write-copy="composeTagsOptional"></button><div id="write-tags-menu" class="popover tags-popover" hidden><label for="write-tag-search" class="sr-only" data-write-copy="composeTagSearch"></label><input id="write-tag-search" type="search" autocomplete="off"><p class="tag-limit" data-write-copy="composeTagLimit"></p><div id="write-tag-options"></div></div></div></div>
        <div class="title-row"><label class="sr-only" for="write-title" data-write-copy="title"></label><input id="write-title" name="title" maxlength="140" autocomplete="off"><span id="write-title-count">0 / 140</span></div>
        <div id="write-conflict" class="compose-notice" role="status" hidden><p data-write-copy="composeConflict"></p><button type="button" id="write-load-other" data-write-copy="composeLoadOther"></button><button type="button" id="write-keep-current" data-write-copy="composeKeepCurrent"></button></div>
        <div id="write-storage-error" class="compose-notice" role="status" hidden><p data-write-copy="composeDraftError"></p><button type="button" id="write-save-retry" data-write-copy="retry"></button><button type="button" id="write-copy" data-write-copy="composeCopy"></button></div>
        <div class="writing-area"><div class="body-stack"><label for="write-body" class="sr-only" data-write-copy="body"></label><textarea id="write-body" name="body" maxlength="12000"></textarea></div><div id="write-preview" class="preview markdown-body" hidden></div>
          <section id="write-images-region" class="compose-images-region" hidden><p id="write-image-hint" class="compose-image-hint" data-write-copy="composeImageHint"></p><div id="write-images" class="compose-images"></div></section>
          <aside id="write-tip" class="tip-card"><div class="tip-heading"><button type="button" id="write-tip-expand" aria-controls="write-tip-content" aria-expanded="false" data-write-copy="composeHelp"></button>${button('tip-close','close','close')}</div><div id="write-tip-content" class="tip-body"><p data-write-copy="composeTip"></p><button type="button" id="write-guide" class="link-button" data-write-copy="guide"></button></div></aside></div>
        <p id="write-error" class="form-error" role="alert" hidden></p>
        <footer class="composer-footer"><div class="footer-tools"><div class="mode-tabs" role="group" aria-label="Markdown"><button type="button" id="write-edit" aria-pressed="true" data-write-copy="composeEdit"></button><button type="button" id="write-preview-button" aria-pressed="false" data-write-copy="composePreview"></button></div>
          <div class="format-tools" role="group" aria-label="Markdown"><button type="button" id="write-upload" class="tool-button" data-write-label="composeImageAdd">${svg('image')}</button><input id="write-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>${format('bold','composeBold',null,'B')}${format('italic','composeItalic',null,'I')}${format('heading','composeHeading',null,'Tt')}${format('link','composeLink','link')}${format('quote','composeQuote','quote')}${format('code','composeCode','code')}${format('list','composeList','list')}${format('emoji','composeEmoji','emoji')}<button type="button" id="write-more" class="tool-button" aria-controls="write-more-menu" aria-expanded="false" data-write-label="composeMore">${svg('more')}</button></div></div>
          <div class="footer-actions"><span id="write-save-state" class="draft-state" role="status"></span><button type="button" id="write-discard" class="secondary-button" data-write-copy="composeDiscard"></button><button type="submit" id="write-publish" class="publish-button"></button></div></footer>
      </form><div id="write-more-menu" class="popover more-menu" hidden><button type="button" data-write-format="ordered" data-write-copy="composeOrdered"></button><button type="button" data-write-format="rule" data-write-copy="composeRule"></button></div>
    </section>
    <div id="write-draft-bar" class="draft-bar" hidden>${svg('pencil')}<span id="write-draft-title" class="draft-title"></span><button type="button" id="write-resume" data-write-copy="composeResume"></button></div>
    <dialog id="write-confirm" class="small-dialog" aria-labelledby="write-confirm-title"><h2 id="write-confirm-title"></h2><p id="write-confirm-message"></p><div class="dialog-actions"><button type="button" id="write-confirm-no" class="secondary-button"></button><button type="button" id="write-confirm-yes" class="danger-button"></button></div></dialog>
    <dialog id="write-guide-dialog" class="small-dialog" aria-labelledby="write-guide-title"><div class="dialog-heading"><h2 id="write-guide-title" data-write-copy="guide"></h2>${button('guide-close','close','close')}</div><p data-write-copy="guideBody"></p></dialog>`;
  document.body.append(root);
  const $ = id => root.querySelector(`#write-${id}`);
  const sheet=$('sheet'), form=$('form'), title=$('title'), body=$('body');
  const menuPairs=[[$('category'),$('category-menu')],[$('tags'),$('tags-menu')],[$('more'),$('more-menu')]];
  const background = new Map();
  let owner=null, authenticated=false, routeHidden=false, currentRecord=null, pending=null, conflict=null;
  let draft=blank(), previewing=false, saveTimer=null, saveFailed=false, dirty=false, posting=false, blocked=false;
  let generation=0, confirmResolve=null, confirmTrigger=null, maximized=false, composing=false, mobileTipExpanded=false;
  let saveMessage='composeDraftLocal';
  let errorKey=null;
  let discarding=false;
  let extras=null;
  extras=createComposerExtras({root,t,api,getLanguage,getContext:()=>({owner,authenticated,frozen:posting||Boolean(pending)||discarding,conflict:Boolean(conflict),identity:draft.clientRequestId,category:draft.category}),onChange:changed,onState:syncControls,onProblem:error,onAuth:()=>{saveNow();suspend();onAuth();}});

  function blank() {return {title:'',body:'',category:'',language:'und',clientRequestId:newId(),tagIds:[],attachmentIds:[]};}
  const languageField=document.createElement('label');languageField.className='m3-compose-language';const languageText=document.createElement('span');const language=languageSelect(t);languageField.append(languageText,language);$('form').insertBefore(languageField,root.querySelector('.title-row'));language.onchange=()=>{draft.language=language.value;changed();};
  function extraValues(){const value=extras?.getDraft()||draft;return {tagIds:[...(value.tagIds||[])].sort(),attachmentIds:[...(value.attachmentIds||[])]};}
  function hasContent(){const extra=extras?.getDraft()||draft;return Boolean(title.value.trim()||body.value.trim()||draft.category||pending||extra.tagIds?.length||extra.attachmentIds?.length||extras?.hasVolatileFiles());}
  function snapshot(){return {...draft,...extraValues(),title:title.value,body:body.value,...(pending?{pendingSubmission:{...pending}}:{})};}
  function draftStamp(value){const p=value.pendingSubmission;return JSON.stringify([value.title,value.body,value.category,value.language,value.clientRequestId,[...(value.tagIds||[])].sort(),value.attachmentIds||[],p?[p.title,p.body,p.category,p.language,p.bodyFormat,p.clientRequestId,[...(p.tagIds||[])].sort(),p.attachmentIds||[]]:null]);}
  function key(){return 'jlb-compose-v1:'+encodeURIComponent(owner||'');}
  function focusIfVisible(el){if(el&&!el.closest('[hidden],[inert]')&&el.getClientRects().length)el.focus({preventScroll:true});}
  function clearError(){errorKey=null;$('error').hidden=true;for(const el of [title,body,$('category')])el.removeAttribute('aria-invalid');}
  function error(key,field){errorKey=key;$('error').textContent=t(key);$('error').hidden=false;if(field){field.setAttribute('aria-invalid','true');if(field===body)setMode(false);field.focus();}}
  function syncBackground(open){
    if(open){for(const el of document.body.children){if(el===root||el.id==='toast'||el.tagName==='SCRIPT')continue;if(!background.has(el))background.set(el,el.inert);el.inert=true;}}
    else {for(const [el,inert]of background)if(el.isConnected)el.inert=inert;background.clear();}
    document.body.classList.toggle('composer-open',open);
  }
  function syncTip(){const small=root.getBoundingClientRect().width<=760;$('tip-expand').setAttribute('aria-expanded',String(!small||mobileTipExpanded));$('tip').classList.toggle('expanded',mobileTipExpanded);}
  function syncControls(){
    const frozen=posting||Boolean(pending)||discarding;
    title.readOnly=frozen;body.readOnly=frozen;language.disabled=frozen;language.value=draft.language;languageText.textContent=t('m3Language');language.setAttribute('aria-label',t('m3Language')); language.querySelector('[value=und]').textContent=t('m3Unknown');$('category').disabled=frozen;
    for(const b of root.querySelectorAll('[data-write-format]'))b.disabled=frozen;
    $('more').disabled=frozen;$('discard').disabled=posting||discarding;
    $('load-other').disabled=discarding||posting;$('keep-current').disabled=discarding||posting;
    $('publish').disabled=posting||discarding||blocked||Boolean(conflict)||(!pending&&Boolean(extras?.hasBlockingWork()));
    $('publish').textContent=t(posting?'composePublishing':pending?'composeRetry':'composeCreate');
    sheet.setAttribute('aria-busy',String(posting));
    $('maximize').setAttribute('aria-pressed',String(maximized));
    $('maximize').setAttribute('aria-label',t(maximized?'composeRestoreSize':'composeMaximize'));
    $('title-count').textContent=`${title.value.length} / 140`;
    $('draft-title').textContent=title.value.trim()||t('composeDraftTitle');
    $('save-state').textContent=t(saveMessage);$('save-state').title=t('composeDraftLocal');
    $('draft-bar').hidden=!(authenticated&&!routeHidden&&sheet.hidden&&hasContent());
    $('conflict').hidden=!conflict;$('storage-error').hidden=!saveFailed;
    $('category-label').textContent=draft.category?categoryLabel(draft.category,getLanguage(),t):t('composeSelectCategory');
    const dot=$('category').querySelector('.category-dot');dot.style.background=categories[draft.category]?.color||'#aaa';
    for(const b of root.querySelectorAll('[data-write-category]'))b.setAttribute('aria-pressed',String(b.dataset.writeCategory===draft.category));
    extras?.refresh();
    $('image-hint').textContent=t('composeImageHint')+(extras?.hasVolatileFiles()?' '+t('composeImagesLost'):'');
  }
  function refreshDirectory(){
    const menu=$('category-menu');menu.replaceChildren();
    for(const [id,c]of Object.entries(categories).filter(([id,c])=>id!=='site'&&c.active!==false)){
      const b=document.createElement('button');b.type='button';b.className='category-option';b.dataset.writeCategory=id;
      const dot=document.createElement('span');dot.className='category-dot';dot.style.background=c.color;
      const name=document.createElement('span');name.textContent=categoryLabel(id,getLanguage(),t);b.append(dot,name);
      b.disabled=posting||Boolean(pending)||discarding;
      b.onclick=()=>{if(posting||pending||discarding)return;draft.category=id;closeMenus();changed();$('category').focus();};menu.append(b);
    }
    labels();
  }
  function labels(){
    for(const el of root.querySelectorAll('[data-write-copy]'))el.textContent=categories[el.dataset.writeCopy]?categoryLabel(el.dataset.writeCopy,getLanguage(),t):t(el.dataset.writeCopy);
    for(const el of root.querySelectorAll('[data-write-label]')){el.title=t(el.dataset.writeLabel);el.setAttribute('aria-label',t(el.dataset.writeLabel));}
    title.placeholder=t('composeTitlePlaceholder');body.placeholder=t('composeBodyPlaceholder');
    $('help').setAttribute('aria-expanded',String(!$('tip').hidden));
    if(errorKey)$('error').textContent=t(errorKey);
    syncTip();syncControls();if(previewing)renderPreview();
  }
  function closeMenus(restore=false){let closed=false;for(const[b,p]of menuPairs){if(!p.hidden){p.hidden=true;b.setAttribute('aria-expanded','false');if(restore)focusIfVisible(b);closed=true;}}return closed;}
  function toggleMenu(button,panel){const opening=panel.hidden;closeMenus();panel.hidden=!opening;button.setAttribute('aria-expanded',String(opening));if(opening)panel.querySelector('button')?.focus();}
  function applyRecord(record){
    currentRecord=record;draft=record?{...record.draft}:blank();pending=draft.pendingSubmission?{...draft.pendingSubmission}:null;delete draft.pendingSubmission;
    title.value=draft.title;body.value=draft.body;dirty=false;conflict=null;blocked=false;saveFailed=false;
    extras.setDraft(draft,draft.clientRequestId);
    saveMessage=record?'composeDraftSaved':'composeDraftLocal';clearError();syncControls();if(previewing)renderPreview();
    if(pending)error('composePending');
  }
  function readInitial(){
    const found=store.read(owner);
    if(found.status==='ok')applyRecord(found.record);
    else{applyRecord(null);if(found.status==='unavailable'){saveFailed=true;saveMessage='composeDraftError';}else if(found.status==='expired')toast(t('composeDraftExpired'));syncControls();}
    return found;
  }
  function setUser(user){
    if(!user){authenticated=false;suspend();return;}
    authenticated=true;
    if(owner!==user.id){generation++;posting=false;suspend();discarding=false;owner=user.id;readInitial();}
    syncControls();
  }
  function scheduleSave(){clearTimeout(saveTimer);dirty=true;saveMessage='composeDraftSaving';syncControls();saveTimer=setTimeout(()=>{saveTimer=null;saveNow();},1000);}
  function saveNow(){
    clearTimeout(saveTimer);saveTimer=null;
    if(discarding)return false;
    if(!owner||(!hasContent()&&!currentRecord)){dirty=false;return true;}
    if(conflict){syncControls();return false;}
    const value=snapshot();
    if(currentRecord&&draftStamp(currentRecord.draft)===draftStamp(value)){
      const found=store.read(owner);
      if(found.status==='ok'&&found.record.revision===currentRecord.revision){dirty=false;saveFailed=false;saveMessage='composeDraftSaved';syncControls();return true;}
      if(found.status!=='unavailable'){conflict={record:found.status==='ok'?found.record:null};saveMessage='composeConflict';syncControls();return false;}
    }
    const result=store.write(owner,value,currentRecord?.revision??null);
    if(result.status==='ok'){currentRecord=result.record;dirty=false;saveFailed=false;saveMessage='composeDraftSaved';if(authenticated&&!pending)extras.renew(true);}
    else if(result.status==='conflict'){conflict={record:result.record??null};saveMessage='composeConflict';}
    else{saveFailed=true;saveMessage='composeDraftError';}
    syncControls();return result.status==='ok';
  }
  function changed(){clearError();blocked=false;draft.title=title.value;draft.body=body.value;Object.assign(draft,extraValues());scheduleSave();if(previewing)renderPreview();}
  function open(){
    const user=getUser();if(!user){onAuth();return;}
    setUser(user);routeHidden=false;
    const restoring=Boolean(currentRecord)&&sheet.hidden;
    if(!hasContent()&&!currentRecord){draft.language='und';const category=getCategory();if(categories[category]&&categories[category].active!==false&&category!=='site')draft.category=category;}
    sheet.hidden=false;$('shade').hidden=false;syncBackground(true);labels();
    extras.renew();
    if(pending)error('composePending');
    requestAnimationFrame(()=>focusIfVisible(restoring&&!pending?body:title));
    if(restoring)toast(t('composeDraftRestored'));
  }
  function suspend(){
    if(!sheet.hidden)saveNow();closeMenus();sheet.hidden=true;$('shade').hidden=true;syncBackground(false);onClose();syncControls();
  }
  function minimize(){saveNow();suspend();focusIfVisible($('draft-bar').hidden?document.getElementById('new-topic'):$('resume'));}
  function setRoute(account){routeHidden=account;if(account)suspend();syncControls();}
  function renderPreview(){
    renderMarkdown($('preview'),body.value);
    if(!body.value.trim()){const p=document.createElement('p');p.className='muted';p.textContent=t('composePreviewEmpty');$('preview').append(p);}
  }
  function setMode(preview){previewing=preview;$('preview').hidden=!preview;root.querySelector('.body-stack').hidden=preview;$('edit').setAttribute('aria-pressed',String(!preview));$('preview-button').setAttribute('aria-pressed',String(preview));if(preview)renderPreview();}
  function ask(titleKey,messageKey,yesKey){
    if(confirmResolve)return Promise.resolve(false);
    $('confirm-title').textContent=t(titleKey);$('confirm-message').textContent=t(messageKey);$('confirm-no').textContent=t('composeKeepEditing');$('confirm-yes').textContent=t(yesKey);
    confirmTrigger=document.activeElement;
    return new Promise(resolve=>{confirmResolve=resolve;$('confirm').showModal();$('confirm-no').focus();});
  }
  function finishAsk(yes){const resolve=confirmResolve;confirmResolve=null;$('confirm').close();resolve?.(yes);}
  $('confirm-no').onclick=()=>finishAsk(false);$('confirm-yes').onclick=()=>finishAsk(true);
  $('confirm').addEventListener('cancel',e=>{e.preventDefault();if(!composing)finishAsk(false);});
  $('confirm').addEventListener('close',()=>{if(confirmResolve){const resolve=confirmResolve;confirmResolve=null;resolve(false);}focusIfVisible(confirmTrigger);});
  async function discard(){
    if(posting||discarding)return;
    if(pending&&!blocked){error('composePending');return;}
    if(hasContent()&&!await ask('composeDiscardTitle','composeDiscardBody','composeDiscard'))return;
    const result=store.remove(owner,currentRecord?.revision??null);
    if(result.status==='conflict'){conflict={record:result.record??null};syncControls();return;}
    if(result.status!=='ok'){saveFailed=true;saveMessage='composeDraftError';syncControls();return;}
    const sentOwner=owner,sentId=draft.clientRequestId;
    discarding=true;clearTimeout(saveTimer);saveTimer=null;currentRecord=null;dirty=false;syncControls();
    let cleared=false;try{cleared=await extras.release();}catch{}
    if(owner!==sentOwner||draft.clientRequestId!==sentId)return;
    discarding=false;const found=store.read(owner);applyRecord(found.status==='ok'?found.record:null);minimize();
    if(!cleared)toast(t('composeImageReleaseError'));
  }
  async function beforeLogout(){return !discarding&&(!hasContent()||await ask('composeLogoutTitle','composeLogoutBody','composeLogoutAction'));}
  function logout(){
    generation++;posting=false;discarding=false;clearTimeout(saveTimer);saveTimer=null;
    extras.reset();
    let cleared=true;
    if(owner){try{if(!storage)cleared=false;else storage.removeItem(key());}catch{cleared=false;}}
    authenticated=false;currentRecord=null;pending=null;conflict=null;draft=blank();title.value='';body.value='';owner=null;dirty=false;saveFailed=false;blocked=false;suspend();setMode(false);syncControls();
    if(!cleared)toast(t('composeClearError'));
  }
  async function submit(event){
    event.preventDefault();if(posting||discarding||blocked||conflict)return;
    const user=getUser();if(!user||user.id!==owner){saveNow();suspend();onAuth();return;}
    clearError();
    if(!pending){
      if(extras.hasBlockingWork())return error('composeImagesBusy');
      if(!draft.category)return error('composeRequiredCategory',$('category'));
      if(!directoryReady())return error('m5DirectoryUnavailable');
      if(categories[draft.category]?.active===false||extraValues().tagIds.some(id=>topicTags.find(tag=>tag.id===id)?.active===false))return error('m5DirectoryChanged');
      if(title.value.trim().length<3||title.value.length>140)return error('composeInvalidTitle',title);
      if(body.value.trim().length<5||body.value.length>12000)return error('composeInvalidBody',body);
      pending={title:title.value.trim(),body:body.value,category:draft.category,language:draft.language,bodyFormat:'markdown',clientRequestId:draft.clientRequestId,...extraValues()};
    }
    saveNow();if(conflict){pending=null;syncControls();return;}
    const payload={...pending},sentOwner=owner,ticket=++generation;
    posting=true;syncControls();
    try{
      const result=await api('/api/topics',{method:'POST',body:JSON.stringify({...payload,expectedUserId:sentOwner})});
      if(!result.topic?.id)throw Object.assign(new Error('invalid_topic_result'),{network:true});
      if(ticket!==generation||owner!==sentOwner)return;
      const saved=store.read(sentOwner),savedDraft=saved.status==='ok'?saved.record.draft:null;
      let cleanupFailed=saved.status==='unavailable';
      if(savedDraft&&savedDraft.clientRequestId===payload.clientRequestId&&
        savedDraft.title.trim()===payload.title&&savedDraft.body===payload.body&&savedDraft.category===payload.category&&
        savedDraft.language===payload.language&&JSON.stringify(savedDraft.tagIds||[])===JSON.stringify(payload.tagIds||[])&&JSON.stringify(savedDraft.attachmentIds||[])===JSON.stringify(payload.attachmentIds||[])&&savedDraft.pendingSubmission?.clientRequestId===payload.clientRequestId){
        cleanupFailed=store.remove(sentOwner,saved.record.revision).status==='unavailable';
      }
      currentRecord=null;pending=null;conflict=null;draft=blank();title.value='';body.value='';dirty=false;saveFailed=false;posting=false;blocked=false;saveMessage='composeDraftLocal';
      extras.setDraft(draft,draft.clientRequestId);
      suspend();setMode(false);syncControls();onPublished(result.topic);
      if(cleanupFailed)toast(t('composePublishedCleanupError'));
    }catch(failure){
      if(ticket!==generation||owner!==sentOwner)return;
      posting=false;
      if(failure.code==='account_changed'){saveNow();suspend();toast(t('composeAccountChanged'));onAuth();return;}
      if(failure.status===401){saveNow();suspend();toast(t('composeSessionExpired'));onAuth();return;}
      if(failure.network||!failure.status||failure.status>=500){error('composePending');saveNow();}
      else if([404,410].includes(failure.status)||failure.code==='request_conflict'){
        pending=null;blocked=true;error(failure.code==='request_conflict'?'composeRequestConflict':'composeUnavailable');saveNow();
      }else{pending=null;draft.clientRequestId=newId();extras.setDraft(draft,draft.clientRequestId);error(['inactive_category','inactive_tag','category_inactive','tag_inactive','invalid_category','invalid_tags'].includes(failure.code)?'m5DirectoryChanged':failure.code==='account_muted'?'accountMuted':failure.code==='account_banned'?'accountBanned':failure.status===429?'rateLimited':'composePublishError');saveNow();}
      syncControls();
    }
  }
  form.addEventListener('submit',submit);
  for(const b of root.querySelectorAll('[data-write-category]'))b.onclick=()=>{draft.category=b.dataset.writeCategory;closeMenus();changed();$('category').focus();};
  $('category').onclick=()=>toggleMenu($('category'),$('category-menu'));
  $('more').onclick=()=>toggleMenu($('more'),$('more-menu'));
  $('minimize').onclick=minimize;$('close').onclick=minimize;$('resume').onclick=open;$('discard').onclick=discard;
  $('maximize').onclick=()=>{maximized=!maximized;sheet.classList.toggle('maximized',maximized);syncControls();};
  $('help').onclick=()=>{$('tip').hidden=!$('tip').hidden;labels();};
  $('tip-close').onclick=()=>{$('tip').hidden=true;$('help').setAttribute('aria-expanded','false');$('help').focus();};
  $('tip-expand').onclick=()=>{if(root.getBoundingClientRect().width<=760){mobileTipExpanded=!mobileTipExpanded;syncTip();}};
  $('guide').onclick=()=>{closeMenus();$('guide-dialog').showModal();};
  $('guide-close').onclick=()=>$('guide-dialog').close();
  $('guide-dialog').addEventListener('close',()=>focusIfVisible($('guide')));
  $('edit').onclick=()=>{setMode(false);body.focus();};$('preview-button').onclick=()=>{closeMenus();setMode(true);};
  title.oninput=changed;body.oninput=changed;
  $('save-retry').onclick=saveNow;
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(`${title.value}\n\n${body.value}`);toast(t('composeCopied'));}catch{setMode(false);body.focus();body.select();toast(t('composeCopyManual'));}};
  $('load-other').onclick=()=>{if(discarding||posting)return;const found=store.read(owner);if(found.status==='ok')applyRecord(found.record);else if(['empty','expired','invalid'].includes(found.status))applyRecord(null);else{saveFailed=true;syncControls();}};
  $('keep-current').onclick=()=>{if(discarding||posting)return;const found=store.read(owner);if(found.status==='unavailable'){saveFailed=true;syncControls();return;}currentRecord=found.status==='ok'?found.record:null;conflict=null;dirty=true;saveNow();};

  // Format insertion reuses the prototype's verified textarea selection behavior.
  function applyFormat(format){
    if(posting||pending||discarding)return;closeMenus();setMode(false);
    const result=formatMarkdown({value:body.value,start:body.selectionStart,end:body.selectionEnd,format,placeholder:t('body'),linkLabel:t('composeLink'),maxLength:12000});
    if(!result){toast(t('composeInvalidBody'));return;}
    body.value=result.value;body.focus();body.setSelectionRange(result.start,result.end);changed();
  }
  for(const b of root.querySelectorAll('[data-write-format]'))b.onclick=()=>applyFormat(b.dataset.writeFormat);
  root.addEventListener('compositionstart',()=>{composing=true;});root.addEventListener('compositionend',()=>{composing=false;});
  root.addEventListener('keydown',event=>{
    if(composing||event.isComposing||event.keyCode===229||$('confirm').open||$('guide-dialog').open||sheet.hidden)return;
    if(event.target===$('tag-search')&&event.key==='Enter'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();return;}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(closeMenus(true))return;if(!$('tip').hidden){$('tip-close').click();return;}minimize();return;}
    if(event.key==='Tab'){
      const focusable=[...sheet.querySelectorAll('button,input,textarea,a,[tabindex]')].filter(el=>!el.disabled&&!el.closest('[hidden]')&&el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if((event.ctrlKey||event.metaKey)&&!event.altKey){const key=event.key.toLowerCase();if(key==='enter'){event.preventDefault();form.requestSubmit();}else if(event.target===body&&(key==='b'||key==='i')){event.preventDefault();applyFormat(key==='b'?'bold':'italic');}}
  });
  document.addEventListener('click',event=>{const path=event.composedPath();for(const[b,p]of menuPairs)if(!p.hidden&&!path.includes(p)&&!path.includes(b)){p.hidden=true;b.setAttribute('aria-expanded','false');}});
  window.addEventListener('storage',event=>{
    if(!owner||event.storageArea!==storage||(event.key!==key()&&event.key!==null))return;
    const found=store.read(owner),record=found.status==='ok'?found.record:null;
    if(found.status==='unavailable')return;
    if(record?.revision===currentRecord?.revision)return;
    if(discarding||hasContent()||!sheet.hidden){clearTimeout(saveTimer);saveTimer=null;conflict={record};saveMessage='composeConflict';syncControls();}
    else applyRecord(record);
  });
  window.addEventListener('beforeunload',event=>{if(discarding||((dirty||pending)&&!saveNow())||extras.hasVolatileFiles()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{if(dirty)saveNow();});
  new ResizeObserver(syncTip).observe(root);
  labels();setMode(false);
  return {open,suspend,setUser,setRoute,logout,beforeLogout,refreshLanguage:refreshDirectory,refreshDirectory};
}
