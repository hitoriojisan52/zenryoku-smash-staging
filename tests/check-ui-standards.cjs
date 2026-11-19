#!/usr/bin/env node
'use strict';
// Run from any cwd: node tests/check-ui-standards.cjs
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let checked=0;
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8');}
function assert(value,message){if(!value)throw new Error('UI STANDARD FAILURE: '+message);checked++;}
const htmlPages=[
  'live.html','match.html','match-view.html','guest.html',
  'withdraw-sandbox/manage.html','withdraw-sandbox/register.html',
  'withdraw-v1629/manage.html','withdraw-v1629/register.html'
];
const disallowed=[
  '処理が完了するまで操作できません',
  '操作が完了するまでお待ちください',
  '完了まで操作できません'
];
for(const file of htmlPages){
  const html=read(file);
  for(const phrase of disallowed)
    assert(!html.includes(phrase),file+' has obsolete busy message: '+phrase);
}
for(const folder of ['withdraw-sandbox','withdraw-v1629']){
  const css=read(folder+'/sandbox.css');
  assert(css.includes('.sb-busy-dialog:focus-visible'),folder+' focus-only-on-busy rule missing');
  assert(css.includes('#memberAccessMembers .live-access-row button.btn-blue{'),'role change alignment override missing: '+folder);
  assert(/#memberAccessMembers \.live-access-row button\.btn-blue\s*\{[^}]*margin-top\s*:\s*0\s*;/m.test(css),'role change margin-top reset missing: '+folder);
  for(const file of ['manage.html','register.html']){
    const html=read(folder+'/'+file);
    assert(html.includes('id="sandboxBusyText"'),folder+'/'+file+' busy label missing');
    assert(html.includes('class="sb-spinner"'),folder+'/'+file+' spinner missing');
    assert(!html.includes('sandboxBusyHelp'),folder+'/'+file+' stale aria reference');
    const cssVer=file==='manage.html'?'1633align':'1632busy';
    assert(html.includes('./sandbox.css?v='+cssVer),folder+'/'+file+' CSS cache not refreshed');
  }
}
const stage=read('stage-ui.css');
assert(stage.includes('dialog#stageBusyDialog:focus-visible'),'production stage busy focus guard missing');
const stagingLive=read('live.html'),stagingMatch=read('match.html');
assert(stagingLive.includes('id="stageBusyLabel"'),'live processing label missing');
assert(stagingMatch.includes('id="matchBusyLabel"'),'match processing label missing');
const api=read('withdraw-sandbox/api.js');
// v0.16.34+: the sandbox is preview-only by default; explicit, target-locked tests are allowed.
assert(api.includes('const EXECUTION_REQUESTED=executionRequested();'),'withdrawal execution must be explicitly requested');
assert(api.includes("location.pathname!==EXACT_PATH+'manage.html'"),'withdrawal execution must only be requested from the sandbox management page');
assert(api.includes("q.get('withdrawExec')==='1630'"),'withdrawal mode must require the exact synthetic opt-in');
assert(api.includes('withdrawUiEnabled: EXECUTION_REQUESTED'),'normal sandbox UI must default to preview-only');
assert(api.includes('if(!EXECUTION_REQUESTED)'),'withdrawal API must fail closed without opt-in');
assert(api.includes('payload?.memberId!==TARGET||payload?.confirmMemberId!==TARGET'),'withdrawal API must validate both matching synthetic IDs');
// Check-only LIFF deep-link must open the manager after bootstrap, without auto-opening on normal URLs.
const accessV2=read('live-access-v2.js'),liveJs=read('live.js'),v2Mode=read('access-v2-mode.js');
assert(accessV2.includes('openFromCheckLink(){'),'check-specific deep link handler missing');
assert(accessV2.includes("window.SM_STAGE_WITHDRAW_CHECK!==true||actorRole!=='admin'"),'deep link must require exact flag and admin');
assert(accessV2.includes('await open();'),'check deep link must await member management load');
assert(liveJs.includes(".then(()=>window.SMLiveAccess?.openFromCheckLink?.())"),'manager opens only after initial busy loading');
assert(accessV2.includes("checkButton.scrollIntoView?.({block:'center'})"),'check button should be visible on deep-linked modal');
assert(stagingLive.includes('live-access-v2.js?v=1663'),'management script cache must refresh');
assert(stagingLive.includes('live.js?v=1664'),'startup script cache must refresh');
assert(v2Mode.includes("direct.get('withdrawCheck')==='1'"),'check deep link flag missing');
console.log('PASS: '+checked+' UI standard checks');
