#!/usr/bin/env node
'use strict';
/* v0.16.77: synthetic ledger/date cases, no actual Sheet writes or LINE login. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const gas=read('gas-staging/コード.gs'),visitor=read('visitor-approval.js'),
 live=read('live.js'),access=read('live-access-v2.js'),
 css=read('stage-ui.css'),html=read('live.html');
let n=0;const ok=(yes,label)=>{assert.ok(yes,label);n++};
for(const src of [gas,visitor,live,access]){new Function(src);n++}
const w={};vm.runInNewContext(read('date-format.js'),{window:w,Intl,Date});
const today=w.SMDate.todayJst();
const plus=n=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const schedules=[
 {practiceId:'PAST-C',date:plus(-3)},
 {practiceId:'PAST-O',date:plus(-2)},
 {practiceId:'TODAY-C',date:today},
 {practiceId:'FUTURE-C',date:plus(2)},
 {practiceId:'FUTURE-O',date:plus(3)}
].map(x=>({...x,startTime:'10:00',endTime:'12:00',place:'検証会場'}));
const requests=schedules.map(x=>({...x,requestId:'VR-'+x.practiceId,status:'approved'}));
class Select{constructor(){this.value='';this.children=[];this.disabled=false;}replaceChildren(...xs){this.children=xs}}
const els={visitorMinePractice:new Select(),visitorAdminPractice:new Select()};
const makeOption=(tag,cls,text)=>({tag,className:cls,textContent:text,value:''});
const source=visitor.slice(visitor.indexOf(' function optionsFor('),visitor.indexOf(' function card('));
ok(source.includes('function optionsFor('),'run actual visitor selector');
const optionsFor=new Function('$','w','node','practiceOption',source+'return optionsFor;')(
 id=>els[id],w,makeOption,p=>w.SMDate.practiceLabel(p));
const confirmed=new Set(['PAST-C','TODAY-C','FUTURE-C']);
for(const id of ['visitorMinePractice','visitorAdminPractice']){
 optionsFor(requests,id,schedules,confirmed);
 const values=els[id].children.map(x=>x.value);
 ok(!values.includes('PAST-C')&&values.includes('PAST-O'),id+' hides only confirmed past');
 ok(values.includes('TODAY-C')&&values.includes('FUTURE-C')&&values.includes('FUTURE-O'),
  id+' does not hide confirmed today or future');
 ok(!els[id].children.some(x=>String(x.textContent).includes('履歴：'))&&els[id].value==='TODAY-C',
  id+' has no History prefix and prefers nearest current/future day');
 els[id].value='PAST-O';optionsFor(requests,id,schedules,confirmed);
 ok(els[id].value==='PAST-O',id+' retains open past selection');
 optionsFor(requests,id,schedules,new Set(['PAST-O',...confirmed]));
 ok(els[id].value!=='PAST-O'&&!els[id].children.some(x=>x.value==='PAST-O'),
  id+' removes selected day when confirmed');
 optionsFor(requests,id,schedules,new Set(['TODAY-C','FUTURE-C']));
 ok(els[id].children.some(x=>x.value==='PAST-C')&&els[id].children.some(x=>x.value==='PAST-O'),
  id+' shows dates after confirmation undo and refresh');
}
els.visitorMinePractice=new Select();
optionsFor(requests.slice(0,1),'visitorMinePractice',schedules.slice(0,1),new Set(['PAST-C']));
ok(els.visitorMinePractice.disabled&&els.visitorMinePractice.children.length===1&&
 els.visitorMinePractice.children[0].textContent==='選択可能な開催日がありません',
 'no eligible dates shows a disabled descriptive placeholder');
const helper=gas.slice(gas.indexOf('function visitorConfirmedPracticeIds_('),gas.indexOf('function visitorMine_('));
const entries=[{kind:'practice',status:'confirmed',practiceId:'PAST-C'},
 {kind:'practice',status:'open',practiceId:'PAST-O'},
 {kind:'other',status:'confirmed',practiceId:'OTHER'},
 {kind:'practice',status:'confirmed',practiceId:'TODAY-C'}];
const actual=new Function('entries_',helper+'return visitorConfirmedPracticeIds_;')(()=>entries);
ok(JSON.stringify(actual({}))===JSON.stringify(['PAST-C','TODAY-C']),
 'GAS detects confirmed practice rows only, not schedule-enabled flags');
for(const [start,end] of [['function visitorMine_(','function visitorAdminList_('],
 ['function visitorAdminList_(','function visitorRequest_(']]){
 const fn=gas.slice(gas.indexOf(start),gas.indexOf(end,gas.indexOf(start)));
 ok(fn.includes('confirmedPracticeIds:visitorConfirmedPracticeIds_(ss)'),
  'authorized visitor API returns authoritative ledger state');
}
ok(visitor.includes('!Array.isArray(result.confirmedPracticeIds)')&&
 !visitor.includes('adminHistoryVisible')&&!html.includes('id="visitorAdminHistoryToggle"'),
 'missing financial state fails closed and no admin history toggle remains');
ok(live.includes("replaceChildren(new Option('',''))")&&
 visitor.includes("replaceChildren(node('option','',''))")&&
 live.includes("$('visitorMinePractice').disabled=true")&&
 visitor.includes("$('visitorAdminPractice').disabled=true"),
 'requester and admin controls remain blank and disabled while reading; blue banner supplies activity text');
ok(live.includes("state.classList.add('stage-inline-read-loading')")&&
 live.includes("state.classList.remove('stage-inline-read-loading')")&&
 access.includes("'stage-inline-read-loading',loading")&&
 css.includes('.stage-system-message.stage-inline-read-loading::before')&&
 css.includes('prefers-reduced-motion:reduce'),
 'inline blue banner is animated, stops on completion and supports reduced motion');
for(const asset of ['stage-ui.css','live.js','visitor-approval.js','live-access-v2.js'])
 ok(html.includes(asset+'?v=1676-responsive-reads-v1677-visitor'),'LINE cached '+asset+' invalidated');
ok(!helper.includes('writeLedger_('),'new financial state helper is read only');
console.log('PASS '+n+'/'+n+' visitor finalized-date filtering, unlock visibility and inline activity');
