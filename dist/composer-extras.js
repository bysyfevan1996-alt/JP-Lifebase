import {tagLabel,applyDirectory} from './community-directory.js?v=20261022012917915';
import {normalizeTagName,tagNameKey} from './tag-name.js?v=20261022012917915';
import {topicTags,normalizeTopicTags} from './topic-tags.js?v=20261022012917915';
import {prepareTopicImage,uploadTopicImage,validAttachment} from './composer-images.js?v=20261022012917915';

export function createComposerExtras({root,t,api,getContext,getLanguage=()=>document.documentElement?.lang||'en',onChange,onAuth,onProblem,onState}){
 const $=id=>root.querySelector('#write-'+id);
 let tags=[],rows=[],epoch=0,identity=null,renewing=null,lastRenew=0,releasing=false,creatingTag=null;
 const mutable=()=>{const c=getContext();return c.authenticated&&c.owner&&!c.frozen&&!c.conflict&&!releasing&&!creatingTag;};
 const capture=()=>({owner:getContext().owner,identity:getContext().identity,epoch});
 const current=token=>token.epoch===epoch&&token.owner===getContext().owner&&token.identity===getContext().identity;
 const notify=()=>{refresh();onState();};
 function authError(error,token){if(current(token)&&(error.status===401||error.code==='account_changed'))onAuth();}
 function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;}
 const matchingTag=name=>topicTags.find(tag=>[tag.id,tag.name||'',tagLabel(tag.id,getLanguage(),t),...Object.values(tag.translations||{})].some(label=>tagNameKey(label)===tagNameKey(name)));
 async function addNamedTag(){
  if(!mutable())return;
  let name;try{name=normalizeTagName($('tag-search').value);}catch{onProblem('composeTagInvalid');return;}
  const existing=matchingTag(name);
  if(existing?.active===false){onProblem('m5DirectoryChanged');return;}
  if(existing&&tags.includes(existing.id)){$('tag-search').value='';refresh();return;}
  if(tags.length>=5){onProblem('composeTagLimit');return;}
  if(existing){tags=normalizeTopicTags([...tags,existing.id],{allowUnknown:true});$('tag-search').value='';onChange();refresh();return;}
  const token=capture();creatingTag=token;notify();
  try{
   const result=await api('/api/tags',{method:'POST',body:JSON.stringify({name,expectedUserId:token.owner})});
   if(!current(token))return;
   if(!result.tag?.id||!Array.isArray(result.tags)||!Array.isArray(result.categories))throw new Error('invalid_tag_response');
   applyDirectory(result);
   tags=normalizeTopicTags([...tags,result.tag.id],{allowUnknown:true});$('tag-search').value='';onChange();
  }catch(error){if(current(token)){authError(error,token);onProblem(error.status===429?'rateLimited':error.code==='invalid_tag_name'?'composeTagInvalid':error.code==='inactive_tag'?'m5DirectoryChanged':error.code==='account_muted'?'accountMuted':error.code==='account_banned'?'accountBanned':'composeTagCreateFailed');}}
  finally{if(current(token)){creatingTag=null;notify();}}
 }
 function renderTags(){
  const active=document.activeElement,activeTag=active?.dataset?.extraTag,activeChip=active?.dataset?.extraChip;
  $('tag-chips').replaceChildren();
  for(const id of tags){const tag=topicTags.find(item=>item.id===id),b=button(tagLabel(id,getLanguage(),t)+' ×',()=>{if(!mutable())return;tags=tags.filter(x=>x!==id);onChange();refresh();});b.dataset.extraChip=id;b.setAttribute('aria-label',t('composeTagRemove',{name:tagLabel(id,getLanguage(),t)}));b.disabled=!mutable();$('tag-chips').append(b);}
  const query=$('tag-search').value.trim().toLocaleLowerCase(),category=getContext().category;
  const options=topicTags.filter(tag=>tag.active!==false&&(tagLabel(tag.id,getLanguage(),t)+' '+tag.id).toLocaleLowerCase().includes(query)).sort((a,b)=>Number(b.categories.includes(category))-Number(a.categories.includes(category)));
  $('tag-options').replaceChildren();
  for(const tag of options){const chosen=tags.includes(tag.id),b=button(tagLabel(tag.id,getLanguage(),t),()=>{if(!mutable())return;if(tags.includes(tag.id))tags=tags.filter(id=>id!==tag.id);else if(tags.length<5)tags=normalizeTopicTags([...tags,tag.id],{allowUnknown:true});else{onProblem('composeTagLimit');return;}onChange();refresh();});b.dataset.extraTag=tag.id;b.setAttribute('aria-pressed',String(chosen));b.disabled=!mutable()||!chosen&&tags.length>=5;$('tag-options').append(b);}
  if(!options.length){const p=document.createElement('p');p.textContent=t('composeTagNone');$('tag-options').append(p);}
  if(query&&!matchingTag(query)){
   let name;try{name=normalizeTagName($('tag-search').value);}catch{}
   const add=button(t(creatingTag?'composeTagCreating':'composeTagCreate',{name:name||query}),addNamedTag);add.dataset.createTag='true';add.disabled=!mutable()||!name||tags.length>=5;$('tag-options').append(add);
  }
  $('tags').disabled=!mutable();$('tag-search').disabled=!mutable();$('tag-search').placeholder=t('composeTagSearch');
  const restore=activeTag?root.querySelector('[data-extra-tag="'+activeTag+'"]'):activeChip?root.querySelector('[data-extra-chip="'+activeChip+'"]'):null;
  if(restore&&!restore.disabled&&active!==document.activeElement)restore.focus({preventScroll:true});
 }
 function renderImages(){
  const active=document.activeElement,key=active?.dataset?.extraRow,action=active?.dataset?.extraAction;
  $('images-region').hidden=rows.length===0;$('images').replaceChildren();
  const statusKeys={preparing:'composeImagePreparing',uploading:'composeImageUploading',processing:'composeImageProcessing',checking:'composeImageProcessing',ready:'composeImageReady',error:'composeImageFailed',missing:'composeImageExpired',checkfailed:'composeImageCheckFailed',removing:'composeImageRemoving',removefailed:'composeImageFailed'};
  rows.forEach((row,index)=>{
   const card=document.createElement('div');card.className='compose-image-card';card.dataset.imageStatus=row.status;card.dataset.attachmentId=row.id||'';
   const src=row.preview||(row.meta&&validAttachment(row.meta)?row.meta.url:null);
   if(src){const img=document.createElement('img');img.src=src;img.alt=t('composeImage',{count:index+1});card.append(img);}
   const name=document.createElement('p');name.textContent=row.name||t('composeImage',{count:index+1});card.append(name);
   const status=document.createElement('p');status.setAttribute('role','status');status.textContent=t(statusKeys[row.status]||'composeImageFailed');card.append(status);
   if(['uploading','processing'].includes(row.status)){const p=document.createElement('progress');p.max=100;p.value=row.progress||0;p.setAttribute('aria-label',t('composeImageUploading'));card.append(p);}
   const actions=document.createElement('div');
   if(['error','checkfailed','removefailed'].includes(row.status)){
    const retry=button(t('composeImageRetry'),()=>{if(!mutable())return;if(row.status==='removefailed')remove(row);else if(row.id)renew(true);else run(row);});retry.disabled=!mutable();retry.dataset.extraRow=row.key;retry.dataset.extraAction='retry';actions.append(retry);
   }
   const del=button(t('composeImageRemove'),()=>remove(row));del.disabled=!mutable()||row.status==='removing';del.dataset.extraRow=row.key;del.dataset.extraAction='remove';actions.append(del);card.append(actions);$('images').append(card);
  });
  $('upload').disabled=!mutable()||rows.length>=5;$('image-input').disabled=!mutable();
  if(key&&action){const target=[...$('images').querySelectorAll('button')].find(b=>b.dataset.extraRow===key&&b.dataset.extraAction===action);if(target&&!target.disabled&&active!==document.activeElement)target.focus({preventScroll:true});}
 }
 function refresh(){renderTags();renderImages();}
 function dispose(row){row.controller?.abort();if(row.preview)URL.revokeObjectURL(row.preview);}
 function reset(){epoch++;for(const row of rows)dispose(row);rows=[];tags=[];renewing=null;lastRenew=0;identity=null;releasing=false;creatingTag=null;refresh();}
 function setDraft(value,nextIdentity){reset();identity=nextIdentity;try{tags=normalizeTopicTags(value.tagIds,{allowUnknown:true});}catch{tags=[];}
  rows=(value.attachmentIds||[]).map(id=>({key:crypto.randomUUID(),id,status:'checking'}));refresh();
  if(rows.length&&getContext().owner)queueMicrotask(()=>{if(identity===nextIdentity)renew(true);});
 }
 function getDraft(){return {tagIds:[...tags].sort(),attachmentIds:rows.filter(row=>row.id).map(row=>row.id)};}
 async function run(row){
  if(!mutable()||!rows.includes(row)||row.busy)return;
  const token=capture();row.busy=true;row.controller=new AbortController();row.status=row.blob?'uploading':'preparing';row.progress=0;notify();
  try{
   if(!row.blob){const prepared=await prepareTopicImage(row.file);if(!current(token)||!rows.includes(row))return;row.blob=prepared.blob;row.name=prepared.name;row.preview=URL.createObjectURL(row.blob);}
   if(!current(token)||!rows.includes(row))return;row.status='uploading';notify();
   const meta=await uploadTopicImage({blob:row.blob,uploadId:row.uploadId,expectedUserId:token.owner,signal:row.controller.signal,onProgress:value=>{if(current(token)&&rows.includes(row)){row.progress=value;row.status=value>=100?'processing':'uploading';notify();}}});
   if(!current(token)||!rows.includes(row))return;row.meta=meta;row.id=meta.id;row.status='ready';row.file=null;row.blob=null;lastRenew=0;onChange();
  }catch(error){if(!current(token)||!rows.includes(row))return;row.status='error';if(!error.aborted){onProblem(error.code==='account_muted'?'accountMuted':error.code==='account_banned'?'accountBanned':error.code==='image_too_large'?'composeImageTooLarge':['invalid_image','image_decode_failed'].includes(error.code)?'composeImageInvalid':'composeImageFailed');authError(error,token);}}
  finally{if(current(token)&&rows.includes(row)){row.busy=false;notify();}}
 }
 function addFiles(files){
  if(!mutable())return;let excess=false;
  for(const file of files){if(rows.length>=5){excess=true;continue;}const row={key:crypto.randomUUID(),uploadId:crypto.randomUUID(),file,name:String(file.name||''),status:'preparing'};rows.push(row);run(row);}
  if(excess)onProblem('composeImageLimit');notify();
 }
 async function remove(row){
  if(!mutable()||!rows.includes(row))return;const token=capture();
  if(!row.id){dispose(row);rows=rows.filter(x=>x!==row);notify();return;}
  row.status='removing';notify();
  try{await api('/api/topic-attachments/'+row.id,{method:'DELETE',headers:{'X-Expected-User-Id':token.owner}});}
  catch(error){if(!current(token)||!rows.includes(row))return;if(error.status!==404){row.status='removefailed';authError(error,token);onProblem('composeImageCheckFailed');notify();return;}}
  if(!current(token)||!rows.includes(row))return;dispose(row);rows=rows.filter(x=>x!==row);onChange();notify();
 }
 function renew(force=false){
  const ctx=getContext();if(!ctx.owner||!ctx.authenticated||releasing)return Promise.resolve();
  const target=rows.filter(row=>row.id&&!['removing','removefailed'].includes(row.status));if(!target.length)return Promise.resolve();
  if(renewing)return renewing;if(!force&&Date.now()-lastRenew<30000)return Promise.resolve();
  const token=capture(),ids=target.map(row=>row.id);lastRenew=Date.now();
  const work=(async()=>{try{
   const result=await api('/api/topic-attachments/retain',{method:'POST',body:JSON.stringify({attachmentIds:ids,expectedUserId:token.owner})});
   if(!current(token))return;
   if(!Array.isArray(result.attachments)||!Array.isArray(result.missingIds)||result.attachments.some(meta=>!validAttachment(meta)))throw new Error('invalid_attachment_response');
   for(const row of target){if(!rows.includes(row)||['removing','removefailed'].includes(row.status))continue;const meta=result.attachments.find(meta=>meta.id===row.id);if(meta&&(meta.expiresAt!==null||getContext().frozen)){row.meta=meta;row.status='ready';}else row.status='missing';}
  }catch(error){if(!current(token))return;for(const row of target)if(rows.includes(row)&&!['removing','removefailed'].includes(row.status))row.status='checkfailed';authError(error,token);}
  finally{if(current(token)){renewing=null;notify();}}})();renewing=work;return work;
 }
 async function release(){
  const token=capture(),old=rows.slice();releasing=true;for(const row of old)row.controller?.abort();let ok=true;
  for(const row of old){if(!current(token)){ok=false;break;}if(!row.id)continue;try{await api('/api/topic-attachments/'+row.id,{method:'DELETE',headers:{'X-Expected-User-Id':token.owner}});}catch(error){if(error.status!==404)ok=false;}}
  if(current(token)){reset();}return ok;
 }
 $('tags').onclick=()=>{if(!mutable())return;const open=$('tags-menu').hidden;$('tags-menu').hidden=!open;$('tags').setAttribute('aria-expanded',String(open));if(open)$('tag-search').focus();};
 $('tag-search').oninput=renderTags;
 $('tag-search').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if($('tag-search').value.trim())addNamedTag();}});
 $('upload').onclick=()=>{if(mutable())$('image-input').click();};
 $('image-input').onchange=e=>{const files=[...e.target.files];e.target.value='';addFiles(files);};
 const sheet=$('sheet');
 sheet.addEventListener('dragover',e=>{if([...e.dataTransfer?.items||[]].some(item=>item.kind==='file'))e.preventDefault();});
 sheet.addEventListener('drop',e=>{const files=[...e.dataTransfer?.files||[]];if(files.length){e.preventDefault();addFiles(files);}});
 sheet.addEventListener('paste',e=>{const files=[...e.clipboardData?.items||[]].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();addFiles(files);}});
 return {setDraft,getDraft,refresh,renew,release,reset,hasBlockingWork:()=>releasing||Boolean(creatingTag)||rows.some(row=>row.status!=='ready'),hasVolatileFiles:()=>rows.some(row=>!row.id)};
}
