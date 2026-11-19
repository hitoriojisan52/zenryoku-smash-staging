#!/usr/bin/env node
'use strict';
/* Test actual collection-home renderer and shared CSS contracts in isolation:
 * no LINE request, Sheets write, account ID, or accounting mutation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('stage-ui.css'),html=read('live.html'),js=read('live.js');
let n=0;
const ok=(v,msg)=>{assert.ok(v,msg);n++};
function cssRule(selector){
 const begin=css.indexOf(selector+'{');
 assert.ok(begin>=0,'missing CSS rule: '+selector);
 return css.slice(begin,css.indexOf('}',begin)+1);
}
const bodySel='body.stage-ui:not(.visitor-member):has(> main.container:not(.match-container))';
const mainSel='body.stage-ui:not(.visitor-member) > main.container:not(.match-container)';
const listSel=mainSel+' > #list';
const siblingSel=mainSel+' > :not(#list)';
const bodyRule=cssRule(bodySel),mainRule=cssRule(mainSel);
const listRule=cssRule(listSel),siblingsRule=cssRule(siblingSel);
ok(bodyRule.includes('height:100dvh')&&bodyRule.includes('overflow:hidden'),
 'collection-only body prevents whole-page scrolling');
ok(mainRule.includes('height:100dvh')&&mainRule.includes('min-height:0')&&
 mainRule.includes('overflow:hidden')&&mainRule.includes('max-height:100dvh'),
 'collection main is constrained to the visible viewport');
ok(listRule.includes('flex:1 1 0')&&listRule.includes('min-height:0')&&
 listRule.includes('overflow-y:auto')&&listRule.includes('overflow-x:hidden'),
 'participant list is the sole flexible vertically scrollable home region');
ok(listRule.includes('overscroll-behavior:contain')&&
 listRule.includes('-webkit-overflow-scrolling:touch'),
 'mobile list scroll does not propagate to header/footer');
ok(siblingsRule.includes('flex-shrink:0'),
 'date/header/financial totals/Confirm retain their space outside the list');
ok(mainSel.includes(':not(.match-container)')&&
 mainSel.includes(':not(.visitor-member)'),
 'match and member-only registration screens are not viewport-locked');
ok(css.includes('@media (min-width:650px)')&&
 css.includes('height:calc(100dvh - 30px)')&&
 css.includes('@media (max-height:400px)'),
 'desktop margins and extreme short-keyboard viewports have safe layouts');
ok(html.includes('id="list" role="region" aria-label="集金対象の参加者一覧" tabindex="0"'),
 'scroll-only list is accessible by keyboard and screen reader');
ok((html.match(/\bid="list"/g)||[]).length===1&&
 html.includes('id="balance"')&&html.includes('id="confirm"')&&
 html.indexOf('id="list"')<html.indexOf('id="adjustment"')&&
 html.indexOf('id="adjustment"')<html.indexOf('id="confirm"'),
 'participant region sits between fixed practice header and fixed money footer');
for(const page of ['live.html','match.html','match-view.html','guest.html']){
 ok(read(page).includes('stage-ui.css?v=1660'),page+' receives latest dense shared CSS');
}
ok(css.includes('.stage-ui{line-height:1.34}')&&
 css.includes('.stage-ui dialog p{line-height:1.4}')&&
 css.includes('.stage-ui .stage-system-message{'),
 'font lines and system message padding become more compact');
ok(css.includes('.stage-ui button{padding-block:3px;line-height:1.25}')&&
 css.includes('min-height:44px;line-height:1.25')&&
 css.includes('.stage-ui .manage-grid button{min-height:46px'),
 'button text/padding is denser while actionable buttons remain >=44px');
ok(css.includes('.stage-ui .participant-card{padding:5px 7px;gap:5px;margin-bottom:2px}')&&
 css.includes('.stage-ui .home-footer-bar{padding:5px 7px}'),
 'collection rows and footer become more compact');
ok(css.includes('.stage-ui #scheduleDialog .schedule-card{')&&
 css.includes('.stage-ui dialog#participantDialog .participant-card-item{')&&
 css.includes('.stage-ui :is(#visitorDialog,#visitorAdminDialog) .visitor-review-card{'),
 'existing later LIVE inline styles do not defeat card density changes');
ok(css.includes('.stage-ui .match-round{padding:6px;margin-bottom:5px}')&&
 css.includes('.stage-ui .match-team{line-height:1.34}')&&
 css.includes('body.stage-ui.access-v2-active #memberAccessDialog .live-access-row{'),
 'match and member-account screens receive compact layout too');
ok(css.includes('@media (max-width:900px)')&&
 css.includes('.stage-ui #ledgerDialog .ledger-table tbody tr{'),
 'foldable ledger card formatting remains intact and more compact');
// Run the REAL renderHome() function and check that rerendering stays inside
// the scrollable list without losing its position or moving finance controls.
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};
  this.textContent='';this.value='';this.scrollTop=0;this.disabled=false;
  this.hidden=false;this.checked=false;this.className='';this.attrs={};
  this.handlers={};this.classList={add:()=>{},remove:()=>{},toggle:()=>{}};}
 append(...elements){this.children.push(...elements)}
 replaceChildren(...elements){this.children=[...elements]}
 addEventListener(type,fn){this.handlers[type]=fn}
 setAttribute(k,v){this.attrs[k]=v}
}
const ids=['place','hours','count','completedCount','adjustment','expense',
 'cashCounter','list','collectionLockReason','confirm'];
const controls=Object.fromEntries(ids.map(id=>[id,new Element('div')]));
controls.list.scrollTop=137;
const participants=Array.from({length:9},(_,i)=>({
 participantId:'MEMBER-'+i,name:'テスト参加者'+i,category:'member',fee:500,
 collectionCompleted:i%2===0,attending:true,memo:i%3===0?'備考':''
}));
const S={overview:{practice:{date:'2026-11-16',place:'検証体育館',hours:4},
 ledger:{status:'open',canConfirm:true,adjustment:0,expense:0},
 participants,attendingCount:9,completedCount:5,collectionAccess:{canCollect:true}},
 pending:new Set(),paymentNeedsRefresh:false};
let footerCalls=0,longPressCount=0;
const start=js.indexOf('function renderHome(){'),
 end=js.indexOf('function updateFooter(){',start);
ok(start>=0&&end>start,'real renderHome function is isolated');
const renderHome=new Function('S','$','document','M','yen','today','setupLongPress',
 'setPayment','showPaymentError_','updateFooter',
 js.slice(start,end)+'\nreturn renderHome;')(
 S,id=>controls[id],{createElement:tag=>new Element(tag),activeElement:null},
 {sortParticipants:people=>people,normalizeName:x=>x,CATEGORY_LABEL:{member:'メンバー'}},
 x=>x+'円',()=> '2026-11-19',
 ()=>{longPressCount++},()=>Promise.resolve(),()=>{},
 ()=>{footerCalls++});
renderHome();
ok(controls.list.children.length===9&&longPressCount===9,
 'all participants are rendered inside the dedicated scrollable node');
ok(controls.list.scrollTop===137,
 'participant scroll location is restored on automatic list redraw');
ok(controls.place.textContent==='場所：検証体育館'&&
 controls.completedCount.textContent==='集金完了：5名'&&footerCalls===1,
 'header and money footer are still updated independently of the list scroll');
ok(controls.list.children[0].children[1].children[1].handlers.change,
 'checkbox change handlers remain connected to their original payment workflow');
controls.list.scrollTop=234;renderHome();
ok(controls.list.scrollTop===234&&footerCalls===2,
 'subsequent live refresh preserves the new participant scroll position');
console.log('PASS '+n+'/'+n+' dense stage UI, collection-only scrolling and preserved payment controls');
