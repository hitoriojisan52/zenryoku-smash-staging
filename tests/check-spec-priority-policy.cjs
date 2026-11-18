#!/usr/bin/env node
'use strict';
// The user-approved priority order is a durable contract for every new chat.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hierarchy=[
 '既存アプリの確定済み業務仕様・動作',
 '既存機能との整合性と安全性',
 'これまでに協議した実装ルール',
 '新しい画面・機能の実装方法',
 '明示的な変更指示の仕様'
];
const files=[
 'docs/SPEC_PRIORITY_POLICY.md',
 'docs/SESSION_HANDOFF.md',
 'docs/NEW_CHAT_START_PROMPT.md'
];
let checks=0;
const ok=(value,msg)=>{assert.ok(value,msg);checks++};
for(const file of files){
 const s=read(file),positions=hierarchy.map((name,i)=>{
  const pattern=(i+1)+'. ';
  const idx=s.indexOf(pattern+name);
  const alt=s.indexOf(pattern+'**'+name);
  const pos=idx>=0?idx:alt;
  ok(pos>=0,file+' contains priority '+(i+1)+': '+name);
  return pos;
 });
 ok(positions.every((pos,i)=>i===0||pos>positions[i-1]),
  file+' lists five priorities in user-defined order');
 ok(s.includes('懸念')&&s.includes('報告'),
  file+' requires concern reporting before overriding rules');
}
const intro=read('README.md');
ok(intro.includes('docs/SPEC_PRIORITY_POLICY.md')&&
 intro.includes('docs/NEW_CHAT_START_PROMPT.md')&&
 intro.includes('docs/SESSION_HANDOFF.md'),
 'README links handoff, priority, and prompt');
ok(!read('docs/SESSION_HANDOFF.md').includes(
 'ユーザーが明示した後日の仕様変更 > 旧アプリで実際に採用された仕様'),
 'old latest-first priority removed');
ok(intro.includes('懸念・影響をユーザーへ報告するまで既存仕様を上書きしない'),
 'README explicitly disallows silent overrides');
const historical=read('docs/ui-standard-v1632.md');
ok(historical.includes('履歴資料')&&historical.includes('SPEC_PRIORITY_POLICY.md'),
 'historical UI notes marked nonauthoritative');
const prompt=read('docs/NEW_CHAT_START_PROMPT.md');
for(const term of ['既存アプリ','GitHub','CI','本番','未確認','退会','月またぎ','仕様']){
 ok(prompt.includes(term),'new chat prompt includes safety term '+term);
}
// GitHub-first deployment and complete user instructions are part of the
// permanent handoff contract. Prevent later chats from reverting to
// copy-paste GAS/Worker deployment or repeatedly asking for completed setup.
const playbook=read('docs/DEPLOYMENT_AND_USER_ACTIONS.md');
const handoff=read('docs/SESSION_HANDOFF.md');
const prompt=read('docs/NEW_CHAT_START_PROMPT.md');
const readme=read('README.md');
for(const [file,s] of [
 ['docs/DEPLOYMENT_AND_USER_ACTIONS.md',playbook],
 ['docs/SESSION_HANDOFF.md',handoff],
 ['docs/NEW_CHAT_START_PROMPT.md',prompt],
 ['README.md',readme]
]){
 ok(s.includes('DEPLOYMENT_AND_USER_ACTIONS.md')||
    file==='docs/DEPLOYMENT_AND_USER_ACTIONS.md',
    file+' references the stable deployment/user-workflow playbook');
}
for(const term of ['GitHub Actions','Cloudflare Workers Builds',
 'GAS_STAGE_SCRIPT_ID','GAS_STAGE_DEPLOYMENT_ID','GAS_STAGE_CLASPRC_JSON',
 'WITHDRAW_ENABLED','STAGING_WITHDRAW_PURPOSE','WORKER_PURPOSE',
 'WITHDRAW_STAGE_SPREADSHEET_ID','RICH_MENU_SYNC_ENABLED',
 'stage-v1653-github-sync-20261119','channelMatchesLiveLiff',
 '1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac',
 'https://liff.line.me/2012602642-XBSkXduO',
 'https://docs.google.com/spreadsheets/d/',
 'https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health',
 '作業先','具体的','ユーザーが']){
 ok(playbook.includes(term),'deployment playbook retains '+term);
}
ok(handoff.includes('Workers Builds')&&handoff.includes('設定完了'),
 'handoff states Worker Git connection and user-completed settings');
ok(prompt.includes('ChatGPTがGitHub経由')&&
 prompt.includes('ユーザーに必要作業がある場合')&&
 prompt.includes('再要求しない'),
 'new-chat prompt requires ChatGPT-led deploy and no redundant settings');
ok(playbook.includes('未実施')&&playbook.includes('退会API'),
 'readiness is distinguished from real withdrawal E2E testing');
ok(read('cloudflare-worker/README.md').includes('2026/11/19 実反映確認済み'),
 'Worker-specific README records verified deployment');
ok(read('gas-staging/README.md').includes('2026/11/19 現在の補足'),
 'GAS-specific README flags old initialization directions as history');
console.log('PASS '+checks+'/'+checks+' five-level specification policy and durable handoff');
