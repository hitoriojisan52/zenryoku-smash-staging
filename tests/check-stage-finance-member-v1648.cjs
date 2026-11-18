#!/usr/bin/env node
'use strict';
/* Role manager + finance UI regression, no remote services or live data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(base,p),'utf8');
const manager=read('live-access-v2.js'),selector=read('access-v2-mode.js'),
 ui=read('live.js'),html=read('live.html'),css=read('stage-ui.css'),
 gas=read('gas-staging/コード.gs'),accessGas=read('gas-staging/AccessAndGuestV160.gs'),
 popup=read('dialog-close.js');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
new Function(manager);new Function(ui);new Function(gas);new Function(accessGas);n+=4;
// The reviewed card-based admin module must run on an ordinary LIFF launch.
// Explicit legacy rollback is possible but never the normal entrypoint.
for(const [search,expected] of [['',true],['?accessUi=v2',true],
 ['?accessUi=legacy',false],['?liff.state=%3FaccessUi%3Dlegacy',false]]){
 const w={location:{search}};
 vm.runInNewContext(selector,{window:w,URLSearchParams});
 ok(w.SM_STAGE_ACCESS_V2===expected,'manager v2 default selection '+search);
}
ok(!html.includes('管理者専用です。新規登録の承認時には一般メンバーとして登録します。'),
 'obsolete admin explanation removed');
ok(!html.includes('氏名・カナは利用登録情報に基づくため、この画面では変更できません。'),
 'obsolete participant edit explanation removed');
ok(html.includes('🔐 メンバー権限管理')&&html.includes('<h3>利用者一覧</h3>'),
 'screen and roster names are consistent');
ok(!manager.includes('window.confirm(')&&!manager.includes("if(!confirm("),
 'normal admin uses in-app confirmation, not browser modal');
ok(manager.includes("m.role==='admin'&&adminCount<=1"),
 'only remaining administrator is not editable');
ok(manager.includes("m.memberId===actorMemberId"),
 'own authority cannot be edited');
ok(accessGas.includes('withdrawn:withdrawn')&&
 accessGas.includes('accessHistoryForManagerV1623_(ss,members)'),
 'server returns real withdrawal history, not a placeholder');
ok(accessGas.includes('registeredAt:registeredAt')&&
 accessGas.includes('lineUserId:/^U[0-9a-f]{32}$/i.test(lineUserId)'),
 'admin roster adds participant-card-style verified member information');
ok(popup.includes('if(!screenIds.has(dialog.id))continue'),
 'dialog Close injected only on navigation screens');
ok(!popup.includes("'participantEditDialog'")&&!popup.includes("'confirmActionDialog'"),
 'edit and confirm popups never get redundant top-right Close');
// Exercise real member cards with a simple stand-in DOM to catch hidden history
// and disabled sole-admin role selects without requiring jsdom.
class Element {
 constructor(tag,cls='',text=''){
  this.tag=tag;this.className=cls;this.textContent=text;
  this.children=[];this.hidden=false;this.disabled=false;this.attrs={};this.handlers={};
  this.options=[];this.value='';
 }
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(k,v){this.attrs[k]=v;}
 add(opt){this.options.push(opt);}
 addEventListener(k,fn){this.handlers[k]=fn;}
}
const el=(tag,cls,label)=>new Element(tag,cls,label),elements={
 memberAccessPending:new Element('div'),memberAccessMembers:new Element('div'),
 memberAccessHistoryV2:new Element('section'),memberAccessWithdrawnV2:new Element('div')
},$=id=>elements[id],dateFns={SMDate:{dateTimeJst:s=>'formatted '+s}};
const start=manager.indexOf(' const ROLE_LABEL='),end=manager.indexOf(' // v0.16.24: Display-only example.',start);
ok(start>=0&&end>start,'current card renderer can be isolated');
const names=new Function('$','item','window','actorMemberId','renderWithdrawPreviewV1624',
 'Option',manager.slice(start,end)+'\nreturn {render,renderHistory};')(
 $,el,dateFns,'M-ADMIN',()=>{},class Option {
  constructor(label,value){this.text=label;this.value=value;}
 });
const snapshot={
 pending:[{name:'申請者',requestId:'REQ-1',requestedAt:'2026-11-18T12:00:00Z'}],
 members:[
  {name:'管理者本人',memberId:'M-ADMIN',active:true,role:'admin',
   lineUserId:'U'+'a'.repeat(32),registeredAt:'2026-11-15T12:00:00Z'},
  {name:'一般会員',memberId:'M-2',active:true,role:'member',
   lineUserId:'U'+'b'.repeat(32),registeredAt:'2026-11-16T12:00:00Z'},
  {name:'停止会員',memberId:'M-3',active:false,role:'member'}
 ],
 withdrawn:[{name:'退会者',withdrawnAt:'2026-11-17T12:00:00Z',state:'completed'}]
};
names.render(snapshot);
ok(elements.memberAccessMembers.children.length===3,'all current members have cards');
ok(elements.memberAccessPending.children[0].className==='participant-card-item',
 'pending member approvals also use participant card');
const cards=elements.memberAccessMembers.children;
ok(cards.every(c=>c.className==='participant-card-item'),'member list matches participant card structure');
const traverse=(root)=>[root,...root.children.flatMap(traverse)];
const adminNodes=traverse(cards[0]),memberNodes=traverse(cards[1]),
 inactiveNodes=traverse(cards[2]);
ok(!adminNodes.some(e=>e.tag==='select'),'sole admin has no enabled role selector');
ok(adminNodes.some(e=>e.textContent==='変更不可'),'sole admin explicitly read-only');
ok(memberNodes.filter(e=>e.tag==='select').length===1 &&
 memberNodes.some(e=>e.tag==='button'&&e.textContent==='変更'&&e.disabled),
 'other member role editable only after changing dropdown');
ok(!inactiveNodes.some(e=>e.tag==='select'),'inactive member has no editable control');
ok(elements.memberAccessHistoryV2.hidden===false &&
 elements.memberAccessWithdrawnV2.children.length===1,
 'withdrawn member cards are visible without expanding a disclosure');
ok(traverse(elements.memberAccessWithdrawnV2).some(e=>e.textContent==='👤 退会者'),
 'withdrawn record is actually rendered');
names.renderHistory([]);
ok(elements.memberAccessHistoryV2.hidden===false &&
 traverse(elements.memberAccessWithdrawnV2).some(e=>e.textContent==='退会者はいません。'),
 'even empty history visibly distinguishes no records from hidden records');
names.renderHistory(undefined);
ok(traverse(elements.memberAccessWithdrawnV2).some(e=>/取得できません/.test(e.textContent)),
 'missing backend history reports an error instead of silently hiding it');
// Finance actions: original editor, role gate and compact bracketed prompts.
ok(ui.includes("btn.className=act==='delete'?'btn-danger':act==='confirm'?'btn-green'")&&
 ui.includes("act==='edit'?'btn-blue':'btn-outline'"),
 'edit blue, confirm green, delete red');
ok(ui.includes("group.className='ledger-action-group'")&&
 css.includes('justify-content:flex-end')&&css.includes('td.ledger-row-actions'),
 'finance action cells align right');
ok(ui.includes("const titles={confirm:'【収支の確定】'")&&
 ui.includes('window.SMDate.date(row.date)'),
 'finance confirm includes bracketed title and meeting date');
ok(ui.includes("querySelector('option[value=\"practice\"]').disabled=!available"),
 'practice re-registration category is disabled when there are no candidates');
ok(ui.includes("if(kind==='practice'&&(!$('ledgerPractice').value||$('ledgerPractice').disabled))"),
 'empty practice selector cannot be submitted via direct script');
ok(ui.includes('ledger.maxMonth||today().slice(0,7)')&&
 gas.includes('maxMonth:latest'),'future published ledgers visible in month navigation');
const mStart=gas.indexOf('function monthLedger_('),mEnd=gas.indexOf('\nfunction ',mStart+10);
ok(mStart>=0&&mEnd>mStart,'monthLedger backend isolated');
const monthLedger=new Function('str_','today_','entries_','fail_',gas.slice(mStart,mEnd)+
 '\nreturn monthLedger_;')(
 x=>String(x??''),()=> '2026-11-19',
 ()=>[
  {rowId:'OPEN',date:'2026-11-01',kind:'opening',income:0,expense:0,balance:10000},
  {rowId:'P-PR-FUTURE',date:'2026-12-02',kind:'practice',income:0,expense:0,balance:10000}
 ],
 (code,msg)=>{let e=new Error(msg);e.smCode=code;throw e});
const future=monthLedger({}, {role:'admin'}, {month:'2026-12'}).data;
ok(future.maxMonth==='2026-12'&&future.rows.length===1&&
 future.rows[0].rowId==='P-PR-FUTURE','future linked ledger month returned read-only');
assert.throws(()=>monthLedger({}, {role:'admin'}, {month:'2027-01'}),
 e=>e.smCode==='BAD_REQUEST');
n++;
console.log('PASS '+n+'/'+n+' v0.16.48 finance UI, member cards, history and future-month ledger');
