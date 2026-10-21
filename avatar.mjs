import {createHash} from 'node:crypto';
import {crc32,inflateSync} from 'node:zlib';

const segmenter=new Intl.Segmenter('und',{granularity:'grapheme'});

export function defaultAvatar(name){
 const normalized=String(name??'').trim().normalize('NFC');
 let avatar='?';
 for(const {segment} of segmenter.segment(normalized)){
  if(/[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(segment)){avatar=segment;break;}
 }
 return {avatar,tone:createHash('sha256').update(normalized,'utf8').digest()[0]%8};
}

export function avatarUrl(userId,hash){
 if(typeof userId!=='string'||!userId.trim())return null;
 if(typeof hash!=='string'||hash.length!==64||!/^[a-f0-9]{64}$/.test(hash))return null;
 try{return `/api/avatars/${encodeURIComponent(userId)}/${hash}`;}catch{return null;}
}

const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const maxAvatarBytes=90*1024;
const dataPrefix='data:image/png;base64,';
const metadataLengths=new Map([['sRGB',1],['gAMA',4],['cHRM',32],['pHYs',9]]);
const invalid=()=>{throw Object.assign(new Error('invalid_avatar'),{status:400,code:'invalid_avatar'});};

// Canvas emits a small, static RGB/RGBA PNG. Compressed text/profile metadata,
// animation and unknown chunks are excluded from this upload format.
function validatePngChunks(bytes){
 let offset=8,count=0,width,height,channels,header=false,idat=false,idatEnded=false,finished=false;
 const parts=[],metadata=new Set();
 while(offset<bytes.length){
  if(++count>1024||bytes.length-offset<12)invalid();
  const length=bytes.readUInt32BE(offset);
  if(length>bytes.length-offset-12)invalid();
  const start=offset+8,end=start+length,next=end+4;
  for(let i=offset+4;i<offset+8;i++){
   const b=bytes[i];if(!(b>=65&&b<=90||b>=97&&b<=122))invalid();
  }
  if(bytes[offset+6]&32)invalid();
  const type=bytes.toString('ascii',offset+4,offset+8);
  if(crc32(bytes.subarray(offset+4,end))!==bytes.readUInt32BE(end))invalid();
  if(count===1&&type!=='IHDR')invalid();
  if(idat&&type!=='IDAT')idatEnded=true;
  if(type==='IHDR'){
   if(header||count!==1||length!==13)invalid();
   width=bytes.readUInt32BE(start);height=bytes.readUInt32BE(start+4);
   const depth=bytes[start+8],color=bytes[start+9];
   if(width<1||width>256||height<1||height>256||depth!==8||![2,6].includes(color)||bytes[start+10]!==0||bytes[start+11]!==0||bytes[start+12]!==0)invalid();
   channels=color===2?3:4;header=true;
  }else if(type==='IDAT'){
   if(!header||idatEnded)invalid();
   idat=true;parts.push(bytes.subarray(start,end));
  }else if(type==='IEND'){
   if(!header||!idat||length!==0||next!==bytes.length)invalid();
   finished=true;offset=next;break;
  }else{
   if(!header||idat||metadata.has(type)||metadataLengths.get(type)!==length)invalid();
   if(type==='sRGB'&&bytes[start]>3||type==='gAMA'&&bytes.readUInt32BE(start)===0||type==='pHYs'&&bytes[start+8]>1)invalid();
   metadata.add(type);
  }
  offset=next;
 }
 if(!finished||offset!==bytes.length)invalid();
 const compressed=Buffer.concat(parts);if(!compressed.length)invalid();
 return {width,height,channels,compressed};
}

export function decodeAvatar(value){
 if(value===undefined||value===null)return null;
 try{
  if(typeof value!=='string'||!value.startsWith(dataPrefix)||value.length>dataPrefix.length+Math.ceil(maxAvatarBytes/3)*4)invalid();
  const payload=value.slice(dataPrefix.length);
  if(!payload)invalid();
  const bytes=Buffer.from(payload,'base64');
  // Round-trip equality enforces the standard alphabet, padding and pad bits.
  if(bytes.length>maxAvatarBytes||bytes.toString('base64')!==payload||bytes.length<8||!bytes.subarray(0,8).equals(pngSignature))invalid();
  const {width,height,channels,compressed}=validatePngChunks(bytes);
  const stride=width*channels+1,expected=stride*height;
  const result=inflateSync(compressed,{maxOutputLength:expected,info:true});
  if(result.buffer.length!==expected||result.engine.bytesWritten!==compressed.length)invalid();
  for(let row=0;row<height;row++)if(result.buffer[row*stride]>4)invalid();
  return {bytes,hash:createHash('sha256').update(bytes).digest('hex')};
 }catch{invalid();}
}
