import {appendFile} from 'node:fs/promises';
import path from 'node:path';

const copy={
 ja:['メールアドレスの確認コード','確認コード','このコードは10分間有効です。心当たりがなければ、このメールを無視してください。'],
 en:['Your email verification code','Verification code','This code expires in 10 minutes. If you did not request it, ignore this email.'],
 ko:['이메일 인증 코드','인증 코드','이 코드는 10분 동안 유효합니다. 요청하지 않았다면 이 메일을 무시하세요.'],
 'zh-CN':['邮箱验证码','验证码','验证码 10 分钟内有效。如果不是你本人操作，请忽略此邮件。'],
 'zh-TW':['電子郵件驗證碼','驗證碼','驗證碼 10 分鐘內有效。如果不是你本人操作，請忽略此郵件。']
};
const purposes={
 ja:{register:['新規登録のメール確認','このコードは Japan Life Base の新規登録用です。'],reset:['パスワードの再設定','このコードはパスワード再設定用です。他人に共有しないでください。'],legacy:['アカウントのメール確認','このコードはログイン中アカウントのメール確認用です。'],changed:['パスワードが変更されました','Japan Life Base のパスワードが変更され、すべてのログインセッションを終了しました。心当たりがなければ、サイトでパスワードを再設定してください。']},
 en:{register:['Verify your registration','Use this code to register for Japan Life Base.'],reset:['Reset your password','Use this code to reset your password. Do not share it with anyone.'],legacy:['Verify your account email','Use this code to verify the email address on your signed-in account.'],changed:['Your password was changed','Your Japan Life Base password was changed and all login sessions were ended. If you did not make this change, reset your password on the website.']},
 ko:{register:['회원가입 이메일 인증','Japan Life Base 회원가입에 사용할 코드입니다.'],reset:['비밀번호 재설정','비밀번호 재설정 코드입니다. 다른 사람에게 공유하지 마세요.'],legacy:['계정 이메일 인증','로그인한 계정의 이메일 주소를 인증하는 코드입니다.'],changed:['비밀번호가 변경되었습니다','Japan Life Base 비밀번호가 변경되어 모든 로그인 세션이 종료되었습니다. 본인이 변경하지 않았다면 웹사이트에서 비밀번호를 재설정하세요.']},
 'zh-CN':{register:['验证注册邮箱','此验证码用于注册 Japan Life Base。'],reset:['重置密码','此验证码用于重置密码，请勿向他人透露。'],legacy:['验证账号邮箱','此验证码用于认证当前已登录账号的邮箱。'],changed:['密码已修改','你的 Japan Life Base 密码已修改，所有登录会话已退出。如果不是本人操作，请前往网站重新设置密码。']},
 'zh-TW':{register:['驗證註冊信箱','此驗證碼用於註冊 Japan Life Base。'],reset:['重設密碼','此驗證碼用於重設密碼，請勿向他人透露。'],legacy:['驗證帳號信箱','此驗證碼用於認證目前已登入帳號的信箱。'],changed:['密碼已修改','你的 Japan Life Base 密碼已修改，所有登入工作階段已登出。如果不是本人操作，請前往網站重新設定密碼。']}
};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function htmlMessage({subject,intent,label,code,note,language}){
 const lang=Object.hasOwn(copy,language)?language:'en';
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f4f5f6;color:#282b30;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 16px"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e4e8;border-radius:12px;padding:32px"><p style="margin:0 0 24px;font-size:17px;font-weight:700">Japan Life Base</p><h1 style="font-size:22px;margin:0 0 16px">${escape(subject)}</h1>${intent?`<p style="font-size:15px;line-height:1.7">${escape(intent)}</p>`:''}${code!==undefined?`<p style="margin:24px 0 8px;font-size:13px;color:#656b75">${escape(label)}</p><p style="margin:0 0 24px;font-size:34px;font-weight:700;letter-spacing:6px;font-variant-numeric:tabular-nums">${escape(code)}</p>`:''}<p style="font-size:14px;line-height:1.7;color:#656b75">${escape(note)}</p><p style="margin:28px 0 0;border-top:1px solid #e2e4e8;padding-top:20px;font-size:13px"><a href="https://www.jp-lifebase.com/" style="color:#353b45">www.jp-lifebase.com</a></p></div></td></tr></table></body></html>`;
}
export function createMailer({dataDir,env=process.env,fetchImpl=fetch}){
 const outbox=env.NODE_ENV==='test'&&env.JPL_TEST_MAIL_OUTBOX==='1';
 const configured=outbox||env.MAIL_PROVIDER==='resend'&&!!env.RESEND_API_KEY&&!!env.MAIL_FROM;
 async function deliver({email,subject,text,html,id,outboxValue}){
  if(!configured)throw Object.assign(new Error('mail_unavailable'),{status:503,code:'mail_unavailable'});
  try{
   if(outbox){await appendFile(path.join(dataDir,'mail-outbox.ndjson'),JSON.stringify(outboxValue)+'\n',{mode:0o600});return;}
   const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`jpl-auth-${id}`},body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:`Japan Life Base — ${subject}`,text,html}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('provider_rejected');
   const result=await response.json();if(typeof result.id!=='string'||!result.id)throw new Error('provider_invalid');
  }catch{throw Object.assign(new Error('mail_send_failed'),{status:503,code:'mail_send_failed'});}
 }
 return {configured,async send({email,code,purpose,language,id}){
  const [,label,note]=copy[language]||copy.en,[subject,intent]=(purposes[language]||purposes.en)[purpose]||purposes.en.register;
  return deliver({email,subject,id,text:`Japan Life Base\n\n${intent}\n\n${label}: ${code}\n\n${note}\n\nhttps://www.jp-lifebase.com/`,html:htmlMessage({subject,intent,label,code,note,language}),outboxValue:{email,code,purpose,language}});
 },async notifyPasswordChanged({email,language,id}){
  const [subject,note]=(purposes[language]||purposes.en).changed;
  return deliver({email,subject,id,text:`Japan Life Base\n\n${note}\n\nhttps://www.jp-lifebase.com/account/login`,html:htmlMessage({subject,note,language}),outboxValue:{email,purpose:'password_changed',language}});
 }};
}
