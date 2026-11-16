/* v0.16 staging access controls; uses match.js authenticated request. */
(function(){
'use strict';
const $=id=>document.getElementById(id),say=s=>{$('accessMessage').textContent=s;};
let api=null,getPracticeId=()=>'',role='';
function btn(label,fn){const b=document.createElement('button');b.type='button';b.className='btn-blue';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){say(e.message||String(e));}finally{b.disabled=false;}};return b;}
async function status(){try{const r=await api('/api/member/status');
 if(r.status==='pending'){$('accessApply').disabled=true;say('登録申請済みです。管理者の承認をお待ちください。');}
 else if(r.status==='approved')say('登録済みです。画面を開き直してください。');
 else if(r.status==='rejected')say('前の申請は承認されていません。再申請できます。');
 }catch(e){say(e.message||String(e));}}
async function apply(){const name=$('accessRegName').value.trim();
 if(!name){say('表示名を入力してください');return;}
 const r=await api('/api/member/apply',{displayName:name});
 say(r.status==='pending'?'登録申請を受け付けました。承認をお待ちください。':'登録済みです。画面を開き直してください。');
 $('accessApply').disabled=r.status==='pending';}
async function share(){const practiceId=getPracticeId();
 if(!practiceId){say('開催日を選択してください');return;}
 const r=await api('/api/match/share',{practiceId,operationId:crypto.randomUUID()});
 // Issued URL must match the configured public visitor page exactly.
 // Keep this allowlist in sync with SMA16.site on the GAS side.
 const destination=window.SMASH_CONFIG?.guestViewUrl;
 if(typeof r.url!=='string'||typeof destination!=='string')throw Error('閲覧ページの設定がありません');
 let publicUrl,expected;
 try{publicUrl=new URL(r.url);expected=new URL(destination);}catch(_){throw Error('共有リンクの形式が不正です');}
 if(publicUrl.protocol!=='https:'||expected.protocol!=='https:'||publicUrl.origin!==expected.origin||
    publicUrl.pathname!==expected.pathname||publicUrl.search!==''||!/^#t=[0-9a-f]{64}$/.test(publicUrl.hash))
   throw Error('共有リンクの発行先が設定と一致しません');
 $('accessShareUrl').value=r.url;$('accessShare').hidden=false;
 const box=$('accessQr');box.replaceChildren();
 if(typeof QRCode==='function')new QRCode(box,{text:r.url,width:236,height:236,colorDark:'#111111',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
 else say('QR画像を生成できません。URLをコピーしてください。');
 $('accessShareExpiry').textContent='有効期限：'+window.SMDate.dateTimeJst(r.expiresAt);
 say('閲覧QRを表示しました');}
$('accessApply').onclick=()=>apply().catch(e=>say(e.message||String(e)));
$('accessQrButton').onclick=()=>window.SMMatchBusy.run(()=>share()).catch(e=>say(e.message||String(e)));
$('accessQrCopy').onclick=async()=>{const url=$('accessShareUrl').value;if(!url)return;try{await navigator.clipboard.writeText(url);say('URLをコピーしました');}catch(_){$('accessShareUrl').select();say('URLを選択しました。長押しでコピーしてください');}};
$('accessShareClose').onclick=()=>{$('accessShare').hidden=true;};
window.SMAccess={
 showRegistration(o){api=o.api;$('accessRegistration').hidden=false;$('accessQrHeader').hidden=true;status();},
 setup(o){api=o.api;getPracticeId=o.getPracticeId;role=o.role;$('accessQrHeader').hidden=false;$('accessRegistration').hidden=true;}
};
})();