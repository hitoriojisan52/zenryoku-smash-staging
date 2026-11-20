#!/usr/bin/env node
'use strict';
// UI-only contract: DOM placement, original event targets, date text and safe taps.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('live.html'),ui=read('live.js'),styles=read('stage-ui.css'),match=read('match.html'),
 visitor=read('visitor-approval.js'),close=read('dialog-close.js'),dateJs=read('date-format.js');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++};
const section=id=>{
 const start=html.indexOf('<dialog id="'+id+'"');
 assert.ok(start>=0,id+' dialog missing');
 const end=html.indexOf('</dialog>',start);
 assert.ok(end>start,id+' dialog unclosed');
 return html.slice(start,end);
};
const count=(s,p)=>(s.match(new RegExp(p,'g'))||[]).length;
const ledger=section('ledgerDialog'),sched=section('scheduleDialog'),
 people=section('participantDialog'),visitorMine=section('visitorDialog'),
 visitorAdmin=section('visitorAdminDialog'),members=section('memberAccessDialog');
ok(ledger.includes('id="newLedgerRow" class="btn-green" type="button" aria-label="収支を追加" title="収支を追加">＋</button>'),
 'ledger new row is a labeled single-character + with original ID');
const controls=ledger.match(/<div class="ledger-controls">([\s\S]*?)<\/div>/)?.[1]||'';
ok(['id="ledgerMonth"','id="prevMonth"','id="nextMonth"','id="newLedgerRow"'].every(x=>controls.includes(x))&&
 controls.indexOf('id="ledgerMonth"')<controls.indexOf('id="prevMonth"')&&
 controls.indexOf('id="prevMonth"')<controls.indexOf('id="nextMonth"')&&
 controls.indexOf('id="nextMonth"')<controls.indexOf('id="newLedgerRow"'),
 'month previous next and + in a single action row in requested order');
ok(styles.includes('#ledgerDialog .ledger-controls{')&&styles.includes('flex-wrap:nowrap!important')&&
 styles.includes('#ledgerDialog #newLedgerRow{'),
 'ledger date row cannot wrap on ordinary mobile widths');
const sbar=sched.match(/<div class="schedule-list-toolbar">([\s\S]*?)<\/div>/)?.[1]||'';
ok(sbar.includes('id="scheduleAdd"')&&sbar.includes('id="scheduleReload"')&&
 sched.indexOf('id="scheduleTitle"')<sched.indexOf('schedule-list-toolbar')&&
 sched.indexOf('schedule-list-toolbar')<sched.indexOf('id="scheduleList"'),
 'schedule Add/Refresh are directly below title, above list');
ok(!sched.slice(sched.indexOf('id="scheduleList"')).includes('id="scheduleReload"'),
 'schedule Refresh is not at the bottom');
const row=(s,id,refresh)=>{
 const m=s.match(new RegExp('<div class="(?:stage-date-refresh-row|participant-controls)">([\\s\\S]*?)<\\/div>','g'))||[];
 return m.some(x=>x.includes('id="'+id+'"')&&x.includes('id="'+refresh+'"')&&
 x.indexOf('id="'+id+'"')<x.indexOf('id="'+refresh+'"'));
};
ok(row(people,'participantPractice','participantReload'),
 'participant date selector and Refresh share one row');
ok(row(visitorMine,'visitorMinePractice','visitorMineRefresh'),
 'visitor requester date selector and Refresh share one row');
ok(row(visitorAdmin,'visitorAdminPractice','visitorAdminRefresh'),
 'visitor admin date selector and Refresh share one row');
ok(styles.includes('.stage-date-refresh-row select')&&
 styles.includes('flex:1 1 0;min-width:0!important')&&
 styles.includes('.stage-date-refresh-row button'),
 'date selectors shrink alongside compact Refresh without forcing a second row');
ok(members.includes('class="member-pending-heading"><h3>登録申請</h3><button id="memberAccessRefresh"')&&
 members.indexOf('member-pending-heading')<members.indexOf('id="memberAccessPending"'),
 'membership Refresh shares the pending registrations heading');
const summary=visitorMine.match(/<summary>([^<]+)<\/summary>/)?.[1]||'';
ok(summary==='新しいビジターを申請','visitor form title has no + prefix');
ok(styles.includes('#visitorNewFormSection > summary')&&
 styles.includes('#courtSettings > summary')&&
 styles.includes('#participantSettings > summary')&&
 styles.includes('display:flex;align-items:center;gap:7px;min-height:44px'),
 'visitor and both match settings foldable headings are vertically centered');
ok(match.includes('id="courtSettings"><summary>コート設定</summary>')&&
 match.includes('id="participantSettings"><summary>参加者・固定ペア設定</summary>'),
 'native collapsible match settings and their labels survive');
ok(close.includes('const topActions={};')&&
 ['scheduleAdd','scheduleReload','participantReload','visitorAdminRefresh',
 'memberAccessRefresh','newLedgerRow'].every(x=>!close.includes("['"+x+"']"))&&
 close.includes('toolbar.append(title,actions)')&&close.includes('actions.append(closeButton)'),
 'only Close moves to title; all existing context button IDs/events stay in place');
for(const id of ['refresh','attendanceReload','participantReload','scheduleReload',
 'visitorMineRefresh','visitorAdminRefresh','memberAccessRefresh']){
 const rx=new RegExp('<button[^>]*\\bid="'+id+'"[^>]*>🔄 更新<\\/button>');
 ok(rx.test(html),id+' uses the refresh emoji');
}
ok(/id="refreshMatch"[^>]*>🔄 更新<\/button>/.test(match),
 'match Refresh also uses emoji');
ok(!/<button[^>]*>更新<\/button>/.test(html+match+read('match-view.html')+read('guest.html')),
 'no remaining plain-Update buttons on active pages');
ok(styles.includes('padding-block:0!important')&&
 styles.includes('.stage-ui input:not([type=checkbox]):not([type=radio])')&&
 styles.includes('.stage-ui select,.stage-ui textarea'),
 'all buttons/text inputs/dropdowns have minimal vertical padding, no horizontal override');
ok(styles.includes('min-height:44px')&&styles.includes('.stage-date-refresh-row'),
 'compact controls preserve the one-row date layout');
const win={};vm.runInNewContext(dateJs,{window:win,Date,Intl});
const test={date:'2026-11-28',startTime:'9:00',endTime:'13:00',place:'曽谷公民館'};
ok(win.SMDate.practiceLabel(test)==='2026/11/28(土) 09:00～13:00 曽谷公民館',
 'common date + weekday + two times + venue exactly matches user example');
ok(win.SMDate.practiceLabel({...test,startTime:'09:00'})===win.SMDate.practiceLabel(test),
 'single-digit hour and existing zero-padded time are consistent');
ok(ui.includes('window.SMDate.practiceLabel(p),p.practiceId')&&
 visitor.includes('label:practiceOption(p)')&&
 visitor.includes('w.SMDate.upcomingPractices(practices)'),
 'participant and visitor selectors share detailed practice labels');
ok(!visitor.includes("{value:'all',text:'すべての日程'}")&&
 visitor.includes('r.date<today')&&
 visitor.includes('unique.has(previous)?previous'),
 'all/past dates excluded and manually chosen future date preserved');
ok(html.includes('date-format.js?v=1664')&&html.includes('visitor-approval.js?v=1664')&&
 html.includes('dialog-close.js?v=1673-receipt-close')&&html.includes('stage-ui.css?v=1673-receipt-close')&&
 html.includes('live.js?v=1676-responsive'),
 'all versioned page dependencies load new layout and date labels');
console.log('PASS '+checks+'/'+checks+' schedule/context controls, compact taps and Japanese dropdown labels');
