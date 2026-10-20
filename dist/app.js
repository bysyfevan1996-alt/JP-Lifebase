import {categories,avatarColors,topics as seedTopics} from './topics.js';
import {selectTopics} from './select-topics.js';

const icons={
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',sliders:'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3z"/>',messages:'<path d="M4 4h13v10H9l-5 4V4Z"/><path d="M17 8h4v13l-5-4h-4v-3"/>',message:'<path d="M4 4h16v12H9l-5 4V4Z"/>',book:'<path d="M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V4Z"/><path d="M12 6v15"/>',flame:'<path d="M12 3c1 5 6 5 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 3 2 4 2 4s3-3 1-9Z"/>',bookmark:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',zap:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>', 'check-square':'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>', 'chevron-down':'<path d="m6 9 6 6 6-6"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',plus:'<path d="M12 5v14M5 12h14"/>',pin:'<path d="m8 3 8 0-1 6 3 3v2H6v-2l3-3-1-6ZM12 14v7"/>',reply:'<path d="m9 5-6 6 6 6v-4c6 0 9 2 12 6-1-8-5-10-12-10V5Z"/>','arrow-left':'<path d="m10 5-7 7 7 7M3 12h18"/>','arrow-up':'<path d="m6 10 6-6 6 6M12 4v16"/>',heart:'<path d="M20 5c-3-3-6-1-8 1C10 4 7 2 4 5c-4 4 1 9 8 15 7-6 12-11 8-15Z"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.message}</svg>`;
const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={category:'all',query:'',sort:'latest',limit:12,unanswered:false,showBanner:true,user:null,topicId:null,scrollY:0};
const topics=structuredClone(seedTopics).map(t=>({...t,initialReplies:t.replies}));
let quote=null,toastTimer=null;
let savedIds=new Set();
const svgInit=(parent=document)=>parent.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
const avatar=t=>{const [bg,fg]=avatarColors[t.tone%avatarColors.length];return `<span class="avatar" style="--av-bg:${bg};--av-fg:${fg}" aria-hidden="true">${escape(t.avatar)}</span>`;};
const categoryTag=id=>{const c=categories[id];return `<button class="category-tag" data-category="${id}" style="--cat:${c.color};--tag-bg:${c.bg};--tag-fg:${c.fg}" aria-label="筛选${c.label}"><span class="category-marker"></span>${c.label}</button>`;};
const relative=minutes=>minutes===0?'刚刚':minutes<60?`${minutes} 分钟前`:minutes<1440?`${Math.floor(minutes/60)} 小时前`:`${Math.floor(minutes/1440)} 天前`;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800);}
function syncSidebar(){const hidden=matchMedia('(max-width:760px)').matches?!document.body.classList.contains('drawer-open'):document.body.classList.contains('nav-collapsed');$('#sidebar').inert=hidden;$('#sidebar').setAttribute('aria-hidden',String(hidden));}
function closeDrawer(){document.body.classList.remove('drawer-open');syncSidebar();$('#drawer-shade').hidden=true;$('#menu-toggle').setAttribute('aria-expanded',String(!matchMedia('(max-width:760px)').matches&&!document.body.classList.contains('nav-collapsed')));}
function closeFilter(){$('#filter-popover').hidden=true;$('#filter-toggle').setAttribute('aria-expanded','false');}
function bindCategories(parent){parent.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>setCategory(b.dataset.category)));}
function setCategory(category){state.category=category;state.limit=12;state.unanswered=false;state.scrollY=0;closeDrawer();showList(false);renderList();window.scrollTo({top:0});}
function renderList(){
 const filtered=state.unanswered?topics.filter(t=>t.replies===0):topics;
 const result=selectTopics(filtered,state);
 $('#topic-list').replaceChildren(...result.items.map(t=>{
  const card=document.createElement('article');card.className=`topic-card${t.pinned?' pinned':''}`;
  card.innerHTML=`${avatar(t)}<div class="topic-content"><button class="topic-title" data-topic="${t.id}">${t.pinned?icon('pin'):''}<span>${escape(t.title)}</span></button><div class="topic-meta">${categoryTag(t.category)}<span class="reply-count" aria-label="${t.replies} 条回复">${icon('reply')}${t.replies}</span><span class="meta-author">${escape(t.author)}</span><span class="meta-separator">·</span><time class="meta-time">${relative(t.minutes)}</time></div>${t.pinned?`<p class="topic-excerpt">${escape(t.excerpt)}</p><span class="pinned-badge">${icon('pin')}已置顶</span>`:''}</div>`;
  card.querySelector('[data-topic]').addEventListener('click',()=>openTopic(t.id));bindCategories(card);return card;
 }));
 if(!result.total)$('#topic-list').innerHTML='<div class="empty-state"><strong>没有找到相关讨论</strong>换一个关键词，或清除当前分类筛选。</div>';
 $('#load-more').hidden=!result.hasMore;$('#end-note').hidden=result.hasMore||!result.total;
 const hasFilters=state.query||state.category!=='all'||state.unanswered;
 $('#results-context').hidden=!hasFilters;
 $('#results-label').textContent=[state.category!=='all'?categories[state.category].label:'',state.query?`“${state.query}”`:'',state.unanswered?'待回复':'',`${result.total} 个话题`].filter(Boolean).join(' · ');
 $('#announcement').hidden=!state.showBanner||!!hasFilters;
 $('#banner-toggle').checked=state.showBanner;$('#category-select').value=state.category;
 document.querySelectorAll('[data-sort]').forEach(b=>{const active=b.dataset.sort===state.sort;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 document.querySelectorAll('#sidebar [data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category));
 $('[data-view="all"]').classList.toggle('active',state.category==='all'&&!state.unanswered);
 document.title=`${hasFilters?'筛选讨论':'社区'} · Japan Life Base`;
}
function showList(restoreScroll=true){$('#list-view').hidden=false;$('#detail-view').hidden=true;state.topicId=null;quote=null;renderList();if(restoreScroll)window.scrollTo({top:state.scrollY});}
function openTopic(id){state.scrollY=window.scrollY;state.topicId=id;quote=null;$('#list-view').hidden=true;$('#detail-view').hidden=false;closeFilter();renderDetail();window.scrollTo({top:0});}
function renderDetail(){
 const t=topics.find(t=>t.id===state.topicId);if(!t){showList();return;}
 const local=t.localReplies||[],samples=t.sampleReplies||[{author:'Yuki',avatar:'Y',tone:2,body:'这个话题我也在关注，想听听大家的实际经验。'}];
 const shown=t.initialReplies>0?samples:[];
 const replies=[...shown,...local];
 $('#topic-detail').innerHTML=`<h1 class="detail-heading">${escape(t.title)}</h1><div class="detail-summary">${categoryTag(t.category)}<span>${t.replies} 条回复</span><span>${relative(t.minutes)}有更新</span></div><div class="posts"></div>${t.replies>replies.length?`<p class="form-note">本设计预览仅展示 ${replies.length} 条示例回复，列表中的回复数量为演示数据。</p>`:''}<div class="detail-controls"><button class="new-topic" id="save-topic">${icon('bookmark')}${savedIds.has(t.id)?'已收藏':'收藏主题'}</button></div><section class="reply-editor"><label for="reply-text">回复主题</label><blockquote id="reply-quote" class="quote" hidden></blockquote><textarea id="reply-text" placeholder="写下你的回复…" maxlength="3000"></textarea><div class="editor-actions"><button class="dark-button" id="send-reply">发表回复</button><small>演示内容仅在当前页面内显示。</small></div><p class="form-error" id="reply-error" hidden></p></section><footer class="detail-footer">示例讨论 · 分享经验时请说明地区与适用时间</footer>`;
 const posts=[{author:t.author,avatar:t.avatar,tone:t.tone,body:t.body,first:true},...replies];
 $('.posts').replaceChildren(...posts.map((p,i)=>{
  const el=document.createElement('article');el.className='post';el.innerHTML=`${avatar(p)}<div><div class="post-header"><strong>${escape(p.author)}</strong>${p.first?'<span class="post-role">楼主</span>':''}<time>${i===0?'昨天 20:16':p.local?'刚刚':`${i*12} 分钟前`} · #${i+1}</time></div>${p.quote?`<blockquote class="quote">${escape(p.quote)}</blockquote>`:''}<div class="post-body">${escape(p.body)}</div><div class="post-tools"><button class="like-post" aria-label="赞同 ${escape(p.author)} 的发言" aria-pressed="false">${icon('heart')}<span>0</span></button><button class="quote-post">${icon('reply')}回复</button></div></div>`;
  el.querySelector('.like-post').addEventListener('click',e=>{const b=e.currentTarget,liked=b.getAttribute('aria-pressed')==='true';b.setAttribute('aria-pressed',String(!liked));b.querySelector('span').textContent=liked?'0':'1';});
  el.querySelector('.quote-post').addEventListener('click',()=>{quote=`${p.author}：${p.body}`;$('#reply-quote').textContent=quote;$('#reply-quote').hidden=false;$('#reply-text').focus();});return el;
 }));
 bindCategories($('#topic-detail'));
 $('#save-topic').addEventListener('click',()=>{if(savedIds.has(t.id))savedIds.delete(t.id);else savedIds.add(t.id);$('#save-topic').innerHTML=icon('bookmark')+(savedIds.has(t.id)?'已收藏':'收藏主题');});
 $('#send-reply').addEventListener('click',()=>{const text=$('#reply-text').value.trim();$('#reply-error').hidden=!!text;if(!text){$('#reply-error').textContent='请先写下回复内容。';return;}if(!state.user){openAuth('login',()=>{toast('已进入演示账号，可以发表回复。');});return;}const reply={author:state.user,avatar:'叶',tone:0,body:text,quote,local:true};t.localReplies??=[];t.localReplies.push(reply);t.replies++;t.minutes=0;quote=null;renderDetail();toast('回复已加入当前页面，没有公开发布。');});
 document.title=`${t.title} · Japan Life Base`;
}
const dialog=$('#site-dialog');
function openDialog(title,html){$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;svgInit($('#dialog-body'));closeFilter();closeDrawer();if(!dialog.open)dialog.showModal();}
function openAuth(mode,after){openDialog(mode==='register'?'加入 Japan Life Base':'登录 Japan Life Base',`<div class="dialog-copy"><p>参与讨论、分享生活经验、收藏你关心的话题。</p></div><p class="form-note">当前为界面演示，暂未连接真实账号服务。</p><button class="dark-button" id="demo-login">使用演示账号继续</button>`);$('#demo-login').addEventListener('click',()=>{state.user='访客小叶';dialog.close();document.querySelector('.account-actions').innerHTML='<button class="pill" id="my-account">小叶</button>';$('#my-account').addEventListener('click',()=>toast('当前使用演示账号「访客小叶」。'));if(after)after();else toast('已进入演示账号。');});}
function openComposer(){openDialog('发表主题',`<label class="form-field">标题<input id="compose-title" placeholder="你想讨论什么？" maxlength="100"></label><label class="form-field">分类<select id="compose-category">${Object.entries(categories).filter(([id])=>id!=='site').map(([id,c])=>`<option value="${id}" ${state.category===id?'selected':''}>${c.label}</option>`).join('')}</select></label><label class="form-field">正文<textarea id="compose-body" placeholder="分享你的经历，或把问题说清楚。" maxlength="5000"></textarea></label><p class="form-note">只在当前预览中模拟发表，不会公开发布。</p><p class="form-error" id="compose-error" hidden></p><button class="dark-button" id="publish-topic">发表主题</button>`);$('#publish-topic').addEventListener('click',()=>{const title=$('#compose-title').value.trim(),body=$('#compose-body').value.trim();if(!title||!body){$('#compose-error').textContent='请填写标题和正文。';$('#compose-error').hidden=false;return;}const t={id:'local-'+Date.now(),title,body,excerpt:body,category:$('#compose-category').value,author:state.user,avatar:'叶',tone:0,replies:0,minutes:0};topics.push(t);dialog.close();openTopic(t.id);toast('主题已在当前预览中生成，没有公开发布。');});}
const info={
 about:['关于 Japan Life Base','<p>这是一个面向在日外国人的生活讨论社区。大家可以交流住房、账单、签证、工作、出行和日常经验。</p><p>当前页面是首页设计预览，帖子、账号和回复数均为示例。</p>'],
 guide:['使用指南','<p>点击话题阅读讨论；点击分类缩小范围。可以组合关键词与分类搜索，用“热门”查看回复较多的主题。</p><p>发帖和回复可用演示账号体验，内容不会公开发布。</p>'],
 guides:['生活指南','<p>社区中的优质经验会在这里按主题整理，保留原讨论入口和资料来源。</p><p>先从住房、搬家和账单讨论开始。</p>'],
 denki:['电费比较','<p>电费工具将支持按账单期间比较套餐，展开费用拆分和官方价格来源。</p><p>本轮先完成社区首页，工具可从侧栏进入。相关讨论可以通过搜索“电费”查看。</p>'],
 checklist:['搬家清单','<p>搬家前：整理物品、确认退租与搬家安排。</p><p>搬家后：按当地机构要求核对地址变更、生活服务和必要文件。</p><p>当前为工具入口预览，具体事项与期限需按实际情况确认。</p>']
};
function openInfo(id){if(id==='saved'){const saved=topics.filter(t=>savedIds.has(t.id));openDialog('我的收藏',saved.length?saved.map(t=>`<p style="margin:12px 0"><button class="plain-button" data-saved="${t.id}">${escape(t.title)}</button></p>`).join(''):'<p class="dialog-copy">还没有收藏的话题。打开一个主题，点击“收藏主题”试试。</p>');$('#dialog-body').querySelectorAll('[data-saved]').forEach(b=>b.addEventListener('click',()=>{dialog.close();openTopic(b.dataset.saved);}));return;}const [title,body]=info[id]||info.about;openDialog(title,`<div class="dialog-copy">${body}</div>`);}
$('#menu-toggle').addEventListener('click',()=>{if(matchMedia('(max-width:760px)').matches){const open=document.body.classList.toggle('drawer-open');$('#drawer-shade').hidden=!open;$('#menu-toggle').setAttribute('aria-expanded',String(open));syncSidebar();}else{const collapsed=document.body.classList.toggle('nav-collapsed');$('#menu-toggle').setAttribute('aria-expanded',String(!collapsed));syncSidebar();}});
$('#drawer-shade').addEventListener('click',closeDrawer);
document.querySelectorAll('.section-toggle').forEach(b=>b.addEventListener('click',()=>{const open=b.getAttribute('aria-expanded')==='true';b.setAttribute('aria-expanded',String(!open));document.getElementById(b.getAttribute('aria-controls')).hidden=open;}));
$('#category-links').innerHTML=Object.entries(categories).map(([id,c])=>`<button class="side-link" data-category="${id}"><span class="category-marker" style="--cat:${c.color}"></span>${c.label}</button>`).join('');
$('#category-select').insertAdjacentHTML('beforeend',Object.entries(categories).map(([id,c])=>`<option value="${id}">${c.label}</option>`).join(''));bindCategories($('#sidebar'));
document.querySelectorAll('[data-info]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();openInfo(b.dataset.info);}));
document.querySelectorAll('[data-auth]').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.auth)));
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{state.sort=b.dataset.sort;state.limit=12;state.unanswered=false;renderList();}));
document.querySelectorAll('[data-filter-shortcut]').forEach(b=>b.addEventListener('click',()=>{state.sort=b.dataset.filterShortcut==='popular'?'popular':'latest';state.unanswered=b.dataset.filterShortcut==='unanswered';state.limit=12;closeDrawer();showList(false);window.scrollTo({top:0});}));
$('[data-view="all"]').addEventListener('click',()=>{state.query='';$('#search-input').value='';state.sort='latest';setCategory('all');});
$('.brand').addEventListener('click',e=>{e.preventDefault();state.query='';state.sort='latest';$('#search-input').value='';setCategory('all');});
$('#search-form').addEventListener('submit',e=>{e.preventDefault();$('#search-input').blur();closeFilter();});
$('#search-input').addEventListener('input',e=>{state.query=e.target.value.trim();state.limit=12;state.scrollY=0;showList(false);});
$('#filter-toggle').addEventListener('click',()=>{const open=$('#filter-popover').hidden;$('#filter-popover').hidden=!open;$('#filter-toggle').setAttribute('aria-expanded',String(open));});
$('#category-select').addEventListener('change',e=>setCategory(e.target.value));
$('#banner-toggle').addEventListener('change',e=>{state.showBanner=e.target.checked;renderList();});
$('#banner-close').addEventListener('click',()=>{state.showBanner=false;renderList();});
function reset(){state.category='all';state.query='';state.unanswered=false;state.limit=12;$('#search-input').value='';renderList();}
$('#clear-filters').addEventListener('click',reset);$('#reset-list').addEventListener('click',reset);
$('#load-more').addEventListener('click',()=>{state.limit+=6;renderList();});
$('#banner-topic').addEventListener('click',()=>openTopic('electricity'));
$('#side-promo').addEventListener('click',()=>{state.user?openComposer():openAuth('register',openComposer);});
$('#new-topic').addEventListener('click',()=>{state.user?openComposer():openAuth('login',openComposer);});
$('#back-to-list').addEventListener('click',()=>{quote=null;showList();});
$('#dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function toggleAssistant(open){$('#assistant-panel').hidden=!open;$('#assistant-launcher').setAttribute('aria-expanded',String(open));if(open)$('#chat-input').focus();}
$('#assistant-launcher').addEventListener('click',()=>toggleAssistant($('#assistant-panel').hidden));$('#assistant-close').addEventListener('click',()=>toggleAssistant(false));
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();const q=$('#chat-input').value.trim();if(!q)return;const mine=document.createElement('div');mine.className='chat-bubble mine';mine.textContent=q;$('#chat-messages').append(mine);$('#chat-input').value='';const found=topics.filter(t=>(t.title+t.excerpt+t.body).includes(q)||['电费','租房','搬家'].some(word=>q.includes(word)&&(t.title+t.excerpt+t.body).includes(word))).slice(0,3);const answer=document.createElement('div');answer.className='chat-bubble';answer.textContent=found.length?'找到这些相关的社区讨论：':'这是助手的交互演示。你可以用顶部搜索框查找关键词，或发帖向社区成员提问。';found.forEach(t=>{const b=document.createElement('button');b.textContent=t.title;b.addEventListener('click',()=>{toggleAssistant(false);openTopic(t.id);});answer.append(b);});$('#chat-messages').append(answer);$('#chat-messages').scrollTop=$('#chat-messages').scrollHeight;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeFilter();toggleAssistant(false);}});
document.addEventListener('click',e=>{if(!$('#filter-popover').hidden&&!$('#filter-popover').contains(e.target)&&!$('#filter-toggle').contains(e.target))closeFilter();});
matchMedia('(max-width:760px)').addEventListener('change',()=>{closeDrawer();closeFilter();});
svgInit();closeDrawer();renderList();
