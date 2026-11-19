#!/usr/bin/env node
'use strict';
// Execute the real staging finance table renderer offline (no external API).
// CSS switches the same semantic table to cards ONLY on narrow screens.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=file('live.js'),html=file('live.html'),css=file('stage-ui.css');
let n=0;
const ok=(v,m)=>{assert.ok(v,m);n++};
ok(!html.includes('id="demoRole"')&&!ui.includes("$('demoRole')"),
 'dead demo-role dropdown and JS lookup are removed; auth still supplies role');
ok(html.includes('id="ledgerDialog"')&&html.includes('id="newLedgerRow"')&&
 html.includes('id="closeLedger"')&&html.includes('id="ledgerBody"'),
 'original ledger dialogs, add, close and table IDs preserved');
ok(file('dialog-close.js').includes("ledgerDialog:['newLedgerRow']")&&
 css.includes('#ledgerDialog .stage-dialog-toolbar{')&&
 css.includes('flex-wrap:nowrap;align-items:center'),
 'original add/close controls align with title without duplicate actions');
ok(css.includes('font-size:clamp(12px,3.8vw,16px)')&&
 css.includes('#ledgerDialog .stage-dialog-toolbar-actions button{'),
 'ledger header remains compact on phones');
ok(css.includes('@media (max-width:900px)')&&
 css.includes('#ledgerDialog .ledger-table tbody tr{')&&
 css.includes('display:grid;grid-template-columns:minmax(0,1fr)'),
 'mobile ledger uses real vertically stacked table-row cards');
ok(css.includes('overflow-y:auto;overflow-x:hidden')&&
 css.includes('min-width:0!important'), 'mobile cards do not need horizontal scrolling');
for(const column of ['date','label','income','expense','balance','confirmed']){
 ok(css.includes('td.ledger-col-'+column+'{'),
 'mobile card has independently positioned '+column);
}
ok(css.includes('.ledger-col-balance::before{content:"残高："')&&
 css.includes('.ledger-col-label::before{content:"項目："')&&
 css.includes('.ledger-col-confirmed::before{content:"確認者："'),
 'cards label finance data rather than relying on hidden table headings');
ok(css.includes('.stage-ui button{min-height:44px;font-size:14px;font-weight:700;padding-block:5px}')&&
 css.includes('min-width:44px;min-height:44px;padding:5px 7px'),
 'all stage screens reduce vertical padding but card actions keep 44px tap areas');
for(const page of ['live.html','match.html','match-view.html','guest.html']){
 ok(file(page).includes('stage-ui.css?v=1660'),page+' refreshes shared compact CSS');
}
ok(html.includes('live.js?v=1660'),'ledger JS cache bust applied');
ok(css.includes('tr.carry-row{')&&
 css.includes('#ledgerDialog .ledger-table tbody tr.carry-row'),
 'carry-forward light yellow styling preserved in both layouts');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.value='';
  this.className='';this.disabled=false;this.handlers={};this.classes=new Set();
  this.classList={add:x=>this.classes.add(x)};}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=[...items]}
 addEventListener(event,fn){this.handlers[event]=fn}
}
const nodes={ledgerMonth:new Element('input'),ledgerBody:new Element('tbody'),
 ledgerTotal:new Element('div'),nextMonth:new Element('button')};
nodes.ledgerMonth.value='2026-11';
const rows=[
 {rowId:'P-EARLY',date:'2026-11-10',label:'検証会場',kind:'practice',
 status:'open',canConfirm:true,version:1,income:0,expense:0,balance:900},
 {rowId:'R-LATE',date:'2026-11-11',label:'立替精算',kind:'reimbursement',
 status:'open',canConfirm:false,version:2,income:0,expense:50,balance:850},
 {rowId:'R-CLOSED',date:'2026-11-12',label:'確定済み試験',kind:'reimbursement',
 status:'confirmed',canConfirm:false,version:3,income:10,expense:0,balance:860},
 {rowId:'P-FUTURE',date:'2026-11-29',label:'未来日',kind:'practice',
 status:'open',canConfirm:false,version:4,income:0,expense:0,balance:860}
];
const payload={carried:900,rows,maxMonth:'2026-11',closingBalance:860};
const S={actor:{role:'duty'},ledger:null},calls=[];
const lStart=ui.indexOf('async function loadLedger(){'),
 lEnd=ui.indexOf('function ledgerAction(',lStart);
ok(lStart>=0&&lEnd>lStart,'real ledger renderer extracted from LIVE code');
const render=new Function('$','call','S','document','today','window','yen','ledgerAction',
 ui.slice(lStart,lEnd)+'\nreturn loadLedger;')(
 id=>nodes[id],async()=>payload,S,{createElement:tag=>new Element(tag)},
 ()=> '2026-11-19',{SMDate:{date:x=>x}},x=>String(x),
 (action,row)=>calls.push({action,rowId:row.rowId}));
const card=i=>nodes.ledgerBody.children[i];
const buttons=i=>card(i).children[6].children[0].children;
const status=i=>card(i).children[6].children[1];
(async()=>{
 await render();
 ok(nodes.ledgerBody.children.length===5,'carried plus every server-returned row stays visible');
 ok(card(0).classes.has('carry-row')&&card(0).children[6].children[0].tag==='small',
  'carry-forward row retains no ledger mutation buttons');
 ok(card(1).children.length===7&&
  card(1).children.slice(0,6).map(x=>x.className).join(',')===
  ['ledger-col-date','ledger-col-label','ledger-col-income','ledger-col-expense',
   'ledger-col-balance','ledger-col-confirmed'].join(','),
  'seven native cells retain desktop order and individual mobile card placement');
 ok(card(1).children[0].textContent==='2026-11-10'&&
  card(1).children[4].textContent==='900',
  'date and balance are shown on first card row');
 ok(status(1).textContent==='⏳ 未確定'&&status(1).className.includes('is-open'),
  'open card has a visible compact status label');
 ok(buttons(1).map(x=>x.textContent).join('|')==='修正|削除|確定'&&
  buttons(1)[0].disabled&&buttons(1)[1].className==='btn-danger'&&
  !buttons(1)[2].disabled,
  'open practice has fixed slots, disabled edit, red delete and valid confirm');
 buttons(1)[2].handlers.click();
 ok(calls.length===1&&calls[0].action==='confirm'&&calls[0].rowId==='P-EARLY',
  'same operation handler still receives unchanged row ID');
 ok(buttons(2).length===3&&buttons(2)[2].disabled,
  'later line cannot be finalized before earlier unconfirmed line');
 ok(status(3).textContent==='✔ 確定済み'&&
  buttons(3).length===1&&buttons(3)[0].textContent==='確定済み'&&buttons(3)[0].disabled,
  'duty confirmed card has only noninteractive Confirmed state');
 ok(buttons(4).length===3&&buttons(4).every(x=>x.disabled),
  'future-day cards keep all three slots disabled');
 S.actor.role='admin';await render();
 ok(buttons(3).length===1&&buttons(3)[0].textContent==='確定解除'&&
  buttons(3)[0].className==='btn-green'&&!buttons(3)[0].disabled,
  'admin confirmed card shows a single GREEN unlock button');
 buttons(3)[0].handlers.click();
 ok(calls.length===2&&calls[1].action==='unlock'&&calls[1].rowId==='R-CLOSED',
  'admin unlock calls existing mutation action using persisted row ID');
 ok(buttons(2).map(x=>x.textContent).join('|')==='修正|削除|確定',
  'normal open action slots remain stable regardless of actor role');
 ok(nodes.ledgerTotal.textContent==='残金：860'&&nodes.nextMonth.disabled,
  'month navigation and closing balance are still computed from server response');
 console.log('PASS '+n+'/'+n+' responsive finance cards and untouched ledger API semantics');
})().catch(e=>{console.error(e);process.exitCode=1});
