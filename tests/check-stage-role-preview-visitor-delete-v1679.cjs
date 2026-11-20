#!/usr/bin/env node
'use strict';
/* Retains v1679 visitor deletion boundary after the explicitly approved v1680
 * replacement of visual-only preview with real, staging-gated self-role change.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=read('live.html'),live=read('live.js'),role=read('stage-role-preview.js'),
 gas=read('gas-staging/コード.gs'),access=read('gas-staging/AccessAndGuestV160.gs'),
 worker=read('cloudflare-worker/worker.js'),css=read('stage-ui.css');
let n=0;function ok(v,msg){assert.ok(v,msg);n++}
for(const code of [live,role,gas,access]){new Function(code);n++}
new Function(worker.replace('export async function','async function').replace('export default {fetch:handleRequest};',''));n++;
const header=html.slice(html.indexOf('<header class="app-header">'),html.indexOf('</header>'));
ok(header.indexOf('id="stageRolePreviewOpen"')>=0&&
 header.indexOf('id="stageRolePreviewOpen"')<header.indexOf('id="reimbursementBtn"'),
 'self-role control appears immediately left of reimbursement at top of home');
ok(!html.includes('stageRolePreviewMemberOpen')&&!html.includes('stageRolePreviewMenuOpen')&&
 html.includes('stage-role-preview.js?v=1680-self-role'),
 'obsolete preview menu entries retired; staging control has one home entry');
ok(role.includes("'/api/stage/self-role'")&&role.includes("action:'status'")&&
 role.includes("action:'change'")&&role.includes('expectedRole:expected')&&
 role.includes('operationId:crypto.randomUUID()'),
 'self role switch re-reads server role and submits one audited operation ID');
ok(role.includes("await api('/api/session')")&&role.includes('w.location.reload()'),
 'role change requires verified session then reloads UI');
ok(live.includes("if(S.actor.role==='member'){")&&
 live.includes("if(control.id!=='stageRolePreviewOpen')control.disabled=true")&&
 live.includes("if(VISITOR_MODE){"),
 'management LIFF member controls disabled, except self-role; member attendance remains isolated');
ok(live.includes("window.SMRolePreview?.setup({role:S.actor.role,api:call})")&&
 live.indexOf("S.actor=await call('/api/session')")<live.indexOf('window.SMRolePreview?.setup'),
 'self-role API bound only after authenticated user session');
ok(worker.includes("'/api/stage/self-role':'stage.selfRole'")&&
 worker.includes("if(op==='stage.selfRole')")&&worker.includes('if(!withdrawAtEdge'),
 'edge route requires existing exact staging environment purpose');
ok(gas.includes("if(op==='stage.selfRole')return accessStageSelfRoleV1680_")&&
 access.includes("SMA_STAGE_ROLE_BACKUP_V1680='M-TEST-MEMBER-V1656-001'")&&
 access.includes('SMA_STAGE_ROLE_OWNER_V1680'),
 'GAS stages owner binding and synthetic backup check before duty-only dispatch');
ok(live.includes("btn.disabled=blocked||(action==='delete'&&isVisitorParticipant_(p))")&&
 live.includes("if(!p||PM.uncertain||isVisitorParticipant_(p))return"),
 'participant UI and send handler still reject direct visitor deletion');
const part=gas.slice(gas.indexOf('function participantChange_('),
 gas.indexOf('/* v0.16.38b:',gas.indexOf('function participantChange_(')));
ok(part.includes("action==='delete'&&!visitorDecisionInternal&&/^PV-/.test(person)")&&
 part.includes("action==='delete'&&!visitorDecisionInternal&&str_(old[4])==='visitor'")&&
 !part.includes("action:'reject',operationId:payload.operationId"),
 'direct participant visitor removal blocked at backend including admins');
ok(gas.includes("action:'delete'},true)")&&
 gas.includes("if(member.role!=='admin')fail_('FORBIDDEN','ビジター審査は管理者だけが操作できます')"),
 'admin rejection still uses audited internal delete');
ok(gas.includes("if(action==='delete'&&r.status!=='pending')")&&
 html.includes('id="visitorMineDeleteDialog"'),
 'applicant may withdraw their own pending request; approved ones cannot');
ok(css.includes('content:"⚠️"')&&
 css.includes('.stage-system-message--warning')&&
 css.includes('.stage-system-message--error'),
 'warning emoji and info/warning/error classes present');
console.log('PASS '+n+'/'+n+' stage self-role boundary and existing visitor reject-only deletion');
