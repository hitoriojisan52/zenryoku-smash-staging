/** Member-facing view-only match schedule. No mutating UI or update endpoints. */
'use strict';
const $=id=>document.getElementById(id),CFG=window.SMASH_CONFIG||{};
let token='',practiceId='';
const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=content;return n;};
async function request(path,payload={}){
 const res=await fetch(CFG.apiBaseUrl.replace(/\/$/,'')+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(payload),cache:'no-store'});
 const r=await res.json();if(!res.ok||!r.ok)throw Error(r.error||'取得できませんでした');return r.data;
}
function render(view){const s=view.session,body=$('matchBody');body.replaceChildren();if(!s){$('matchHeader').textContent='対戦表未作成';return;}
 $('matchHeader').textContent=s.sessionState==='finished'?'対戦表の進行は終了しました':s.sessionState==='ready'?'試合開始前':`第${s.currentRound}試合`;
 const names=view.numberMap||{};const team=ids=>ids.map(id=>names[id]?names[id].number+' '+names[id].name:id).join('・');
 (view.visibleRounds||[]).forEach((r,i)=>{const section=el('section','match-round'+(i===0?' current':''));section.append(el('h2','',`第${r.roundNumber}試合｜${r.state==='running'?'進行中':'予定'}`));r.courts.forEach(c=>{const court=el('div','match-court');court.append(el('strong','',`第${c.courtNumber}コート`),el('div','match-team',team(c.teamA)),el('div','match-versus','VS'),el('div','match-team',team(c.teamB)));section.append(court);});body.append(section);});
}
async function load(){if(practiceId)render(await request('/api/match/get',{practiceId}));}
async function init(){try{if(!CFG.liffId||CFG.liffId.includes('REPLACE_')||!CFG.apiBaseUrl||CFG.apiBaseUrl.includes('REPLACE_'))throw Error('設定がありません');await liff.init({liffId:CFG.liffId});if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}token=liff.getIDToken();if(!token)throw Error('LINE認証に失敗しました');const list=await request('/api/match/practices');const select=$('matchPractice');select.replaceChildren(...list.practices.map(p=>new Option(`${p.date} ${p.place}`,p.practiceId)));if(list.practices.length){practiceId=list.practices.at(-1).practiceId;select.value=practiceId;await load();}else $('matchHeader').textContent='練習日程がありません';setInterval(()=>{if(!document.hidden)load().catch(()=>{});},10000);}catch(e){$('matchHeader').textContent=e.message||String(e);}}
$('matchPractice').onchange=async()=>{practiceId=$('matchPractice').value;try{await load();}catch(e){$('matchHeader').textContent=e.message||String(e);}};
$('refreshMatch').onclick=async()=>{try{await load();}catch(e){$('matchHeader').textContent=e.message||String(e);}};
init();
