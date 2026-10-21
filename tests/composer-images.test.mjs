import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTopicImage,uploadTopicImage} from '../dist/composer-images.js';

const MAX=5*1024*1024;
const UUID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UPLOAD='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function png(width=1200,height=800){
 const bytes=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
 bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);bytes[24]=8;bytes[25]=6;return bytes;
}
function jpeg(width=1200,height=800){
 const bytes=Buffer.from([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc2,0,17,8,0,0,0,0,3,1,0x11,0,2,0x11,0,3,0x11,0]);
 bytes.writeUInt16BE(height,13);bytes.writeUInt16BE(width,15);return bytes;
}
function webp(width,height,type='VP8X'){
 const length=type==='VP8L'?5:10,bytes=Buffer.alloc(20+length);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WEBP',8);bytes.write(type,12);bytes.writeUInt32LE(length,16);
 if(type==='VP8X'){bytes.writeUIntLE(width-1,24,3);bytes.writeUIntLE(height-1,27,3);}
 else if(type==='VP8L'){bytes[20]=0x2f;bytes.writeUInt32LE(((width-1)|((height-1)<<14))>>>0,21);}
 else{bytes[20]=0x10;bytes.set([0x9d,1,0x2a],23);bytes.writeUInt16LE(width,26);bytes.writeUInt16LE(height,28);}
 return bytes;
}
function file(bytes,type='image/png'){return new File([bytes],'sample.png',{type});}

async function imageFixture(work,{dimensions={width:1200,height:800},sizes=[200000]}={}){
 const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;
 let bitmapCalls=0,closed=0,draws=[],encodes=[];
 globalThis.createImageBitmap=async()=>{bitmapCalls++;return {...dimensions,close(){closed++;}};};
 globalThis.document={createElement(tag){assert.equal(tag,'canvas');const canvas={width:0,height:0,getContext(){return {drawImage(...args){draws.push(args.slice(1));},clearRect(){}};},toBlob(cb,type){assert.equal(type,'image/png');encodes.push([canvas.width,canvas.height]);const size=sizes[Math.min(encodes.length-1,sizes.length-1)];cb(size===null?null:new Blob([new Uint8Array(size)],{type}));}};return canvas;}};
 try{await work({get bitmapCalls(){return bitmapCalls;},get closed(){return closed;},draws,encodes});}finally{globalThis.createImageBitmap=oldBitmap;globalThis.document=oldDocument;}
}

test('JPEG, PNG and the three WebP headers are accepted and pixels are rewritten as bounded PNG',async()=>{
 for(const [bytes,type]of [[png(),'image/png'],[jpeg(),'image/jpeg'],[webp(1200,800),'image/webp'],[webp(1200,800,'VP8L'),'image/webp'],[webp(1200,800,'VP8 '),'image/webp']]){
  await imageFixture(async context=>{const result=await prepareTopicImage(file(bytes,type));assert.equal(result.blob.type,'image/png');assert.equal(result.blob.size,200000);assert.equal(result.width,1200);assert.equal(result.height,800);assert.equal(result.name,'sample.png');assert.equal(context.bitmapCalls,1);assert.equal(context.closed,1);assert.equal(context.encodes.length,1);});
 }
 await imageFixture(async context=>{const result=await prepareTopicImage(file(png(8000,5000)));assert.equal(result.width,2048);assert.equal(result.height,1280);assert.equal(context.closed,1);},{dimensions:{width:8000,height:5000}});
});

test('bad formats, oversized sources and excessive pixel dimensions fail before decoding',async()=>{
 await imageFixture(async context=>{
  for(const input of [file(png(),'image/gif'),file(Buffer.from('not an image')),file(png(0,3)),file(png(16385,1)),file(png(8001,5000)),file(jpeg(16385,1),'image/jpeg'),file(webp(8001,5000),'image/webp')])await assert.rejects(prepareTopicImage(input),e=>e.code==='invalid_image');
  await assert.rejects(prepareTopicImage(file(new Uint8Array(MAX+1))),e=>e.code==='image_too_large');
  assert.equal(context.bitmapCalls,0);
 });
});

test('large encoded PNGs shrink again, and failed encoding still closes the decoded bitmap',async()=>{
 await imageFixture(async context=>{const result=await prepareTopicImage(file(png(2048,2048)));assert(result.width<2048);assert.equal(result.width,result.height);assert(result.blob.size<=MAX);assert(context.encodes.length>=2);assert.equal(context.closed,1);},{dimensions:{width:2048,height:2048},sizes:[MAX+1,MAX-1]});
 await imageFixture(async context=>{await assert.rejects(prepareTopicImage(file(png())),e=>e.code==='image_decode_failed');assert.equal(context.closed,1);},{sizes:[null]});
});

const metadata=()=>({id:UUID,url:'/api/topic-attachments/'+UUID,mime:'image/png',width:1200,height:800,bytes:100,expiresAt:'2026-10-28T00:00:00.000Z'});
async function xhrFixture(work){
 const oldXHR=globalThis.XMLHttpRequest,requests=[];
 class FakeXHR{
  upload={};headers={};status=0;responseText='';
  constructor(){requests.push(this);}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(name,value){this.headers[name.toLowerCase()]=value;}
  send(blob){this.blob=blob;this.sent=true;}
  abort(){this.aborted=true;this.onabort?.();}
  load(status,result){this.status=status;this.responseText=JSON.stringify(result);this.onload?.();}
 }
 globalThis.XMLHttpRequest=FakeXHR;
 try{await work(requests);}finally{globalThis.XMLHttpRequest=oldXHR;}
}
function startUpload(extra={}){return uploadTopicImage({blob:new Blob([new Uint8Array(100)],{type:'image/png'}),uploadId:UPLOAD,expectedUserId:'owner',...extra});}

test('XHR sends only PNG to the same-origin endpoint, reports real progress and waits for validated metadata',async()=>{
 await xhrFixture(async requests=>{
  const progress=[];let settled=false;
  const promise=startUpload({onProgress:value=>progress.push(value)}).then(value=>{settled=true;return value;});
  const xhr=requests[0];assert.equal(xhr.method,'POST');assert.equal(xhr.url,'/api/topic-attachments');assert.equal(xhr.withCredentials,true);assert.equal(xhr.headers['content-type'],'image/png');assert.equal(xhr.headers['x-client-upload-id'],UPLOAD);assert.equal(xhr.headers['x-expected-user-id'],'owner');
  xhr.upload.onprogress({lengthComputable:true,loaded:50,total:100});xhr.upload.onprogress({lengthComputable:true,loaded:100,total:100});await Promise.resolve();assert.equal(settled,false);assert(progress.includes(50));assert(progress.includes(100));
  xhr.load(201,{attachment:metadata()});assert.deepEqual(await promise,metadata());
 });
});

test('XHR distinguishes server rejection, uncertain network results, invalid success and cancellation',async()=>{
 await xhrFixture(async requests=>{
  let promise=startUpload();requests.at(-1).load(409,{code:'account_changed'});await assert.rejects(promise,e=>e.status===409&&e.code==='account_changed');
  promise=startUpload();requests.at(-1).onerror();await assert.rejects(promise,e=>e.network===true);
  promise=startUpload();requests.at(-1).load(201,{attachment:{...metadata(),url:'https://outside.example/image.png'}});await assert.rejects(promise,e=>e.network===true&&e.code==='invalid_attachment_response');
  const signal=new AbortController();promise=startUpload({signal:signal.signal});signal.abort();await assert.rejects(promise,e=>e.aborted===true);assert(requests.at(-1).aborted);
  const already=new AbortController();already.abort();const before=requests.length;await assert.rejects(startUpload({signal:already.signal}),e=>e.aborted===true);assert.equal(requests.length,before);
 });
});
