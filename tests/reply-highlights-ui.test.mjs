import test from 'node:test';
import assert from 'node:assert/strict';
import {Element} from './helpers/mobile-dom.mjs';
import {createReplyHighlights} from '../dist/reply-highlights.js';

test('featured replies move original nodes once, preserve handlers/floors, and restore ordinary order after answer changes',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 globalThis.document={createElement:tag=>new Element(tag)};
 try{
  const root=new Element('main'),list=new Element('div');list.className='reply-posts';root.append(list);
  const rows=['a','b','c','d'].map((id,i)=>{const node=new Element('article');node.className='post';node.dataset.postId=id;node.dataset.floor=String(i+2);list.append(node);return node;});
  let clicked=0;rows[2].onclick=()=>clicked++;
  const featured=[{id:'d',featured:'answer'},{id:'c',featured:'hot'}];
  const controller=createReplyHighlights({root,featured,t:key=>key});
  const ids=()=>list.children.map(node=>node.dataset.postId);
  assert.deepEqual(ids(),['d','c','a','b']);assert.equal(new Set(list.children).size,4);
  assert.equal(rows[3].dataset.floor,'5');rows[2].click();assert.equal(clicked,1);
  controller.setAnswer('b');assert.deepEqual(ids(),['b','c','a','d']);
  assert.equal(rows[3].querySelector('.featured-reply-label'),null);
  assert.equal(rows[1].querySelector('.featured-reply-label').textContent,'readingPinnedAnswer');
  controller.setAnswer('c');assert.deepEqual(ids(),['c','a','b','d']);assert.equal(rows[2].dataset.featured,'answer');
  controller.setAnswer(null);assert.deepEqual(ids(),['c','a','b','d']);assert.equal(rows[2].dataset.featured,'hot');
  assert.equal(list.children[0],rows[2]);assert.equal(root.querySelectorAll('.featured-reply-label').length,1);
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
});
