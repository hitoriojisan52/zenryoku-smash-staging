'use strict';
// Staging-only static contract: passive notes are neutral, actionable failures
// retain their severity, and all existing auth/payment operations remain intact.
const fs=require('node:fs'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const css=read('stage-ui.css'),html=read('live.html'),live=read('live.js'),
 visitor=read('visitor-approval.js'),match=read('match.js'),view=read('match-view.js'),
 guest=read('guest.js'),access=read('access-ui.js'),registration=read('registration.html'),
 matchHtml=read('match.html'),viewHtml=read('match-view.html'),guestHtml=read('guest.html');
assert.match(css,/\.stage-ui \.stage-system-message--neutral\{/);
assert.match(css,/background:#f4f6f8;border-color:#d8e0e7/);
for(const phrase of [
 'ご自身の練習出欠を送信・修正できます。',
 'ビジターの参加希望を受けたメンバーが申請します。',
 '出欠は参加者一覧と同様に変更できます。',
 '利用登録した本人の出欠だけを変更できます。'
]){
 const tag=html.split('\n').find(line=>line.includes(phrase));
 assert.ok(tag?.includes('stage-system-message--neutral'),'neutral explanation: '+phrase);
}
assert.ok(!live.includes("schedule-note stage-system-message stage-system-message--info'"));
assert.ok(live.includes("schedule-note stage-system-message stage-system-message--neutral'"));
assert.ok(visitor.includes("node('p','stage-system-message stage-system-message--neutral',label)"));
assert.ok(match.includes("count<4?'stage-system-message--warning':'stage-system-message--neutral'"));
assert.ok(view.includes("stage-system-message stage-system-message--neutral','この開催日の対戦表"));
assert.ok(guest.includes("'stage-system-message stage-system-message--neutral',"));
assert.ok(matchHtml.includes('id="accessMessage" class="stage-system-message stage-system-message--neutral"'));
assert.ok(access.includes("say=(s,kind='neutral')"));
assert.ok(access.includes("['info','neutral','processing','success','warning','error']"));
assert.ok(access.includes("'登録済みです。画面を開き直してください。','success'"));
assert.ok(access.includes("'登録申請済みです。管理者の承認をお待ちください。','warning'"));
for(const page of [html,registration,matchHtml,viewHtml,guestHtml]){
 assert.match(page,/stage-ui\.css\?v=[^"']*v1687-neutral/,'page loads latest neutral CSS');
}
assert.match(html,/stageRegistrationStatus" class="stage-system-message stage-system-message--info stage-inline-read-loading/,'legacy in-flight operation keeps spinner');
assert.match(live,/state\.classList\.add\('stage-inline-read-loading'\)/,'foreground reads retain spinner');
assert.match(live,/state\.classList\.add\('stage-system-message--error'\)/,'error reporting retained');
assert.match(match,/main\.disabled=\(v\.participants\|\|\[\]\)\.length<4/,'match creation safety retained');
assert.match(guest,/autoPausedOnError=false/,'QR refresh flow retained');
assert.match(css,/\.stage-system-message--processing:not\(:empty\)::before/);
assert.match(css,/\.stage-system-message--success:not\(:empty\)::before/);
assert.match(css,/\.stage-system-message--warning:not\(:empty\)::before/);
assert.match(css,/\.stage-system-message--error:not\(:empty\)::before/);
for(const p of [live,visitor,match,view,guest,access])new Function(p);
console.log('PASS v1687 neutral-only guidance while preserving blue progress and actionable severity');
