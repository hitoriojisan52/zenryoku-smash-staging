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
 if(typeof r.url!=='string'||!/^https:\/\/hitoriojisan52\.github\.io\/zenryoku-smash-staging\/guest\.html#t=[0-9a-f]{64}$/.test(r.url))throw Error('共有リンクの応答形式が不正です');
 $('accessShareUrl').value=r.url;$('accessShare').hidden=false;
 const box=$('accessQr');box.replaceChildren();
 if(typeof QRCode==='function')new QRCode(box,{text:r.url,width:236,height:236,colorDark:'#111111',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
 else say('QR画像を生成できません。URLをコピーしてください。');
 $('accessShareExpiry').textContent='有効期限：'+new Date(r.expiresAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
 say('閲覧QRを表示しました');}
async function manage(){const d=await api('/api/member/manage/list');
 const pending=$('accessPending');pending.replaceChildren();
 if(!d.pending.length)pending.textContent='申請待ちはありません。';
 for(const p of d.pending){
  const row=document.createElement('div');row.className='access-row';const name=document.createElement('span');name.textContent=p.name;
  row.append(name,btn('承認',async()=>{await api('/api/member/manage/decide',{requestId:p.requestId,approve:true,operationId:crypto.randomUUID()});say('承認しました');await manage();}),
   btn('却下',async()=>{if(!confirm(p.name+'さんの申請を却下しますか？'))return;await api('/api/member/manage/decide',{requestId:p.requestId,approve:false,operationId:crypto.randomUUID()});say('却下しました');await manage();}));
  pending.append(row);
 }
 const members=$('accessMembers');members.replaceChildren();
 for(const m of d.members){const row=document.createElement('div');row.className='access-row',name=document.createElement('span'),sel=document.createElement('select');
  name.textContent=m.name+(m.active?'':'（停止中）');
  sel.setAttribute('aria-label',m.name+'の権限');
  for(const [id,label] of [['admin','管理者'],['duty','当番担当'],['member','一般メンバー']])sel.add(new Option(label,id));
  sel.value=m.role;sel.disabled=!m.active;
  row.append(name,sel,btn('変更',async()=>{if(sel.value===m.role)return;if(!confirm(m.name+'さんの権限を変更しますか？'))return;
    await api('/api/member/manage/role',{memberId:m.memberId,role:sel.value,operationId:crypto.randomUUID()});say('権限を変更しました');await manage();
  }));members.append(row);
 }
}
$('accessApply').onclick=()=>apply().catch(e=>say(e.message||String(e)));
$('accessQrButton').onclick=()=>share().catch(e=>say(e.message||String(e)));
$('accessQrCopy').onclick=async()=>{const url=$('accessShareUrl').value;if(!url)return;try{await navigator.clipboard.writeText(url);say('URLをコピーしました');}catch(_){$('accessShareUrl').select();say('URLを選択しました。長押しでコピーしてください');}};
$('accessShareClose').onclick=()=>{$('accessShare').hidden=true;};
$('accessAdminButton').onclick=()=>{const open=$('accessManagement').hidden;$('accessManagement').hidden=!open;if(open)manage().catch(e=>say(e.message||String(e)));};
$('accessAdminClose').onclick=()=>{$('accessManagement').hidden=true;};
window.SMAccess={
 showRegistration(o){api=o.api;$('accessRegistration').hidden=false;$('accessQrHeader').hidden=true;$('accessToolbar').hidden=true;status();},
 setup(o){api=o.api;getPracticeId=o.getPracticeId;role=o.role;$('accessQrHeader').hidden=false;$('accessRegistration').hidden=true;$('accessAdminButton').hidden=role!=='admin';$('accessToolbar').hidden=role!=='admin';}
};
})();