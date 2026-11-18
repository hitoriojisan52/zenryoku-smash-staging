/**
 * Cloudflare Workers API gateway for Zenryoku Smash.
 * A LINE ID token is verified with LINE's official endpoint for EVERY request.
 * The client cannot select its own LINE user ID or administrative role.
 * GAS remains the authorization and ledger source of truth.
 */
// v0.16.36: first Git-connected staging build trigger (no functional changes).
const VALID_PATHS = Object.freeze({
  '/api/session':'session',
  '/api/member/status':'member.status',
  '/api/member/apply':'member.apply',
  '/api/member/manage/list':'member.manage.list',
  '/api/member/manage/decide':'member.manage.decide',
  '/api/member/manage/role':'member.manage.role',
  '/api/member/manage/withdraw':'member.manage.withdraw', // v0.16.26: always blocked; never forwarded to GAS
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
  '/api/cash/get':'cash.get',
  '/api/cash/save':'cash.save',
  '/api/roster/line':'roster.line',
  '/api/match/bootstrap':'match.bootstrap',
  '/api/match/practices':'match.practices',
  '/api/match/get':'match.get',
  '/api/match/line':'match.line',
  '/api/match/create':'match.create',
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
async function fetchGasOnce(url,body,metrics={}){
  let res;
  const postStart=performance.now();
  try{
    res=await fetch(url,{method:'POST',redirect:'manual',
      headers:{'Content-Type':'text/plain; charset=utf-8'},body:JSON.stringify(body)});
  }catch(_){throw backendError('GAS_CONNECT_FAILED','GASへのネットワーク接続に失敗しました');}
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
      try{res=await fetch(target.toString(),{method:'GET',redirect:'manual'});}
      catch(_){throw backendError('GAS_CONTENT_FETCH_FAILED','GASの応答取得に失敗しました');}
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
  try{responseText=await res.text();}catch(_){throw backendError('GAS_BODY_FAILED','GASからの応答を読み取れませんでした');}
  let result;
  try{result=JSON.parse(responseText);}catch(_){
    throw backendError('GAS_NOT_JSON','GASがJSON以外の応答を返しました。URL・公開設定を確認してください');
  }
  if(!result||typeof result.ok!=='boolean')throw backendError('GAS_BAD_RESPONSE','GASの応答形式が不正です');
  return result;
}
async function verifyLineToken(token,clientId){
  const params=new URLSearchParams({id_token:token,client_id:clientId});
  let resp;
  try{resp=await fetch('https://api.line.me/oauth2/v2.1/verify',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),redirect:'manual'
  });}catch(_){
    throw knownError('LINE_VERIFY_CONNECT_FAILED','LINE認証サーバーへの接続に失敗しました');
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
    throw knownError('LINE_VERIFY_NOT_JSON','LINE認証サーバーからJSON応答を取得できませんでした');
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
    return json({ok:true,status:'deployed',version:'0.16.36c-stage-gated',configured});
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
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>32768)return failure('要求が大きすぎます',413,origin);
  let phase='request_body';
  try{
    const raw=await request.text();
    if(raw.length>32768)return failure('要求が大きすぎます',413,origin);
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
    // v0.16.36 connected-staging TEST-ONLY gate. No normal member can ever pass.
    // Two independent server flags must agree; authorization is rechecked by GAS.
    if(op==='member.manage.withdraw'){
      const stageId='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
      const target=String(env.WITHDRAW_TEST_MEMBER_ID||'');
      const permitted=env.WITHDRAW_ENABLED==='true' &&
        env.WITHDRAW_STAGE_SPREADSHEET_ID===stageId &&
        env.WORKER_PURPOSE==='staging-withdraw-test-v1636' &&
        /^M-TEST-STAGE-WITHDRAW-[A-Z0-9-]{4,64}$/.test(target);
      if(!permitted)return failure('退会機能は現在無効です。データは変更されません。',403,origin,'WITHDRAW_DISABLED');
      if(payload.memberId!==target||payload.confirmMemberId!==target||
         typeof payload.operationId!=='string'||
         !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.operationId))
        return failure('架空の検証対象以外は退会できません',403,origin,'TEST_TARGET_ONLY');
    }
    phase='gas_forward';
    const gasMetrics={};
    const gasStart=performance.now();
    const result=await fetchGasOnce(env.GAS_WEB_APP_URL,
      {sharedSecret:env.GAS_SHARED_SECRET,lineUserId,op,payload},gasMetrics);
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