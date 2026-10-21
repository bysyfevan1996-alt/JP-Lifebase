import test from 'node:test';
import assert from 'node:assert/strict';
import {bindReplyViewport} from '../dist/reply-viewport.js';

function surface(viewport={height:500,offsetTop:30,scale:1}){
 const target=()=>({listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name,fn){assert.equal(this.listeners.get(name),fn);this.listeners.delete(name);},emit(name){this.listeners.get(name)?.();}});
 const frames=new Map(),styles=new Map([['color','red']]);let sequence=0;
 const view=Object.assign(target(),{innerHeight:844,visualViewport:viewport&&Object.assign(target(),viewport),requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence;},cancelAnimationFrame(id){frames.delete(id);}});
 const element={style:{setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key)}};
 return {view,element,styles,frames,flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};
}
test('mobile writing tracks visible keyboard viewport synchronously and coalesces updates',()=>{
 const s=surface(),destroy=bindReplyViewport(s);assert.equal(s.styles.get('--reply-viewport-height'),'500px');assert.equal(s.styles.get('--reply-viewport-top'),'30px');
 s.view.visualViewport.height=330;s.view.visualViewport.offsetTop=80;s.view.visualViewport.emit('resize');s.view.visualViewport.emit('scroll');s.view.emit('resize');assert.equal(s.frames.size,1);s.flush();assert.equal(s.styles.get('--reply-viewport-height'),'330px');assert.equal(s.styles.get('--reply-viewport-top'),'80px');assert.equal(s.styles.get('color'),'red');destroy();
});
test('missing viewport, pinch zoom and invalid metrics use bounded window fallback',()=>{
 const s=surface(null),cleanup=bindReplyViewport(s);assert.equal(s.styles.get('--reply-viewport-height'),'844px');assert.equal(s.styles.get('--reply-viewport-top'),'0px');cleanup();
 const zoom=surface({height:200,offsetTop:100,scale:2}),end=bindReplyViewport(zoom);assert.equal(zoom.styles.get('--reply-viewport-height'),'844px');assert.equal(zoom.styles.get('--reply-viewport-top'),'0px');
 zoom.view.innerHeight=NaN;zoom.view.visualViewport.scale=1;zoom.view.visualViewport.height=NaN;zoom.view.emit('resize');zoom.flush();assert.equal(zoom.styles.get('--reply-viewport-height'),'1px');
 zoom.view.visualViewport.height=300;zoom.view.visualViewport.offsetTop=-12;zoom.view.emit('resize');zoom.flush();assert.equal(zoom.styles.get('--reply-viewport-top'),'0px');end();
});
test('leaving full-screen cancels pending work, removes listeners and never restores stale geometry',()=>{
 const s=surface(),destroy=bindReplyViewport(s);s.view.emit('resize');const late=[...s.frames.values()][0];destroy();destroy();assert.equal(s.frames.size,0);assert.equal(s.view.listeners.size,0);assert.equal(s.view.visualViewport.listeners.size,0);late();assert.equal(s.styles.has('--reply-viewport-height'),false);assert.equal(s.styles.has('--reply-viewport-top'),false);assert.equal(s.styles.get('color'),'red');
});
