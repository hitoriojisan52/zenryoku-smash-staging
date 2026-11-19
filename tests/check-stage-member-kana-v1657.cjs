#!/usr/bin/env node
'use strict';
// Staging v0.16.57: real GAS registration and roster helpers, mocked Sheets,
// with explicit no-write checks for participant/money/match history.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const core=read('gas-staging/コード.gs'),access=read('gas-staging/AccessAndGuestV160.gs'),
 worker=read('cloudflare-worker/worker.js'),matchHTML=read('match.html'),
 accessUI=read('access-ui.js'),managerUI=read('live-access-v2.js'),liveHTML=read('live.html');
let checks=0;const ok=(x,label)=>{assert.ok(x,label);checks++};
const fail_=(code,message)=>{const e=new Error(message);e.code=code;throw e};
const str_=x=>String(x??'').trim(),norm_=x=>String(x??'').normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');
const bool_=x=>x===true||x==='TRUE',safeCell_=x=>String(x),withLock_=fn=>fn();
new Function(core);new Function(access);new Function(accessUI);new Function(managerUI);checks+=4;
ok(core.includes("'メンバー':['memberId','displayName','lineUserId','active','isAdmin','nameKana']"),'member schema extension last column');
ok(core.includes("'登録申請':['requestId','lineUserId','displayName','status','requestedAt','decidedBy','decidedAt','memberId','nameKana']"),'registration schema keeps old 8 columns');
ok(access.includes("regHeader: ['requestId','lineUserId','displayName','status','requestedAt','decidedBy','decidedAt','memberId','nameKana']"),'header contract');
ok(matchHTML.includes('id="accessRegKana"')&&accessUI.includes("{displayName:name,nameKana}"),'LIFF collects and posts kana');
ok(liveHTML.includes('id="memberAccessEditKanaV1657"')&&managerUI.includes('expectedKana:m.nameKana'), 'admin editor preserves optimistic concurrency for kana');
ok(worker.includes("version:'0.16.57-stage-kana'")&&worker.includes("if(op==='member.apply')"),'Worker health and edge validation');

const kanaStart=access.indexOf('function accessKanaV1657_('),kanaEnd=access.indexOf('function accessMemberRow16_(',kanaStart);
ok(kanaStart>=0&&kanaEnd>kanaStart,'real GAS kana validator available');
const validKana=new Function('norm_','fail_',access.slice(kanaStart,kanaEnd)+'\nreturn accessKanaV1657_;')(norm_,fail_);
ok(validKana('ﾌｼﾞﾜﾗﾀﾛｳ',false)==='フジワラタロウ','half-width kana normalizes');
ok(validKana('',true)==='','old member missing kana remains representable');
assert.throws(()=>validKana('ひらがな',false),e=>e.code==='BAD_REQUEST');checks++;
assert.throws(()=>validKana('',false),e=>e.code==='BAD_REQUEST');checks++;

const DATA={
 'メンバー':[['M-LEGACY','既存会員','U'+'a'.repeat(32),true,false,'']],
 '登録申請':[],
 '出欠回答':[['P-1','M-NEW','古い表示名','','member',true,'',1,'M-LEGACY'],
              ['P-1','M-OLD','既存太郎','','member',true,'',1,'M-LEGACY'],
              ['P-1','V-1','検証ビジター','ビジター','visitor',true,'',1,'M-LEGACY'],
              ['P-1','M-STU','検証学生','アオ','student',true,'',1,'M-LEGACY'],
              ['P-1','M-ABS','欠席者','アア','member',false,'',1,'M-LEGACY']]
};
let writes=0,serial=0;
const sheetRows_=(_ss,n)=>(DATA[n]||[]).map(r=>[...r]);
const registrationSheet={appendRow(row){DATA['登録申請'].push([...row]);writes++}};
const regStart=access.indexOf('function accessRegistration16_('),regEnd=access.indexOf('function accessAdmin16_(',regStart);
ok(regStart>=0&&regEnd>regStart,'real GAS member application handler available');
const apply=new Function('str_','norm_','fail_','bool_','withLock_','safeCell_',
 'accessSheet16_','accessRows16_','accessMemberRow16_','accessStageWithdrawHistoryV1636_',
 'accessKanaV1657_','SMA16','Utilities','accessTime16_',
 access.slice(regStart,regEnd)+'\nreturn accessRegistration16_;')(
 str_,norm_,fail_,bool_,withLock_,safeCell_,()=>registrationSheet,
 (s,width)=>DATA['登録申請'].map(r=>r.slice(0,width)),
 (_ss,line)=>DATA['メンバー'].find(m=>m[2]===line)||null,
 ()=>false,validKana,{registrations:'登録申請',regHeader:[]},
 {getUuid:()=>String(++serial).padStart(8,'0')},()=> '2026-11-19T09:00:00Z'
);
const LINE='U'+'b'.repeat(32);
assert.throws(()=>apply(null,LINE,'member.apply',{displayName:'新しい会員'}),e=>e.code==='BAD_REQUEST');checks++;
ok(writes===0,'missing kana refuses without writes');
const request=apply(null,LINE,'member.apply',{displayName:' 新しい 会員 ',nameKana:'ﾅｶ ﾀﾛｳ'});
ok(request.data.status==='pending'&&DATA['登録申請'][0][2]==='新しい会員'&&
 DATA['登録申請'][0][8]==='ナカタロウ','accepted row keeps original columns, appends validated kana');
ok(writes===1&&apply(null,LINE,'member.apply',{displayName:'再送',nameKana:'ナカ'}).data.status==='pending'&&writes===1,
 'duplicate request never writes second row');
ok(apply(null,LINE,'member.status',{}).data.status==='pending','legacy status API unchanged');
DATA['メンバー'].push(['M-NEW','新しい会員',LINE,true,false,'ナカタロウ']);
DATA['メンバー'].push(['M-OLD','既存太郎','U'+'c'.repeat(32),true,false,'']);
DATA['メンバー'].push(['M-STU','検証学生','U'+'d'.repeat(32),true,false,'アオ']);
const helperStart=core.indexOf('function memberRosterMapV1657_('),helperEnd=core.indexOf('function attendees_(',helperStart);
ok(helperStart>=0&&helperEnd>helperStart,'real read-only member overlay available');
const helpers=new Function('sheetRows_','str_','norm_','bool_',core.slice(helperStart,helperEnd)+
 '\nreturn {memberRosterMapV1657_,overlayMemberRosterV1657_};')(sheetRows_,str_,norm_,bool_);
const master=helpers.memberRosterMapV1657_(null);
const rosterRaw=DATA['出欠回答'].map(r=>({participationId:r[1],name:r[2],nameKana:r[3],
 category:r[4],attending:r[5]}));
const readOnlyBefore=JSON.stringify(DATA['出欠回答']);
const overlay=helpers.overlayMemberRosterV1657_(rosterRaw,master);
ok(overlay.find(r=>r.participationId==='M-NEW').name==='新しい会員'&&
 overlay.find(r=>r.participationId==='M-NEW').nameKana==='ナカタロウ',
 'registered member name and kana override stale attendance only on read');
ok(overlay.find(r=>r.participationId==='V-1').nameKana==='ビジター'&&
 overlay.find(r=>r.participationId==='M-OLD').nameKana==='',
 'visitor kana preserved; legacy member without kana remains empty');
ok(JSON.stringify(DATA['出欠回答'])===readOnlyBefore&&writes===1,'overlay never writes historical participation or finance');

const model=new Function(core+'\nreturn SMMatchCore;')();
const numbered=model.numbered(overlay);
ok(numbered.map(r=>r.participationId).join('|')==='M-OLD|M-NEW|M-STU|V-1',
 'member/students/visitor category rank then kana/name order, absentee excluded');
ok(numbered.every((r,i)=>r.number===i+1),'all screens share consecutive attending-only numbers');

const listStart=core.indexOf('function participantList_('),listEnd=core.indexOf('function participantArchivePending_(',listStart);
ok(listStart>=0&&listEnd>listStart,'real participant manager list available');
const list=new Function('practices_','str_','practice_','participantRows_','paymentRows_',
 'sheetRows_','attendanceAuditDates_','norm_','bool_','entries_','participantMatchLocked_','fail_',
 core.slice(listStart,listEnd)+'\nreturn participantList_;')(
 ()=>[{practiceId:'P-1',date:'2026-11-19',startTime:'09:00',place:'検証会場'}],
 str_,()=>({practiceId:'P-1',date:'2026-11-19'}),
 ()=>DATA['出欠回答'].map(r=>({practiceId:'P-1',participantId:r[1],name:r[2],nameKana:r[3],
   category:r[4],attending:r[5],memo:'',version:1,registeredBy:r[8]})),
 ()=>[],sheetRows_,()=>({}),norm_,bool_,()=>[],()=>false,fail_
 );
const listed=list(null,{role:'duty'},{practiceId:'P-1'}).data.participants;
ok(listed.find(r=>r.participantId==='M-NEW').nameKana==='ナカタロウ','participant manager picks master kana');
ok(listed.map(r=>r.participantId).join('|')==='M-ABS|M-OLD|M-NEW|M-STU|V-1',
 'manager list category+kana order includes absentees without changing enrollment');
ok(JSON.stringify(DATA['出欠回答'])===readOnlyBefore&&writes===1,'list reads only; no historical edits');
ok(core.includes("var roster=attendees_(ss,id,true)")&&
 core.includes("return overlayMemberRosterV1657_(rows,memberRosterMapV1657_(ss));"),
 'collection and match use same master-aware read path');
ok(core.includes("function attendees_(ss,id,withCurrentMemberNames)")&&
 core.includes("return withCurrentMemberNames?overlayMemberRosterV1657_"),
 'finance write path has no extra member-sheet read');
console.log('PASS '+checks+'/'+checks+' kana application, immutable history and shared roster ordering');
