// Maintained translations. These strings never depend on machine translation
// for the five supported interface languages.
const languages=['en','ja','zh-CN','zh-TW','ko'];
const commonRows={
 language:['Language','言語','语言','語言','언어'],
 topicOrder:['Topic order','話題の並び順','话题排序','話題排序','게시글 정렬'],
 topicDetail:['Topic detail','話題の詳細','话题详情','話題詳情','게시글 상세'],
 announcement:['Community announcement','コミュニティのお知らせ','社区公告','社群公告','커뮤니티 공지'],
 browserLanguage:['Browser language: {language}.','ブラウザーの言語：{language}。','浏览器语言为 {language}。','瀏覽器語言為 {language}。','브라우저 언어: {language}.'],
 useBrowserLanguage:['Switch language','この言語に切り替える','切换到此语言','切換至此語言','이 언어로 전환'],
 preferenceSaveError:['Language changed on this device, but could not be saved to your account. Select it again to retry.','この端末では切り替わりましたが、アカウントに保存できませんでした。もう一度選択して再試行してください。','本机语言已切换，但未能保存到账号。重新选择该语言可重试。','本機語言已切換，但未能儲存至帳號。重新選擇該語言可重試。','이 기기의 언어는 바뀌었지만 계정에 저장하지 못했습니다. 언어를 다시 선택해 재시도하세요.'],
 accountBanned:['This account is suspended. Contact the site team if you need help.','このアカウントは停止されています。必要な場合は運営にお問い合わせください。','该账号已被封禁。如需帮助，请联系站点管理员。','此帳號已被停權。如需協助，請聯絡網站管理員。','정지된 계정입니다. 도움이 필요하면 운영자에게 문의하세요.'],
 accountMuted:['Posting is disabled for this account. Your draft has been kept.','このアカウントは投稿を制限されています。下書きは保持されています。','该账号目前被禁言，输入内容已保留。','此帳號目前被禁言，輸入內容已保留。','이 계정은 글쓰기가 제한되어 있습니다. 작성한 내용은 유지됩니다.']
};
const adminRows={
 audit:['Audit log','操作履歴','管理日志','管理日誌','관리 기록'],
 auditNewest:['Latest records','最新の履歴','最新记录','最新記錄','최근 기록'],
 audit_moderate:['Change topic visibility or pin','話題の公開・固定設定','修改话题显示或置顶','修改話題顯示或置頂','게시글 공개·고정 변경'],
 audit_author_hide:['Author hid a topic','投稿者による非公開','作者隐藏话题','作者隱藏話題','작성자가 게시글 숨김'],
 audit_operator_hide:['Operator hid a topic','運用担当による非公開','运维隐藏话题','維運隱藏話題','운영 담당자가 게시글 숨김'],
 audit_operator_restore:['Operator restored a topic','運用担当による復元','运维恢复话题','維運恢復話題','운영 담당자가 게시글 복원'],
 audit_restrict_user:['Change account restrictions','アカウントの利用制限を変更','修改账号限制','修改帳號限制','계정 제한 변경'],
 audit_review_report:['Review report','通報への対応','处理举报','處理檢舉','신고 처리'],
 banned:['Suspended','停止中','已封禁','已停權','정지됨'],
 muted:['Muted','投稿制限中','已禁言','已禁言','글쓰기 제한'],
 activeUser:['Active','有効','正常','正常','정상'],
 moderation:['Restrictions','利用制限','账号限制','帳號限制','계정 제한'],
 ban:['Suspend','停止する','封禁','停權','정지'],
 unban:['Lift suspension','停止を解除','解除封禁','解除停權','정지 해제'],
 mute:['Mute','投稿を制限','禁言','禁言','글쓰기 제한'],
 unmute:['Unmute','投稿制限を解除','解除禁言','解除禁言','글쓰기 제한 해제'],
 protectedUser:['Administrator accounts cannot be restricted here.','管理者アカウントはここでは制限できません。','此处不能限制管理员账号。','此處不能限制管理員帳號。','여기서는 관리자 계정을 제한할 수 없습니다.'],
 confirmUserChange:['Apply “{action}” to {name}?','{name} に「{action}」を適用しますか？','确定对“{name}”执行“{action}”？','確定對「{name}」執行「{action}」？','{name} 님에게 “{action}” 작업을 적용할까요?'],
 reportStatus:['Review status','対応状況','处理状态','處理狀態','처리 상태'],
 open:['Open','未対応','待处理','待處理','대기'],
 reviewing:['Reviewing','確認中','处理中','處理中','검토 중'],
 resolved:['Resolved','対応済み','已解决','已解決','해결됨'],
 dismissed:['Dismissed','対応不要','已驳回','已駁回','기각됨'],
 save:['Save','保存','保存','儲存','저장'],
 reviewedBy:['Last reviewer','最終対応者','最后处理人','最後處理人','최근 처리자'],
 auditActor:['Actor ID','操作者ID','操作人 ID','操作人 ID','작업자 ID'],
 auditAction:['Action','操作','操作','操作','작업'],
 auditDetails:['Details','詳細','详情','詳情','상세'],
 auditMore:['Older records','以前の履歴','更早记录','更早記錄','이전 기록'],
 auditFilter:['Filter by action code','操作コードで絞り込み','按操作代码筛选','依操作代碼篩選','작업 코드로 필터'],
 auditAll:['All actions','すべての操作','全部操作','全部操作','모든 작업'],
 protected_account:['This account cannot be restricted.','このアカウントは制限できません。','不能限制该账号。','無法限制此帳號。','이 계정은 제한할 수 없습니다.'],
 invalid_status:['Choose a valid review status.','有効な対応状況を選択してください。','请选择有效的处理状态。','請選擇有效的處理狀態。','올바른 처리 상태를 선택하세요.']
};
const make=rows=>Object.fromEntries(languages.map((language,index)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>[key,values[index]]))]));
export const commonCopy=make(commonRows);
export const adminCopy=make(adminRows);
