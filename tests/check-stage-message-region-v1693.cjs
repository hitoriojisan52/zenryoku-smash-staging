#!/usr/bin/env node
'use strict';
// v0.16.93: shared banner position for all severity colors, not an
// accounting/mutation change. Audit screen top, amounts and error fallback.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const src=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const home=src('live.html'),js=src('live.js'),css=src('stage-ui.css'),stage=src('stage-ui.js'),
 match=src('match.html'),view=src('match-view.html'),guest=src('guest.html');
const pos=(s,txt)=>{const p=s.indexOf(txt);assert.ok(p>=0,'missing '+txt);return p;};
const homeArea=home.slice(pos(home,'id="stageHomeMessageRegion"'),
 pos(home,'<details id="perfBreakdown"'));
for(const id of ['stageInlineError','collectionLockReason','confirmLockReason']){
 assert.ok(homeArea.includes('id="'+id+'"'),id+' is in the SAME screen-top system region');
 assert.equal(home.split('id="'+id+'"').length-1,1,id+' exists once');
}
assert.ok(pos(home,'id="stageHomeMessageRegion"')>pos(home,'class="summary-info"'));
assert.ok(pos(home,'id="stageHomeMessageRegion"')<pos(home,'id="list"'));
assert.ok(pos(home,'id="confirmLockReason"')<pos(home,'id="adjustment"'),
 'legacy chronological-warning notice is no longer below footer');
assert.match(homeArea,/stage-system-message--error/);
assert.match(homeArea,/stage-system-message--warning/);
assert.match(css,/\.stage-ui \.stage-message-region\{[\s\S]*?display:grid;/,
 'all severity banners have a dedicated reusable screen-top region');
for(const type of ['processing','success','warning','error']){
 assert.ok(css.includes('.stage-system-message--'+type),
   type+' uses the existing canonical box with common placement');
}
assert.match(home,/class="adjustment-box"[\s\S]*?class="stage-money-save-pair"><small id="adjustmentStatus"[\s\S]*?<span><input id="adjustment"/,
 'adjustment save text is left of its input within one unbreakable pair');
assert.match(home,/class="expense-actions"[\s\S]*?class="stage-money-save-pair"><small id="expenseStatus"[\s\S]*?<span><input id="expense"/,
 'expense save text is left of its input within one unbreakable pair');
assert.match(css,/\.stage-money-save-pair\{[\s\S]*?display:inline-flex/);
assert.match(css,/\.expense-box > \.expense-actions\{[\s\S]*?flex-wrap:wrap;/,
 'narrow screen can wrap receipt actions without splitting save status from input');
assert.ok(home.includes('v1693-unified-top')&&home.includes('v1693-ledger-verify'),
 'staging UI cache keys are bumped for LINE WebView');
const errorSource=js.slice(pos(js,'function showHomeReadError_('),pos(js,'async function reload(',pos(js,'function showHomeReadError_(')));
assert.match(errorSource,/const error=\$\('stageInlineError'\)/,
 'home read errors use the top red banner');
assert.match(errorSource,/list\.replaceChildren\(\)/,'home read failure empties stale cards');
assert.doesNotMatch(errorSource,/list\.replaceChildren\(error\)/,
 'read errors must NOT use the bottom of the participant list');
const dollarNodes={};
const $=id=>dollarNodes[id]||(dollarNodes[id]={
 textContent:'',hidden:true,disabled:false,replaceChildren(){this.cleared=true;}
});
const showHomeReadError_=new Function('showHomeReadError_({code:'REQUEST_TIMEOUT'});
assert.equal(dollarNodes.stageInlineError.hidden,false);
assert.match(dollarNodes.stageInlineError.textContent,/15秒/);
assert.equal(dollarNodes.list.cleared,true);
assert.equal(dollarNodes.refresh.disabled,false,'manual refresh remains available');
assert.equal(dollarNodes.confirm.disabled,true,'financial mutation blocked after read error');
assert.match(stage,/const home=\$\('stageInlineError'\);[\s\S]*?if\(home\)\{home\.textContent=message;home\.hidden=false;return;\}/,
 'global error handler prefers same home top region before any list error');
for(const [name,html,id] of [
 ['match',match,'matchInlineError'],
 ['match-view',view,'matchViewNotice'],
 ['guest',guest,'guestNotice']
]){
 const region=pos(html,'class="stage-message-region"'),notice=pos(html,'id="'+id+'"');
 assert.ok(notice>region,name+' notice is inside dedicated top region');
 assert.ok(notice-region<450,name+' notice is immediately near region start');
 assert.ok(html.includes('v1693-unified-top'),name+' cache busts shared styles');
}
assert.ok(pos(match,'id="matchInlineError"')<pos(match,'class="date-selector"'));
assert.ok(pos(view,'id="matchViewNotice"')<pos(view,'class="date-selector"'));
assert.ok(pos(guest,'id="guestNotice"')<pos(guest,'id="guestPractice"'));
for(const [id,after] of [
 ['visitorStatus','<section class="visitor-my-requests"'],
 ['attendanceNotice','<form id="attendanceForm"'],
 ['participantNotice','<div class="participant-controls"'],
 ['memberAccessEditStatusV1656','<form id="memberAccessEditFormV1656"']
]){
 assert.ok(pos(home,'id="'+id+'"')<pos(home,after),id+' alert is above its editing controls');
}
for(const t of ['/api/ledger/change','ledger.canConfirm===false','ledger?.canConfirm!==true']){
 assert.ok(js.includes(t),'existing accounting checks stay in place: '+t);
}
const memberArea=home.slice(pos(home,'id="memberAccessDialog"'),pos(home,'class="member-pending-heading"'));
for(const id of ['memberAccessStatus','memberAccessWithdrawPreviewStatusV1624',
 'memberAccessWithdrawCheckResultV1627']){
 assert.ok(memberArea.includes('id="'+id+'"'),id+' is at member management top');
}
const access=src('live-access-v2.js');
assert.match(access,/previewStatus\.hidden=section\.hidden/,
 'withdraw diagnostic is hidden when optional preview is hidden');
assert.match(stage,/if\(region\)region\.insertAdjacentElement\('afterbegin',note\)/,
 'dialog errors are inserted in shared area before any local content');
for(const id of ['stageRolePreviewActual','memberAccessStatus','stageLineAuthHelp']){
 const at=pos(home,'id="'+id+'"');
 assert.ok(home.slice(at,at+160).includes('stage-system-message--neutral'),
  id+' is passive neutral, never blue processing');
}
assert.match(src('stage-role-preview.js'),/canSwitch\?'neutral':'warning'/,
 'normal role hint is neutral');
assert.match(access,/stage-system-message--neutral',!error&&!loading/,
 'member management stable state is neutral');

console.log('PASS v1693 common top-of-screen system notice region and left-of-input amount status, no ledger writes');
,'S',errorSource+'\nreturn showHomeReadError_;')(
 $, {pending:new Set()});
showHomeReadError_({code:'REQUEST_TIMEOUT'});
assert.equal(dollarNodes.stageInlineError.hidden,false);
assert.match(dollarNodes.stageInlineError.textContent,/15秒/);
assert.equal(dollarNodes.list.cleared,true);
assert.equal(dollarNodes.refresh.disabled,false,'manual refresh remains available');
assert.equal(dollarNodes.confirm.disabled,true,'financial mutation blocked after read error');
assert.match(stage,/const home=\$\('stageInlineError'\);[\s\S]*?if\(home\)\{home\.textContent=message;home\.hidden=false;return;\}/,
 'global error handler prefers same home top region before any list error');
for(const [name,html,id] of [
 ['match',match,'matchInlineError'],
 ['match-view',view,'matchViewNotice'],
 ['guest',guest,'guestNotice']
]){
 const region=pos(html,'class="stage-message-region"'),notice=pos(html,'id="'+id+'"');
 assert.ok(notice>region,name+' notice is inside dedicated top region');
 assert.ok(notice-region<450,name+' notice is immediately near region start');
 assert.ok(html.includes('v1693-unified-top'),name+' cache busts shared styles');
}
assert.ok(pos(match,'id="matchInlineError"')<pos(match,'class="date-selector"'));
assert.ok(pos(view,'id="matchViewNotice"')<pos(view,'class="date-selector"'));
assert.ok(pos(guest,'id="guestNotice"')<pos(guest,'id="guestPractice"'));
for(const [id,after] of [
 ['visitorStatus','<section class="visitor-my-requests"'],
 ['attendanceNotice','<form id="attendanceForm"'],
 ['participantNotice','<div class="participant-controls"'],
 ['memberAccessEditStatusV1656','<form id="memberAccessEditFormV1656"']
]){
 assert.ok(pos(home,'id="'+id+'"')<pos(home,after),id+' alert is above its editing controls');
}
for(const t of ['/api/ledger/change','ledger.canConfirm===false','ledger?.canConfirm!==true']){
 assert.ok(js.includes(t),'existing accounting checks stay in place: '+t);
}
const memberArea=home.slice(pos(home,'id="memberAccessDialog"'),pos(home,'class="member-pending-heading"'));
for(const id of ['memberAccessStatus','memberAccessWithdrawPreviewStatusV1624',
 'memberAccessWithdrawCheckResultV1627']){
 assert.ok(memberArea.includes('id="'+id+'"'),id+' is at member management top');
}
const access=src('live-access-v2.js');
assert.match(access,/previewStatus\.hidden=section\.hidden/,
 'withdraw diagnostic is hidden when optional preview is hidden');
assert.match(stage,/if\(region\)region\.insertAdjacentElement\('afterbegin',note\)/,
 'dialog errors are inserted in shared area before any local content');
for(const id of ['stageRolePreviewActual','memberAccessStatus','stageLineAuthHelp']){
 const at=pos(home,'id="'+id+'"');
 assert.ok(home.slice(at,at+160).includes('stage-system-message--neutral'),
  id+' is passive neutral, never blue processing');
}
assert.match(src('stage-role-preview.js'),/canSwitch\?'neutral':'warning'/,
 'normal role hint is neutral');
assert.match(access,/stage-system-message--neutral',!error&&!loading/,
 'member management stable state is neutral');

console.log('PASS v1693 common top-of-screen system notice region and left-of-input amount status, no ledger writes');
,'S',errorSource+'\nreturn showHomeReadError_;')($,{pending:new Set()});
showHomeReadError_({code:'REQUEST_TIMEOUT'});
assert.equal(dollarNodes.stageInlineError.hidden,false);
assert.match(dollarNodes.stageInlineError.textContent,/15秒/);
assert.equal(dollarNodes.list.cleared,true);
assert.equal(dollarNodes.refresh.disabled,false,'manual refresh remains available');
assert.equal(dollarNodes.confirm.disabled,true,'financial mutation blocked after read error');
assert.match(stage,/const home=\$\('stageInlineError'\);[\s\S]*?if\(home\)\{home\.textContent=message;home\.hidden=false;return;\}/,
 'global error handler prefers same home top region before any list error');
for(const [name,html,id] of [
 ['match',match,'matchInlineError'],
 ['match-view',view,'matchViewNotice'],
 ['guest',guest,'guestNotice']
]){
 const region=pos(html,'class="stage-message-region"'),notice=pos(html,'id="'+id+'"');
 assert.ok(notice>region,name+' notice is inside dedicated top region');
 assert.ok(notice-region<450,name+' notice is immediately near region start');
 assert.ok(html.includes('v1693-unified-top'),name+' cache busts shared styles');
}
assert.ok(pos(match,'id="matchInlineError"')<pos(match,'class="date-selector"'));
assert.ok(pos(view,'id="matchViewNotice"')<pos(view,'class="date-selector"'));
assert.ok(pos(guest,'id="guestNotice"')<pos(guest,'id="guestPractice"'));
for(const [id,after] of [
 ['visitorStatus','<section class="visitor-my-requests"'],
 ['attendanceNotice','<form id="attendanceForm"'],
 ['participantNotice','<div class="participant-controls"'],
 ['memberAccessEditStatusV1656','<form id="memberAccessEditFormV1656"']
]){
 assert.ok(pos(home,'id="'+id+'"')<pos(home,after),id+' alert is above its editing controls');
}
for(const t of ['/api/ledger/change','ledger.canConfirm===false','ledger?.canConfirm!==true']){
 assert.ok(js.includes(t),'existing accounting checks stay in place: '+t);
}
const memberArea=home.slice(pos(home,'id="memberAccessDialog"'),pos(home,'class="member-pending-heading"'));
for(const id of ['memberAccessStatus','memberAccessWithdrawPreviewStatusV1624',
 'memberAccessWithdrawCheckResultV1627']){
 assert.ok(memberArea.includes('id="'+id+'"'),id+' is at member management top');
}
const access=src('live-access-v2.js');
assert.match(access,/previewStatus\.hidden=section\.hidden/,
 'withdraw diagnostic is hidden when optional preview is hidden');
assert.match(stage,/if\(region\)region\.insertAdjacentElement\('afterbegin',note\)/,
 'dialog errors are inserted in shared area before any local content');
for(const id of ['stageRolePreviewActual','memberAccessStatus','stageLineAuthHelp']){
 const at=pos(home,'id="'+id+'"');
 assert.ok(home.slice(at,at+160).includes('stage-system-message--neutral'),
  id+' is passive neutral, never blue processing');
}
assert.match(src('stage-role-preview.js'),/canSwitch\?'neutral':'warning'/,
 'normal role hint is neutral');
assert.match(access,/stage-system-message--neutral',!error&&!loading/,
 'member management stable state is neutral');

console.log('PASS v1693 common top-of-screen system notice region and left-of-input amount status, no ledger writes');
,'S',errorSource+'\nreturn showHomeReadError_;')(
 $, {pending:new Set()});
showHomeReadError_({code:'REQUEST_TIMEOUT'});
assert.equal(dollarNodes.stageInlineError.hidden,false);
assert.match(dollarNodes.stageInlineError.textContent,/15秒/);
assert.equal(dollarNodes.list.cleared,true);
assert.equal(dollarNodes.refresh.disabled,false,'manual refresh remains available');
assert.equal(dollarNodes.confirm.disabled,true,'financial mutation blocked after read error');
assert.match(stage,/const home=\$\('stageInlineError'\);[\s\S]*?if\(home\)\{home\.textContent=message;home\.hidden=false;return;\}/,
 'global error handler prefers same home top region before any list error');
for(const [name,html,id] of [
 ['match',match,'matchInlineError'],
 ['match-view',view,'matchViewNotice'],
 ['guest',guest,'guestNotice']
]){
 const region=pos(html,'class="stage-message-region"'),notice=pos(html,'id="'+id+'"');
 assert.ok(notice>region,name+' notice is inside dedicated top region');
 assert.ok(notice-region<450,name+' notice is immediately near region start');
 assert.ok(html.includes('v1693-unified-top'),name+' cache busts shared styles');
}
assert.ok(pos(match,'id="matchInlineError"')<pos(match,'class="date-selector"'));
assert.ok(pos(view,'id="matchViewNotice"')<pos(view,'class="date-selector"'));
assert.ok(pos(guest,'id="guestNotice"')<pos(guest,'id="guestPractice"'));
for(const [id,after] of [
 ['visitorStatus','<section class="visitor-my-requests"'],
 ['attendanceNotice','<form id="attendanceForm"'],
 ['participantNotice','<div class="participant-controls"'],
 ['memberAccessEditStatusV1656','<form id="memberAccessEditFormV1656"']
]){
 assert.ok(pos(home,'id="'+id+'"')<pos(home,after),id+' alert is above its editing controls');
}
for(const t of ['/api/ledger/change','ledger.canConfirm===false','ledger?.canConfirm!==true']){
 assert.ok(js.includes(t),'existing accounting checks stay in place: '+t);
}
const memberArea=home.slice(pos(home,'id="memberAccessDialog"'),pos(home,'class="member-pending-heading"'));
for(const id of ['memberAccessStatus','memberAccessWithdrawPreviewStatusV1624',
 'memberAccessWithdrawCheckResultV1627']){
 assert.ok(memberArea.includes('id="'+id+'"'),id+' is at member management top');
}
const access=src('live-access-v2.js');
assert.match(access,/previewStatus\.hidden=section\.hidden/,
 'withdraw diagnostic is hidden when optional preview is hidden');
assert.match(stage,/if\(region\)region\.insertAdjacentElement\('afterbegin',note\)/,
 'dialog errors are inserted in shared area before any local content');
for(const id of ['stageRolePreviewActual','memberAccessStatus','stageLineAuthHelp']){
 const at=pos(home,'id="'+id+'"');
 assert.ok(home.slice(at,at+160).includes('stage-system-message--neutral'),
  id+' is passive neutral, never blue processing');
}
assert.match(src('stage-role-preview.js'),/canSwitch\?'neutral':'warning'/,
 'normal role hint is neutral');
assert.match(access,/stage-system-message--neutral',!error&&!loading/,
 'member management stable state is neutral');

console.log('PASS v1693 common top-of-screen system notice region and left-of-input amount status, no ledger writes');
