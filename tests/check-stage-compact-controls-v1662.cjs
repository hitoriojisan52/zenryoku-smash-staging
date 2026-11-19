#!/usr/bin/env node
'use strict';
// Regression of the two user-observed differences between the old and new UI.
// Read/execute only local code; never sends requests or writes accounting rows.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('stage-ui.css'),js=read('live.js'),html=read('live.html');
let n=0;const ok=(condition,description)=>{assert.ok(condition,description);n++};
const mark=css.indexOf('/* v0.16.62 — Match the original');
ok(mark>0,'compact-height rules are appended after all legacy 44px rules');
const latest=css.slice(mark);
ok(/\.stage-ui button\{\s*min-height:38px!important;/.test(latest),
 'every staging action button gets a compact 38px minimum hitbox');
ok(/\.stage-ui input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=file\]\),\s*\.stage-ui select\{\s*height:38px!important;\s*min-height:38px!important;/.test(latest),
 'normal textboxes, date/number/month inputs and dropdowns are 38px high');
ok(/\.stage-ui textarea\{\s*min-height:38px!important;/.test(latest),
 'multiline fields have a compact minimum without fixed height');
ok(/\.stage-ui input\[type=file\]\{\s*min-height:38px!important;/.test(latest),
 'receipt upload keeps native presentation and compact minimum');
ok(/\.stage-ui dialog\.stage-has-toolbar \.stage-dialog-toolbar-actions button\{\s*min-height:38px!important;/.test(latest),
 'dialog Close button does not retain its legacy 44px important minimum');
ok(/\.stage-ui \.cash-count-btn\{\s*height:38px!important;\s*min-height:38px!important;/.test(latest),
 'cash-denomination +/- controls also shrink vertically');
ok(/\.stage-ui #ledgerDialog \.ledger-controls button,\s*\.stage-ui #ledgerDialog #newLedgerRow\{\s*min-height:38px!important;/.test(latest),
 'month navigation and + retain their single-row layout at the same height');
ok(!/^\s*(?:padding-inline|padding-left|padding-right|width|max-width|box-sizing):/m.test(latest),
 'compact-height patch never changes horizontal padding, width or box sizing');
ok(latest.includes('#list .participant-card .participant-memo{')&&
 latest.includes('color:#c62828;')&&
 latest.includes('font-weight:400!important;'),
 'collection HOME remark is red without forced bold styling');
ok(js.includes("memo.className='meta participant-memo'")&&
 js.includes("memo.textContent='📝 '+p.memo"),
 'real payment-list renderer keeps the memo text and supplies a unique red class');
const start=js.indexOf('function renderParticipantManager_(){'),
 end=js.indexOf('async function loadParticipants_(){',start);
ok(start>0&&end>start,'real participant list renderer found');
const roster=js.slice(start,end);
ok(roster.includes("note.textContent='📝 '+p.memo")&&
 !roster.includes("'📝 備考: '+p.memo")&&
 !roster.includes("'📝 備考：'+p.memo"),
 'participant management cards omit the redundant 備考: prefix');
ok(!latest.includes('.participant-card-memo')&&
 !latest.includes('.participant-card-details')&&
 !latest.includes('.participant-card-name'),
 'red memo rule cannot accidentally recolor roster details, names or attendance');
ok(css.includes('button:disabled')&&css.includes('color:#777f87'),
 'existing disabled button treatment remains in stylesheet');
for(const p of ['live.html','match.html','match-view.html','guest.html']){
 ok(read(p).includes('stage-ui.css?v=1663'),p+' loads compact controls and memo styles');
}
ok(html.includes('live.js?v=1663'),'collection and participant memo renderer is cache-busted');
ok(html.includes('id="adjustment"')&&html.includes('id="expense"')&&
 html.includes('id="confirm"')&&html.includes('id="list"'),
 'money inputs, Confirm and the independently scrollable list retain their original IDs');
console.log('PASS '+n+'/'+n+' compact 38px controls and memo-only visual changes');
