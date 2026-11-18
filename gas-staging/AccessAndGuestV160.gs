/**
 * 全力☆スマッシュ v0.16.0 — 検証環境限定・権限/ビジター閲覧API
 * This add-on deliberately does not alter core match/finance mutations.
 * It requires the small dispatch_ patch in PATCH_CODE_GS_JA.md.
 */
var SMA16 = {
  registrations: '登録申請',
  links: '閲覧リンク',
  teamId: 'T-ROLE-DUTY',
  site: 'https://hitoriojisan52.github.io/zenryoku-smash-staging/guest.html',
  regHeader: ['requestId','lineUserId','displayName','status','requestedAt','decidedBy','decidedAt','memberId'],
  linkHeader: ['tokenHash','practiceId','expiresAt','revokedAt','issuedBy','createdAt']
};
function accessSheet16_(ss, name, headers){
  var s=ss.getSheetByName(name);if(!s)fail_('SETUP','追加シート「'+name+'」がありません。初期設定を実行してください');
  var actual=s.getRange(1,1,1,headers.length).getValues()[0];
  if(headers.some(function(h,i){return actual[i]!==h;}))fail_('SETUP',name+' のヘッダーが一致しません');
  return s;
}
function accessRows16_(sheet,width){var n=sheet.getLastRow();return n<2?[]:sheet.getRange(2,1,n-1,width).getValues();}
function accessTime16_(){return new Date().toISOString();}
function accessSha16_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(x){return ('0'+(x&255).toString(16)).slice(-2);}).join('');}
function accessMemberRow16_(ss,userId){return sheetRows_(ss,'メンバー').find(function(r){return str_(r[2])===userId;})||null;}
function accessSetupV160(){
  var ss=ss_(), spec=[[SMA16.registrations,SMA16.regHeader],[SMA16.links,SMA16.linkHeader]];
  spec.forEach(function(pair){var s=ss.getSheetByName(pair[0]);if(!s){s=ss.insertSheet(pair[0]);s.getRange(1,1,1,pair[1].length).setValues([pair[1]]);s.setFrozenRows(1);}accessSheet16_(ss,pair[0],pair[1]);});
  var teams=sheetRows_(ss,'当番チーム');
  if(!teams.some(function(r){return str_(r[0])===SMA16.teamId;}))sheet_(ss,'当番チーム').appendRow([SMA16.teamId,'権限管理用・当番担当',true]);
  console.log(JSON.stringify({setup:'ready',registrationSheet:true,guestLinksSheet:true,dutyRoleTeam:SMA16.teamId}));
}
function accessRegistration16_(ss,lineUserId,op,payload){
  var sheet=accessSheet16_(ss,SMA16.registrations,SMA16.regHeader);
  var current=accessMemberRow16_(ss,lineUserId);
  if(op==='member.status'){
    // Interrupted staging withdrawal must NOT make inactive accounts appear approved.
    if(current&&accessStageWithdrawHistoryV1636_(ss,current))
      return {ok:true,data:{status:'withdrawal_processing'}};
    if(current&&bool_(current[3]))return {ok:true,data:{status:'approved'}};
    if(current)return {ok:true,data:{status:'inactive'}};
    var latest=accessRows16_(sheet,8).filter(function(r){return r[1]===lineUserId;}).pop();
    return {ok:true,data:{status:latest?str_(latest[3]):'not_requested'}};
  }
  if(op!=='member.apply')fail_('BAD_REQUEST','申請操作が不正です');
  var name=str_(payload.displayName).normalize('NFKC').trim();
  if(!name||name.length>30||/[\r\n<>]/.test(name))fail_('BAD_REQUEST','表示名を1～30文字で入力してください');
  if(current){
    if(accessStageWithdrawHistoryV1636_(ss,current))fail_('CONFLICT','退会処理中のため再申請できません');
    if(bool_(current[3]))return {ok:true,data:{status:'approved'}};
    fail_('CONFLICT','停止中の利用者です。管理者に確認してください');
  }
  return withLock_(function(){
    var latestMember=accessMemberRow16_(ss,lineUserId);
    if(latestMember){
      if(accessStageWithdrawHistoryV1636_(ss,latestMember))fail_('CONFLICT','退会処理中のため再申請できません');
      if(bool_(latestMember[3]))return {ok:true,data:{status:'approved'}};
      fail_('CONFLICT','停止中の利用者です。管理者に確認してください');
    }
    var rows=accessRows16_(sheet,8),pending=rows.find(function(r){return r[1]===lineUserId&&r[3]==='pending';});
    if(pending)return {ok:true,data:{status:'pending'}};
    var id='REQ-'+Utilities.getUuid();
    sheet.appendRow([id,lineUserId,safeCell_(name),'pending',accessTime16_(),'','','']);
    return {ok:true,data:{status:'pending'}};
  });
}
function accessAdmin16_(member){if(member.role!=='admin')fail_('FORBIDDEN','管理者権限が必要です');}
function accessRole16_(m,teams,membership){
  if(bool_(m[4]))return 'admin';
  var enabled={};teams.forEach(function(t){if(bool_(t[2]))enabled[str_(t[0])]=true;});
  return membership.some(function(t){return t[1]===m[0]&&bool_(t[2])&&enabled[str_(t[0])];})?'duty':'member';
}
// v0.16.23: 退会履歴の管理者向け読み取り専用ヘルパー。
// LINEユーザーID・操作ID・退会担当者は応答に含めない。
var SMA_HISTORY_HEADER_V1623=['memberId','displayName','withdrawnAt','withdrawnBy','state','operationId'];
function accessHistoryForManagerV1623_(ss,currentMembers){
  var sh=accessSheet16_(ss,'退会履歴',SMA_HISTORY_HEADER_V1623);
  return accessRows16_(sh,6).filter(function(r){return !!str_(r[0]);}).map(function(r){
    var id=str_(r[0]);
    var stillPresent=currentMembers.some(function(m){return str_(m[0])===id;});
    return {
      memberId:id,
      name:str_(r[1]),
      withdrawnAt:str_(r[2]),
      state:str_(r[4])==='completed'&&!stillPresent?'completed':'processing'
    };
  });
}
/**
 * v0.16.27 staging-only, admin-only READ-ONLY withdrawal readiness check.
 * This is NOT a withdrawal operation, never mutates a sheet, and does not
 * expose LINE user IDs, names, passwords, tokens or operation logs.
 * Retire/withdraw is still unconditionally rejected by accessManagement16_.
 */
function accessWithdrawCheckV1627_(ss,member,payload){
  accessAdmin16_(member);
  // An exact workbook binding prevents this helper from probing production.
  if(conf_('SPREADSHEET_ID')!=='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac')
    fail_('STAGING_ONLY','退会条件の確認は検証用の管理シートだけで利用できます');
  var history=accessRows16_(accessSheet16_(ss,'退会履歴',SMA_HISTORY_HEADER_V1623),6);
  var members=sheetRows_(ss,'メンバー');
  var teams=sheetRows_(ss,'当番チーム');
  var memberships=sheetRows_(ss,'チーム所属');
  var idCounts={},lineCounts={};
  members.forEach(function(m){
    var id=str_(m[0]),lineId=str_(m[2]);
    if(id)idCounts[id]=(idCounts[id]||0)+1;
    if(lineId)lineCounts[lineId]=(lineCounts[lineId]||0)+1;
  });
  var archived={};history.forEach(function(r){if(str_(r[0]))archived[str_(r[0])]=true;});
  var active=0,admins=0,eligible=0,blocked=0;
  var targetId=str_((payload||{}).memberId),selected='not_requested';
  members.forEach(function(m){
    var id=str_(m[0]);if(!id||!bool_(m[3]))return;
    active++;
    var role=accessRole16_(m,teams,memberships);
    if(role==='admin')admins++;
    // v0.16.27 deliberately forbids withdrawing ANY admin, even when there are several.
    // Invalid IDs / duplicated LINE identities / partial histories are not eligible.
    var lineId=str_(m[2]);
    var safe=role!=='admin' && id!==str_(member.memberId) &&
      (idCounts[id]||0)===1 && /^U[0-9a-f]{32}$/i.test(lineId) &&
      (lineCounts[lineId]||0)===1 && !archived[id];
    if(safe)eligible++;else blocked++;
    if(targetId&&id===targetId)selected=safe?'eligible_for_review':'blocked';
  });
  return {ok:true,data:{
    readOnly:true,withdrawEnabled:false,
    activeMemberCount:active,adminCount:admins,
    eligibleCandidateCount:eligible,blockedMemberCount:blocked,
    historyRecordCount:history.filter(function(r){return !!str_(r[0]);}).length,
    targetStatus:selected
  }};
}

function accessManagement16_(ss,member,op,payload){
  accessAdmin16_(member);
  // v0.16.36: stage-only synthetic target; defaults fail closed on both servers.
  // No target exists in the original stage, and any real member is excluded.
  if(op==='member.manage.withdraw')
    return accessStageWithdrawalV1636_(ss,member,payload);
  if(op==='member.manage.withdraw.check')
    return accessWithdrawCheckV1627_(ss,member,payload);
  var reg=accessSheet16_(ss,SMA16.registrations,SMA16.regHeader);
  if(op==='member.manage.list'){
    var members=sheetRows_(ss,'メンバー'),teams=sheetRows_(ss,'当番チーム'),membership=sheetRows_(ss,'チーム所属');
    var withdrawn=accessHistoryForManagerV1623_(ss,members);
    // Admin-only member card metadata. Preserve the member master as source
    // of identity; expose a registration date only for a UNIQUE approved
    // application linked to that SAME member and LINE subject.
    var requests=accessRows16_(reg,8),approvedById=Object.create(null);
    requests.forEach(function(request){
      var mid=str_(request[7]);
      if(str_(request[3])!=='approved'||!mid)return;
      if(!approvedById[mid])approvedById[mid]=[];
      approvedById[mid].push(request);
    });
    return {ok:true,data:{members:members.filter(function(m){return str_(m[0]);}).map(function(m){
       var mid=str_(m[0]),lineUserId=str_(m[2]),matches=approvedById[mid]||[];
       var registeredAt=matches.length===1&&str_(matches[0][1])===lineUserId?
        str_(matches[0][4]):null;
       return {memberId:mid,name:str_(m[1]),active:bool_(m[3]),
        role:accessRole16_(m,teams,membership),
        lineUserId:/^U[0-9a-f]{32}$/i.test(lineUserId)?lineUserId:null,
        registeredAt:registeredAt};
      }),
      pending:requests.filter(function(r){return r[3]==='pending';}).map(function(r){return {requestId:str_(r[0]),name:str_(r[2]),requestedAt:str_(r[4])};}),
      withdrawn:withdrawn,
      // Worker adds the independent edge-gate result to this safe boolean.
      // No secret, spreadsheet ID or LINE user ID is exposed here.
      withdrawEnabled:conf_('WITHDRAW_ENABLED')==='true'&&
        conf_('STAGING_WITHDRAW_PURPOSE')===SMA_STAGE_WITHDRAW_PURPOSE_V1636&&
        conf_('SPREADSHEET_ID')===SMA_STAGE_WITHDRAW_ID_V1636&&
        ss.getId()===SMA_STAGE_WITHDRAW_ID_V1636}};
  }
  var opId=checkOpId_(payload);
  return withLock_(function(){
    var cached=auditExisting_(ss,opId,op,member);if(cached)return cached;
    var result;
    if(op==='member.manage.decide'){
      var id=str_(payload.requestId),accept=payload.approve===true;
      var all=accessRows16_(reg,8),idx=all.findIndex(function(r){return str_(r[0])===id;});
      if(idx<0||all[idx][3]!=='pending')fail_('CONFLICT','申請は既に処理されています');
      var row=all[idx],newId='';
      if(accept){
        var previous=accessMemberRow16_(ss,str_(row[1]));
        if(previous){if(bool_(previous[3]))fail_('CONFLICT','すでに登録済みの利用者です');
          fail_('CONFLICT','停止済みの利用者です。管理者に確認してください');}
        newId='M-'+Utilities.getUuid();
        sheet_(ss,'メンバー').appendRow([newId,safeCell_(str_(row[2])),str_(row[1]),true,false]);
      }
      reg.getRange(idx+2,4).setValue(accept?'approved':'rejected');
      reg.getRange(idx+2,6,1,3).setValues([[str_(member.memberId),accessTime16_(),newId]]);
      result={ok:true,data:{requestId:id,status:accept?'approved':'rejected'}};
    }else if(op==='member.manage.role'){
      var memberId=str_(payload.memberId),role=str_(payload.role);
      if(['admin','duty','member'].indexOf(role)<0)fail_('BAD_REQUEST','権限が不正です');
      var members=sheetRows_(ss,'メンバー'),idx=members.findIndex(function(r){return str_(r[0])===memberId;});
      if(idx<0||!bool_(members[idx][3]))fail_('NOT_FOUND','有効なメンバーが見つかりません');
      var target=members[idx];
      if(bool_(target[4])&&role!=='admin'){
        var count=members.filter(function(m){return bool_(m[3])&&bool_(m[4]);}).length;
        if(count<=1)fail_('FORBIDDEN','最後の管理者は解除できません');
      }
      if(role==='admin'){
        sheet_(ss,'メンバー').getRange(idx+2,5).setValue(true);
      }else{
        var memberships=sheetRows_(ss,'チーム所属'),membershipSheet=sheet_(ss,'チーム所属');
        if(role==='member'){
          memberships.forEach(function(r,i){if(str_(r[1])===memberId&&bool_(r[2]))membershipSheet.getRange(i+2,3).setValue(false);});
        }else{
          var activeTeams=sheetRows_(ss,'当番チーム').filter(function(t){return bool_(t[2]);}).map(function(t){return str_(t[0]);});
          var already=memberships.some(function(r){return r[1]===memberId&&bool_(r[2])&&activeTeams.indexOf(str_(r[0]))>=0;});
          if(!already)membershipSheet.appendRow([SMA16.teamId,memberId,true]);
        }
        sheet_(ss,'メンバー').getRange(idx+2,5).setValue(false);
      }
      result={ok:true,data:{memberId:memberId,role:role}};
    }else fail_('BAD_REQUEST','管理操作が不正です');
    audit_(ss,opId,op,member,str_(payload.memberId||payload.requestId),result);
    return result;
  });
}
function accessShareIssue16_(ss,member,payload){
  var practiceId=str_(payload.practiceId);
  practice_(ss,practiceId); // Only enabled, registered practices can be shared.
  var opId=checkOpId_(payload);
  return withLock_(function(){
    var linkSheet=accessSheet16_(ss,SMA16.links,SMA16.linkHeader);
    var links=accessRows16_(linkSheet,6),issued=links.filter(function(r){return r[4]===member.memberId&&r[1]===practiceId&&Number(new Date(r[5]))>Date.now()-60*60*1000;});
    if(issued.length>=10)fail_('LIMIT','閲覧リンクの発行回数が多すぎます。しばらくしてからお試しください');
    var token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
    var exp=new Date(Date.now()+8*60*60*1000).toISOString();
    linkSheet.appendRow([accessSha16_(token),practiceId,exp,'',member.memberId,accessTime16_()]);
    var result={ok:true,data:{url:SMA16.site+'#t='+token,expiresAt:exp,practiceId:practiceId}};
    // Do not write raw guest token to 操作履歴. This issue operation intentionally is not cached by operationId.
    return result;
  });
}
function accessShareRevoke16_(ss,member,payload){
  accessAdmin16_(member);
  var practiceId=str_(payload.practiceId);if(!practiceId)fail_('BAD_REQUEST','練習IDが必要です');
  var opId=checkOpId_(payload);
  return withLock_(function(){
    var old=auditExisting_(ss,opId,'match.share.revoke',member);if(old)return old;
    var sheet=accessSheet16_(ss,SMA16.links,SMA16.linkHeader),rows=accessRows16_(sheet,6),n=0;
    rows.forEach(function(r,i){if(r[1]===practiceId&&!r[3]){sheet.getRange(i+2,4).setValue(accessTime16_());n++;}});
    var result={ok:true,data:{revoked:n}};
    audit_(ss,opId,'match.share.revoke',member,practiceId,result);
    return result;
  });
}
function accessGuestGet16_(ss,token){
  if(!/^[0-9a-f]{64}$/.test(String(token||'')))fail_('UNAUTHORIZED','閲覧リンクが無効です');
  var sheet=accessSheet16_(ss,SMA16.links,SMA16.linkHeader),hash=accessSha16_(token),matches=accessRows16_(sheet,6).filter(function(r){return r[0]===hash;});
  if(matches.length!==1||matches[0][3]||Date.parse(matches[0][2])<=Date.now())fail_('UNAUTHORIZED','閲覧リンクの期限が切れているか、無効です');
  var id=str_(matches[0][1]);
  var practice=practice_(ss,id); // Revoke access when practice disabled.
  var state=matchLoad_(ss,id),all=sheetRows_(ss,'出欠回答').filter(function(r){return str_(r[0])===id;});
  var roster=all.map(function(r){return {participationId:str_(r[1]),name:norm_(r[2]),nameKana:norm_(r[3]),attending:bool_(r[5])};});
  var numbered=SMMatchCore.numbered(roster),names={};
  numbered.forEach(function(p){names[p.participationId]=p.number+' '+p.displayName;});
  function team(ids){return ids.map(function(x){return names[x]||'参加者';});}
  var visible=state?SMMatchCore.visible(state):[];
  return {ok:true,data:{practice:{date:practice.date,place:practice.place},
    expiresAt:str_(matches[0][2]),state:state?state.sessionState:'not_created',
    currentRound:state?state.currentRound:0,
    rounds:visible.map(function(r){return {roundNumber:r.roundNumber,state:r.state,courts:r.courts.map(function(c){return {courtNumber:c.courtNumber,teamA:team(c.teamA),teamB:team(c.teamB)};})};})}};
}

/**
 * v0.16.25 editor-only, read-only withdrawal integration preflight.
 * It cannot be called through the current HTTP dispatcher (no new route).
 * Returns counts only; never a LINE ID, token, name or secret.
 */
function accessWithdrawPreflightV1625(){
  var expected='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
  if(conf_('SPREADSHEET_ID')!==expected)
    fail_('STAGING_ONLY','ステージング以外では点検できません。');
  var ss=ss_();
  accessSheet16_(ss,'退会履歴',SMA_HISTORY_HEADER_V1623);
  var members=sheetRows_(ss,'メンバー');
  var active=members.filter(function(r){return str_(r[0])&&bool_(r[3]);});
  var admins=active.filter(function(r){return bool_(r[4]);});
  var nonAdmins=active.filter(function(r){return !bool_(r[4]);});
  return {
    staging:true,
    historyHeaderReady:true,
    activeMemberCount:active.length,
    adminCount:admins.length,
    nonAdminMemberCount:nonAdmins.length,
    gasWithdrawalBlocked:true,
    workerConfigurationVerified:false
  };
}


/**
 * v0.16.53 — CONNECTED STAGING ONLY / ALL RECORDS ARE USER-APPROVED TEST DATA.
 * The user authorized destructive tests on members of the connected staging
 * workbook. This does NOT authorize production access or bypass admin,
 * idempotency, historical data retention or partial-failure safeguards.
 * Both GAS and Worker must explicitly opt into the NEW staging purpose.
 * Never copy the isolated sandbox IDs/secrets/Worker destination here.
 */
var SMA_STAGE_WITHDRAW_ID_V1636='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
var SMA_STAGE_WITHDRAW_PURPOSE_V1636='staging-member-withdraw-v1653';
var SMA_STAGE_WITHDRAW_HEADER_V1636=['memberId','displayName','withdrawnAt','withdrawnBy','state','operationId'];
var SMA_STAGE_MEMBER_ID_RE_V1653=/^M-[A-Z0-9-]{2,90}$/i;
var SMA_STAGE_UUID4_RE_V1636=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function accessStageBindingV1636_(ss){
  if(conf_('SPREADSHEET_ID')!==SMA_STAGE_WITHDRAW_ID_V1636||
     !ss||ss.getId()!==SMA_STAGE_WITHDRAW_ID_V1636)
    fail_('STAGING_ONLY','退会は接続ステージングの指定シートでのみ実行できます');
}
function accessStageGateV1636_(ss,id){
  accessStageBindingV1636_(ss);
  // Member ID never comes from LINE identity; it must be a fixed-ID target
  // chosen from the manager's authenticated member roster.
  if(conf_('WITHDRAW_ENABLED')!=='true'||
     conf_('STAGING_WITHDRAW_PURPOSE')!==SMA_STAGE_WITHDRAW_PURPOSE_V1636||
     !SMA_STAGE_MEMBER_ID_RE_V1653.test(id))
    fail_('WITHDRAW_DISABLED','検証環境の退会機能が有効ではありません');
}
function accessStageWithdrawHistoryV1636_(ss,memberRow){
  if(!memberRow||conf_('SPREADSHEET_ID')!==SMA_STAGE_WITHDRAW_ID_V1636||
     ss.getId()!==SMA_STAGE_WITHDRAW_ID_V1636)return false;
  var history=accessSheet16_(ss,'退会履歴',SMA_STAGE_WITHDRAW_HEADER_V1636);
  return accessRows16_(history,6).some(function(r){return str_(r[0])===str_(memberRow[0]);});
}
function accessStageWithdrawalV1636_(ss,member,payload){
  accessAdmin16_(member); // server-authenticated member only
  payload=payload||{};
  var id=str_(payload.memberId);
  // Reject before obtaining the write lock, and check again under that lock.
  accessStageGateV1636_(ss,id);
  if(id!==str_(payload.confirmMemberId))fail_('BAD_REQUEST','退会対象の確認が一致しません');
  var opId=str_(payload.operationId);
  if(!SMA_STAGE_UUID4_RE_V1636.test(opId))fail_('BAD_REQUEST','退会操作IDはUUID v4形式が必要です');
  if(id===str_(member.memberId))fail_('FORBIDDEN','自分自身は退会できません');
  return withLock_(function(){
    accessStageGateV1636_(ss,id);
    var memberSheet=accessSheet16_(ss,'メンバー',SM.headers['メンバー']);
    var teamSheet=accessSheet16_(ss,'チーム所属',SM.headers['チーム所属']);
    var reg=accessSheet16_(ss,SMA16.registrations,SMA16.regHeader);
    var links=accessSheet16_(ss,SMA16.links,SMA16.linkHeader);
    var history=accessSheet16_(ss,'退会履歴',SMA_STAGE_WITHDRAW_HEADER_V1636);
    accessSheet16_(ss,'操作履歴',SM.headers['操作履歴']);
    var members=sheetRows_(ss,'メンバー');
    var actor=members.filter(function(r){return str_(r[0])===str_(member.memberId);});
    if(actor.length!==1||!bool_(actor[0][3])||!bool_(actor[0][4])||
       !/^U[0-9a-f]{32}$/i.test(str_(actor[0][2]))||
       members.filter(function(r){return str_(r[2])===str_(actor[0][2]);}).length!==1)
      fail_('FORBIDDEN','管理者の有効な登録が確認できません');
    // Never replay an uncertain destructive operation, even with the same UUID.
    if(sheetRows_(ss,'操作履歴').some(function(r){return str_(r[0])===opId;}))
      fail_('CONFLICT','操作IDは既に使用されています。最新の一覧を確認してください');
    var matches=members.map(function(r,i){return {r:r,i:i};}).filter(function(x){return str_(x.r[0])===id;});
    if(matches.length!==1)fail_('NOT_FOUND','退会対象を一意に確認できません');
    var target=matches[0].r,idx=matches[0].i,lineId=str_(target[2]);
    if(!bool_(target[3])||bool_(target[4]))fail_('FORBIDDEN','停止中または管理者は退会できません');
    if(!/^U[0-9a-f]{32}$/i.test(lineId)||
       members.filter(function(r){return str_(r[2])===lineId;}).length!==1)
      fail_('CONFLICT','LINEユーザーIDが不正または重複しています');
    var historyRows=accessRows16_(history,6);
    if(historyRows.some(function(r){return str_(r[0])===id;}))
      fail_('CONFLICT','退会履歴が存在します。自動再実行しないでください');
    var teamRows=sheetRows_(ss,'チーム所属');
    var regRows=accessRows16_(reg,8),linkRows=accessRows16_(links,6);
    // Every schema validated and all dependencies read before the FIRST write.
    history.appendRow([id,safeCell_(str_(target[1])),accessTime16_(),str_(member.memberId),'processing',opId]);
    var historyRow=history.getLastRow();
    memberSheet.getRange(idx+2,4).setValue(false);
    SpreadsheetApp.flush();
    for(var li=0;li<linkRows.length;li++)if(str_(linkRows[li][4])===id&&!linkRows[li][3])
      links.getRange(li+2,4).setValue(accessTime16_());
    for(var ti=teamRows.length-1;ti>=0;ti--)if(str_(teamRows[ti][1])===id)teamSheet.deleteRow(ti+2);
    for(var ri=regRows.length-1;ri>=0;ri--)if(str_(regRows[ri][1])===lineId)reg.deleteRow(ri+2);
    // Never touch attendance, collection, finances or match history.
    history.getRange(historyRow,5).setValue('completed');
    SpreadsheetApp.flush();
    memberSheet.deleteRow(idx+2);
    var result={ok:true,data:{memberId:id,status:'withdrawn'}};
    audit_(ss,opId,'member.manage.withdraw',member,id,result);
    return result;
  });
}
/** Editor-only, READ-ONLY stage preflight. It cannot be routed through doPost. */
function accessStageWithdrawPreflightV1636(){
  var ss=ss_();accessStageBindingV1636_(ss);
  var members=sheetRows_(ss,'メンバー');
  var hist=accessRows16_(accessSheet16_(ss,'退会履歴',SMA_STAGE_WITHDRAW_HEADER_V1636),6);
  var actorCount=members.filter(function(r){return bool_(r[3])&&bool_(r[4]);}).length;
  var eligible=members.filter(function(r){var line=str_(r[2]);return bool_(r[3])&&!bool_(r[4])&&
    SMA_STAGE_MEMBER_ID_RE_V1653.test(str_(r[0]))&&
    /^U[0-9a-f]{32}$/i.test(line)&&members.filter(function(x){return str_(x[2])===line;}).length===1&&
    !hist.some(function(h){return str_(h[0])===str_(r[0]);});}).length;
  return {staging:true,readOnly:true,
    withdrawFlagEnabled:conf_('WITHDRAW_ENABLED')==='true',
    purposeConfigured:conf_('STAGING_WITHDRAW_PURPOSE')===SMA_STAGE_WITHDRAW_PURPOSE_V1636,
    activeAdminCount:actorCount,eligibleMemberCount:eligible,historyCount:hist.length};
}
function logStageWithdrawPreflightV1636(){
  console.log(JSON.stringify(accessStageWithdrawPreflightV1636()));
}
