#!/usr/bin/env node
'use strict';
/* v0.16.83: registration and navigation performance regression. No live writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('live.html'),ui=read('live.js'),form=read('stage-registration.js'),
 visitor=read('visitor-approval.js'),gas=read('gas-staging/コード.gs'),
 access=read('gas-staging/AccessAndGuestV160.gs');
let passed=0;function ok(value,message){assert.ok(value,message);passed++}
for(const source of [ui,form,visitor,gas,access]){new Function(source);passed++;}
const header=html.slice(html.indexOf('<dialog id="manageDialog"'),
 html.indexOf('</dialog>',html.indexOf('<dialog id="manageDialog"')));
ok(header.includes('管理者メニュー')&&header.indexOf('管理者メニュー')<
 header.indexOf('id="manageSchedules"')&&header.indexOf('id="manageSchedules"')<
 header.indexOf('id="visitorAdminMenu"'),'schedule master remains under administrator section');
ok(header.includes('検証用メニュー')&&header.indexOf('検証用メニュー')<
 header.indexOf('id="stageRegistrationOpen"'),'self-application belongs in verification menu');
ok(html.includes('id="stageRegistrationDialog"')&&html.includes('stage-registration.js?v=1683-line-apply'),
 'application form is loaded with cache-busted module on management LIFF');
ok(ui.includes("q.get('apply')==='1'")&&
 ui.includes("new URLSearchParams(state).get('apply')==='1'"),
 'unregistered tester can open future rich-menu-compatible apply=1 route');
ok(ui.includes("if(e?.status===401&&e?.code==='UNAUTHORIZED'){enterRegistrationOnly_();return;}")&&
 ui.includes('if(APP_REG_MODE){enterRegistrationOnly_();return;}'),
 'only authenticated unregistered LINE accounts go to application-only view');
ok(ui.includes("S.registrationOnly=true")&&
 ui.includes("control.disabled=true")&&
 ui.includes("openAgain.textContent='📝 利用申請を開く'"),
 'nonmembers cannot access finance but can reopen their own application');
ok(gas.indexOf("if(body.op==='member.apply'||body.op==='member.status')")<
 gas.indexOf("member=member_(ss,body.lineUserId"),
 'unregistered self-application still routes before member administration');
ok(access.includes("if(current&&bool_(current[3]))return {ok:true,data:{status:'approved'}}")&&
 access.includes("if(pending)return {ok:true,data:{status:'pending'}}"),
 'existing duplicate-pending and approved-member protection is retained');
ok(form.includes("api('/api/member/status')")&&form.includes("api('/api/member/apply'")&&
 !/targetMemberId|targetLineUserId|actorMemberId/.test(form),
 'application uses only authenticated subject, never a client-selected identity');
ok(ui.includes('screenReadActive_.get(id)?.controller?.abort()')&&
 ui.includes('current.signal=controller?.signal')&&
 ui.includes("if(!expired&&!isWrite&&externalSignal?.aborted)throw readCancelled_()"),
 'close cancels obsolete GET with no false timeout');
ok(ui.includes("silentRefreshPausedUntil=Date.now()+10000")&&
 ui.includes('Date.now()>=S.silentRefreshPausedUntil'),
 'automatic overview briefly pauses after closing a read-heavy screen');
ok(ui.includes('const MUTATING_ENDPOINTS=new Set(')&&
 ui.includes("const controller=!isWrite&&typeof AbortController")&&
 !ui.includes('controller?.abort()\n const work='),
 'writes retain no-abort semantics and operation-ID authority');
ok(gas.includes('function member_(ss,lineUserId,readContext)')&&
 gas.includes("if(readContext)readContext.memberRows=rows")&&
 gas.includes("attendees_(ss,id,true,readContext&&readContext.memberRows)"),
 'same authenticated member rows feed overview name overlay without another sheet read');
ok(gas.includes('registrationPractices:dates.filter(')&&
 visitor.includes('registrationPractices:()=>registrationDates?registrationDates.slice():null')&&
 ui.includes('window.SMVisitor.registrationPractices?.()'),
 'visitor application uses a single backend request when full date snapshot is available');
ok(gas.includes('phases.scheduleReadMs')&&gas.includes('phases.ledgerReadMs')&&
 gas.includes('phases.attendeeAndIdentityMs')&&ui.includes('処理内訳'),
 'overview exposes non-sensitive schedule/ledger/roster performance phases');
// Exercise actual member roster overlay helper independently with known rows.
const begin=gas.indexOf('function memberRosterMapV1657_('),
 end=gas.indexOf('function overlayMemberRosterV1657_(',begin);
let physicalReads=0;
const fn=new Function('sheetRows_','str_','norm_','bool_',gas.slice(begin,end)+
 'return memberRosterMapV1657_;')(
 ()=>{physicalReads++;throw Error('duplicate sheet read');},
 s=>String(s??'').trim(),s=>String(s??'').normalize('NFKC').replace(/\s+/g,''),
 x=>x===true||x==='TRUE');
const identities=[
 ['M-ONE','全力太郎','U-one',true,false,'ゼンリョクタロウ'],
 ['M-TWO','重複一','U-two1',true,false,'ジュウフクイチ'],
 ['M-TWO','重複二','U-two2',true,false,'ジュウフクニ'],
 ['M-INACTIVE','停止中','U-inactive',false,false,'テイシチュウ']
];
const map=fn(null,identities);
ok(physicalReads===0&&map['M-ONE'].name==='全力太郎'&&
 !map['M-TWO']&&!map['M-INACTIVE'],
 'cached member read still excludes duplicate and inactive identities');
// In-memory DOM simulation of existing authenticated member.apply/status.
class Element{
 constructor(id){this.id=id;this.open=false;this.disabled=false;this.value='';
  this.textContent='';this.listeners={};
  const classes=new Set(['stage-system-message--info']);
  this.classList={toggle:(k,flag)=>flag?classes.add(k):classes.delete(k),
   contains:k=>classes.has(k)};
 }
 addEventListener(type,fn){this.listeners[type]=fn;}
 showModal(){this.open=true;}
 close(){this.open=false;this.listeners.close?.();}
}
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const window={SMStageUX:{errorDetails:e=>({message:e.message}),showError:async()=>{}}};
vm.runInNewContext(form,{window,document:{getElementById:get}});
let status='not_requested',writes=0,lastPayload;
const api=async(path,payload)=>{
 if(path==='/api/member/status')return {status};
 if(path==='/api/member/apply'){writes++;lastPayload=payload;status='pending';return {status};}
 throw Error('unexpected endpoint '+path);
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 window.SMStageRegistration.setup({api});
 window.SMStageRegistration.open();await tick();
 ok(get('stageRegistrationDialog').open&&get('stageRegSubmit').disabled===false,
 'new tester receives enabled self-application form');
 get('stageRegName').value='全力太郎';get('stageRegKana').value='ゼンリョクタロウ';
 await get('stageRegForm').listeners.submit({preventDefault(){}});await tick();
 ok(writes===1&&lastPayload.displayName==='全力太郎'&&
 lastPayload.nameKana==='ゼンリョクタロウ'&&
 get('stageRegSubmit').disabled,'one application submitted and further sends disabled while pending');
 await get('stageRegRefresh').listeners.click();await tick();
 ok(get('stageRegStatus').textContent.includes('申請済み')&&writes===1,
 'pending applicant checks status with no duplicate application');
 get('stageRegClose').listeners.click();
 ok(!get('stageRegistrationDialog').open,'user can close application without modifying roles');
 status='approved';window.SMStageRegistration.open();await tick();
 ok(get('stageRegSubmit').disabled&&get('stageRegStatus').textContent.includes('登録済み'),
 'approved member cannot apply again');
 console.log('PASS '+passed+'/'+passed+' LINE member self-application and nonoverlapping screen reads');
})().catch(e=>{console.error(e);process.exitCode=1;});
