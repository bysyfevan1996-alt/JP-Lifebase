import {renderMarkdown} from './markdown.js?v=20261021223719402';
import {formatMarkdown} from './m3-format.js?v=20261021223719402';

export const contentLanguages=['und','zh-CN','zh-TW','ja','en','ko'];
export function languageSelect(t,value='und'){
 const select=document.createElement('select');select.setAttribute('aria-label',t('m3Language'));
 for(const code of contentLanguages){const option=document.createElement('option');option.value=code;option.textContent=code==='und'?t('m3Unknown'):({'zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語',en:'English',ko:'한국어'})[code];select.append(option);}
 if(!contentLanguages.includes(value)&&typeof value==='string'&&value.length<=35){const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option);}
 select.value=value;return select;
}
export function createBodyEditor({textarea,host,t,onChange=()=>{},onSubmit=()=>{},onPreviewChange=()=>{},disabled=()=>false,maxLength=6000}){
 const events=new AbortController(),options={signal:events.signal};let composing=false,previewing=false;
 const bar=document.createElement('div');bar.className='m3-editor-toolbar';
 const preview=document.createElement('div');preview.className='m3-editor-preview markdown-body';preview.hidden=true;
 const button=(key,text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text||t(key);b.setAttribute('aria-label',t(key));b.title=t(key);b.onclick=action;bar.append(b);return b;};
 const mode=button('composePreview','',()=>setPreview(!previewing));
 const formats=[['bold','composeBold','B'],['italic','composeItalic','I'],['heading','composeHeading','H'],['link','composeLink','↗'],['quote','composeQuote','❞'],['code','composeCode','</>'],['list','composeList','≡']];
 function apply(format){if(disabled())return;setPreview(false);const result=formatMarkdown({value:textarea.value,start:textarea.selectionStart,end:textarea.selectionEnd,format,placeholder:t('body'),linkLabel:t('composeLink'),maxLength});if(!result)return;textarea.value=result.value;textarea.focus();textarea.setSelectionRange(result.start,result.end);onChange();}
 for(const [format,key,text]of formats)button(key,text,()=>apply(format));
 function setPreview(value){previewing=value;preview.hidden=!value;textarea.hidden=value;mode.textContent=t(value?'composeEdit':'composePreview');mode.setAttribute('aria-label',mode.textContent);mode.title=mode.textContent;mode.setAttribute('aria-pressed',String(value));if(value)renderMarkdown(preview,textarea.value);onPreviewChange(value);}
 host.insertBefore(bar,textarea);textarea.after(preview);textarea.maxLength=maxLength;
 textarea.addEventListener('input',()=>{onChange();if(previewing)renderMarkdown(preview,textarea.value);},options);
 textarea.addEventListener('compositionstart',()=>{composing=true;},options);textarea.addEventListener('compositionend',()=>{composing=false;},options);
 textarea.addEventListener('keydown',event=>{if(composing||event.isComposing||event.keyCode===229||disabled())return;if((event.ctrlKey||event.metaKey)&&!event.altKey){const key=event.key.toLowerCase();if(key==='enter'){event.preventDefault();onSubmit();}else if(key==='b'||key==='i'){event.preventDefault();apply(key==='b'?'bold':'italic');}}},options);
 return {setPreview,isPreview:()=>previewing,elements:{bar,preview,mode},refresh(){for(const b of bar.querySelectorAll('button'))b.disabled=disabled();textarea.readOnly=disabled();},destroy(){events.abort();bar.remove();preview.remove();textarea.hidden=false;}};
}
