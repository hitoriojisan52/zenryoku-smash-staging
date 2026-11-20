#!/usr/bin/env node
'use strict';
/* v0.16.79: role visualization never promotes an actor and visitor deletion is
 * denied at UI and GAS entry; actual admin visitor rejection stays covered
 * by check-stage-visitor-approval-v1640.cjs. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=root('live.html'),js=root('stage-role-preview.js'),live=root('live.js'),gas=root('gas-staging/コード.gs');
let passed=0;const ok=(v,label)=>{assert.ok(v,label);passed++};
for(const s of [js,live,gas]){new Function(s);passed++;}
class El{
 constructor(id){this.id=id;this.children=[];this.disabled=/^stageRolePreview(?:Menu|Member)Open$/.test(id);this.textContent='';this.listeners={};this.open=false;this.value='';}
 addEventListener(event,fn){this.listeners[event]=fn}
 replaceChildren(...nodes){this.children=nodes}
 append(...nodes){this.children.push(...nodes)}
 showModal(){this.open=true}
 close(){this.open=false}
}
const map={};const get=id=>map[id]||(map[id]=new El(id));
const document={getElementById:get,createElement:tag=>new El(tag)};
for(const id of ['memberAttendanceStart','visitorMemberStart','cashCounter','openLedger','manageSchedules',
 'managePeople','visitorRegisterMenu','matchManage','visitorAdminMenu','manageAccess','manageAttendance']){
 const match=html.match(new RegExp('<button id="'+id+'"[^>]*>([^<]+)</button>'));
 ok(!!match,'menu item exists: '+id);
 get(id).textContent=match?.[1]||'';
}
const win={};vm.runInNewContext(js,{window:win,document});
ok(!!win.SMRolePreview&&Object.isFrozen(win.SMRolePreview),'role preview API is frozen');
const realActor={role:'member',memberId:'M-TEST',name:'テスト'};
const initial=JSON.stringify(realActor);
ok(html.includes('id="stageRolePreviewMenuOpen" type="button" class="btn-outline" disabled')&&
 html.includes('id="stageRolePreviewMemberOpen" class="btn-outline" type="button" disabled')&&
 get('stageRolePreviewMenuOpen').disabled&&get('stageRolePreviewMemberOpen').disabled,
 'preview requires authenticated session before enabling entry');
win.SMRolePreview.setup(realActor);
ok(!get('stageRolePreviewMemberOpen').disabled&&
 !get('stageRolePreviewMenuOpen').disabled,'member and duty/admin menus have same role-preview entry');
get('stageRolePreviewMemberOpen').listeners.click();
ok(get('stageRolePreviewDialog').open&&get('stageRolePreviewSelect').value==='member',
 'ordinary member opens own-role preview');
function labels(){
 return get('stageRolePreviewList').children.map(section=>
  ({heading:section.children[0].textContent,
   labels:section.children.slice(1).map(button=>button.textContent),
   disabled:section.children.slice(1).every(button=>button.disabled)}));
}
let member=labels();
ok(member.length===1&&member[0].labels.length===2&&member[0].disabled&&
 member[0].labels.some(s=>s.includes('参加連絡'))&&
 member[0].labels.some(s=>s.includes('ビジター')),
 'member preview only shows own attendance and visitor registration');
get('stageRolePreviewSelect').value='duty';get('stageRolePreviewSelect').listeners.change();
let duty=labels(),dt=duty.flatMap(x=>x.labels).join('|');
ok(duty.length===2&&duty.every(x=>x.disabled)&&
 dt.includes('現金確認')&&dt.includes('収支表')&&dt.includes('対戦表')&&
 !dt.includes('練習日程')&&!dt.includes('メンバー権限管理')&&!dt.includes('ビジター管理'),
 'duty preview shows actual duty menu without admin-only options');
get('stageRolePreviewSelect').value='admin';get('stageRolePreviewSelect').listeners.change();
let admin=labels(),at=admin.flatMap(x=>x.labels).join('|');
ok(admin.length===3&&admin.every(x=>x.disabled)&&
 at.includes('練習日程')&&at.includes('ビジター管理')&&at.includes('メンバー権限管理'),
 'admin preview contains duty and privileged controls as inert examples');
ok(get('stageRolePreviewActual').textContent.includes('実際の権限：メンバー')&&
 get('stageRolePreviewActual').textContent.includes('表示プレビュー：管理者')&&
 JSON.stringify(realActor)===initial,
 'switching preview does not change server-authenticated actor');
ok(!/fetch\s*\(|XMLHttpRequest|sessionStorage|localStorage|\.role\s*=|\/api\//.test(js),
 'preview makes no network, storage or authority-changing calls');
get('stageRolePreviewClose').listeners.click();
ok(!get('stageRolePreviewDialog').open,'role preview closes without role mutation');
const adminActor={role:'admin'};
win.SMRolePreview.setup(adminActor);get('stageRolePreviewMenuOpen').listeners.click();
ok(get('stageRolePreviewSelect').value==='admin','admin opens from own verified role');
ok(html.includes('id="stageRolePreviewMemberOpen"')&&
 html.includes('id="stageRolePreviewMenuOpen"')&&
 html.includes('stage-role-preview.js?v=1679-role-preview'),
 'member and staff entrypoints plus cache-busted script are present');
ok(live.includes("window.SMRolePreview?.setup({role:S.actor.role})")&&
 live.indexOf("S.actor=await call('/api/session')")<live.indexOf('window.SMRolePreview?.setup'),
 'role preview setup only occurs after verified LINE member session');
ok(live.includes("btn.disabled=blocked||(action==='delete'&&isVisitorParticipant_(p))")&&
 live.includes("if(PM.uncertain||PM.financeLocked||PM.matchLocked||isVisitorParticipant_(p))return")&&
 live.includes("if(!p||PM.uncertain||isVisitorParticipant_(p))return"),
 'visitor participant deletion is blocked in UI, confirmation and send handler');
const part=gas.slice(gas.indexOf('function participantChange_('),gas.indexOf('/* v0.16.38b:',gas.indexOf('function participantChange_(')));
ok(part.includes("action==='delete'&&!visitorDecisionInternal&&/^PV-/.test(person)")&&
 part.includes("action==='delete'&&!visitorDecisionInternal&&str_(old[4])==='visitor'")&&
 !part.includes("action:'reject',operationId:payload.operationId"),
 'direct GAS delete rejects visitor IDs/categories and no longer proxies admin rejection');
ok(gas.includes("participantChange_(ss,member,{operationId:opId,practiceId:r.practiceId,")&&
 gas.includes("action:'delete'},true)")&&
 gas.includes("if(member.role!=='admin')fail_('FORBIDDEN','ビジター審査は管理者だけが操作できます')"),
 'admin visitor.decide reject keeps internal audited delete path and role checks');
ok(gas.includes("if(action==='delete'&&r.status!=='pending')")&&
 gas.includes("function visitorModify_(ss,member,payload)"),
 'distinct prior pending-request withdrawal stays unchanged pending user decision');
console.log('PASS '+passed+'/'+passed+' read-only role preview, member entry, admin rejection-only participant deletion');
