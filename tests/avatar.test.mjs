import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {crc32,deflateSync} from 'node:zlib';
import {decodeAvatar,defaultAvatar,avatarUrl} from '../avatar.mjs';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type,data=Buffer.alloc(0)){
 const bytes=Buffer.alloc(data.length+12);
 bytes.writeUInt32BE(data.length,0);Buffer.from(type,'latin1').copy(bytes,4);data.copy(bytes,8);
 bytes.writeUInt32BE(crc32(bytes.subarray(4,bytes.length-4)),bytes.length-4);
 return bytes;
}
function header({width=1,height=1,depth=8,color=6,compression=0,filter=0,interlace=0}={}){
 const b=Buffer.alloc(13);b.writeUInt32BE(width,0);b.writeUInt32BE(height,4);
 b[8]=depth;b[9]=color;b[10]=compression;b[11]=filter;b[12]=interlace;return b;
}
const assemble=chunks=>Buffer.concat([signature,...chunks]);
function png({width=1,height=1,color=6,raw,compressed,metadata=[],parts,...options}={}){
 const channels=color===2?3:4,stream=compressed??deflateSync(raw??Buffer.alloc((width*channels+1)*height));
 return assemble([chunk('IHDR',header({width,height,color,...options})),...metadata,...(parts??[stream]).map(x=>chunk('IDAT',x)),chunk('IEND')]);
}
const url=bytes=>'data:image/png;base64,'+bytes.toString('base64');
const rejects=(value,label)=>assert.throws(()=>decodeAvatar(value),e=>e.status===400&&e.code==='invalid_avatar',label);

test('nickname avatars preserve visible Unicode graphemes and stable normalized colors',()=>{
 const cases=[['  中文  ','中'],['田中','田'],['🇯🇵abc','🇯🇵'],['👨‍👩‍👧‍👦x','👨‍👩‍👧‍👦'],['👩🏽‍💻x','👩🏽‍💻'],['e\u0301','é'],['\u200b\u200d田中','田'],['\u0001\ufe0f田中','田'],['','?'],[' \t\n ','?'],['\u200b\u200d\ufe0f','?']];
 for(const [name,initial]of cases){const value=defaultAvatar(name);assert.equal(value.avatar,initial,name);assert.equal(value.tone,createHash('sha256').update(name.trim().normalize('NFC')).digest()[0]%8);assert(Number.isInteger(value.tone)&&value.tone>=0&&value.tone<8);assert.deepEqual(value,defaultAvatar(name));}
 assert.deepEqual(defaultAvatar('é'),defaultAvatar('e\u0301'));assert.deepEqual(defaultAvatar(null),defaultAvatar(''));
});

test('avatar URLs use only exact lowercase hashes and escaped identifiers',()=>{
 const hash='a1'.repeat(32);assert.equal(avatarUrl('id/with space',hash),'/api/avatars/id%2Fwith%20space/'+hash);
 for(const value of [undefined,null,'',hash.slice(1),hash+'a',hash.toUpperCase(),'g'.repeat(64),hash+'\n',hash+'\r',hash.slice(0,-1)+'\n','https://example.test/a'])assert.equal(avatarUrl('id',value),null);
 for(const id of [undefined,null,0,'',' \t ','\ud800'])assert.equal(avatarUrl(id,hash),null);
});

test('real RGB/RGBA PNGs, contiguous IDAT and maximum dimensions are accepted',()=>{
 assert.equal(decodeAvatar(null),null);assert.equal(decodeAvatar(undefined),null);
 for(const color of [2,6]){
  const bytes=png({color}),result=decodeAvatar(url(bytes));assert.deepEqual(result.bytes,bytes);assert.equal(result.hash,createHash('sha256').update(bytes).digest('hex'));
  const max=png({width:256,height:256,color});assert(decodeAvatar(url(max)).bytes.equals(max));
 }
 const compressed=deflateSync(Buffer.from([0,1,2,3,255]));
 const split=png({parts:[compressed.subarray(0,2),Buffer.alloc(0),compressed.subarray(2)]});assert(decodeAvatar(url(split)).bytes.equals(split));
 for(let filter=0;filter<=4;filter++)assert(decodeAvatar(url(png({raw:Buffer.from([filter,0,0,0,0])}))));
});

test('fixed optional PNG metadata is accepted before image data',()=>{
 const gamma=Buffer.alloc(4);gamma.writeUInt32BE(45455);const density=Buffer.alloc(9);density.writeUInt32BE(3780,0);density.writeUInt32BE(3780,4);density[8]=1;
 const chromaticity=Buffer.alloc(32);[31270,32900,64000,33000,30000,60000,15000,6000].forEach((v,i)=>chromaticity.writeUInt32BE(v,i*4));
 const bytes=png({metadata:[chunk('sRGB',Buffer.from([0])),chunk('gAMA',gamma),chunk('cHRM',chromaticity),chunk('pHYs',density)]});assert.deepEqual(decodeAvatar(url(bytes)).bytes,bytes);
});

test('only exact canonical PNG data URLs within 90KiB are accepted',()=>{
 const good=url(png());
 for(const value of [0,false,{},[],Buffer.alloc(2),'','https://example.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,AAAA',good.replace('image/png','IMAGE/PNG'),good+'\n',good+' ',good.replace(';base64,',';base64, '),good.replace(';base64,',';base64,\n'),good+'=',good.replace('base64,','base64,-'),good.slice(0,-1)])rejects(value);
 rejects(url(Buffer.alloc(90*1024+1)));rejects('data:image/png;base64,'+'A'.repeat(Math.ceil(90*1024/3)*4+4));
});

test('PNG boundaries, checksums and required chunks cannot be bypassed',()=>{
 const bytes=png(),badSignature=Buffer.from(bytes);badSignature[0]=0;rejects(url(badSignature));
 const badCrc=Buffer.from(bytes);badCrc[badCrc.length-1]^=1;rejects(url(badCrc));
 for(const length of [0,7,8,12,24,bytes.length-1])rejects(url(bytes.subarray(0,length)));
 rejects(url(Buffer.concat([bytes,Buffer.from([0])])));
 const hugeLength=Buffer.from(bytes);hugeLength.writeUInt32BE(0xffffffff,8);rejects(url(hugeLength));
 const image=chunk('IDAT',deflateSync(Buffer.alloc(5))),end=chunk('IEND'),hdr=chunk('IHDR',header());
 for(const chunks of [[image,end],[hdr,end],[hdr,image],[hdr,hdr,image,end],[hdr,image,chunk('IEND',Buffer.from([0]))],[hdr,image,end,end],[hdr,chunk('IDAT'),end],[chunk('IHDR',header().subarray(0,12)),image,end]])rejects(url(assemble(chunks)));
});

test('PNG dimensions and pixel format stay within the canvas upload contract',()=>{
 for(const options of [{width:0},{height:0},{width:257},{height:257},{depth:16},{color:0},{color:3},{color:4},{interlace:1},{compression:1},{filter:1}])rejects(url(png(options)),JSON.stringify(options));
});

test('animation, unknown chunks, invalid type bytes and compressed metadata are rejected',()=>{
 for(const type of ['acTL','fcTL','fdAT','iCCP','zTXt','iTXt','PLTE','ABCD','tEXt','texT','t1Xt'])rejects(url(png({metadata:[chunk(type,Buffer.alloc(8))]})),type);
 rejects(url(assemble([chunk('\u00c9HDR',header()),chunk('IDAT',deflateSync(Buffer.alloc(5))),chunk('IEND')])));
 const compressed=deflateSync(Buffer.alloc(5));
 rejects(url(assemble([chunk('IHDR',header()),chunk('IDAT',compressed.subarray(0,2)),chunk('sRGB',Buffer.from([0])),chunk('IDAT',compressed.subarray(2)),chunk('IEND')])));
 rejects(url(png({metadata:[chunk('sRGB',Buffer.from([0])),chunk('sRGB',Buffer.from([0]))]})));
 for(const [type,length]of [['sRGB',0],['gAMA',3],['cHRM',31],['pHYs',8]])rejects(url(png({metadata:[chunk(type,Buffer.alloc(length))]})));
 rejects(url(png({metadata:[chunk('sRGB',Buffer.from([4]))]})));rejects(url(png({metadata:[chunk('gAMA',Buffer.alloc(4))]})));
 const density=Buffer.alloc(9);density[8]=2;rejects(url(png({metadata:[chunk('pHYs',density)]})));
});

test('zlib is bounded to the declared scanlines and consumes every compressed byte',()=>{
 for(const raw of [Buffer.alloc(4),Buffer.alloc(6),Buffer.alloc(1024*1024),Buffer.from([5,0,0,0,0])])rejects(url(png({raw})));
 const stream=deflateSync(Buffer.alloc(5));
 for(const compressed of [Buffer.alloc(0),Buffer.from([1,2,3]),stream.subarray(0,stream.length-1),Buffer.concat([stream,Buffer.from([0])]),Buffer.concat([stream,stream])])rejects(url(png({compressed})));
 const raw=Buffer.alloc((2*4+1)*2);raw[9]=5;rejects(url(png({width:2,height:2,raw})));
 const tooManyParts=Array.from({length:1023},()=>Buffer.alloc(0));tooManyParts.push(stream);rejects(url(png({parts:tooManyParts})));
});
