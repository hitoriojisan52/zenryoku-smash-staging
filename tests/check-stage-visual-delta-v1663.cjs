#!/usr/bin/env node
'use strict';
// Regression on the actual CSS source order and UI copy. This prevents the
// prior 38px "compact" style from silently winning over later overrides.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(base,f),'utf8');
const css=read('stage-ui.css'),html=read('live.html'),ui=read('live.js');
const visitor=read('visitor-approval.js'),access=read('live-access-v2.js');
let n=0;const ok=(v,label)=>{assert.ok(v,label);n++};
const v62=css.indexOf('/* v0.16.62 — Match the original');
const v63=css.indexOf('/* v0.16.63 — cause of unchanged visual height');
ok(v62>=0&&v63>v62,'new compact sizing must follow the old v1662 38px rule');
ok(css.slice(v62,v63).includes('min-height:38px!important;')&&
 read('style.css').includes('.income-block{display:flex;flex-direction:column;'),
 'previous fixed 38px rule is identified as a concrete cause');
const current=css.slice(v63);
ok(/\.stage-ui button\{\s*min-height:30px!important;/.test(current),
 'new button minimum is truly 30px');
ok(/\.stage-ui input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=file\]\),\s*\.stage-ui select\{\s*height:28px!important;\s*min-height:28px!important;/.test(current),
 'textbox/dropdown contents are 28px high plus native borders (~30px outer)');
ok(/\.stage-ui dialog\.stage-has-toolbar \.stage-dialog-toolbar-actions button,\s*\.stage-ui #ledgerDialog \.ledger-controls button,\s*\.stage-ui #ledgerDialog #newLedgerRow\{\s*min-height:30px!important;/.test(current),
 'the more-specific 38px modal/month rules are also overridden');
ok(/\.stage-ui \.cash-count-btn\{\s*height:30px!important;\s*min-height:30px!important;/.test(current),
 'cash-denomination buttons use the compact 30px height');
ok(/body\.stage-ui > main\.container \.adjustment-box,\s*body\.stage-ui > main\.container \.expense-box\{\s*padding-block:2px!important;/.test(current),
 'cash input surrounding yellow/blue rows become shorter');
ok(/body\.stage-ui > main\.container \.income-block\{\s*flex-direction:row!important;\s*flex-wrap:wrap!important;/.test(current),
 'cash summary no longer forces the adjustment onto a third row');
ok(/body\.stage-ui > main\.container \.home-footer-bar\{\s*padding-block:3px!important;/.test(current)&&
 current.includes('.home-footer-action strong{')&&current.includes('font-size:14px!important;'),
 'cash balance/Confirm footer becomes compact too');
ok(/body\.stage-ui > main\.container \.app-header h1\{\s*font-size:15px!important;/.test(current)&&
 current.includes('font-size:14px!important}'),
 'long club title has a slightly smaller heading in narrow phones');
ok(!/^\s*(?:padding-inline|padding-left|padding-right|width|max-width|box-sizing):/m.test(current),
 'horizontal spacing and box dimensions are not incidentally altered');
ok(/\.stage-ui #list \.participant-card \.participant-memo\{\s*font-weight:400!important;\s*color:#c62828;/.test(current),
 'home note is red, never forcibly bold');
ok(html.includes('id="cashReset" type="button" class="btn-blue"')&&
 html.includes('id="cashResetConfirm" type="button" class="btn-danger"'),
 'cash reset opens with blue action but irreversible confirmation stays red');
ok(html.includes('<h2 id="visitorDialogTitle">👤 ビジター申請</h2>')&&
 !html.includes('申請内容を確認し、承認または却下を選択してください。却下後の再承認はできません。'),
 'visitor application title and redundant management paragraph are corrected');
ok(visitor.includes("'📅 申請日：'+formatRequestedAt_(data.requestedAt)")&&
 visitor.includes("admin?'👤 申請者：'+(data.requestedByName||'不明')"),
 'visitor lists use the requested date label and administrator requester emoji');
ok(!visitor.includes("data.nameKana?'カナ：'")&&
 !visitor.includes("'📝 備考: '+data.memo")&&
 visitor.includes("'📝 '+data.memo"),
 'both visitor card views hide kana and omit the 備考: prefix, preserving memo');
ok(access.includes("'🔤 氏名カナ：'+")&&
 access.includes("'🆔 LINE ID：'+")&&
 access.includes("'📅 登録日：'+")&&
 !access.includes("'📅 利用登録日：'+"),
 'member management shows emoji labels and shorter registration date');
const noteRule=current.match(/\.stage-ui #list \.participant-card \.participant-memo\{([^}]+)\}/)?.[1]||'';
ok(ui.includes("memo.className='meta participant-memo'")&&
 noteRule.includes('font-weight:400!important;')&&
 !noteRule.includes('font-weight:700;')&&
 ui.includes("note.textContent='📝 '+p.memo"),
 'payment note styling is normal weight even when other headings are bold');
for(const p of ['live.html','match.html','match-view.html','guest.html']){
 ok(read(p).includes('stage-ui.css?v='+(p==='live.html'?'1667':'1665')),
  p+' busts the old cached 38px CSS for real LINE webview reload');
}
ok(html.includes('live-access-v2.js?v=1663')&&
 html.includes('visitor-approval.js?v=1664')&&
 html.includes('live.js?v=1667'),
 'all new UI text and home layout assets are cache-busted');
console.log('PASS '+n+'/'+n+' real visual height fixes, memo weight and business screen labels');
