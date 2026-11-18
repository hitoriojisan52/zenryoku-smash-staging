#!/usr/bin/env node
'use strict';
// Regression against old v7 "resp-row-card" hierarchy and no visitor add
// in participant list. Pure in-memory DOM; no application or sheet writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('live.js'),html=read('live.html');
let n=0;function ok(v,m){assert.ok(v,m);n++;}
new Function(ui);n++;
const domStart=html.indexOf('<dialog id="participantDialog"');
const domEnd=html.indexOf('</dialog>',domStart);
ok(domStart>=0&&domEnd>domStart,'participant list modal exists');
const panel=html.slice(domStart,domEnd);
ok(panel.includes('<h2 id="participantTitle">👥 参加者一覧</h2>'),'legacy answer list title');
ok(panel.indexOf('id="participantClose"')>panel.indexOf('id="participantTitle"')&&
 panel.indexOf('id="participantClose"')<panel.indexOf('id="participantPractice"'),
 'close button is in header, not bottom footer');
ok(panel.includes('id="participantPractice"')&&panel.includes('id="participantReload"')&&
 panel.indexOf('id="participantPractice"')<panel.indexOf('id="participantReload"'),
 'legacy date selector then refresh');
ok(!panel.includes('participantAdd')&&!panel.includes('ビジター追加')&&
 !panel.includes('ビジター登録'),'visitor addition removed from participant list');
ok(!ui.includes("participantAdd"),'removed element has no click or disabled wiring');
ok(ui.includes("(p.place||'開催場所未登録')"),'participant date selector shows venue');
ok(!html.includes('id="participantEmail"')&&!ui.includes("participantEmail"),
 'email is absent from participant list/edit UI entirely');
ok(html.includes('id="visitorRegisterMenu"')&&html.includes('id="visitorDialog"'),
 'existing separate visitor registration remains intact pending new instructions');
const cssChecks=[
 '.participant-card-item{background:#fafafa;border:1px solid #ddd',
 '.participant-card-title{display:flex;justify-content:space-between',
 '.participant-card-category{font-size:10.5px',
 '.participant-card-details{display:flex;flex-direction:column',
 '.participant-card-content{display:flex;gap:8px;justify-content:space-between',
 '.participant-card-buttons{display:flex;justify-content:flex-end;align-items:flex-end',
 '.participant-card-info{flex:1;min-width:0',
 '.participant-card-attendance.is-attending{color:#2e7d32}',
 '.participant-card-attendance.is-absent{color:#c62828}',
 '#participantDialog:not([open]){display:none}',
 'min-height:44px'
];
for(const rule of cssChecks)ok(html.includes(rule),'old-v7 visual baseline: '+rule);
ok(html.includes('live.js?v=1647'),'new UI cache version');
const begin=ui.indexOf('function renderParticipantManager_(){'),end=ui.indexOf('async function loadParticipants_(){',begin);
ok(begin>=0&&end>begin,'render participant routine still present');
const code=ui.slice(begin,end);
ok(!/\.innerHTML\s*=/.test(code),'user controlled name and note cannot inject markup');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.className='';this.textContent='';this.disabled=false;this.hidden=false;this.style={};this.listeners={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(name,value){this[name]=String(value);}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
const node={participantCards:new Element('div'),participantNotice:new Element('p')};
const $=id=>node[id]||(node[id]=new Element('div'));
const document={createElement:tag=>new Element(tag)};
const pm={people:[
 {practiceId:'P1',participantId:'ID1',name:'全力太郎',category:'member',attending:true,
  lineUserId:'U'+'a'.repeat(32),registeredAt:'2026-11-17T03:30:00.000Z',memo:'体育館入口に集合',collectionCompleted:true},
 {practiceId:'P1',participantId:'ID2',name:'全力花子',category:'visitor',attending:false,
  lineUserId:null,registeredAt:'2026-11-18 13:20:00',memo:'',collectionCompleted:false}
],matchLocked:false,financeLocked:false,uncertain:false};
let edited=0,deleted=0;
const render=new Function('PM','$','document','PM_CATEGORIES','window',
 'openParticipantEditor_','confirmParticipantDelete_',code+'\nreturn renderParticipantManager_;')(
 pm,$,document,{member:'メンバー',visitor:'ビジター'},
 {SMDate:{dateTimeJst:s=>s.startsWith('2026-11-17')?'2026/11/17 12:30':'2026/11/18 13:20'}},
 ()=>{edited++},()=>{deleted++}
);
render();
ok(node.participantNotice.hidden,'empty permission note does not consume vertical space');
ok(node.participantCards.children.length===2,'all participants including absence displayed');
const first=node.participantCards.children[0],second=node.participantCards.children[1];
ok(first.className==='participant-card-item','legacy compact response card');
ok(first.children.map(x=>x.className).join(',')===
 'participant-card-title,participant-card-content',
 'name/type/status header then details+buttons in one aligned row');
ok(first.children[1].children.map(x=>x.className).join(',')===
 'participant-card-info,participant-card-buttons',
 'info on the left and edit/delete on the lower right');
ok(second.children.map(x=>x.className).join(',')===
 'participant-card-title,participant-card-content',
 'every participant, including visitors, uses same card layout');
const head=first.children[0],person=head.children[0],status=head.children[1];
ok(person.children[0].textContent==='👤 全力太郎'&&
 person.children[1].textContent==='メンバー','name and unbracketed type match original v7');
ok(status.textContent==='参加'&&status.className.includes('is-attending'),
 'attending shown in green at far right');
ok(second.children[0].children[1].textContent==='欠席'&&
 second.children[0].children[1].className.includes('is-absent'),
 'absence shown red at far right');
const memberInfo=first.children[1].children[0],memberDetails=memberInfo.children[0];
ok(memberDetails.children[0].textContent==='LINE ID：'+'U'+'a'.repeat(32)&&
 memberDetails.children[1].textContent==='📅 登録日：2026/11/17 12:30',
 'member LINE ID and account registration date formatted in JST');
ok(memberInfo.children[1].textContent==='📝 備考: 体育館入口に集合',
 'optional note stays above inline action buttons');
const visitorDetails=second.children[1].children[0].children[0];
ok(visitorDetails.children.length===2&&
 visitorDetails.children[0].textContent==='LINE ID：なし（ビジター）'&&
 visitorDetails.children[1].textContent==='📅 登録日：2026/11/18 13:20',
 'visitor approval date is its registration date and sponsor identity stays hidden');
ok(!first.children.some(x=>x.textContent.includes('集金：')),
 'old response view excludes unrelated payment-summary row');
const buttons=first.children[1].children[1].children;
ok(buttons.map(x=>x.textContent).join(',')==='修正,削除',
 'bottom right actions follow v7 order');
ok(buttons.every(x=>!x.disabled),'non-locked rows stay actionable');
buttons[0].listeners.click();buttons[1].listeners.click();
ok(edited===1&&deleted===1,'existing edit/delete actions retain real handlers');
pm.matchLocked=true;render();
ok(node.participantCards.children.every(card=>card.children[1].children[1].children.every(btn=>btn.disabled)),
 'match session protection remains disabling editing/deletion');
ok(!node.participantNotice.hidden&&node.participantNotice.textContent.includes('対戦表'),
 'match lock warning remains visible when relevant');
const start=ui.indexOf('function openParticipantEditor_(p){');
const finish=ui.indexOf('function participantEditData_(){',start);
ok(start>=0&&finish>start,'actual participant edit setup found');
const openEditor=new Function('PM','$','dialog',ui.slice(start,finish)+'\nreturn openParticipantEditor_;')(
 pm,$,()=>{}
);
pm.matchLocked=false;
openEditor({name:'テストビジター',nameKana:'',category:'visitor',attending:true,memo:''});
ok(!node.participantVisitorIdentity.hidden&&node.participantMemberIdentity.hidden,
 'visitor edit retains dedicated visitor name/kana inputs');
ok(node.participantCategory.disabled&&node.participantCategory.value==='visitor'&&
 !node.participantCategoryVisitor.disabled,
 'existing visitor category remains fixed');
openEditor({name:'テストメンバー',nameKana:'カナ',category:'member',attending:true,memo:''});
ok(node.participantVisitorIdentity.hidden&&!node.participantMemberIdentity.hidden&&
 node.participantMemberName.textContent==='テストメンバー'&&
 node.participantMemberKana.textContent==='カナ',
 'member name/kana displayed as read-only identity without editable inputs');
ok(node.participantCategoryVisitor.hidden&&node.participantCategoryVisitor.disabled&&
 !node.participantCategory.disabled,
 'nonvisitor cannot select visitor category');
// The submit routine must not trust hidden inputs or allow manual DOM tampering.
const dataStart=ui.indexOf('function participantEditData_(){');
const dataEnd=ui.indexOf('async function saveParticipantEdit_(',dataStart);
ok(dataStart>=0&&dataEnd>dataStart,'participant editor payload is available');
const getData=new Function('PM','$','PM_CATEGORIES',ui.slice(dataStart,dataEnd)+
 '\nreturn participantEditData_;')(pm,$,{member:'メンバー',visitor:'ビジター',student:'学生'});
node.participantName.value='別人';node.participantKana.value='ニセモノ';
node.participantCategory.value='member';node.participantMemo.value='既存の備考';
const data=getData();
ok(data.name==='テストメンバー'&&data.nameKana==='カナ'&&data.category==='member',
 'member submit ignores hidden name/kana and preserves saved identity');
node.participantCategory.value='visitor';
assert.throws(()=>getData(),/ビジター/);n++;
openEditor({name:'代理ビジター',nameKana:'ダイリ',category:'visitor',attending:true,memo:''});
node.participantName.value='修正ビジター';node.participantKana.value='シュウセイ';
const visitorData=getData();
ok(visitorData.name==='修正ビジター'&&visitorData.nameKana==='シュウセイ'&&
 visitorData.category==='visitor',
 'visitor retains own name/kana editing without a member account');
pm.people=[];render();
ok(node.participantCards.children[0].textContent==='この開催日の回答データはありません。',
 'empty state matches original v7');
console.log('PASS '+n+'/'+n+' original v7 participant layout and no visitor-add regression');
