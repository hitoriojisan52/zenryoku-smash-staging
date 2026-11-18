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
console.log('PASS '+checks+'/'+checks+' five-level specification policy and durable handoff');
