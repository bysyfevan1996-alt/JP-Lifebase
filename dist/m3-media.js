import {prepareTopicImage,uploadTopicImage,validAttachment} from './composer-images.js?v=20261021232645283';

export function createReplyMedia({host,t,api,getOwner,getDisabled=()=>false,onChange=()=>{},ids=[],saved=[]}){
 const events=new AbortController();let disposed=false,rows=saved.length?saved.slice(0,5).map(row=>({id:row.id,key:row.key||crypto.randomUUID(),uploadId:row.uploadId||crypto.randomUUID(),file:row.file||null,status:row.id?'checking':row.status==='failed'?'failed':'uploading'})):ids.map(id=>({id,status:'checking',key:crypto.randomUUID()}));
 const controls=document.createElement('div');controls.className='m3-media';
 const add=document.createElement('button');add.type='button';add.textContent=t('m3ImageAdd');
 const fileInput=document.createElement('input');fileInput.type='file';fileInput.accept='image/jpeg,image/png,image/webp';fileInput.multiple=true;fileInput.hidden=true;
 const list=document.createElement('div');list.className='m3-media-list';
 const message=document.createElement('p');message.className='form-error';message.hidden=true;
 controls.append(add,fileInput,list,message);const actions=host.querySelector('.editor-actions');if(actions)host.insertBefore(controls,actions);else host.append(controls);
 const current=owner=>!disposed&&owner===getOwner();
 const problem=key=>{message.textContent=t(key);message.hidden=false;};
 function render(){
  if(disposed)return;list.replaceChildren();add.disabled=getDisabled()||!getOwner()||rows.length>=5;
  for(const row of rows){const card=document.createElement('div');card.className='m3-media-card';
   if(row.id){const img=document.createElement('img');img.src='/api/topic-attachments/'+row.id;img.alt=t('composeImage',{count:rows.indexOf(row)+1});card.append(img);}
   const status=document.createElement('span');status.textContent=t(row.status==='ready'?'m3ImageReady':row.status==='failed'?'m3ImageFailed':'composeImageUploading');status.setAttribute('role','status');card.append(status);
   if(row.status==='failed'&&row.file){const retry=document.createElement('button');retry.type='button';retry.textContent=t('m3Retry');retry.disabled=getDisabled();retry.onclick=()=>upload(row);card.append(retry);}
   const remove=document.createElement('button');remove.type='button';remove.textContent=t('m3ImageRemove');remove.disabled=getDisabled()||row.status==='removing';remove.onclick=()=>removeRow(row);card.append(remove);list.append(card);
  }
 }
 async function upload(row){
  if(disposed||getDisabled()||!getOwner()||row.busy)return;const owner=getOwner();row.busy=true;row.status='uploading';row.controller=new AbortController();render();
  try{const prepared=await prepareTopicImage(row.file);if(!current(owner)||!rows.includes(row))return;const meta=await uploadTopicImage({blob:prepared.blob,uploadId:row.uploadId,expectedUserId:owner,signal:row.controller.signal});if(!current(owner)||!rows.includes(row))return;row.id=meta.id;row.status='ready';row.file=null;onChange();}
  catch(error){if(!current(owner)||!rows.includes(row))return;row.status='failed';if(!error.aborted)problem('m3ImageFailed');}
  finally{row.busy=false;if(current(owner))render();}
 }
 function addFiles(files){if(disposed||getDisabled()||!getOwner())return;message.hidden=true;for(const file of files){if(rows.length>=5){problem('m3ImageLimit');break;}const row={key:crypto.randomUUID(),uploadId:crypto.randomUUID(),file,status:'uploading'};rows.push(row);upload(row);}render();onChange();}
 async function removeRow(row){if(disposed||getDisabled())return;const owner=getOwner();row.controller?.abort();if(!row.id){rows=rows.filter(value=>value!==row);render();onChange();return;}row.status='removing';render();try{await api('/api/topic-attachments/'+row.id,{method:'DELETE',headers:{'X-Expected-User-Id':owner}});if(!current(owner))return;rows=rows.filter(value=>value!==row);onChange();}catch{if(current(owner)){row.status='failed';problem('m3ImageFailed');}}if(current(owner))render();}
 async function renew(){const owner=getOwner(),target=rows.filter(row=>row.id);if(!target.length)return true;if(!owner)return false;try{const result=await api('/api/topic-attachments/retain',{method:'POST',body:JSON.stringify({attachmentIds:target.map(row=>row.id),expectedUserId:owner})});if(!current(owner))return false;for(const row of target){const meta=result.attachments?.find(item=>item.id===row.id);row.status=validAttachment(meta)&&meta.expiresAt!==null?'ready':'failed';}render();return target.every(row=>row.status==='ready');}catch{if(current(owner)){for(const row of target)row.status='failed';render();problem('m3ImageFailed');}return false;}}
 add.onclick=()=>fileInput.click();fileInput.onchange=()=>{addFiles([...fileInput.files]);fileInput.value='';};
 host.addEventListener('paste',event=>{const files=[...event.clipboardData?.items||[]].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();addFiles(files);}},{signal:events.signal});
 host.addEventListener('dragover',event=>{if([...event.dataTransfer?.items||[]].some(item=>item.kind==='file'))event.preventDefault();},{signal:events.signal});
 host.addEventListener('drop',event=>{const files=[...event.dataTransfer?.files||[]];if(files.length){event.preventDefault();addFiles(files);}},{signal:events.signal});
 render();if(rows.some(row=>row.id))renew();for(const row of rows)if(row.file&&row.status==='uploading')upload(row);
 return {getState:()=>rows.map(row=>({id:row.id,key:row.key,uploadId:row.uploadId,file:row.file,status:row.status})),getIds:()=>rows.filter(row=>row.id).map(row=>row.id),isBusy:()=>rows.some(row=>row.status!=='ready'),renew,refresh:render,destroy(){disposed=true;events.abort();for(const row of rows)row.controller?.abort();controls.remove();}};
}
