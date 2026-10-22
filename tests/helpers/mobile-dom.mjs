export class Element extends EventTarget{
 constructor(tag){super();this.tagName=tag;this.children=[];this.parentNode=null;this.dataset={};const values=new Map();this.style={setProperty:(k,v)=>values.set(k,String(v)),getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',removeProperty:k=>values.delete(k)};this.attributes=new Map();this.hidden=false;this.disabled=false;this.open=false;this.className='';this.classList={contains:key=>this.className.split(' ').includes(key),add:key=>this.classList.toggle(key,true),remove:key=>this.classList.toggle(key,false),toggle:(key,force)=>{const values=new Set(this.className.split(' ').filter(Boolean)),on=force??!values.has(key);if(on)values.add(key);else values.delete(key);this.className=[...values].join(' ');return on;}};}
 get isConnected(){return this.tagName==='body'||!!this.parentNode?.isConnected;}
 append(...nodes){for(const node of nodes){node.remove();this.children.push(node);node.parentNode=this;}}
 prepend(...nodes){for(const node of nodes.reverse()){node.remove();this.children.unshift(node);node.parentNode=this;}}
 before(node){const parent=this.parentNode;node.remove();parent.children.splice(parent.children.indexOf(this),0,node);node.parentNode=parent;}
 after(node){const parent=this.parentNode;node.remove();parent.children.splice(parent.children.indexOf(this)+1,0,node);node.parentNode=parent;}
 replaceWith(node){this.before(node);this.remove();}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)??null;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){return this.children.flatMap(node=>[...(selector.startsWith('.')?node.classList.contains(selector.slice(1)):selector.startsWith('#')?node.getAttribute('id')===selector.slice(1):selector.startsWith('[')?node.attributes.has(selector.slice(1,-1)):selector.startsWith('label[')?node.tagName==='label'&&node.getAttribute('for')==='reply-text':node.tagName===selector)?[node]:[],...node.querySelectorAll(selector)]);}
 getBoundingClientRect(){return {top:0,bottom:this.bottom??100,left:0,right:390};}
 click(){if(!this.disabled)this.onclick?.();}
 focus(){document.activeElement=this;}
 blur(){if(document.activeElement===this)document.activeElement=null;}
 setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}
 replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
}
