import {bindReplyViewport} from './reply-viewport.js?v=20261022012556469';

const node=(tag,className,text)=>{const value=document.createElement(tag);value.className=className;if(text!==undefined)value.textContent=text;return value;};
const glyph=(kind)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='expand'?'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5':'m6 9 6 6 6-6');svg.append(path);return svg;};

// One editor instance is moved, never copied. Text, selection and image receipts stay together.
export function createReplyWriting({host,textarea,editor,t,topicTitle,onState=()=>{},expanded=false}){
 const events=new AbortController(),options={signal:events.signal},mobile=matchMedia('(max-width:760px)');
 let disposed=false,modal=null,placeholder=null,stopViewport=null,savedPage=null;
 const label=host.querySelector('label[for="reply-text"]'),head=node('header','reply-writing-head');
 label.textContent=t('readingWrite');head.append(label);
 const expand=node('button','reply-expand');expand.type='button';expand.append(glyph('expand'),node('span','',t('replyFullscreen')));expand.setAttribute('aria-expanded','false');head.append(expand);
 const context=node('p','reply-writing-context',topicTitle);context.title=topicTitle;
 const modes=node('div','reply-writing-modes'),tabs=node('div','reply-writing-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label',t('replyEditorMode'));
 const write=node('button','',t('replyWrite')),preview=node('button','',t('composePreview'));write.type=preview.type='button';tabs.append(write,preview);
 const count=node('span','reply-character-count');modes.append(tabs,count);
 const area=node('div','reply-writing-area'),quotes=host.querySelector('.m3-draft-quotes'),media=host.querySelector('.m3-media'),language=host.querySelector('.m3-language-field');
 const settings=node('details','reply-writing-settings'),summary=node('summary','',t('replyOptions'));settings.append(summary,language);
 const footer=host.querySelector('.editor-actions'),hint=node('small','reply-draft-hint',t('replyPageDraft'));footer.prepend(hint);
 area.append(quotes,editor.elements.bar,textarea,editor.elements.preview,media);
 host.prepend(head,context,modes,area,settings);host.classList.add('reply-writing');editor.elements.mode.hidden=true;
 function sync(){if(disposed)return;const active=editor.isPreview();write.setAttribute('aria-pressed',String(!active));preview.setAttribute('aria-pressed',String(active));area.classList.toggle('is-preview',active);count.textContent=textarea.value.length.toLocaleString()+' / 6,000';}
 write.onclick=()=>{editor.setPreview(false);sync();textarea.focus({preventScroll:true});};preview.onclick=()=>{textarea.blur();editor.setPreview(true);sync();};
 textarea.addEventListener('input',sync,options);editor.elements.bar.addEventListener('click',sync,options);
 function pageLock(){const style=document.body.style;savedPage={x:window.scrollX,y:window.scrollY,properties:Object.fromEntries(['position','top','left','width','overflow'].map(key=>[key,[style.getPropertyValue(key),style.getPropertyPriority(key)]]))};style.position='fixed';style.top=-savedPage.y+'px';style.left=-savedPage.x+'px';style.width='100%';style.overflow='hidden';document.body.classList.add('reply-fullscreen-open');}
 function pageUnlock(){if(!savedPage)return;const previous=savedPage;savedPage=null;for(const [key,[value,priority]]of Object.entries(previous.properties)){if(value)document.body.style.setProperty(key,value,priority);else document.body.style.removeProperty(key);}document.body.classList.remove('reply-fullscreen-open');window.scrollTo({left:previous.x,top:previous.y,behavior:'instant'});}
 function collapse({focus=true}={}){
  if(!modal)return;const closing=modal;modal=null;stopViewport?.();stopViewport=null;textarea.blur();
  if(placeholder?.parentNode)placeholder.replaceWith(host);placeholder=null;
  host.classList.remove('is-fullscreen');expand.replaceChildren(glyph('expand'),node('span','',t('replyFullscreen')));expand.setAttribute('aria-expanded','false');
  if(closing.open)closing.close();closing.remove();pageUnlock();if(focus&&!disposed&&expand.isConnected)expand.focus({preventScroll:true});if(!disposed)onState();
 }
 function open(){
  if(disposed||modal||!mobile.matches)return;const selection=[textarea.selectionStart,textarea.selectionEnd,textarea.selectionDirection],scroll=textarea.scrollTop;
  placeholder=document.createComment('reply editor position');host.before(placeholder);pageLock();
  modal=node('dialog','reply-writing-dialog');modal.setAttribute('aria-label',t('replyFullscreen'));document.body.append(modal);modal.append(host);host.classList.add('is-fullscreen');
  const opened=modal;expand.replaceChildren(glyph('collapse'),node('span','',t('replyCollapse')));expand.setAttribute('aria-expanded','true');modal.addEventListener('cancel',event=>{event.preventDefault();collapse();},options);modal.addEventListener('close',()=>{if(modal===opened)collapse();},options);
  modal.showModal();stopViewport=bindReplyViewport({element:modal});
  if(!editor.isPreview()){textarea.focus({preventScroll:true});textarea.setSelectionRange(...selection);textarea.scrollTop=scroll;}else preview.focus({preventScroll:true});onState();
 }
 expand.onclick=()=>modal?collapse():open();mobile.addEventListener('change',()=>{if(!mobile.matches)collapse({focus:false});},options);
 sync();if(expanded&&mobile.matches)queueMicrotask(()=>{if(!disposed)open();});
 return {refresh:sync,isExpanded:()=>!!modal,destroy(){disposed=true;events.abort();collapse({focus:false});}};
}
