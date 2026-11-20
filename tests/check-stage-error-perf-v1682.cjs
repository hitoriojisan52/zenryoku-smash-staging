#!/usr/bin/env node
'use strict';
/* v0.16.82 — communication failure contract and opt-in performance tracing.
 * No connected LINE token, user identity, writes or remote requests. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=src('live.html'),live=src('live.js'),ux=src('stage-ui.js'),
 access=src('live-access-v2.js'),role=src('stage-role-preview.js'),gas=src('gas-staging/コード.gs');
let n=0;function ok(c,label){assert.ok(c,label);n++}
for(const code of [live,ux,access,role,gas]){new Function(code);n++}
const mStart=html.indexOf('<dialog id="manageDialog"'),mEnd=html.indexOf('</dialog>',mStart);
const menu=html.slice(mStart,mEnd);
ok(menu.indexOf('manageAdminSection')<menu.indexOf('id="manageSchedules"')&&
 menu.indexOf('id="manageSchedules"')<menu.indexOf('id="visitorAdminMenu"'),
 'schedule master moved into administrator menu, before visitor review');
ok(html.includes('id="manageSchedules" type="button" class="btn-outline" hidden disabled')&&
 live.includes("$('manageSchedules').hidden=S.actor.role!=='admin'")&&
 live.includes("$('manageSchedules').disabled=S.actor.role!=='admin'"),
 'member and duty have schedule button hidden/disabled until verified admin login');
ok(gas.includes("requireDuty_(member);")&&gas.includes("op==='schedule.list'?scheduleList_(ss,member,payload)"),
 'GAS duty authorization unchanged per specification priority');
ok(live.includes('window.SMStageUX?.errorDetails?.(error)?.message')&&
 live.includes('void window.SMStageUX?.showError?.(error)'),
 'read dialogs use shared wording and both visible red indicator and modal');
ok(live.includes("if(window.SMStageUX?.isBusy?.()===false)void window.SMStageUX.showError(e)")&&
 live.includes("if($('refresh')&&S.pending.size===0)$('refresh').disabled=false"),
 'home read failure displays modal and still offers manual Refresh');
ok(live.includes("!S.homeReadFailed&&")&&
 live.includes("S.pending.size===0&&!S.loading")&&
 live.includes("Date.now()>=S.silentRefreshPausedUntil"),
 'failed overview stays paused and closing a screen yields before next silent poll');
ok(live.includes('window.SMStageUX?.clearInlineError?.()'),
 'successful home refresh clears previous red error');
ok(live.includes("profileTimings:true")&&
 live.includes('profileApiRequest_')&&live.includes('stageApiPerfText'),
 'opt-in client diagnostic includes GAS-only safe time data');
ok(gas.includes("overviewProfile=body.op==='overview'")&&
 gas.includes('gasTotalMs:Date.now()-overviewProfile.startedAt')&&
 gas.includes("if(op==='overview'&&overviewProfile)return withLock_"),
 'opt-in GAS timing preserves identical locked overview transaction');
ok(html.includes('id="stageInlineError"')&&html.includes('stage-ui.js?v=1682-dual-error'),
 'new home inline red node and fresh shared-error asset');
ok(role.includes('void w.SMStageUX.showError(e)')&&
 access.includes('void window.SMStageUX.showError(e)'),
 'role switching and member administration also use shared red modal');
class Element{
 constructor(id){this.id=id;this.hidden=false;this.open=false;this.textContent='';this.listeners={};
  this.classList={};}
 addEventListener(kind,fn){this.listeners[kind]=fn}
 showModal(){this.open=true}
 close(){this.open=false;this.listeners.close?.()}
 focus(){}
 setAttribute(){}
 querySelector(){return null}
}
const list={},els={};const get=id=>els[id]||(els[id]=new Element(id));
const doc={
 getElementById:get,
 querySelector(q){return q==='main'?get('main'):q==='#list .stage-system-message--error'?null:null;},
 querySelectorAll(){return []},
 createElement:tag=>new Element(tag)
};
const win={};vm.runInNewContext(ux,{window:win,document:doc,console});
const errors=win.SMStageUX;
ok(errors.errorDetails(Error('Failed to fetch')).message==='通信に失敗しました。更新して再試行してください。',
 'browser network English is normalized into concise Japanese');
ok(errors.errorDetails(Object.assign(Error('read'),{code:'REQUEST_TIMEOUT'})).message.includes('15秒'),
 'timeout copy is 15s and does not repeat recovery paragraphs');
errors.showError(Error('Failed to fetch'));
ok(get('stageErrorDialog').open&&
 get('stageErrorMessage').textContent===get('stageInlineError').textContent&&
 get('stageInlineError').hidden===false,'every error shows matching red modal and home inline text');
get('stageErrorDialog').close();
errors.clearInlineError();
ok(get('stageInlineError').hidden&&get('stageInlineError').textContent==='',
 'inline error resets after a successful reload');
const start=live.indexOf('function profileApiRequest_('),end=live.indexOf('const REQUEST_TIMEOUT_MS=15000;',start);
ok(start>=0&&end>start,'standalone profiler extracted');
const panel={hidden:true},output={textContent:''};
const perfCtx=new Function('PERF_MODE','S','$',live.slice(start,end)+
  '\nreturn profileApiRequest_;')(true,{apiPerfHistory:[],lastOverviewProfile:{
  spreadsheetOpenMs:150,memberAuthMs:250,lockWaitMs:450,overviewHandlerMs:700,gasTotalMs:1550}},
 id=>id==='perfBreakdown'?panel:id==='stageApiPerfText'?output:null);
perfCtx('/api/overview',1850,'line;dur=90, gas;dur=1400, gas_post;dur=850, gas_content;dur=550','ok');
ok(!panel.hidden&&output.textContent.includes('ロック待ち450ms')&&
 output.textContent.includes('LINE 90ms')&&output.textContent.includes('GAS POST 850ms'),
 'diagnostic panel identifies major network and spreadsheet phases');
ok(!/Bearer|U[0-9a-f]{32}|sharedSecret|token=/.test(output.textContent),
 'performance display contains no bearer, LINE ID or secret');
for(const [htmlFile,jsFile,modalId,textId] of [
 ['match-view.html','match-view.js','matchViewErrorDialog','matchViewNotice'],
 ['guest.html','guest.js','guestErrorDialog','guestNotice']
]){
 const h=src(htmlFile),j=src(jsFile);
 new Function(j);n++;
 ok(h.includes('id="'+modalId+'"')&&h.includes('id="'+textId+'"')&&
  j.includes('.showModal()')&&j.includes('Failed to fetch'),
  htmlFile+' reports failures as Japanese popup and red banner');
}
ok(src('match.html').includes('id="matchInlineError"')&&
 src('match-confirm.js').includes("byId('matchInlineError')")&&
 src('match.js').includes("inline.hidden=true"),
 'match operations show paired errors and clear inline state on later success');
console.log('PASS '+n+'/'+n+' v0.16.82 paired error, retry, schedule placement and safe performance trace');
