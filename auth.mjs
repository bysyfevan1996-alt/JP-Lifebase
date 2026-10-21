import {randomBytes,randomUUID,randomInt,scrypt as scryptCallback,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createMailer} from './mailer.mjs';
import {decodeAvatar,defaultAvatar,avatarUrl} from './avatar.mjs';

const scrypt=promisify(scryptCallback),digest=value=>createHash('sha256').update(value).digest('hex');
const error=(status,code,extra={})=>Object.assign(new Error(code),{status,code,...extra});
const now=()=>Date.now(),iso=()=>new Date().toISOString();
const CODE_LIFE=600000,GRANT_LIFE=900000,COOLDOWN=180000;
export function migrateAuth(db){
 const columns=new Set(db.prepare('PRAGMA table_info(users)').all().map(c=>c.name));
 for(const [name,type] of Object.entries({email_verified_at:'TEXT',legacy_account:'INTEGER NOT NULL DEFAULT 1',password_version:'INTEGER NOT NULL DEFAULT 1',avatar_data:'BLOB',avatar_hash:'TEXT'}))if(!columns.has(name))db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
 db.exec(`CREATE TABLE IF NOT EXISTS auth_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,purpose TEXT NOT NULL,user_id TEXT,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,resend_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 1,language TEXT NOT NULL DEFAULT 'en');
 CREATE INDEX IF NOT EXISTS auth_challenge_email ON auth_challenges(email,purpose);
 CREATE TABLE IF NOT EXISTS auth_flows(token_hash TEXT PRIMARY KEY,challenge_id TEXT NOT NULL,step TEXT NOT NULL DEFAULT 'code',expires INTEGER NOT NULL,grant_expires INTEGER);
 CREATE TABLE IF NOT EXISTS auth_send_state(scope TEXT PRIMARY KEY,resend_at INTEGER NOT NULL DEFAULT 0,lock_until INTEGER NOT NULL DEFAULT 0,lock_token TEXT);
 CREATE TABLE IF NOT EXISTS auth_mail_usage(id TEXT PRIMARY KEY,email_hash TEXT NOT NULL,ip_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS auth_mail_usage_time ON auth_mail_usage(created_at);`);
 if(!db.prepare('PRAGMA table_info(auth_challenges)').all().some(c=>c.name==='language'))db.exec("ALTER TABLE auth_challenges ADD COLUMN language TEXT NOT NULL DEFAULT 'en'");
}
export async function createAuth({db,dataDir,secure,body,json,language,limit,text,mailer:mailClient,migrate=true}){
 if(migrate)migrateAuth(db);const q=sql=>db.prepare(sql),mailer=mailClient||createMailer({dataDir});
 let secret=process.env.AUTH_TOKEN_SECRET;
 if(!secret){
  const filename=path.join(dataDir,'auth-token-secret');
  try{secret=(await readFile(filename,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;secret=randomBytes(32).toString('hex');try{await writeFile(filename,secret,{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;secret=(await readFile(filename,'utf8')).trim();}}
 }
 if(secret.length<32)throw new Error('AUTH_TOKEN_SECRET must contain at least 32 characters');
 function tx(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;
 function token(req,name){const result=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);return /^[a-f0-9]{64}$/.test(result||'')?result:null;}
 function publicUser(row){return row?{id:row.id,name:row.name,email:row.email,role:row.role,banned:!!row.banned,muted:!!row.muted,emailVerified:!!row.email_verified_at,legacyAccount:!!row.legacy_account,avatarUrl:avatarUrl(row.id,row.avatar_hash),...defaultAvatar(row.name)}:null;}
 function session(req){
  const t=token(req,'jpl_session'),row=t?q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(digest(t),now())||null:null;
  if(row?.banned){q('DELETE FROM sessions WHERE user_id=?').run(row.id);throw error(403,'account_banned');}return row;
 }
 function sessionCookie(user){
  const current=q('SELECT * FROM users WHERE id=?').get(user.id);if(!current)throw error(401,'invalid_credentials');if(current.banned)throw error(403,'account_banned');
  const t=randomBytes(32).toString('hex');q('DELETE FROM sessions WHERE expires<?').run(now());q('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(digest(t),current.id,now()+604800000);return cookie('jpl_session',t,604800);
 }
 function flow(req){const t=token(req,'jpl_auth');if(!t)return null;return q('SELECT f.*,c.id AS challenge,c.email,c.purpose,c.user_id,c.code_hash,c.attempts,c.active,c.eligible,c.resend_at,c.language,c.expires AS code_expires FROM auth_flows f JOIN auth_challenges c ON c.id=f.challenge_id WHERE f.token_hash=? AND f.expires>?').get(digest(t),now())||null;}
 function view(f){return {purpose:f.purpose,step:f.step,email:mask(f.email),expiresAt:f.code_expires??f.expires,resendAt:f.resend_at,grantExpiresAt:f.grant_expires||null};}
 function mask(value){const at=value.lastIndexOf('@');return value.slice(0,1)+'***'+value.slice(at);}
 function mail(value){if(typeof value!=='string'||value.trim().length>254||/[\u0000-\u001f\u007f]/.test(value)||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw error(400,'invalid_email');return value.trim().toLowerCase();}
 function password(value){if(typeof value!=='string'||value.length<12||value.length>128||value.includes('\0'))throw error(400,'password_length');return value;}
 async function passwordMatches(row,value){if(typeof value!=='string'||value.length>200)return false;const candidate=row?.password_version===1?value.trim():value;const result=Buffer.from(await scrypt(candidate,row?.salt||'00000000000000000000000000000000',64));const saved=Buffer.from(row?.password||'','hex');return saved.length===result.length&&timingSafeEqual(result,saved);}
 async function newPassword(value){const salt=randomBytes(16).toString('hex');return {salt,password:Buffer.from(await scrypt(value,salt,64)).toString('hex')};}
 const codeHash=(id,email,purpose,code)=>createHmac('sha256',secret).update(JSON.stringify([id,email,purpose,code])).digest('hex');
 function revoke(req){const t=token(req,'jpl_auth');if(t){q('UPDATE auth_challenges SET active=0 WHERE id IN (SELECT challenge_id FROM auth_flows WHERE token_hash=?)').run(digest(t));q('DELETE FROM auth_flows WHERE token_hash=?').run(digest(t));}}
 async function start(req,res,{email,purpose,userId=null,eligible=true,language:lang='en'},existing){
  if(!mailer.configured)throw error(503,'mail_unavailable');
  const scope=digest(purpose+':'+email),time=now(),lock=randomBytes(16).toString('hex');
  tx(()=>{
   const state=q('SELECT * FROM auth_send_state WHERE scope=?').get(scope);
   const until=Math.max(state?.resend_at||0,state?.lock_until||0);if(until>time)throw error(429,'resend_cooldown',{retryAfter:Math.ceil((until-time)/1000)});
   const eh=digest(email),ip=digest(String(req.headers['cf-connecting-ip']||req.socket.remoteAddress));
   const counts=q('SELECT sum(CASE WHEN email_hash=? AND created_at>? THEN 1 ELSE 0 END) AS hourly,sum(CASE WHEN email_hash=? THEN 1 ELSE 0 END) AS daily,sum(CASE WHEN ip_hash=? AND created_at>? THEN 1 ELSE 0 END) AS ip FROM auth_mail_usage WHERE created_at>?').get(eh,time-3600000,eh,ip,time-3600000,time-86400000);
   if(counts.hourly>=5||counts.daily>=10||counts.ip>=30)throw error(429,'rate_limited',{retryAfter:3600});
   q('DELETE FROM auth_mail_usage WHERE created_at<?').run(time-86400000);
   q('DELETE FROM auth_flows WHERE expires<?').run(time-86400000);
   q('DELETE FROM auth_challenges WHERE expires<? AND id NOT IN (SELECT challenge_id FROM auth_flows)').run(time-86400000);
   q('INSERT INTO auth_mail_usage(id,email_hash,ip_hash,created_at) VALUES(?,?,?,?)').run(randomUUID(),eh,ip,time);
   q('INSERT INTO auth_send_state(scope,resend_at,lock_until,lock_token) VALUES(?,0,?,?) ON CONFLICT(scope) DO UPDATE SET lock_until=excluded.lock_until,lock_token=excluded.lock_token').run(scope,time+45000,lock);
  });
  const id=randomUUID(),previous=q('SELECT id,code_hash FROM auth_challenges WHERE email=? AND purpose=? ORDER BY rowid DESC LIMIT 1').get(email,purpose);
  let code;do{code=String(randomInt(1000000)).padStart(6,'0');}while(previous&&previous.code_hash===codeHash(previous.id,email,purpose,code));
  const credentialSnapshot=eligible&&purpose!=='register'?q('SELECT * FROM users WHERE id=?').get(userId):null;
  try{if(eligible)await mailer.send({email,purpose,code,language:lang,id});}catch(e){q('UPDATE auth_send_state SET lock_until=0,lock_token=NULL WHERE scope=? AND lock_token=?').run(scope,lock);throw e;}
  const t=randomBytes(32).toString('hex'),accepted=now(),expires=accepted+CODE_LIFE,resendAt=accepted+COOLDOWN;
  try{tx(()=>{
   const state=q('SELECT lock_token FROM auth_send_state WHERE scope=?').get(scope);if(state?.lock_token!==lock)throw error(503,'mail_send_failed');
   if(credentialSnapshot){const current=q('SELECT * FROM users WHERE id=?').get(userId);if(current?.banned)throw error(403,'account_banned');if(!current||current.email!==credentialSnapshot.email||current.password!==credentialSnapshot.password||current.salt!==credentialSnapshot.salt||current.email_verified_at!==credentialSnapshot.email_verified_at)throw error(503,'mail_send_failed');}
   q('UPDATE auth_challenges SET active=0 WHERE email=? AND purpose=?').run(email,purpose);
   q('INSERT INTO auth_challenges(id,email,purpose,user_id,code_hash,expires,resend_at,eligible,active,language) VALUES(?,?,?,?,?,?,?,?,1,?)').run(id,email,purpose,userId,codeHash(id,email,purpose,code),expires,resendAt,eligible?1:0,lang);
   revoke(req);q('INSERT INTO auth_flows(token_hash,challenge_id,step,expires) VALUES(?,?,?,?)').run(digest(t),id,'code',accepted+CODE_LIFE+GRANT_LIFE);
   q('UPDATE auth_send_state SET resend_at=?,lock_until=0,lock_token=NULL WHERE scope=?').run(resendAt,scope);
  });}catch(e){q('UPDATE auth_send_state SET lock_until=0,lock_token=NULL WHERE scope=? AND lock_token=?').run(scope,lock);throw e;}
  return json(res,200,{purpose,step:'code',email:mask(email),expiresAt:expires,resendAt},{'Set-Cookie':cookie('jpl_auth',t,1500)});
 }
 async function handle(req,res,route){
  const method=req.method;
  if(method==='GET'&&route==='/api/session'){json(res,200,{user:publicUser(session(req))});return true;}
  if(method==='GET'&&route==='/api/auth/flow'){const f=flow(req);json(res,200,{flow:f?view(f):null});return true;}
  if(method==='GET'&&route.startsWith('/api/avatars/')){
   const match=route.match(/^\/api\/avatars\/([^/]+)\/([a-f0-9]{64})$/);if(!match)throw error(404,'not_found');
   const row=q('SELECT avatar_data FROM users WHERE id=? AND avatar_hash=?').get(match[1],match[2]);if(!row?.avatar_data)throw error(404,'not_found');
   res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(row.avatar_data));return true;
  }
  if(method!=='POST')return false;
  if(route==='/api/logout'||route==='/api/auth/cancel'){
   const b=await body(req);void b;revoke(req);const cookies=[cookie('jpl_auth','',0)];
   if(route==='/api/logout'){const t=token(req,'jpl_session');if(t)q('DELETE FROM sessions WHERE token_hash=?').run(digest(t));cookies.push(cookie('jpl_session','',0));}
   json(res,200,{ok:true},{'Set-Cookie':cookies});return true;
  }
  if(['/api/auth/register/start','/api/auth/password/start','/api/auth/email/start','/api/auth/resend'].includes(route)){
   const b=await body(req),lang=language(b.language||'en');
   if(route==='/api/auth/resend'){const f=flow(req);if(!f||f.step!=='code')throw error(400,'flow_expired');if(f.purpose==='legacy'){const user=session(req);if(!user||user.id!==f.user_id||user.email!==f.email)throw error(401,'login_required');}await start(req,res,{email:f.email,purpose:f.purpose,userId:f.user_id,eligible:!!f.eligible,language:lang},f);return true;}
   if(route==='/api/auth/email/start'){
    limit(req,'auth',12,900000);const user=session(req);if(!user)throw error(401,'login_required');if(!await passwordMatches(user,b.password))throw error(401,'invalid_credentials');
    const current=session(req);if(!current||current.id!==user.id||current.password!==user.password||current.salt!==user.salt)throw error(401,'invalid_credentials');
    if(user.email_verified_at)throw error(409,'email_already_verified');
    await start(req,res,{email:user.email,purpose:'legacy',userId:user.id,language:lang});return true;
   }
   const email=mail(b.email),row=q('SELECT * FROM users WHERE email=?').get(email),purpose=route.includes('register')?'register':'reset';
   await start(req,res,{email,purpose,userId:row?.id||null,eligible:purpose==='register'?!row:!!row?.email_verified_at&&!row.banned,language:lang});return true;
  }
  if(route==='/api/auth/verify'){
   const b=await body(req);let failure;const result=tx(()=>{
    const f=flow(req);if(!f||f.step!=='code')return {failure:error(400,'flow_expired')};
    if(f.code_expires<=now())return {failure:error(400,'code_expired')};
    if(f.attempts>=5)return {failure:error(400,'code_locked',{remainingAttempts:0})};
    if(!f.active)return {failure:error(400,'code_expired')};
    const matches=typeof b.code==='string'&&/^\d{6}$/.test(b.code)&&f.eligible&&timingSafeEqual(Buffer.from(codeHash(f.challenge,f.email,f.purpose,b.code),'hex'),Buffer.from(f.code_hash,'hex'));
    if(!matches){q('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?').run(f.challenge);return {failure:error(400,f.attempts>=4?'code_locked':'code_invalid',{remainingAttempts:4-f.attempts})};}
    q('UPDATE auth_challenges SET active=0 WHERE id=?').run(f.challenge);
    if(f.purpose==='legacy'){
     const user=session(req);if(!user||user.id!==f.user_id||user.email!==f.email)return {failure:error(401,'login_required')};
     q('UPDATE users SET email_verified_at=? WHERE id=?').run(iso(),user.id);q('DELETE FROM auth_flows WHERE token_hash=?').run(f.token_hash);
     return {purpose:f.purpose,step:'complete',email:mask(f.email),user:publicUser(q('SELECT * FROM users WHERE id=?').get(user.id))};
    }
    const step=f.purpose==='register'?'profile':'password',grantExpiresAt=now()+GRANT_LIFE;
    q('UPDATE auth_flows SET step=?,expires=?,grant_expires=? WHERE token_hash=?').run(step,grantExpiresAt,grantExpiresAt,f.token_hash);
    return {purpose:f.purpose,step,email:mask(f.email),grantExpiresAt};
   });failure=result.failure;if(failure)throw failure;json(res,200,result,result.step==='complete'?{'Set-Cookie':cookie('jpl_auth','',0)}:{});return true;
  }
  if(route==='/api/register'){
   limit(req,'auth-complete',12,900000);
   const b=await body(req),f=flow(req);if(!f||f.step!=='profile'||f.purpose!=='register'||f.grant_expires<=now())throw error(400,'flow_expired');
   const name=text(b.name,2,40,'invalid_name'),canonical=name.normalize('NFKC').replace(/[\s_-]+/g,'').toLowerCase();if(new Set(['japanlifebase','admin','administrator','管理者','管理员','管理員']).has(canonical))throw error(400,'reserved_name');
   const pass=password(b.password),avatar=decodeAvatar(b.avatarData),credentials=await newPassword(pass),id=randomUUID();
   tx(()=>{
    const current=flow(req);if(!current||current.token_hash!==f.token_hash||current.step!=='profile'||current.grant_expires<=now())throw error(400,'flow_expired');
    if(q('SELECT id FROM users WHERE name=?').get(name))throw error(409,'name_taken');
    if(q('SELECT id FROM users WHERE email=?').get(f.email))throw error(409,'email_exists');
    q('INSERT INTO users(id,name,email,password,salt,role,created_at,email_verified_at,legacy_account,password_version,avatar_data,avatar_hash) VALUES(?,?,?,?,?,?,?,?,0,2,?,?)').run(id,name,f.email,credentials.password,credentials.salt,'member',iso(),iso(),avatar?.bytes||null,avatar?.hash||null);
    q('DELETE FROM auth_flows WHERE token_hash=?').run(f.token_hash);
   });const user=q('SELECT * FROM users WHERE id=?').get(id);json(res,201,{user:publicUser(user)},{'Set-Cookie':[sessionCookie(user),cookie('jpl_auth','',0)]});return true;
  }
  if(route==='/api/login'){
   limit(req,'auth',12,900000);const b=await body(req),email=mail(b.email),row=q('SELECT * FROM users WHERE email=?').get(email);
   if(!await passwordMatches(row,b.password))throw error(401,'invalid_credentials');
   let sessionHeader;tx(()=>{const current=q('SELECT * FROM users WHERE id=?').get(row.id);if(!current||current.password!==row.password||current.salt!==row.salt)throw error(401,'invalid_credentials');if(current.banned)throw error(403,'account_banned');sessionHeader=sessionCookie(current);});
   json(res,200,{user:publicUser(q('SELECT * FROM users WHERE id=?').get(row.id))},{'Set-Cookie':sessionHeader});return true;
  }
  if(route==='/api/auth/password/complete'){
   limit(req,'auth-complete',12,900000);
   const b=await body(req),f=flow(req);if(!f||f.step!=='password'||f.purpose!=='reset'||f.grant_expires<=now())throw error(400,'flow_expired');
   const credentials=await newPassword(password(b.password));
   tx(()=>{
    const current=flow(req),user=q('SELECT * FROM users WHERE id=?').get(f.user_id);if(!current||current.step!=='password'||current.token_hash!==f.token_hash||current.grant_expires<=now())throw error(400,'flow_expired');
    if(user?.banned)throw error(403,'account_banned');
    if(!user?.email_verified_at||user.email!==f.email)throw error(400,'flow_expired');
    q('UPDATE users SET password=?,salt=?,password_version=2 WHERE id=?').run(credentials.password,credentials.salt,user.id);
    q('DELETE FROM sessions WHERE user_id=?').run(user.id);
    q('DELETE FROM auth_flows WHERE challenge_id IN (SELECT id FROM auth_challenges WHERE user_id=?)').run(user.id);
    q('UPDATE auth_challenges SET active=0 WHERE user_id=?').run(user.id);
   });await mailer.notifyPasswordChanged({email:f.email,language:f.language,id:randomUUID()}).catch(()=>{});json(res,200,{ok:true},{'Set-Cookie':[cookie('jpl_auth','',0),cookie('jpl_session','',0)]});return true;
  }
  if(route==='/api/me/avatar'){
   const previous=session(req);if(!previous)throw error(401,'login_required');const b=await body(req),user=session(req);if(!user)throw error(401,'login_required');if(user.id!==previous.id)throw error(409,'account_changed');if(!Object.hasOwn(b,'avatarData'))throw error(400,'invalid_avatar');const avatar=decodeAvatar(b.avatarData);
   q('UPDATE users SET avatar_data=?,avatar_hash=? WHERE id=?').run(avatar?.bytes||null,avatar?.hash||null,user.id);json(res,200,{user:publicUser(q('SELECT * FROM users WHERE id=?').get(user.id))});return true;
  }
  return false;
 }
 return {handle,session: req=>publicUser(session(req)),publicUser,configured:mailer.configured};
}
