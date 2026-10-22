import test from 'node:test';
import assert from 'node:assert/strict';
import {profilePayload} from '../dist/profile-payload.js';
test('profile payload whitelists fields, binds owner and suppresses activity for private profiles',()=>{
 const draft=Object.freeze({name:' Alice ',bio:'Bio',location:'Tokyo',website:'',publicEnabled:false,showActivity:true,updatedAt:'old',role:'admin'});
 assert.deepEqual(profilePayload(draft,'Alice','owner'),{expectedUserId:'owner',bio:'Bio',location:'Tokyo',website:'',publicEnabled:false,showActivity:false});
 assert.equal(draft.showActivity,true);
 assert.equal(profilePayload({...draft,name:' New name ',publicEnabled:true},'Alice','owner').name,'New name');
 assert.equal(profilePayload({...draft,name:undefined},'Alice','owner').name,undefined);
});
