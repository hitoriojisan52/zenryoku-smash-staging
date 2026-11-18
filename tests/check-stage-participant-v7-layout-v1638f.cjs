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
ok(html.includes('id="visitorRegisterMenu"')&&html.includes('id="visitorDialog"'),
 'existing separate visitor registration remains intact pending new instructions');
const cssChecks=[
 '.participant-card-item{background:#fafafa;border:1px solid #ddd',
 '.participant-card-title{display:flex;justify-content:space-between',
 '.participant-card-category{font-size:10.5px',
 '.participant-card-details{display:flex;flex-direction:column',
 '.participant-card-footer{display:flex;justify-content:flex-end',
 'border-top:1px dashed #ccc',
 '.participant-card-attendance.is-attending{color:#2e7d32}',
 '.participant-card-attendance.is-absent{color:#c62828}',
 '#participantDialog:not([open]){display:none}',
 'min-height:40px'
];
for(const rule of cssChecks)ok(html.includes(rule),'old-v7 visual baseline: '+rule);
ok(html.includes('live.js?v=1639b'),'new UI cache version');
const begin=ui.indexOf('function renderParticipantManager_(){'),end=ui.indexOf('async function loadParticipants_(){',begin);
ok(begin>=0&&end>begin,'render participant routine still present');
const code=ui.slice(begin,end);
ok(!/\.innerHTML\s*=/.test(code),'user controlled name and note cannot inject markup');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.className='';this.textContent='';this.disabled=false;this.hidden=false;this.style={};this.listeners={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
const node={participantCards:new Element('div'),participantNotice:new Element('p')};
const $=id=>node[id]||(node[id]=new Element('div'));
const document={createElement:tag=>new Element(tag)};
const pm={people:[
 {practiceId:'P1',participantId:'ID1',name:'全力太郎',category:'member',attending:true,
  email:null,registeredAt:null,memo:'体育館入口に集合',collectionCompleted:true},
 {practiceId:'P1',participantId:'ID2',name:'全力花子',category:'visitor',attending:false,
  email:null,registeredAt:null,memo:'',collectionCompleted:false}
],matchLocked:false,financeLocked:false,uncertain:false};
let edited=0,deleted=0;
const render=new Function('PM','$','document','PM_CATEGORIES',
 'openParticipantEditor_','confirmParticipantDelete_',code+'\nreturn renderParticipantManager_;')(
 pm,$,document,{member:'メンバー',visitor:'ビジター'},
 ()=>{edited++},()=>{deleted++}
);
render();
ok(node.participantNotice.hidden,'empty permission note does not consume vertical space');
ok(node.participantCards.children.length===2,'all participants including absence displayed');
const first=node.participantCards.children[0],second=node.participantCards.children[1];
ok(first.className==='participant-card-item','legacy compact response card');
ok(first.children.map(x=>x.className).join(',')===
 'participant-card-title,participant-card-details,participant-card-memo,participant-card-footer',
 'card order: name/type/status, contact/time, optional note, action divider');
ok(second.children.map(x=>x.className).join(',')===
 'participant-card-title,participant-card-details,participant-card-footer',
 'empty notes do not add placeholder row');
const head=first.children[0],person=head.children[0],status=head.children[1];
ok(person.children[0].textContent==='👤 全力太郎'&&
 person.children[1].textContent==='メンバー','name and unbracketed type match original v7');
ok(status.textContent==='参加'&&status.className.includes('is-attending'),
 'attending shown in green at far right');
ok(second.children[0].children[1].textContent==='欠席'&&
 second.children[0].children[1].className.includes('is-absent'),
 'absence shown red at far right');
ok(first.children[1].children[0].textContent==='📧 未記録'&&
 first.children[1].children[1].textContent==='📅 登録: 未記録',
 'missing historical email/timestamp are not fabricated');
ok(first.children[2].textContent==='📝 備考: 体育館入口に集合',
 'optional note uses old v7 format');
ok(!first.children.some(x=>x.textContent.includes('集金：')),
 'old response view excludes unrelated payment-summary row');
const buttons=first.children.at(-1).children[0].children;
ok(buttons.map(x=>x.textContent).join(',')==='修正,削除',
 'bottom right actions follow v7 order');
ok(buttons.every(x=>!x.disabled),'non-locked rows stay actionable');
buttons[0].listeners.click();buttons[1].listeners.click();
ok(edited===1&&deleted===1,'existing edit/delete actions retain real handlers');
pm.matchLocked=true;render();
ok(node.participantCards.children.every(card=>card.children.at(-1).children[0].children.every(btn=>btn.disabled)),
 'match session protection remains disabling editing/deletion');
ok(!node.participantNotice.hidden&&node.participantNotice.textContent.includes('対戦表'),
 'match lock warning remains visible when relevant');
pm.matchLocked=false;pm.people=[];render();
ok(node.participantCards.children[0].textContent==='この開催日の回答データはありません。',
 'empty state matches original v7');
console.log('PASS '+n+'/'+n+' original v7 participant layout and no visitor-add regression');
