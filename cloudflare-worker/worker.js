/**
 * Cloudflare Workers API gateway for Zenryoku Smash.
 * A LINE ID token is verified with LINE's official endpoint for EVERY request.
 * The client cannot select its own LINE user ID or administrative role.
 * GAS remains the authorization and ledger source of truth.
 */
// v0.16.53 — GitHub main -> cloudflare-worker Workers Builds deployment sync.
// No credentials embedded; Cloudflare dashboard owns all runtime variables/secrets.
// Deployment still must be verified from Cloudflare builds and public /health.
const VALID_PATHS = Object.freeze({
  '/api/session':'session',
  '/api/attendance/mine':'attendance.mine',
  '/api/attendance/submit':'attendance.submit',
  '/api/member/status':'member.status',
  '/api/member/apply':'member.apply',
  '/api/member/manage/list':'member.manage.list',
  '/api/member/manage/decide':'member.manage.decide',
  '/api/member/manage/role':'member.manage.role',
  '/api/stage/self-role':'stage.selfRole', // authenticated, strict staging identity gate
  '/api/member/manage/edit':'member.manage.edit', // v0.16.57: name and optional kana, administrator validated by GAS
  '/api/member/manage/withdraw':'member.manage.withdraw', // v0.16.53: admin-only, strictly staging-bound, opt-in
  '/api/member/manage/withdraw/check':'member.manage.withdraw.check', // v0.16.27: read-only and admin-checked by GAS
  '/api/match/share':'match.share.issue',
  '/api/match/share/revoke':'match.share.revoke',
  '/api/match/guest':'match.guest.get',
  '/api/overview':'overview',
  '/api/payment':'payment.set',
  '/api/category':'category.set',
  '/api/adjustment':'adjustment.set',
  '/api/expense':'expense.set',
  '/api/ledger':'ledger.list',
  '/api/ledger/change':'ledger.change',
  '/api/receipt/upload':'receipt.upload',
  '/api/receipt/get':'receipt.get',
  '/api/cash/get':'cash.get',
  '/api/cash/save':'cash.save',
  '/api/schedule/list':'schedule.list',
  '/api/schedule/change':'schedule.change',
  '/api/schedule/delete-preview':'schedule.delete.preview',
  '/api/visitor/practices':'visitor.practices',
  '/api/visitor/register':'visitor.register',
  '/api/visitor/request':'visitor.request',
  '/api/visitor/mine':'visitor.mine',
  '/api/visitor/modify':'visitor.modify',
  '/api/visitor/admin-list':'visitor.admin.list',
  '/api/visitor/decide':'visitor.decide',
  '/api/participant/list':'participant.list',
  '/api/participant/change':'participant.change',
  '/api/roster/line':'roster.line',
  '/api/match/bootstrap':'match.bootstrap',
  '/api/match/practices':'match.practices',
  '/api/match/get':'match.get',
  '/api/match/line':'match.line',
  '/api/match/create':'match.create',
  '/api/match/delete':'match.delete',
  '/api/match/change':'match.change',
  '/api/match/operation':'match.operation'
});
function json(obj,status=200,origin='',serverTiming=''){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,content-type';headers['Access-Control-Allow-Methods']='POST,OPTIONS';headers['Access-Control-Expose-Headers']='Server-Timing';}
  if(origin&&serverTiming)headers['Server-Timing']=serverTiming;
  return new Response(JSON.stringify(obj),{status,headers});
}
function failure(message,status,origin,code){
  return json({ok:false,error:message,...(code?{code}:{})},status,origin);
}
function backendError(code,message){
  // Intentionally never include URL, upstream body, token or secret in browser errors.
  return Object.assign(new Error(message),{status:502,code});
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function knownError(code,message,status=502){
  // Only static status, code and messages; never include upstream data.
  return Object.assign(new Error(message),{status,code});
}
function exceptionType(e){
  return ['TypeError','SyntaxError','RangeError','ReferenceError','Error'].includes(e?.name)?e.name:'Other';
}

/**
 * Apps Script ContentService normally responds to a successful POST with a
 * 302 redirect to a one-time script.googleusercontent.com URL. Do not replay
 * the original POST, since it may have changed a match or financial state.
 * An occasional 404 at the one-time GET URL can be retried without executing
 * doPost again. Only fetch the expected Google ContentService host.
 */
async function fetchGasOnce(url,body,metrics={},deadline){
  let res;
  const postStart=performance.now();
  try{
    res=await fetch(url,{method:'POST',redirect:'manual',signal:deadline,
      headers:{'Content-Type':'text/plain; charset=utf-8'},body:JSON.stringify(body)});
  }catch(_){
    if(deadline?.aborted)throw knownError('GAS_TIMEOUT','GASの通信が15秒以内に完了しませんでした',504);
    throw backendError('GAS_CONNECT_FAILED','GASへの接続に失敗しました');
  }
  metrics.postMs=Math.max(0,Math.round(performance.now()-postStart));
  if([301,302,303].includes(res.status)){
    const location=res.headers.get('Location');
    let target;
    try{target=new URL(location);}catch(_){throw backendError('GAS_REDIRECT_INVALID','GASの応答先URLが不正です');}
    if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||!target.pathname.startsWith('/macros/echo')){
      throw backendError('GAS_REDIRECT_UNEXPECTED','GASの転送先が想定外です。Webアプリの公開設定とURLを確認してください');
    }
    // Follow at most one redirect hop. Retrying this GET never repeats doPost.
    const contentStart=performance.now();
    for(let attempt=0;attempt<3;attempt++){
      if(attempt)await delay(attempt===1?350:900);
      try{res=await fetch(target.toString(),{method:'GET',redirect:'manual',signal:deadline});}
      catch(_){
        if(deadline?.aborted)throw knownError('GAS_TIMEOUT','GASの通信が15秒以内に完了しませんでした',504);
        throw backendError('GAS_CONTENT_FETCH_FAILED','GASの応答を取得できませんでした');
      }
      if(res.status!==404)break;
    }
    metrics.contentMs=Math.max(0,Math.round(performance.now()-contentStart));
    if(res.status===404)throw backendError('GAS_CONTENT_404','GASの応答先が404を返しました。Google側の一時的な障害や公開設定をご確認ください');
    if(res.status>=300&&res.status<400)throw backendError('GAS_REDIRECT_LOOP','GASの転送先がさらに転送されました。公開URL・アクセス権限を確認してください');
  }else if(res.status>=300&&res.status<400){
    throw backendError('GAS_REDIRECT_UNEXPECTED','GASの転送方法が想定外です');
  }
  if(!res.ok){
    const code='GAS_HTTP_'+res.status;
    throw backendError(code,'GASがHTTP '+res.status+'を返しました。Webアプリの公開設定・URLを確認してください');
  }
  let responseText;
  try{responseText=await res.text();}catch(_){
    if(deadline?.aborted)throw knownError('GAS_TIMEOUT','GASの通信が15秒以内に完了しませんでした',504);
    throw backendError('GAS_BODY_FAILED','GASの応答を読み取れませんでした');
  }
  let result;
  try{result=JSON.parse(responseText);}catch(_){
    throw backendError('GAS_NOT_JSON','GASがJSON以外の応答を返しました。URL・公開設定を確認してください');
  }
  if(!result||typeof result.ok!=='boolean')throw backendError('GAS_BAD_RESPONSE','GASの応答形式が不正です');
  return result;
}
async function verifyLineToken(token,clientId,deadline){
  const params=new URLSearchParams({id_token:token,client_id:clientId});
  let resp;
  try{resp=await fetch('https://api.line.me/oauth2/v2.1/verify',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:params.toString(),redirect:'manual',signal:deadline
  });}catch(_){
    if(deadline?.aborted)throw knownError('LINE_VERIFY_TIMEOUT','LINE認証が15秒以内に完了しませんでした',504);
    throw knownError('LINE_VERIFY_CONNECT_FAILED','LINE認証サーバーに接続できませんでした');
  }
  // Cloudflare Workers does not implement redirect:'error'. Use manual and
  // refuse any 3xx so the ID token is never forwarded to another host.
  if(resp.status>=300&&resp.status<400){
    throw knownError('LINE_VERIFY_REDIRECT','LINE認証APIから想定外の転送応答がありました');
  }
  if(!resp.ok){
    if(resp.status>=500)throw knownError('LINE_VERIFY_UPSTREAM_ERROR','LINE認証サーバーが一時的にエラーを返しました');
    // Do not show token claims or LINE's raw error response to the browser.
    throw knownError('LINE_TOKEN_INVALID','LINE認証が無効です。LINEから再度開いてください',401);
  }
  let p;
  try{p=await resp.json();}catch(_){
    if(deadline?.aborted)throw knownError('LINE_VERIFY_TIMEOUT','LINE認証が15秒以内に完了しませんでした',504);
    throw knownError('LINE_VERIFY_NOT_JSON','LINE認証の応答を読み取れませんでした');
  }
  if(!p||typeof p!=='object'||Array.isArray(p)){
    throw knownError('LINE_VERIFY_BAD_RESPONSE','LINE認証サーバーの応答形式が不正です');
  }
  if(p.aud!==clientId||p.iss!=='https://access.line.me'||!/^U[0-9a-f]{32}$/i.test(p.sub||'')||Number(p.exp)*1000<=Date.now()){
    throw knownError('LINE_TOKEN_INVALID','LINE認証を検証できません。ログインチャネルとLIFFを確認してください',401);
  }
  return p.sub;
}
export async function handleRequest(request,env){
  const url=new URL(request.url);
  // Deployment-only check. Public, read-only, with no secret/config values.
  // It does NOT prove LINE authentication or GAS connectivity.
  if(url.pathname==='/health' && request.method==='GET'){
    const configured=Boolean(env.FRONTEND_ORIGIN&&env.LINE_LOGIN_CHANNEL_ID&&env.GAS_WEB_APP_URL&&env.GAS_SHARED_SECRET);
    // Public LIFF channel prefix (not a secret); disclose only a boolean,
    // never the configured environment value or any LINE token.
    const channelMatchesLiveLiff=env.LINE_LOGIN_CHANNEL_ID==='2012602642';
    return json({ok:true,status:'deployed',version:'0.16.65-stage-receipt',
      codeRevision:'stage-v1665-receipt-upload-20261119',
      configured,channelMatchesLiveLiff});
  }
  const origin=request.headers.get('Origin')||'';
  // Reject any browser origin other than the one approved GitHub Pages site.
  if(!env.FRONTEND_ORIGIN||!env.LINE_LOGIN_CHANNEL_ID||!env.GAS_WEB_APP_URL||!env.GAS_SHARED_SECRET){
    return failure('サーバー設定が未完了です',503);
  }
  if(origin!==env.FRONTEND_ORIGIN)return failure('許可されていないアクセス元です',403);
  if(request.method==='OPTIONS'){
    return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type',
      'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Max-Age':'1800','Vary':'Origin'
    }});
  }
  if(request.method!=='POST')return failure('POSTのみ対応しています',405,origin);
  const op=VALID_PATHS[url.pathname];
  if(!op)return failure('不明なAPIです',404,origin);
  const isGuest=op==='match.guest.get';
  const tokenMatch=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('Authorization')||'');
  if(!isGuest&&!tokenMatch)return failure('LINE認証が必要です',401,origin);
  const limit=op==='receipt.upload'?2200000:32768;
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>limit)return failure('要求が大きすぎます',413,origin);
  let phase='request_body';
  try{
    const raw=await request.text();
    if(raw.length>limit)return failure('要求が大きすぎます',413,origin);
    let payload;
    try{payload=JSON.parse(raw);}catch(_){return failure('要求のJSON形式が不正です（診断コード：BAD_REQUEST_JSON）',400,origin,'BAD_REQUEST_JSON');}
    if(!payload||Array.isArray(payload)||typeof payload!=='object')return failure('要求形式が不正です',400,origin);
    // Guest reads require a short-lived, server-issued bearer capability;
    // they never require a LINE login and never forward a member identity.
    if(isGuest){
      if(typeof payload.token!=='string'||! /^[0-9a-f]{64}$/.test(payload.token))
        return failure('閲覧リンクが無効です',403,origin,'GUEST_LINK_INVALID');
      const result=await fetchGasOnce(env.GAS_WEB_APP_URL,{
        sharedSecret:env.GAS_SHARED_SECRET,op:'match.guest.get',guestToken:payload.token,payload:{}
      });
      return json(result,result.ok?200:result.code==='UNAUTHORIZED'?403:result.code==='NOT_FOUND'?404:400,origin);
    }
    phase='line_verify';
    const lineStart=performance.now();
    const lineUserId=await verifyLineToken(tokenMatch[1],env.LINE_LOGIN_CHANNEL_ID);
    const lineMs=Math.max(0,Math.round(performance.now()-lineStart));
    // v0.16.53: ALL connected-staging members are authorized test data.
    // Preserve fail-closed gates on the exact staging workbook and purpose.
    // GAS independently rechecks both the admin and spreadsheet under Lock.
    const withdrawAtEdge=env.WITHDRAW_ENABLED==='true' &&
      env.WITHDRAW_STAGE_SPREADSHEET_ID==='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac' &&
      env.WORKER_PURPOSE==='staging-member-withdraw-v1653';
    if(op==='stage.selfRole'){
      // Existing independent staging purpose is required. A LINE member
      // cannot select a different identity: GAS binds the first real admin.
      if(!withdrawAtEdge||env.LINE_LOGIN_CHANNEL_ID!=='2012602642'||
         env.FRONTEND_ORIGIN!=='https://hitoriojisan52.github.io')
        return failure('権限切換は検証環境でのみ利用できます',403,origin,'STAGING_ONLY');
      if(payload.action!=='status'&&payload.action!=='change')
        return failure('権限切換操作が不正です',400,origin,'BAD_REQUEST');
      if(payload.action==='change'&&(
          !['admin','duty','member'].includes(payload.role)||
          !['admin','duty','member'].includes(payload.expectedRole)||
          typeof payload.operationId!=='string'||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.operationId)))
        return failure('権限指定または操作IDが不正です',400,origin,'BAD_REQUEST');
    }
    if(op==='receipt.upload'){
      if(typeof payload.rowId!=='string'||!/^([PR]-)[A-Za-z0-9_-]{1,100}$/.test(payload.rowId)||
         !Number.isSafeInteger(payload.expectedVersion)||payload.expectedVersion<1||
         typeof payload.fileName!=='string'||payload.fileName.length>120||
         !['application/pdf','image/png','image/jpeg','image/webp'].includes(payload.mimeType)||
         typeof payload.base64!=='string'||payload.base64.length>2100000||
         !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.base64))
        return failure('領収書の形式または対象行が不正です',400,origin,'BAD_REQUEST');
    }
    if(op==='receipt.get'&&
       (typeof payload.rowId!=='string'||!/^([PR]-)[A-Za-z0-9_-]{1,100}$/.test(payload.rowId)))
      return failure('領収書の対象行が不正です',400,origin,'BAD_REQUEST');
    if(op==='receipt.upload'){
      const b=payload.base64;
      if(typeof payload.rowId!=='string'||!/^([PR])-[-_A-Za-z0-9]{4,100}$/.test(payload.rowId)||
         !Number.isSafeInteger(payload.expectedVersion)||payload.expectedVersion<1||
         typeof payload.fileName!=='string'||!/^.{1,100}\.(pdf|png|jpe?g|webp)$/i.test(payload.fileName)||
         !['application/pdf','image/jpeg','image/png','image/webp'].includes(payload.mimeType)||
         typeof b!=='string'||b.length<8||b.length>2100000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b)||
         typeof payload.operationId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(payload.operationId))
        return failure('領収書の情報を確認してください',400,origin,'BAD_RECEIPT');
    }
    if(op==='receipt.get'&&(typeof payload.rowId!=='string'||!/^([PR])-[-_A-Za-z0-9]{4,100}$/.test(payload.rowId)))
      return failure('領収書の対象を確認してください',400,origin,'BAD_RECEIPT');
    if(op==='member.apply'){
      const kana=typeof payload.nameKana==='string'?payload.nameKana.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,''):'';
      if(typeof payload.displayName!=='string'||!payload.displayName.trim()||
         payload.displayName.length>30||!kana||kana.length>60||
         !/^[ァ-ヶー・]+$/.test(kana))
        return failure('登録申請の氏名・カナを確認してください',400,origin,'BAD_REQUEST');
    }
    if(op==='member.manage.edit'){
      if(Object.prototype.hasOwnProperty.call(payload,'nameKana')){
        const kana=typeof payload.nameKana==='string'?payload.nameKana.normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,''):null;
        if(kana===null||kana.length>60||(kana&&!/^[ァ-ヶー・]+$/.test(kana))||
           typeof payload.expectedKana!=='string'||payload.expectedKana.length>60)
          return failure('氏名カナの修正内容が不正です',400,origin,'BAD_REQUEST');
      }
      if(typeof payload.memberId!=='string'||!/^M-[A-Z0-9-]{2,90}$/i.test(payload.memberId)||
         typeof payload.displayName!=='string'||!payload.displayName.trim()||
         payload.displayName.length>30||
         typeof payload.expectedName!=='string'||!payload.expectedName.trim()||
         payload.expectedName.length>30||
         typeof payload.operationId!=='string'||
         !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.operationId))
        return failure('利用者情報の修正内容が不正です',400,origin,'BAD_REQUEST');
    }
    if(op==='member.manage.withdraw'){
      if(!withdrawAtEdge)
        return failure('退会機能は現在無効です。データは変更されません。',403,origin,'WITHDRAW_DISABLED');
      if(typeof payload.memberId!=='string'||
         !/^M-[A-Z0-9-]{2,90}$/i.test(payload.memberId)||
         payload.confirmMemberId!==payload.memberId||
         typeof payload.operationId!=='string'||
         !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.operationId))
        return failure('退会対象の確認情報が正しくありません',400,origin,'BAD_REQUEST');
    }
    phase='gas_forward';
    const gasMetrics={};
    const gasStart=performance.now();
    const result=await fetchGasOnce(env.GAS_WEB_APP_URL,
      {sharedSecret:env.GAS_SHARED_SECRET,lineUserId,op,payload},gasMetrics);
    // Never enable a destructive UI action until BOTH independent gates agree.
    // The boolean is safe for admin-only UI; do not publish secrets/IDs.
    if(op==='member.manage.list'&&result?.ok===true&&result?.data){
      result.data.withdrawEnabled=result.data.withdrawEnabled===true&&withdrawAtEdge;
    }
    const gasMs=Math.max(0,Math.round(performance.now()-gasStart));
    phase='reply';
    // Only the authenticated bootstrap response exposes static timing labels +
    // integer milliseconds. No ID tokens, LINE IDs, URLs or secret values.
    // Safe per-request latency phases, for all authenticated API calls.
    // Does not reveal LINE identifiers, tokens, spreadsheet URLs, or secrets.
    const timing=['line;dur='+lineMs,'gas;dur='+gasMs,
      'gas_post;dur='+Math.max(0,gasMetrics.postMs||0),
      'gas_content;dur='+Math.max(0,gasMetrics.contentMs||0)].join(', ');
    return json(result,result.ok?200:(['FORBIDDEN','WITHDRAW_DISABLED','STAGING_ONLY','TEST_TARGET_ONLY'].includes(result.code)?403:['CONFLICT','VERSION_CONFLICT','INVALID_LINEUP','UNDO_NOT_ALLOWED','OP_ID_REUSE'].includes(result.code)?409:result.code==='UNAUTHORIZED'?401:400),origin,timing);
  }catch(err){
    // All logs/browser error codes are static or sanitized. Never log original
    // exception message, URL, LINE ID/token, raw GAS response or shared secret.
    const status=Number.isInteger(err?.status)&&err.status>=400&&err.status<=599?err.status:502;
    const fallback={request_body:'WORKER_REQUEST_FAILED',line_verify:'LINE_VERIFY_UNEXPECTED',
      gas_forward:'GAS_FORWARD_UNEXPECTED',reply:'WORKER_RESPONSE_FAILED'}[phase]||'WORKER_UNEXPECTED';
    const code=typeof err?.code==='string'&&/^(GAS|LINE|WORKER)_[A-Z0-9_]{1,64}$/.test(err.code)
      ?err.code:fallback;
    console.warn('staging_gateway_failure',JSON.stringify({phase,code,errorType:exceptionType(err)}));
    if(status===401){
      return failure('LINE認証に失敗しました（診断コード：'+code+'）',401,origin,code);
    }
    if(status===502){
      // For classified known errors the message is a fixed string from this
      // source. For unexpected exceptions display only the safe stage.
      const known=/^(GAS_(CONNECT_FAILED|REDIRECT_INVALID|REDIRECT_UNEXPECTED|CONTENT_FETCH_FAILED|CONTENT_404|REDIRECT_LOOP|HTTP_[0-9]{3}|BODY_FAILED|NOT_JSON|BAD_RESPONSE)|LINE_VERIFY_(CONNECT_FAILED|UPSTREAM_ERROR|REDIRECT|NOT_JSON|BAD_RESPONSE))$/.test(code);
      const where=phase==='line_verify'?'LINE認証の検証中':phase==='gas_forward'?'GASへの中継中':'Workerの要求処理中';
      const message=(known?err.message:where+'に予期しないエラーが発生しました')+'（診断コード：'+code+'）';
      return failure(message,502,origin,code);
    }
    return failure('処理を完了できませんでした（診断コード：'+code+'）',status,origin,code);
  }
}
export default {fetch:handleRequest};