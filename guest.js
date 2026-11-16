/** v0.16 staging: QR-linked guest view. No LIFF and no identity token. */
(function(){'use strict';
const API='https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/api/match/guest';
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.hash.replace(/^#/, '')).get('t')||'';
const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
let inFlight=false;
async function load(){if(inFlight)return;inFlight=true;const refresh=$('guestRefresh');refresh.disabled=true;refresh.textContent='更新中…';try{
 if(!/^[0-9a-f]{64}$/.test(token))throw Error('閲覧リンクが無効です。担当者から新しいQRをご案内ください。');
 const resp=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',referrerPolicy:'no-referrer'});
 const result=await resp.json();if(!resp.ok||!result.ok)throw Error(result.error||'対戦表を取得できません');
 const data=result.data;
 $('guestPractice').textContent=window.SMDate.date(data.practice.date)+'　'+data.practice.place;
 $('guestStatus').textContent=data.state==='not_created'?'対戦表はまだ作成されていません':data.state==='finished'?'進行終了':data.state==='ready'?'試合開始前':'第'+data.currentRound+'試合を進行中';
 const box=$('guestRounds');box.replaceChildren();
 for(const r of data.rounds||[]){
  const section=el('section','match-round current');
  section.append(el('h2','', '第'+r.roundNumber+'試合｜'+(r.state==='running'?'進行中':r.state==='completed'?'完了':'予定')));
  for(const c of r.courts){
   const court=el('div','match-court');
   court.append(el('strong','', '第'+c.courtNumber+'コート'),el('div','match-team',c.teamA.join('・')),el('div','match-versus','VS'),el('div','match-team',c.teamB.join('・')));
   section.append(court);
  }
  box.append(section);
 }
 $('guestExpiry').textContent='閲覧期限：'+window.SMDate.dateTimeJst(data.expiresAt);
 }catch(e){$('guestStatus').textContent=e.message||'読み込めませんでした';$('guestRounds').replaceChildren();}
 finally{inFlight=false;refresh.disabled=false;refresh.textContent='🔄 更新';}}
$('guestRefresh').addEventListener('click',load);load();setInterval(()=>{if(!document.hidden)load();},15000);
})();