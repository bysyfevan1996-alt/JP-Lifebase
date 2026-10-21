const MAX=5*1024*1024;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail=code=>Object.assign(new Error(code),{code});
function dimensions(bytes,type){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(at,size)=>String.fromCharCode(...bytes.subarray(at,at+size));
 if(type==='image/png'&&bytes.length>=33&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)&&ascii(12,4)==='IHDR')return [view.getUint32(16),view.getUint32(20)];
 if(type==='image/jpeg'&&bytes.length>4&&bytes[0]===255&&bytes[1]===216){
  let p=2;
  while(p+3<bytes.length){
   if(bytes[p++]!==255)break;while(bytes[p]===255)p++;const marker=bytes[p++];
   if(marker===217||marker===218)break;
   if(marker===1||marker>=208&&marker<=215)continue;
   if(p+2>bytes.length)break;const length=view.getUint16(p);if(length<2||p+length>bytes.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)return [view.getUint16(p+5),view.getUint16(p+3)];p+=length;
  }
 }
 if(type==='image/webp'&&bytes.length>=25&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
  const kind=ascii(12,4),u24=p=>bytes[p]+bytes[p+1]*256+bytes[p+2]*65536;
  if(kind==='VP8X'&&bytes.length>=30)return [u24(24)+1,u24(27)+1];
  if(kind==='VP8L'&&bytes[20]===47){const bits=view.getUint32(21,true);return [(bits&16383)+1,((bits>>>14)&16383)+1];}
  if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return [view.getUint16(26,true)&16383,view.getUint16(28,true)&16383];
 }
 throw fail('invalid_image');
}
const allowedDimensions=([w,h])=>Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&w<=16384&&h<=16384&&w*h<=40000000;
export async function prepareTopicImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw fail('invalid_image');
 if(file.size>MAX)throw fail('image_too_large');
 let bytes;try{bytes=new Uint8Array(await file.arrayBuffer());}catch{throw fail('invalid_image');}
 if(!allowedDimensions(dimensions(bytes,file.type)))throw fail('invalid_image');
 let bitmap;
 try{
  bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  if(!allowedDimensions([bitmap.width,bitmap.height]))throw fail('invalid_image');
  const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
  let width=Math.max(1,Math.floor(bitmap.width*scale)),height=Math.max(1,Math.floor(bitmap.height*scale));
  const canvas=document.createElement('canvas');
  for(let attempt=0;attempt<20;attempt++){
   canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw fail('image_decode_failed');
   context.drawImage(bitmap,0,0,width,height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw fail('image_decode_failed');
   if(blob.size<=MAX)return {blob,width,height,name:String(file.name||'')};
   if(width===1&&height===1)break;width=Math.max(1,Math.floor(width*.8));height=Math.max(1,Math.floor(height*.8));
  }
  throw fail('image_too_large');
 }catch(error){if(error.code)throw error;throw fail('image_decode_failed');}finally{bitmap?.close();}
}
export function validAttachment(value){
 return Boolean(value&&typeof value.id==='string'&&UUID.test(value.id)&&value.url==='/api/topic-attachments/'+value.id&&value.mime==='image/png'&&Number.isInteger(value.width)&&value.width>0&&value.width<=2048&&Number.isInteger(value.height)&&value.height>0&&value.height<=2048&&Number.isInteger(value.bytes)&&value.bytes>0&&value.bytes<=MAX&&(value.expiresAt===null||typeof value.expiresAt==='string'&&Number.isFinite(Date.parse(value.expiresAt))));
}
export function uploadTopicImage({blob,uploadId,expectedUserId,onProgress=()=>{},signal}){
 return new Promise((resolve,reject)=>{
  if(!(blob instanceof Blob)||blob.type!=='image/png'||blob.size>MAX||!UUID.test(uploadId)||typeof expectedUserId!=='string'||!expectedUserId||expectedUserId.length>200){reject(fail('invalid_arguments'));return;}
  if(signal?.aborted){reject(Object.assign(fail('aborted'),{aborted:true}));return;}
  const xhr=new XMLHttpRequest();let done=false;
  const finish=(error,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>{xhr.abort();finish(Object.assign(fail('aborted'),{aborted:true}));};
  xhr.open('POST','/api/topic-attachments',true);xhr.withCredentials=true;xhr.timeout=60000;
  xhr.setRequestHeader('Content-Type','image/png');xhr.setRequestHeader('X-Client-Upload-Id',uploadId);xhr.setRequestHeader('X-Expected-User-Id',expectedUserId);
  xhr.upload.onprogress=e=>{if(!done&&e.lengthComputable)onProgress(Math.max(0,Math.min(100,Math.round(e.loaded/e.total*100))));};
  xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{finish(Object.assign(fail('invalid_attachment_response'),{network:true}));return;}
   if(xhr.status<200||xhr.status>=300){finish(Object.assign(fail(result.code||'upload_failed'),{status:xhr.status,code:result.code||'upload_failed'}));return;}
   if(!validAttachment(result.attachment)){finish(Object.assign(fail('invalid_attachment_response'),{network:true}));return;}finish(null,result.attachment);
  };
  xhr.onerror=xhr.ontimeout=()=>finish(Object.assign(fail('network'),{network:true}));xhr.onabort=()=>finish(Object.assign(fail('aborted'),{aborted:true}));
  signal?.addEventListener('abort',abort,{once:true});try{xhr.send(blob);}catch{finish(Object.assign(fail('network'),{network:true}));}
 });
}
