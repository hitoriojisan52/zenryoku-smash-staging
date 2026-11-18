#!/usr/bin/env node
'use strict';
// Cross-functional staging UI regression for ALL persistent inline notices.
// Does NOT call any external API or modify a spreadsheet.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=x=>fs.readFileSync(path.join(root,x),'utf8');
const css=file('stage-ui.css'),live=file('live.html'),match=file('match.html'),
 view=file('match-view.html'),guest=file('guest.html'),liveJs=file('live.js'),
 matchJs=file('match.js'),viewJs=file('match-view.js'),guestJs=file('guest.js'),
 accessJs=file('access-ui.js'),confirm=file('match-confirm.js');
let n=0;function ok(v,msg){assert.ok(v,msg);n++;}
for(const [name,js] of Object.entries({'live':liveJs,'match':matchJs,'match-view':viewJs,'guest':guestJs,'access':accessJs})){
 new Function(js);n++;
}
const shared=['.stage-ui .stage-system-message{','.stage-ui .stage-system-message[hidden]',
 '.stage-ui .stage-system-message:empty','.stage-ui .stage-system-message--warning',
 '.stage-ui .stage-system-message--info','.stage-ui .stage-system-message--error',
 'overflow-wrap:anywhere','text-align:left','white-space:pre-line',
 'font-size:13px','line-height:1.55'];
for(const t of shared)ok(css.includes(t),'shared stage message CSS: '+t);
for(const [p,html] of [['live',live],['match',match],['match-view',view],['guest',guest]]){
 ok(html.includes('stage-ui.css?v=1641'),p+' loads same versioned shared styles');
 ok(html.includes('class="stage-system-message')||html.includes(' stage-system-message'),
  p+' has at least one system banner');
}
for(const [section,id,kind] of [
 ['collection lock','collectionLockReason','warning'],
 ['participant edit lock','participantNotice','warning'],
 ['visitor registration availability','visitorStatus','warning'],
 ['member access status','memberAccessStatus','info'],
 ['cash inventory status','cashStatus','warning'],
 ['member management diagnostics','memberAccessWithdrawCheckResultV1627','info']
]){
 const i=live.indexOf('id="'+id+'"');
 ok(i>=0,section+' slot present');
 const el=live.slice(Math.max(0,i-135),i+180);
 ok(el.includes('stage-system-message--'+kind),section+' severity unified');
 ok(el.includes('role="status"')&&el.includes('aria-live="polite"'),section+' accessible live updates');
}
for(const [section,id,kind,html] of [
 ['member registration and QR','accessMessage','info',match],
 ['spectator match errors','matchViewNotice','error',view],
 ['guest QR errors','guestNotice','error',guest]
]){
 const i=html.indexOf('id="'+id+'"');
 ok(i>=0,section+' slot present');
 const tag=html.slice(Math.max(0,i-130),i+190);
 ok(tag.includes('stage-system-message--'+kind),section+' consistent visual class');
 ok(tag.includes('role="status"')&&tag.includes('aria-live="polite"'),section+' accessible inline status');
}
ok(live.includes('live.js?v=1641')&&match.includes('match.js?v=1639b')&&
 view.includes('match-view.js?v=1639b')&&guest.includes('guest.js?v=1639b')&&
 match.includes('access-ui.js?v=1639b'),'all modified client scripts are cache-busted');
ok(liveJs.includes("className='schedule-note stage-system-message stage-system-message--info'"),
 'empty schedule/participants have same informational box');
ok(liveJs.includes("status.classList.toggle('stage-system-message--info',!snap)"),
 'cash loading state switches to informational style without losing warning style');
ok(liveJs.includes("const notice=$('participantNotice')")&&
 liveJs.includes("notice.hidden=!notice.textContent"),
 'participant lock message is hidden when editing is allowed');
ok(liveJs.includes("reason.hidden=!reason.textContent"),
 'collection warning only shown when collection is blocked');
ok(liveJs.includes("この開催日の回答データはありません。"),
 'old-v7 empty roster wording retained');
ok(matchJs.includes("const kind=editable&&count<4?'stage-system-message--warning':'stage-system-message--info'"),
 '0–3 eligible players use warning severity like collection-lock reason');
ok(matchJs.includes("message.setAttribute('role','status')")&&
 matchJs.includes("message.setAttribute('aria-live','polite')"),
 'dynamic match creation guidance is announced accessibly');
ok(matchJs.includes("main.disabled=(v.participants||[]).length<4"),
 'match precondition and button lock unchanged');
ok(viewJs.includes("function viewMessage_(")&&
 viewJs.includes('この開催日の対戦表はまだ作成されていません。'),
 'read-only spectator view has consistent empty-state banner');
ok(guestJs.includes("id")===false || guest.includes('id="guestNotice"'),
 'guest message target wired to existing public page');
ok(guestJs.includes("guestNotice").toString()==='true'&&guestJs.includes("stage-system-message--info"),
 'guest view includes error and empty match banner');
ok(accessJs.includes("say=(s,kind='info')")&&
 accessJs.includes("'stage-system-message--'+type"),
 'member registration / QR share statuses switch severity consistently');
ok(css.includes('#cashStatus.stage-system-message')&&css.includes('white-space:pre-line!important'),
 'cash warnings can wrap instead of truncating on mobile');
ok(css.includes('@media(prefers-reduced-motion:reduce)'),
 'reduced-motion setting for busy indicators is preserved');
ok(confirm.includes('match-modal-is-error')&&
 file('match.css').includes('.match-modal-is-error .match-modal-msg strong{color:#b71c1c}'),
 'deliberately distinct confirmation and error modal designs remain unchanged');
ok(liveJs.includes("toast('集金処理を更新しました')")&&matchJs.includes("notice('対戦表を削除しました')"),
 'transient success toasts remain transient, not confused with persistent notices');
console.log('PASS '+n+'/'+n+' stage-wide system message consistency, access, and unchanged modal semantics');
