/** Member-facing view-only match schedule. No mutating UI or update endpoints. */
'use strict';
const $=id=>document.getElementById(id),CFG=window.SMASH_CONFIG||{};
let token='',practiceId='';
const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=content;return n;};
async function request(path,payload={}){
 let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{const e=Error('通信がタイムアウトしました（15秒）。再度お試しください。');e.code='REQUEST_TIMEOUT';reject(e);},15000)});
 return Promise.race([(async()=>{
 const res=await fetch(CFG.apiBaseUrl.replace(/\/$/,'')+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(payload),cache:'no-store'});
 const r=await res.json();if(!res.ok||!r.ok)throw Error(r.error||'取得できませんでした');return r.data;
 })(),timeout]).finally(()=>clearTimeout(timer));
}
function viewMessage_(text,kind='error'){
 const target=$('matchViewNotice');target.textContent=String(text||'');target.hidden=!text;
 for(const style of ['info','warning','error'])target.classList.toggle('stage-system-message--'+style,style===kind);
}
function viewErrorText_(e){
 const raw=String(e?.message||'');
 if(e?.code==='REQUEST_TIMEOUT')return '通信がタイムアウトしました（15秒）。更新してください。';
 if(/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(raw))
  return '通信に失敗しました。更新してください。';
 return raw||'読み込みに失敗しました。';
}
function showViewError_(e){
 const text=viewErrorText_(e);
 viewMessage_(text);
 $('matchViewErrorText').textContent=text;
 const dialog=$('matchViewErrorDialog');
 if(!dialog.open)dialog.showModal();
}
$('matchViewErrorClose').addEventListener('click',()=>$('matchViewErrorDialog').close());
function render(view){
 const s=view.session,body=$('matchBody');body.replaceChildren();viewMessage_('');
 if(!s){
  $('matchHeader').textContent='対戦表未作成';
  const notice=el('p','stage-system-message stage-system-message--info','この開催日の対戦表はまだ作成されていません。');
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  body.append(notice);return;
 }
 $('matchHeader').textContent=s.sessionState==='finished'?'対戦表の進行は終了しました':s.sessionState==='ready'?'試合開始前':`第${s.currentRound}試合`;
 const names=view.numberMap||{};const team=ids=>ids.map(id=>names[id]?names[id].number+' '+names[id].name:id).join('・');
 (view.visibleRounds||[]).forEach((r,i)=>{const section=el('section','match-round'+(i===0?' current':''));section.append(el('h2','',`第${r.roundNumber}試合｜${r.state==='running'?'進行中':'予定'}`));r.courts.forEach(c=>{const court=el('div','match-court');court.append(el('strong','',`第${c.courtNumber}コート`),el('div','match-team',team(c.teamA)),el('div','match-versus','VS'),el('div','match-team',team(c.teamB)));section.append(court);});body.append(section);});
}
let loading=false;
async function load(){
 if(!practiceId||loading)return;
 loading=true;$('refreshMatch').disabled=true;
 try{render(await request('/api/match/get',{practiceId}));}
 finally{loading=false;$('refreshMatch').disabled=false;}
}
async function init(){
 $('refreshMatch').disabled=true;
 try{
  if(!CFG.viewLiffId||CFG.viewLiffId.includes('REPLACE_')||
    !CFG.apiBaseUrl||CFG.apiBaseUrl.includes('REPLACE_'))throw Error('設定がありません');
  let authTimer;
  try{await Promise.race([
   liff.init({liffId:CFG.viewLiffId}),
   new Promise((_,reject)=>{authTimer=setTimeout(()=>{
    const e=Error('LINE認証がタイムアウトしました（15秒）。開き直してください。');
    e.code='REQUEST_TIMEOUT';reject(e);
   },15000);})
  ]);}finally{clearTimeout(authTimer);}
  if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}
  token=liff.getIDToken();if(!token)throw Error('LINE認証に失敗しました');
  const list=await request('/api/match/practices');
  const select=$('matchPractice');
  select.replaceChildren(...list.practices.map(p=>new Option(
   window.SMDate.date(p.date)+' '+p.place,p.practiceId)));
  if(list.practices.length){
   practiceId=list.practices.at(-1).practiceId;select.value=practiceId;
   await load();
  }else{
   select.replaceChildren(new Option('選択可能な開催日がありません',''));
   $('matchHeader').textContent='対戦表を表示できる開催日がありません';
  }
 }catch(e){showViewError_(e);}
 finally{$('refreshMatch').disabled=loading||!practiceId;}
}
$('matchPractice').onchange=async()=>{
 practiceId=$('matchPractice').value;
 try{await load();}catch(e){showViewError_(e);}
};
$('refreshMatch').onclick=async()=>{
 if($('refreshMatch').disabled)return;
 try{await load();}catch(e){showViewError_(e);}
};
init();
