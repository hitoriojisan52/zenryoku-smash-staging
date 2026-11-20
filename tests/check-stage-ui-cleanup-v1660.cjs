#!/usr/bin/env node
'use strict';
/* v0.16.60 UI regression. Only source / DOM contracts, no external writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('live.html'),ui=read('live.js'),matchHtml=read('match.html'),
 match=read('match.js'),css=read('stage-ui.css'),gas=read('gas-staging/コード.gs');
let n=0;const ok=(x,m)=>{assert.ok(x,m);n++};
new Function(ui);new Function(gas);n+=2;
// Diagnostics are no longer a visible feature, but core LINE login, timing
// collection for bootstrap and auth failure UI are kept.
for(const id of ['lineIdPanel','lineIdValue','copyLineId','startupTimingPanel',
 'startupTimingDetails','copyStartupTiming']){
 ok(!matchHtml.includes('id="'+id+'"'),'match diagnostic element removed: '+id);
}
for(const identifier of ['showOwnLineId','copyOwnLineId','showStartupTimings',
 'copyStartupTimings','startupTimingDetails','lineIdValue']){
 ok(!match.includes(identifier),'no stale match diagnostic callback: '+identifier);
}
ok(match.includes('await timedStartup(')&&match.includes("liff.init({liffId:CFG.liffId})")&&
 match.includes('S.token=liff.getIDToken()')&&match.includes("CFG.useMatchBootstrap===true"),
 'LINE authentication, bootstrap and safe internal measurement remain intact');
ok(matchHtml.includes('match.js?v=1664')&&matchHtml.includes('id="accessRegKana"'),
 'match script refresh preserves required LINE member-registration fields');
// All management/home navigation buttons use the SAME existing neutral color.
const heading=html.match(/<header class="app-header">([\s\S]*?)<\/header>/)?.[1]||'';
const menu=html.match(/<div class="manage-grid">([\s\S]*?)<\/div>/)?.[1]||'';
ok(heading.includes('id="reimbursementBtn" class="btn-outline"')&&
 heading.includes('id="manageBtn" class="btn-outline"'),
 'both home navigation buttons are the neutral gray outline style');
const menuClasses=[...menu.matchAll(/<button[^>]*class="([^"]+)"/g)].map(x=>x[1]);
ok(menuClasses.length>=8&&menuClasses.every(x=>x==='btn-outline')&&
 !menu.includes('btn-blue'),'every management menu button is the SAME neutral style');
ok(css.includes('.stage-ui :is(#reimbursementBtn,#manageBtn)')&&
 css.includes('.stage-ui #manageDialog .manage-grid button{'),
 'navigation uses identical background/border while action colors stay distinct');
ok(css.includes('.stage-ui button{padding-block:2px;line-height:1.2}')&&
 css.includes('input:not([type=checkbox]):not([type=radio])')&&
 css.includes('.stage-ui .dialog-input,.stage-ui .dialog-select{padding-block:3px}')&&
 css.includes('.stage-ui .settings-row input,.stage-ui .settings-row select{'),
 'buttons, textboxes and dropdowns are all vertically compact');
ok(css.includes('.stage-ui .manage-grid button{min-height:44px')&&
 css.includes('.stage-ui button:is(.btn-blue,.btn-green,.btn-gray,.btn-outline,.btn-danger,.btn-finish,.access-danger-v2){'),
 'legacy 44px control rules are overridden by the latest compact dimensions');
ok(css.includes('dialog.stage-has-toolbar:not(#ledgerDialog) .stage-dialog-toolbar{')&&
 css.includes('grid-template-columns:minmax(0,1fr) auto')&&
 css.includes('.stage-dialog-toolbar-actions > .stage-dialog-top-close{')&&
 css.includes('grid-column:2;grid-row:1'),
 'Close always shares mobile title row even when Add/Refresh wraps separately');
ok(css.includes('.stage-dialog-toolbar-actions > button:not(.stage-dialog-top-close){')&&
 css.includes('grid-column:2;grid-row:2')&&
 read('dialog-close.js').includes("actions.append(closeButton)"),
 'original context actions keep their listeners and move below Close only when needed');
for(const page of ['live.html','match.html','match-view.html','guest.html'])
 ok(read(page).includes('stage-ui.css?v='+(page==='live.html'?'1676-responsive-reads':'1665')),page+' uses refreshed shared CSS');
// Participant management must NEVER show LINE identities; timestamps must
// be backed by existing immutable histories, not guessed date values.
const pBegin=ui.indexOf('function renderParticipantManager_(){');
const pEnd=ui.indexOf('async function loadParticipants_(',pBegin);
ok(pBegin>0&&pEnd>pBegin,'real participant list renderer found');
const participantUI=ui.slice(pBegin,pEnd);
ok(!participantUI.includes('LINE ID：')&&!participantUI.includes('p.lineUserId')&&
 participantUI.includes('📅 登録日：')&&participantUI.includes('🕒 更新日：'),
 'member/visitor cards hide LINE IDs and show signup and update fields');
ok(participantUI.includes("if(p.memo)")&&participantUI.includes("'📝 '+p.memo")&&
 participantUI.includes("details.append(updated)")&&participantUI.includes("details.append(registered)"),
 'notes appear only when present, dates display for everyone');
ok(participantUI.includes("return '未記録'")&&
 participantUI.includes("'未更新'")&&
 !participantUI.includes('🪪 利用登録日：'),
 'missing historical timestamps are not invented or confused with account signup');
const dataStart=gas.indexOf('function participantList_('),
 dataEnd=gas.indexOf('function participantArchivePending_(',dataStart);
ok(dataStart>0&&dataEnd>dataStart,'participation response function found');
const data=gas.slice(dataStart,dataEnd);
ok(data.includes("sheetRows_(ss,'参加者操作アーカイブ')")&&
 data.includes("str_(change[7])!=='completed'")&&
 data.includes("str_(change[3])!=='edit'")&&
 data.includes("r.updatedAt=")&&
 data.includes("r.registeredAt="),
 'read-only update date uses existing COMPLETED participant edit archives and LINE audit');
ok(!data.includes('.appendRow(')&&!data.includes('.setValues(')&&
 !data.includes('.deleteRow('),'participant list remains read only');
console.log('PASS '+n+'/'+n+' match diagnostics, neutral navigation, input density, Close toolbar and participant dates');
