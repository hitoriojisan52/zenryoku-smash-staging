#!/usr/bin/env node
'use strict';
// Render actual safe timing UI with fake clock, without a network call/secret.
// Ensure normal UI requests retain their original untouched payload.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ui=fs.readFileSync(path.resolve(__dirname,'../live.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../live.html'),'utf8');
const i=ui.indexOf('const READ_PROFILE_ENDPOINTS=new Set('),j=ui.indexOf('const PERF_MODE=(',i);
assert.ok(i>=0&&j>i,'read endpoint diagnostic allowlist is present');
const endpointSet=new Function(ui.slice(i,j)+'\nreturn READ_PROFILE_ENDPOINTS;')();
assert.deepEqual([...endpointSet],[
 '/api/participant/list','/api/cash/get','/api/visitor/admin-list',
 '/api/visitor/mine','/api/visitor/practices','/api/ledger','/api/schedule/list']);
for(const write of ['/api/payment','/api/cash/save','/api/member/manage/role',
 '/api/member/apply','/api/ledger/change','/api/attendance/submit']){
 assert.equal(endpointSet.has(write),false,'never profile a write: '+write);
}
const start=ui.indexOf(' function profileApiRequest_(');
const end=ui.indexOf('const REQUEST_TIMEOUT_MS=',start);
assert.ok(start>=0&&end>start);
const src=ui.slice(start,end);
const panel={hidden:true},out={textContent:''};
const elements={perfBreakdown:panel,stageApiPerfText:out};
const state={};
const diagnostics=new Function('S','PERF_MODE','$',src+'\nreturn profileApiRequest_;')(
 state,true,key=>elements[key]);
const inner={spreadsheetOpenMs:180,memberAuthMs:200,lockWaitMs:72,
 readHandlerMs:2690,gasTotalMs:3142};
diagnostics('/api/participant/list',10504,
 'line;dur=9,gas;dur=10242,gas_post;dur=10030,gas_content;dur=212','ok',inner);
assert.equal(panel.hidden,false);
assert.match(out.textContent,/\/api\/participant\/list 10504ms/);
assert.match(out.textContent,/LINE 9ms/);
assert.match(out.textContent,/GAS POST 10030ms/);
assert.match(out.textContent,/GAS内訳 開始180ms・会員200ms・ロック待ち72ms・処理2690ms・合計3142ms/);
assert.doesNotMatch(out.textContent,/U[a-f0-9]{32}|token|secret|https?:\/\/|架空太郎/i);
assert.equal(state.apiPerfHistory.length,1);
diagnostics('/api/cash/get',3350,'line;dur=12,gas;dur=3000','ok',inner);
assert.match(out.textContent,/\/api\/cash\/get 3350ms/);
assert.match(out.textContent,/\/api\/participant\/list 10504ms/);
const before=state.apiPerfHistory.length;
const noPanel={hidden:true},quiet={textContent:'do not touch'};
const noUi=new Function('S','PERF_MODE','$',src+'\nreturn profileApiRequest_;')(
 {},false,key=>key==='perfBreakdown'?noPanel:quiet);
noUi('/api/participant/list',1000,'line;dur=1','ok',inner);
assert.equal(noPanel.hidden,true);
assert.equal(quiet.textContent,'do not touch');
assert.equal(state.apiPerfHistory.length,before);
const callFrom=ui.indexOf('async function call(path,payload={}){');
const callTo=ui.indexOf('// Collection checkboxes are independent.',callFrom);
const call=ui.slice(callFrom,callTo);
assert.ok(call.includes("path==='/api/overview'||READ_PROFILE_ENDPOINTS.has(path)"),
 'only overview and explicitly allowed read requests add profileTimings:true');
assert.ok(call.includes('{...payload,profileTimings:true}:payload'),
 'normal request body stays unmodified');
assert.ok(call.includes('diagnosticGasProfile=value?.data?.profileTimings||null'),
 'use only profile returned in this response, not stale global data');
assert.ok(call.includes('diagnosticOutcome,diagnosticGasProfile'),
 'individual response gets its own timing breakdown even when requests overlap');
assert.ok(call.includes('const controller=!isWrite')&&call.includes('if(controller)controller.abort()'),
 'read abort and write uncertain guard unaffected');
assert.ok(html.includes('v1691-measured-reads'),
 'force new LINE WebView controller after staging promotion');
assert.doesNotMatch(src,/console\.(log|info|warn)\(/,'no PII-bearing console in profile display');
console.log('PASS v1691 safe per-request GAS timing UI and opt-in read-only diagnostics');
