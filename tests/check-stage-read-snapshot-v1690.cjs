#!/usr/bin/env node
'use strict';
/* Execute real GAS read handlers in memory. No LINE, GAS, Sheet or finance writes.
 * Measure sheet-read counts, not guessed wall-clock improvements.
 */
const assert=require('node:assert/strict'),fs=require('node:fs');
const gas=fs.readFileSync('gas-staging/コード.gs','utf8');
const cut=(a,b)=>{const i=gas.indexOf(a),j=gas.indexOf(b,i);assert.ok(i>=0&&j>i,'missing real source: '+a);return gas.slice(i,j);};
const fail_=(code,message)=>{const e=Error(message);e.smCode=code;throw e;};
const str_=s=>String(s??'').trim(),norm_=s=>str_(s),bool_=s=>s===true||s==='TRUE';
const first={practiceId:'P-A',date:'2026-11-21',place:'TEST A',startTime:'09:00',hours:4};
const second={practiceId:'P-B',date:'2026-11-25',place:'TEST B',startTime:'09:00',hours:4};
const third={practiceId:'P-C',date:'2026-11-28',place:'TEST C',startTime:'09:00',hours:4};
let practiceRows=[first,second,third],ledgerRows=[
 {rowId:'P-P-A',kind:'practice',practiceId:'P-A',status:'open'},
 {rowId:'P-P-B',kind:'practice',practiceId:'P-B',status:'confirmed'},
 {rowId:'P-P-C',kind:'practice',practiceId:'P-C',status:'open'}
];
const db={
 'メンバー':[['M-A','テスト会員','U'+'a'.repeat(32),true,false,'テストカイイン']],
 '登録申請':[['REQ-A','U'+'a'.repeat(32),'テスト会員','approved','2026-11-19','','','M-A','テストカイイン']],
 'ビジター申請':[],
 '参加者操作アーカイブ':[],
 '出欠回答':[
  ['P-A','M-A','以前の氏名','イゼンノシメイ','member',true,'',0,'M-A'],
  ['P-B','M-A','以前の氏名','イゼンノシメイ','member',false,'',2,'M-A'],
  ['P-C','M-A','以前の氏名','イゼンノシメイ','member',true,'',1,'M-A']
 ]
};
const auditDates=()=>({'P-A|M-A':{first:'2026-11-20 10:00:00',last:'2026-11-20 10:01:00'}});
let scheduleReads=0,ledgerReads=0,matchChecks=0,writes=0,now='2026-11-20',corruptMatch='';
const practices_=()=>{scheduleReads++;return practiceRows.map(p=>({...p}));};
const practice_=()=>{throw Error('must not reread schedule in participant list');};
const entries_=()=>{ledgerReads++;return ledgerRows.map(row=>({...row}));};
const participantMatchLocked_=(_ss,id)=>{matchChecks++;if(id===corruptMatch)fail_('STORAGE_INCOMPLETE','unsafe archive');return id==='P-C';};
const sheetRows_=(_ss,name)=>(db[name]||[]).map(row=>[...row]);
const participantRows_=(_ss,id)=>(db['出欠回答']||[]).filter(r=>r[0]===id).map(r=>({
 practiceId:id,participantId:r[1],name:r[2],nameKana:r[3],category:r[4],
 attending:bool_(r[5]),memo:r[6],version:r[7],registeredBy:r[8]
}));
const paymentRows_=()=>[];
const attendeeReader=new Function('practices_','str_','today_','sheetRows_','attendanceAuditDates_',
 'entries_','bool_','participantMatchLocked_',
 cut('function attendanceMine_(','function attendanceSubmit_(')+'\nreturn attendanceMine_;')(
 practices_,str_,()=>now,sheetRows_,auditDates,entries_,bool_,participantMatchLocked_);
const participantReader=new Function('practices_','str_','practice_','participantRows_','paymentRows_',
 'sheetRows_','attendanceAuditDates_','norm_','entries_','participantMatchLocked_','fail_',
 cut('function participantList_(','function participantArchivePending_(')+'\nreturn participantList_;')(
 practices_,str_,practice_,participantRows_,paymentRows_,sheetRows_,auditDates,norm_,entries_,participantMatchLocked_,fail_);
const member={memberId:'M-A',role:'member',name:'テスト会員'};
const reset=()=>{scheduleReads=0;ledgerReads=0;matchChecks=0;writes=0;};
reset();
const mine=attendeeReader({},member).data;
assert.equal(mine.practices.length,3);
assert.equal(mine.answers.length,3);
assert.equal(mine.answers[0].registered,true);
assert.equal(mine.answers[0].reportedAt,'2026-11-20 10:00:00');
assert.equal(mine.answers[1].attending,false);
assert.equal(mine.answers[1].locked,true,'confirmed accounting row still locks edits');
assert.equal(mine.answers[2].locked,true,'match session still locks edits');
assert.equal(scheduleReads,1,'fetch practice master exactly once');
assert.equal(ledgerReads,1,'read entire financial ledger once for three future days, not three times');
assert.equal(matchChecks,3,'every date retains its independent match-delete safety check');
assert.equal(writes,0);
reset();
now='2026-11-30';
const empty=attendeeReader({},member).data;
assert.equal(empty.answers.length,0);
assert.equal(ledgerReads,0,'no ledger read with zero eligible dates');
assert.equal(matchChecks,0);
now='2026-11-20';
reset();corruptMatch='P-B';
assert.throws(()=>attendeeReader({},member),e=>e.smCode==='STORAGE_INCOMPLETE',
 'pending match deletion still blocks the whole read');
corruptMatch='';
reset();
const participants=participantReader({},member,{practiceId:'P-A'}).data;
assert.equal(participants.participants.length,1);
assert.equal(participants.participants[0].name,'テスト会員','member master still authoritative');
assert.equal(participants.participants[0].reportedAt,undefined);
assert.equal(participants.participants[0].registeredAt,'2026-11-20 10:00:00');
assert.equal(participants.participants[0].memberRegisteredAt,'2026-11-19');
assert.equal(participants.financeLocked,false);
assert.equal(participants.matchLocked,false);
assert.equal(scheduleReads,1,'participant list reuses its one practice master read');
assert.equal(ledgerReads,1,'participant list preserves its single financial ledger read');
assert.equal(matchChecks,1);
assert.equal(writes,0);
reset();
const locked=participantReader({},member,{practiceId:'P-B'}).data;
assert.equal(locked.financeLocked,true);
reset();
assert.throws(()=>participantReader({},member,{practiceId:'UNKNOWN'}),e=>e.smCode==='NOT_FOUND');
assert.equal(scheduleReads,1,'unknown ID should not trigger a second remote schedule read');
reset();practiceRows=[first,first,second,third];
assert.throws(()=>participantReader({},member,{practiceId:'P-A'}),e=>e.smCode==='NOT_FOUND',
 'duplicate practice IDs must remain fail-closed');
assert.equal(scheduleReads,1);
practiceRows=[first,second,third];
assert.match(gas,/if\(op==='attendance.mine'\)return withLock_/, 'member read remains inside ScriptLock');
assert.match(gas,/\['overview','ledger.list','cash.get','schedule.list','schedule.delete.preview','participant.list'\].*return withLock_/, 'duty participant read remains locked');
assert.match(gas,/requireDuty_\(member\);/, 'duty/administrator permission check still present');
console.log('PASS v1690 real GAS single-request snapshot: 3 future dates, one ledger read, one schedule read, match/account/finance gates preserved');
