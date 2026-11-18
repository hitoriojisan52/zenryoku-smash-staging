/**
 * STAGING ONLY COMBINED BUNDLE. Use INSTEAD OF the five separate files.
 * Do not add both versions: duplicate declarations would be ambiguous.
 * Staging workbook only: 1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac
 */


// ==================== MatchEngine.gs ====================
/* 全力☆スマッシュ 対戦表ドメインロジック v1.0
 * Pure JavaScript: browser, Node, Apps Script V8. No IO, no secret, no deployment.
 * participationId is the only match participant key. Display numbers are derived.
 */
(function (root) {
  'use strict';
  var RANK = {member:1, student:2, visitor:3, duty:4, shuttle:5,
    'メンバー':1,'学生':2,'ビジター':3,'当番担当':4,'シャトル担当':5};
  function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function name(s) { return String(s == null ? '' : s).replace(/[\s\u00a0\u3000\u2000-\u200b]+/g, ''); }
  function id(p) { return String(p.participationId || p.participantId || ''); }
  function attending(p) { return p.attending === true || p.attendance === 'attending' || p.attendance === '参加'; }
  function numbered(participants) {
    var seen = Object.create(null);
    return (participants || []).filter(attending).map(function (p) {
      var k = id(p); if (!k || seen[k]) fail('INVALID_ROSTER', '参加者IDが不正または重複しています');
      seen[k] = 1;
      var q = Object.assign({}, p, {participationId:k, displayName:name(p.displayName || p.name),
        sortName:name(p.nameKana || p.displayName || p.name)});
      return q;
    }).sort(function (a,b) {
      var ar = RANK[a.feeCategory || a.category] || 99, br = RANK[b.feeCategory || b.category] || 99;
      return ar-br || a.sortName.localeCompare(b.sortName,'ja') || a.displayName.localeCompare(b.displayName,'ja') || a.participationId.localeCompare(b.participationId);
    }).map(function (p,i) { p.number=i+1; return p; });
  }
  function validCourts(v) {
    if (!Array.isArray(v) || !v.length || v.length>4 || new Set(v).size !== v.length ||
        v.some(function (n) { return !Number.isInteger(n) || n<1 || n>4; })) fail('INVALID_COURTS','コートは1～4の番号を指定してください');
    return v.slice().sort(function(a,b){return a-b;});
  }
  function validGroups(groups, peopleIds) {
    var used = new Set();
    return (groups || []).filter(function (g) { return g.enabled !== false; }).map(function(g,i) {
      var members = (g.participationIds || g.members || []).slice();
      var kind = members.length === 2 ? 'pair' : members.length === 3 ? 'trio' : null;
      if (!kind) fail('INVALID_GROUP','固定グループは2人または3人です');
      if (new Set(members).size !== members.length) fail('INVALID_GROUP','固定グループ内に同一参加者がいます');
      members.forEach(function (m) {
        if (!peopleIds.has(m) || used.has(m)) fail('INVALID_GROUP','固定グループに不明または重複した参加者がいます');
        used.add(m);
      });
      return {groupId:String(g.groupId || 'G'+(i+1)), kind:kind, participationIds:members};
    });
  }
  function rng(seed) { var s = (Number(seed)||1)>>>0; return function() { s=(Math.imul(1664525,s)+1013904223)>>>0; return s/4294967296; }; }
  function shuffle(xs, random) { var a=xs.slice(); for(var i=a.length-1;i>0;i--){var j=Math.floor(random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
  function pairKey(a,b) {return [a,b].sort().join('|');}
  function rosterContext(people, settings) {
    var roster=numbered(people), known=new Set(roster.map(id));
    var groups=validGroups(settings.fixedGroups || [], new Set((people||[]).map(id)));
    var excluded=new Set(settings.excludedIds || []);
    // If any member of a fixed group is excluded/absent, the entire group sits out.
    var groupMembers=new Set(), eligibleGroups=[];
    groups.forEach(function(g){g.participationIds.forEach(function(p){groupMembers.add(p);});
      if(g.participationIds.every(function(p){return known.has(p)&&!excluded.has(p);}))eligibleGroups.push(g);
    });
    var singles=roster.map(id).filter(function(p){return !excluded.has(p)&&!groupMembers.has(p);});
    var eligible=singles.slice();eligibleGroups.forEach(function(g){eligible.push.apply(eligible,g.participationIds);});
    return {singles:singles, groups:eligibleGroups, eligible:eligible, eligibleSet:new Set(eligible)};
  }
  function roundPeople(r) {var ids=[]; (r.courts || []).forEach(function(c){ids.push.apply(ids,c.teamA);ids.push.apply(ids,c.teamB);});return ids;}
  function opponentPairCounts(history) {
    var plays={}, pairs={}, opponents={}, pastRounds=[];
    (history||[]).forEach(function(r){
      if (r.state==='not_played') return;
      var current=new Set();
      (r.courts||[]).forEach(function(c){
        var aa=c.teamA, bb=c.teamB;
        aa.concat(bb).forEach(function(p){current.add(p);});
        [aa,bb].forEach(function(team){if(team.length===2&&!c.fixedPairIds?.includes(pairKey(team[0],team[1]))) {
          var k=pairKey(team[0],team[1]);pairs[k]=(pairs[k]||0)+1;
        }});
        aa.forEach(function(x){bb.forEach(function(y){var k=pairKey(x,y);opponents[k]=(opponents[k]||0)+1;});});
      });
      current.forEach(function(p){plays[p]=(plays[p]||0)+1;});
      pastRounds.push(current);
    });
    return {plays:plays,pairs:pairs,opponents:opponents,pastRounds:pastRounds};
  }
  function scoreCandidate(round, history, eligible) {
    var h=opponentPairCounts(history), after=Object.assign({},h.plays), current=new Set(roundPeople(round));
    eligible.forEach(function(x){after[x]=(after[x]||0)+(current.has(x)?1:0);});
    var nums=eligible.map(function(p){return after[p]||0;});
    var min=nums.length?Math.min.apply(null,nums):0,max=nums.length?Math.max.apply(null,nums):0;
    var mean=nums.reduce(function(a,b){return a+b;},0)/(nums.length||1);
    var fairness=nums.reduce(function(a,b){return a+Math.pow(b-mean,2);},0);
    var penalty=(max-min)*1600+fairness*170;
    (round.courts||[]).forEach(function(c){
      [c.teamA,c.teamB].forEach(function(team){
        if(team.length!==2) return;
        var k=pairKey(team[0],team[1]);if(c.fixedPairIds && c.fixedPairIds.includes(k))return;
        penalty+=Math.pow(h.pairs[k]||0,2)*35+(h.pairs[k]||0)*90;
      });
      c.teamA.forEach(function(a){c.teamB.forEach(function(b){var n=h.opponents[pairKey(a,b)]||0;penalty+=n*12+n*n*9;});});
    });
    if(h.pastRounds.length){
      var prev=h.pastRounds[h.pastRounds.length-1];
      eligible.forEach(function(p){if(prev.has(p)===current.has(p)) penalty += 5;});
    }
    penalty-=round.courts.length*100;
    return penalty;
  }
  function generateOne(people, settings, history, roundNumber, seed, tries) {
    var context=rosterContext(people,settings), random=rng(seed);
    var fixedTeams=context.groups.map(function(g){return {members:g.participationIds.slice(),fixed:g.kind==='pair'};});
    var numTeams=fixedTeams.length+Math.floor(context.singles.length/2);
    var courtCount=Math.min(validCourts(settings.enabledCourts).length,Math.floor(numTeams/2));
    if(courtCount<1) return null;
    var best=null,bestScore=Infinity;
    var previousPlayCount=opponentPairCounts(history).plays;
    tries=Math.min(400,Math.max(1,Number(tries)||90));
    for(var iter=0;iter<tries;iter++){
      var loose=shuffle(context.singles,random),teams=fixedTeams.map(function(t){return {members:t.members.slice(),fixed:t.fixed};});
      for(var i=0;i+1<loose.length;i+=2){teams.push({members:[loose[i],loose[i+1]],fixed:false});}
      // Fairness-first team selection with randomized tie-breaking, while the
      // complete scoring function still chooses among many candidate rounds.
      teams=teams.map(function(t){return Object.assign({},t,{
        selectionScore:t.members.reduce(function(acc,p){return acc+(previousPlayCount[p]||0);},0)/t.members.length + random()*1.1
      });}).sort(function(a,b){return a.selectionScore-b.selectionScore;});
      // Vary court/team placement without changing the chosen participant set.
      var chosen=shuffle(teams.slice(0,2*courtCount),random);
      var enabled=validCourts(settings.enabledCourts);
      var courts=[];
      for(var c=0;c<courtCount;c++){
        var a=chosen[2*c], b=chosen[2*c+1];
        courts.push({courtNumber:enabled[c],teamA:a.members,teamB:b.members,
          fixedPairIds:[a,b].filter(function(t){return t.fixed;}).map(function(t){return pairKey(t.members[0],t.members[1]);})});
      }
      var round={roundNumber:roundNumber,state:'planned',courts:courts};
      var sc=scoreCandidate(round,history,context.eligible);
      if(sc<bestScore){best=round;bestScore=sc;}
    }
    return best;
  }
  function makeSettings(input) {
    var courts=validCourts(input.enabledCourts || [1,2,3]);
    var count=Number(input.lookaheadCount == null ? 5 : input.lookaheadCount);
    if(!Number.isInteger(count)||count<1||count>10)fail('INVALID_LOOKAHEAD','先行生成数は1～10で指定してください');
    return {enabledCourts:courts,lookaheadCount:count,excludedIds:(input.excludedIds||[]).slice(),fixedGroups:clone(input.fixedGroups||[])};
  }
  function appendPlanned(state, input) {
    var c=state.rounds.filter(function(r){return r.state==='running'||r.state==='planned';}).length;
    // existing hidden planned rounds count too, so decreasing lookahead never discards them.
    var tries=Number(input?.candidateCount)||120;
    while(c < state.settings.lookaheadCount){
      var nextNumber=state.rounds.length?Math.max.apply(null,state.rounds.map(function(x){return x.roundNumber;}))+1:1;
      var next=generateOne(state.people,state.settings,state.rounds,nextNumber,
        state.seed+nextNumber*7919+state.generation*137,tries);
      if(!next)break;
      state.rounds.push(next);state.generation++;c++;
    }
  }
  function create(input) {
    if(!input||!input.practiceId)fail('BAD_REQUEST','練習IDが必要です');
    var people=clone(input.people||[]), settings=makeSettings(input);
    numbered(people);validGroups(settings.fixedGroups,new Set(people.map(id)));
    var state={practiceId:String(input.practiceId),people:people,settings:settings,sessionState:'ready',
      currentRound:null,rounds:[],sessionVersion:1,settingsVersion:1,seed:Number(input.seed)||17,
      generation:0,lastProgress:null,lastAction:null,undoHistory:[],appliedOperations:{}};
    appendPlanned(state,input);
    if(!state.rounds.length)fail('NO_FEASIBLE_MATCH','対戦可能な2チームを構成できません');
    return state;
  }
  function checkLineup(state, round) {
    if(!round)fail('NO_NEXT_ROUND','次の試合がありません');
    var context=rosterContext(state.people,state.settings),allowedCourts=new Set(state.settings.enabledCourts),seen=new Set(),invalid=[];
    round.courts.forEach(function(c){
      if(!allowedCourts.has(c.courtNumber))invalid.push('使用停止中のコート '+c.courtNumber);
      c.teamA.concat(c.teamB).forEach(function(p){
        if(!context.eligibleSet.has(p))invalid.push('除外・欠席中の参加者 '+p);
        if(seen.has(p))invalid.push('参加者の重複 '+p);
        seen.add(p);
      });
    });
    // A fixed group that appears in a planned round must remain one whole team.
    (state.settings.fixedGroups||[]).filter(function(g){return g.enabled!==false;}).forEach(function(g){
      var members=g.participationIds||g.members||[];
      var appearances=members.filter(function(p){return seen.has(p);});
      if(!appearances.length)return;
      var intact=round.courts.some(function(c){return [c.teamA,c.teamB].some(function(team){return members.every(function(p){return team.includes(p);});});});
      if(!intact)invalid.push('固定グループの組み合わせが変わりました '+(g.groupId||''));
    });
    if(invalid.length)fail('INVALID_LINEUP',invalid.join('、'));
  }
  function requireVersion(s,n){if(Number(n)!==s.sessionVersion)fail('VERSION_CONFLICT','他の担当者が試合を更新しました');}
  function requireSettingsVersion(s,n){if(Number(n)!==s.settingsVersion)fail('VERSION_CONFLICT','他の担当者が設定を更新しました');}
  // Undo entries keep only the fields that actually changed, not an entire
  // historical session. This makes repeated undo practical in GAS sheet storage.
  function packPlanned(rounds) {
    return rounds.filter(function(r){return r.state==='planned';}).map(function(r){
      return [r.roundNumber, r.courts.map(function(c){
        return [c.courtNumber,c.teamA,c.teamB,c.fixedPairIds||[]];
      })];
    });
  }
  function unpackPlanned(packed){
    return (packed||[]).map(function(v){
      return {roundNumber:v[0],state:'planned',courts:v[1].map(function(c){
        return {courtNumber:c[0],teamA:c[1],teamB:c[2],fixedPairIds:c[3]||[]};
      })};
    });
  }
  function snapshotForUndo(s,kind,input){
    var before;
    if(kind==='start'){
      var first=s.rounds.find(function(r){return r.state==='planned';});
      before={sessionState:s.sessionState,currentRound:s.currentRound,
        roundStates:first?[[first.roundNumber,first.state]]:[]};
    }else if(kind==='advance'){
      var next=s.rounds.find(function(r){return r.state==='planned';});
      var current=s.rounds.find(function(r){return r.roundNumber===s.currentRound;});
      before={sessionState:s.sessionState,currentRound:s.currentRound,
        roundCount:s.rounds.length,generation:s.generation,
        roundStates:[current,next].filter(Boolean).map(function(r){return [r.roundNumber,r.state];})};
    }else if(kind==='finish'){
      before={sessionState:s.sessionState,currentRound:s.currentRound,
        roundStates:s.rounds.filter(function(r){return r.state==='planned'||r.state==='running';})
          .map(function(r){return [r.roundNumber,r.state];})};
    }else if(kind==='regenerate'){
      before={planned:packPlanned(s.rounds),generation:s.generation};
    }else if(kind==='lookahead'){
      before={lookaheadCount:s.settings.lookaheadCount,roundCount:s.rounds.length,generation:s.generation};
    }else if(kind==='status'){
      before={excludedIds:clone(s.settings.excludedIds)};
    }else if(kind==='courts'){
      before={enabledCourts:clone(s.settings.enabledCourts)};
    }else if(kind==='groups'){
      before={fixedGroups:clone(s.settings.fixedGroups)};
    }else return null;
    return {kind:kind,operationId:input.operationId,before:before};
  }
  function restoreUndo(s,frame){
    var b=frame.before,k=frame.kind;
    if(k==='legacy'){
      s.rounds=clone(b.rounds);s.sessionState=b.sessionState;
      s.currentRound=b.currentRound;s.generation=b.generation;s.settings=clone(b.settings);
      return;
    }
    if(k==='start'||k==='advance'||k==='finish'){
      if(b.roundCount!==undefined)s.rounds=s.rounds.slice(0,b.roundCount);
      (b.roundStates||[]).forEach(function(pair){
        var r=s.rounds.find(function(x){return x.roundNumber===pair[0];});
        if(!r)fail('UNDO_NOT_ALLOWED','復元する試合が見つかりません');r.state=pair[1];
      });
      s.sessionState=b.sessionState;s.currentRound=b.currentRound;
      if(b.generation!==undefined)s.generation=b.generation;
    }else if(k==='regenerate'){
      s.rounds=s.rounds.filter(function(r){return r.state!=='planned';}).concat(unpackPlanned(b.planned));
      s.generation=b.generation;
    }else if(k==='lookahead'){
      s.settings.lookaheadCount=b.lookaheadCount;
      s.rounds=s.rounds.slice(0,b.roundCount);s.generation=b.generation;
    }else if(k==='status'){
      s.settings.excludedIds=clone(b.excludedIds);
    }else if(k==='courts'){
      s.settings.enabledCourts=clone(b.enabledCourts);
    }else if(k==='groups'){
      s.settings.fixedGroups=clone(b.fixedGroups);
    }else fail('UNDO_NOT_ALLOWED','操作履歴を復元できません');
  }
  function ensureUndoHistory(s){
    if(Array.isArray(s.undoHistory))return;
    // A v0.10 session can preserve its last one-step undo during migration.
    var old=s.lastAction;
    if(old&&old.before&&old.afterSessionVersion===s.sessionVersion&&
      old.afterSettingsVersion===s.settingsVersion){
      s.undoHistory=[{kind:'legacy',operationId:old.operationId,before:old.before}];
    }else s.undoHistory=[];
  }
  function undoAvailable(state){
    return !!(state&&(Array.isArray(state.undoHistory)?state.undoHistory.length:
      state.lastAction&&state.lastAction.before));
  }
  function action(state, kind, input) {
    input=input||{};
    if(!state)fail('BAD_REQUEST','試合セッションがありません');
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(input.operationId||'')))fail('BAD_REQUEST','操作IDが必要です');
    var fingerprint=JSON.stringify([kind,Object.keys(input).filter(function(k){return k!=='operationId';}).sort().map(function(k){return [k,input[k]];})]);
    var previous=state.appliedOperations[input.operationId];
    if(previous){if(previous!==fingerprint)fail('OP_ID_REUSE','操作IDの再利用を検知しました');return clone(state);}
    var s=clone(state),progress=['start','advance','finish','undo','regenerate','lookahead'].includes(kind);
    if(progress)requireVersion(s,input.expectedSessionVersion);
    else requireSettingsVersion(s,input.expectedSettingsVersion);
    // The current roster is refreshed independently; undo never changes attendance.
    ensureUndoHistory(s);
    if(kind==='undo')requireSettingsVersion(s,input.expectedSettingsVersion);
    var frame=kind==='undo'?null:snapshotForUndo(s,kind,input);
    if(kind==='start'){
      if(s.sessionState!=='ready')fail('INVALID_STATE','開始できない状態です');
      var first=s.rounds.find(function(r){return r.state==='planned';});checkLineup(s,first);
      first.state='running';s.currentRound=first.roundNumber;s.sessionState='running';s.sessionVersion++;
    }else if(kind==='advance'){
      if(s.sessionState!=='running')fail('INVALID_STATE','進行中ではありません');
      var next=s.rounds.find(function(r){return r.state==='planned';});checkLineup(s,next);
      var current=s.rounds.find(function(r){return r.roundNumber===s.currentRound;});
      current.state='completed';next.state='running';s.currentRound=next.roundNumber;
      appendPlanned(s,input);s.sessionVersion++;
    }else if(kind==='finish'){
      if(!['ready','running'].includes(s.sessionState))fail('INVALID_STATE','進行終了できません');
      s.rounds.forEach(function(r){if(r.state==='running')r.state='completed';else if(r.state==='planned')r.state='not_played';});
      s.sessionState='finished';s.sessionVersion++;
    }else if(kind==='undo'){
      var prior=s.undoHistory[s.undoHistory.length-1];
      if(!prior || (input.targetOperationId&&prior.operationId!==input.targetOperationId))
        fail('UNDO_NOT_ALLOWED','これ以上戻せる操作がありません');
      restoreUndo(s,prior);
      s.undoHistory.pop();
      // Both revisions remain monotonic: a stale browser cannot override the undo.
      s.sessionVersion++;s.settingsVersion++;s.lastProgress=null;
      var latest=s.undoHistory[s.undoHistory.length-1];
      s.lastAction=latest?{kind:latest.kind,operationId:latest.operationId}:null;
    }else if(kind==='regenerate'){
      if(s.sessionState==='finished')fail('INVALID_STATE','終了済みです');
      s.rounds=s.rounds.filter(function(r){return r.state!=='planned';});
      appendPlanned(s,input);s.sessionVersion++;s.lastProgress=null;
    }else if(kind==='lookahead'){
      var n=Number(input.count);if(!Number.isInteger(n)||n<1||n>10)fail('INVALID_LOOKAHEAD','先行生成数は1～10です');
      s.settings.lookaheadCount=n;
      if(s.sessionState!=='finished')appendPlanned(s,input);
      s.settingsVersion++;s.sessionVersion++;s.lastProgress=null;
    }else if(kind==='status'){
      var who=String(input.participationId||'');
      if(!s.people.some(function(p){return id(p)===who}))fail('NOT_FOUND','参加者IDが見つかりません');
      if(!['include','exclude'].includes(input.status))fail('BAD_REQUEST','状態は参加か除外です');
      var excluded=new Set(s.settings.excludedIds);
      if(input.status==='include')excluded.delete(who);else excluded.add(who);
      s.settings.excludedIds=Array.from(excluded);s.settingsVersion++;
    }else if(kind==='courts'){
      s.settings.enabledCourts=validCourts(input.enabledCourts);s.settingsVersion++;
    }else if(kind==='groups'){
      var groups=validGroups(input.fixedGroups,new Set(s.people.map(id)));
      s.settings.fixedGroups=groups.map(function(g){return {groupId:g.groupId,participationIds:g.participationIds};});s.settingsVersion++;
    }else if(kind==='roster'){
      var p=clone(input.people||[]);numbered(p);validGroups(s.settings.fixedGroups,new Set(p.map(id)));
      s.people=p;s.settingsVersion++;
    }else fail('BAD_REQUEST','不明な操作です');
    if(frame){
      s.undoHistory.push(frame);
      s.lastAction={kind:kind,operationId:input.operationId};
      s.lastProgress=null;
    }
    s.appliedOperations[input.operationId]=fingerprint;
    return s;
  }
  function visible(state){
    if(!state)return [];
    var active=state.rounds.filter(function(r){return r.state==='planned'||r.state==='running';});
    return active.slice(0,state.settings.lookaheadCount).map(function(r){return clone(r);});
  }
  var api={normalizeName:name,numbered:numbered,create:create,action:action,visible:visible,
    checkLineup:checkLineup,generateOne:generateOne,scoreCandidate:scoreCandidate,
    undoAvailable:undoAvailable};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SMMatchCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);


// ==================== Code.gs ====================
/**
 * 全力☆スマッシュ 新システム GAS API prototype (new, SEPARATE spreadsheet only).
 * Strictly do not paste into the current operational v7 project.
 * Properties required: SPREADSHEET_ID, BACKEND_SECRET, OPENING_DATE, OPENING_BALANCE.
 * All write operations require verified LINE subject supplied by the trusted Worker
 * and membership/role checks performed HERE, not only in the browser.
 * SpreadsheetApp mutations across sheets are not true database transactions:
 * see README for rollback/recovery and limitations.
 */
var SM = {
  headers: {
    'メンバー':['memberId','displayName','lineUserId','active','isAdmin'],
    '当番チーム':['teamId','teamName','active'],
    'チーム所属':['teamId','memberId','active'],
    '練習日程':['practiceId','date','place','startTime','endTime','hours','enabled'],
    '出欠回答':['practiceId','participantId','displayName','nameKana','category','attending','remark','version','registeredBy'],
    '集金記録':['practiceId','participantId','completed','version','updatedBy','updatedAt'],
    '全体収支管理表':['日付','開催場所・費目名','集金額','支出','残金','確認者','rowId','kind','practiceId','status','version','当日補正','費目','立替者','receiptFileId','作成者'],
    '操作履歴':['operationId','operation','actorMemberId','timestamp','targetId','resultJSON']
  },
  fees: {member:800,student:400,visitor:1000,duty:400,shuttle:400}
};
function conf_(name){return PropertiesService.getScriptProperties().getProperty(name)||'';}
function ss_(){var id=conf_('SPREADSHEET_ID');if(!id)throw new Error('SPREADSHEET_ID未設定');return SpreadsheetApp.openById(id);}
function today_(){return Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');}
function now_(){return Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss');}
function norm_(s){return String(s===null||s===undefined?'':s).normalize('NFKC').replace(/[\s\u00a0\u3000]+/g,'');}
function str_(s){return String(s===null||s===undefined?'':s).trim();}
// Sheets may auto-convert ISO date strings to native Date on setValues().
// Canonicalize when reading ledger rows; this guards all mutations and reads.
function ledgerDate_(s){
 if(Object.prototype.toString.call(s)==='[object Date]'){
   return Number.isFinite(s.getTime())?Utilities.formatDate(s,'Asia/Tokyo','yyyy-MM-dd'):'';
 }
 return str_(s);
}
function safeCell_(s){s=String(s);return /^[=+@]/.test(s)?"'"+s:s;}
function bool_(v){return v===true||v==='TRUE'||v==='true';}
function fail_(code,message){var e=new Error(message);e.smCode=code;throw e;}
function iso_(s){s=String(s);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;var d=new Date(s+'T00:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
function jpy_(v,allowNegative){if(typeof v==='boolean'||v===null||v===undefined||v==='')fail_('BAD_REQUEST','金額が不正です');var n=Number(v);if(!Number.isSafeInteger(n)||(!allowNegative&&n<0))fail_('BAD_REQUEST','金額は整数で入力してください');return n;}
function sheetRows_(ss,name){var sh=ss.getSheetByName(name);if(!sh)fail_('SETUP','必要なシートがありません: '+name);var max=SM.headers[name].length;return sh.getLastRow()<2?[]:sh.getRange(2,1,sh.getLastRow()-1,max).getValues();}
function sheet_(ss,name){var sh=ss.getSheetByName(name);if(!sh)fail_('SETUP','必要なシートがありません: '+name);return sh;}
function withLock_(fn,profile){var started=profile?Date.now():0,lock=LockService.getScriptLock();if(!lock.tryLock(15000))fail_('BUSY','他の操作を処理中です。再試行してください');if(profile)profile.lockWaitMs=Date.now()-started;try{return fn();}finally{lock.releaseLock();}}
function member_(ss,lineUserId){var rows=sheetRows_(ss,'メンバー');var found=rows.filter(function(r){return str_(r[2])===lineUserId&&bool_(r[3]);});if(found.length!==1)fail_('UNAUTHORIZED','利用登録が確認できません');
 var m={memberId:str_(found[0][0]),name:norm_(found[0][1]),admin:bool_(found[0][4]),role:'member'};
 if(m.admin){m.role='admin';return m;}
 var memberships=sheetRows_(ss,'チーム所属');var enabledTeams=sheetRows_(ss,'当番チーム').filter(function(t){return bool_(t[2]);}).map(function(t){return str_(t[0]);});
 if(memberships.some(function(r){return str_(r[1])===m.memberId&&bool_(r[2])&&enabledTeams.indexOf(str_(r[0]))!==-1;}))m.role='duty';
 return m;
}
function requireDuty_(m){if(m.role!=='duty'&&m.role!=='admin')fail_('FORBIDDEN','当番チームの権限が必要です');}
function checkOpId_(payload){var s=str_(payload.operationId);if(!/^[\w-]{8,100}$/.test(s))fail_('BAD_REQUEST','操作IDが必要です');return s;}
function auditExisting_(ss,opId,op,member){var rows=sheetRows_(ss,'操作履歴');for(var i=rows.length-1;i>=0;i--)if(rows[i][0]===opId){if(rows[i][1]!==op||rows[i][2]!==member.memberId)fail_('CONFLICT','操作IDは別の処理で使用されています');try{return JSON.parse(rows[i][5]);}catch(_){fail_('SETUP','操作履歴が壊れています');}}return null;}
function audit_(ss,opId,op,member,target,result){sheet_(ss,'操作履歴').appendRow([opId,op,member.memberId,now_(),target,JSON.stringify(result)]);}
function entries_(ss){return sheetRows_(ss,'全体収支管理表').filter(function(r){return str_(r[6]);}).map(function(r){return {
 date:ledgerDate_(r[0]),label:str_(r[1]),income:Number(r[2])||0,expense:Number(r[3])||0,balance:Number(r[4])||0,
 confirmedBy:str_(r[5]),rowId:str_(r[6]),kind:str_(r[7]),practiceId:str_(r[8]),status:str_(r[9])||'open',
 version:Number(r[10])||0,adjustment:Number(r[11])||0,item:str_(r[12]),payee:norm_(r[13]),receiptFileId:str_(r[14]),createdBy:str_(r[15])
};});}
function fee_(cat,hours){var base=SM.fees[cat];var factor={2:6/8,3:7/8,4:1}[hours];if(base===undefined||factor===undefined)fail_('BAD_REQUEST','料金設定または練習時間が不正です');return Math.ceil(base*factor/100)*100;}
function practices_(ss){return sheetRows_(ss,'練習日程').map(function(r){return {practiceId:str_(r[0]),date:str_(r[1]),place:str_(r[2]),startTime:str_(r[3]),endTime:str_(r[4]),hours:Number(r[5]),enabled:bool_(r[6])};}).filter(function(p){return p.practiceId&&p.enabled;});}
function practice_(ss,id){var found=practices_(ss).filter(function(p){return p.practiceId===id;});if(found.length!==1)fail_('NOT_FOUND','練習日程が見つかりません');return found[0];}
function attendees_(ss,id){return sheetRows_(ss,'出欠回答').filter(function(r){return str_(r[0])===id&&bool_(r[5]);}).map(function(r){return {practiceId:id,participantId:str_(r[1]),name:norm_(r[2]),nameKana:norm_(r[3]),category:str_(r[4]),attending:true,memo:str_(r[6]),categoryVersion:Number(r[7])||0};});}
function paymentRows_(ss,id){return sheetRows_(ss,'集金記録').filter(function(r){return str_(r[0])===id;});}
function practiceIncome_(ss,id,adjustment){var p=practice_(ss,id);var payments=paymentRows_(ss,id);var done={};payments.forEach(function(r){if(bool_(r[2]))done[str_(r[1])]=true;});var amount=attendees_(ss,id).reduce(function(sum,a){return sum+(done[a.participantId]?fee_(a.category,p.hours):0);},0);return amount+Number(adjustment||0);}
function balanceRecalc_(rows,original){
 if(rows.length>5000)fail_('LIMIT','収支行が多すぎます');
 var old={};original.forEach(function(r){old[r.rowId]=r;});
 var weight={opening:0,practice:1,reimbursement:2,other:3};
 rows.sort(function(a,b){return a.date.localeCompare(b.date)||((weight[a.kind]===undefined?5:weight[a.kind])-(weight[b.kind]===undefined?5:weight[b.kind]))||a.rowId.localeCompare(b.rowId);});
 var seen={},balance=null;
 rows.forEach(function(r){
   if(!iso_(r.date)||seen[r.rowId])fail_('BAD_REQUEST','収支の日付または行IDが不正です');seen[r.rowId]=true;
   if(r.kind==='opening'){if(balance!==null)fail_('SETUP','引継行が複数あります');balance=jpy_(r.balance,false);return;}
   if(balance===null)fail_('SETUP','前回引継行がありません');
   balance+=jpy_(r.income,false)-jpy_(r.expense,false);
   if(!Number.isSafeInteger(balance))fail_('BAD_REQUEST','残金が計算可能な範囲を超えました');
   if(r.balance!==balance){r.balance=balance;if(old[r.rowId]&&r.version===old[r.rowId].version)r.version++;}
 });
 if(rows.filter(function(r){return r.kind==='opening';}).length!==1)fail_('SETUP','引継行が必要です');
 original.filter(function(r){return r.status==='confirmed';}).forEach(function(r){var newRow=rows.find(function(x){return x.rowId===r.rowId;});if(!newRow||newRow.status==='confirmed'&&newRow.balance!==r.balance)fail_('CONFLICT','確定済み行の残金が変わるため変更できません');});
 return rows;
}
function writeLedger_(ss,rows){var sh=sheet_(ss,'全体収支管理表'),old=Math.max(0,sh.getLastRow()-1);
 var arr=rows.map(function(r){return [r.date,safeCell_(r.label),r.income,r.expense,r.balance,safeCell_(r.confirmedBy),r.rowId,r.kind,r.practiceId,r.status,r.version,r.adjustment,safeCell_(r.item),safeCell_(r.payee),r.receiptFileId,r.createdBy];});
 if(arr.length)sh.getRange(2,1,arr.length,16).setValues(arr);if(old>arr.length)sh.getRange(arr.length+2,1,old-arr.length,16).clearContent();
}
/**
 * Narrow write for the frequent case where only one practice ledger row
 * changed. Balance/confirmed-row checks are ALWAYS done by balanceRecalc_.
 * If rows are unsorted, non-contiguous, or other balances changed, fall back
 * to the existing full rewrite to preserve exact financial semantics.
 */
function writePaymentLedger_(ss,rows,original,targetId){
 var sh=sheet_(ss,'全体収支管理表');
 if(rows.length!==original.length||sh.getLastRow()!==original.length+1){
  writeLedger_(ss,rows);return 'full';
 }
 var changed=-1;
 for(var i=0;i<rows.length;i++){
  var next=rows[i],prev=original[i];
  if(next.rowId!==prev.rowId){writeLedger_(ss,rows);return 'full';}
  var keys=Object.keys(prev);
  if(keys.some(function(k){return k!=='income'&&k!=='balance'&&k!=='version'&&next[k]!==prev[k];})){
   writeLedger_(ss,rows);return 'full';
  }
  if(next.income!==prev.income||next.balance!==prev.balance||next.version!==prev.version){
   if(changed!==-1||next.rowId!==targetId){writeLedger_(ss,rows);return 'full';}
   changed=i;
  }
 }
 if(changed<0){writeLedger_(ss,rows);return 'full';}
 var r=rows[changed];
 // One Sheets update on columns C:K, retaining untouched date/label columns.
 sh.getRange(changed+2,3,1,9).setValues([[
  r.income,r.expense,r.balance,safeCell_(r.confirmedBy),
  r.rowId,r.kind,r.practiceId,r.status,r.version
 ]]);
 return 'row';
}
function row_(list,id){var a=list.filter(function(r){return r.rowId===id;});if(a.length!==1)fail_('NOT_FOUND','収支行が見つかりません');return a[0];}
function unlockable_(row){if(row.status==='confirmed')fail_('LOCKED','確定済みのため変更できません');}
function dateAllowed_(date){if(!iso_(date)||date>today_())fail_('BAD_REQUEST','未来日または日付が不正です');}
function expectVersion_(current,expected){if(!Number.isSafeInteger(Number(expected))||Number(expected)!==current)fail_('CONFLICT','他の端末で変更されています。再読込してください');}
function changeMoney_(ss,member,payload,kind){
 var id=str_(payload.practiceId),p=practice_(ss,id),rows=entries_(ss),row=row_(rows,'P-'+id);unlockable_(row);expectVersion_(row.version,payload.expectedVersion);
 if(kind==='adjustment')row.adjustment=jpy_(payload.value,true);else row.expense=jpy_(payload.value,false);
 row.income=practiceIncome_(ss,id,row.adjustment);row.version++;
 var result=balanceRecalc_(rows,entries_(ss));writeLedger_(ss,result);
 return {ok:true,data:{practiceId:id,ledgerVersion:row.version,income:row.income,expense:row.expense,adjustment:row.adjustment,balance:row.balance}};
}
function setPayment_(ss,member,payload,profile){
 var mark=profile?Date.now():0;
 var id=str_(payload.practiceId),person=str_(payload.participantId),p=practice_(ss,id);
 if(profile){profile.practiceReadMs=Date.now()-mark;mark=Date.now();}
 var original=entries_(ss),rows=original.map(function(r){return Object.assign({},r);}),ledger=row_(rows,'P-'+id);
 if(profile){profile.ledgerReadMs=Date.now()-mark;mark=Date.now();}
 unlockable_(ledger);var attending=attendees_(ss,id);if(!attending.some(function(a){return a.participantId===person;}))fail_('NOT_FOUND','出欠登録のある参加者が見つかりません');
 if(profile){profile.attendeeReadMs=Date.now()-mark;mark=Date.now();}
 var sh=sheet_(ss,'集金記録'),all=sheetRows_(ss,'集金記録');var index=all.findIndex(function(r){return str_(r[0])===id&&str_(r[1])===person;});
 if(profile){profile.paymentReadMs=Date.now()-mark;mark=Date.now();}
 var old=index>=0?all[index]:null,current=old?(Number(old[3])||0):0;
 expectVersion_(current,payload.expectedVersion);if(typeof payload.completed!=='boolean')fail_('BAD_REQUEST','完了状態が不正です');
 // Candidate income is computed in-memory before any write, to validate confirmed balances.
 var a=attending.find(function(x){return x.participantId===person;});var delta=(payload.completed?1:0)-(old&&bool_(old[2])?1:0);
 ledger.income+=delta*fee_(a.category,p.hours);ledger.version++;
 balanceRecalc_(rows,original);
 if(profile){profile.validationMs=Date.now()-mark;mark=Date.now();}
 if(index>=0)sh.getRange(index+2,1,1,6).setValues([[id,person,payload.completed,current+1,member.memberId,now_()]]);
 else sh.appendRow([id,person,payload.completed,1,member.memberId,now_()]);
 if(profile){profile.paymentWriteMs=Date.now()-mark;mark=Date.now();}
 writePaymentLedger_(ss,rows,original,'P-'+id);
 if(profile)profile.ledgerWriteMs=Date.now()-mark;
 return {ok:true,data:{practiceId:id,participantId:person,completed:payload.completed,version:current+1,ledgerVersion:ledger.version,income:ledger.income,balance:ledger.balance}};
}
function setCategory_(ss,member,payload){
 var id=str_(payload.practiceId),person=str_(payload.participantId),p=practice_(ss,id),cat=str_(payload.category);if(SM.fees[cat]===undefined)fail_('BAD_REQUEST','参加区分が不正です');
 var ledgerRows=entries_(ss),ledger=row_(ledgerRows,'P-'+id);unlockable_(ledger);
 var sh=sheet_(ss,'出欠回答'),arr=sheetRows_(ss,'出欠回答'),ix=arr.findIndex(function(r){return str_(r[0])===id&&str_(r[1])===person;});
 if(ix<0||!bool_(arr[ix][5]))fail_('NOT_FOUND','参加者が見つかりません');var record=arr[ix],current=Number(record[7])||0;expectVersion_(current,payload.expectedVersion);
 var oldCat=str_(record[4]);var paid=paymentRows_(ss,id).some(function(r){return str_(r[1])===person&&bool_(r[2]);});
 if(paid)ledger.income+=fee_(cat,p.hours)-fee_(oldCat,p.hours);ledger.version++;
 balanceRecalc_(ledgerRows,entries_(ss));
 sh.getRange(ix+2,5).setValue(cat);sh.getRange(ix+2,8).setValue(current+1);
 if(paid)writeLedger_(ss,ledgerRows);
 return {ok:true,data:{practiceId:id,participantId:person,category:cat,fee:fee_(cat,p.hours),categoryVersion:current+1,ledgerVersion:ledger.version,balance:ledger.balance}};
}
function mutateLedger_(ss,member,payload){
 var original=entries_(ss),rows=entries_(ss),action=str_(payload.action),id=str_(payload.rowId),r=null;
 if(action!=='add'){r=row_(rows,id);expectVersion_(r.version,payload.expectedVersion);}
 if(action==='add'){
   var kind=str_(payload.kind);if(kind==='practice'){
     var p=practice_(ss,str_(payload.practiceId));dateAllowed_(p.date);id='P-'+p.practiceId;
     if(rows.some(function(x){return x.rowId===id;}))fail_('CONFLICT','練習日の収支行は登録済みです');
     r={date:p.date,label:p.place,income:practiceIncome_(ss,p.practiceId,0),expense:0,balance:0,confirmedBy:'',rowId:id,kind:'practice',practiceId:p.practiceId,status:'open',version:1,adjustment:0,item:'',payee:'',receiptFileId:'',createdBy:member.memberId};rows.push(r);
   }else if(kind==='reimbursement'||kind==='other'){
     id=str_(payload.rowId);if(!/^([RO]-)[\w-]{8,100}$/.test(id)||rows.some(function(x){return x.rowId===id;}))fail_('BAD_REQUEST','新しい収支IDが不正です');
     dateAllowed_(str_(payload.date));var income=kind==='reimbursement'?0:jpy_(payload.income,false),expense=kind==='reimbursement'?jpy_(payload.amount,false):jpy_(payload.expense,false);
     if(!income&&!expense||kind==='reimbursement'&&!expense)fail_('BAD_REQUEST','金額が不正です');
     var item=str_(payload.item),payee=norm_(payload.payee),label=kind==='reimbursement'?'立替精算：'+item+'（'+payee+'）':str_(payload.label);
     if(kind==='reimbursement'&&(!item||!payee)||!label)fail_('BAD_REQUEST','費目・立替者・表示名が必要です');
     r={date:payload.date,label,income,expense,balance:0,confirmedBy:'',rowId:id,kind,practiceId:'',status:'open',version:1,adjustment:0,item,payee,receiptFileId:'',createdBy:member.memberId};rows.push(r);
   }else fail_('BAD_REQUEST','登録区分が不正です');
 }else if(action==='edit'){
   unlockable_(r);if(r.kind==='practice')fail_('FORBIDDEN','練習日の集金額・支出はホームから修正してください');dateAllowed_(str_(payload.date));
   r.date=payload.date;
   if(r.kind==='reimbursement'){
     var itm=str_(payload.item),pye=norm_(payload.payee),amt=jpy_(payload.amount,false);if(!itm||!pye||amt<=0)fail_('BAD_REQUEST','費目・立替者・精算額は必須です');
     r.item=itm;r.payee=pye;r.label='立替精算：'+itm+'（'+pye+'）';r.income=0;r.expense=amt;
   }else if(r.kind==='other'){
     r.label=str_(payload.label);r.income=jpy_(payload.income,false);r.expense=jpy_(payload.expense,false);
     if(!r.label||!r.income&&!r.expense)fail_('BAD_REQUEST','費目か金額が不正です');
   }else fail_('BAD_REQUEST','修正できない行です');r.version++;
 }else if(action==='delete'){
   unlockable_(r);rows=rows.filter(function(x){return x.rowId!==id;});
 }else if(action==='confirm'){
   unlockable_(r);dateAllowed_(r.date);r.status='confirmed';r.confirmedBy=member.name;r.version++;
 }else if(action==='unlock'){
   if(member.role!=='admin')fail_('FORBIDDEN','確定解除はシステム管理者のみ可能です');
   if(r.status!=='confirmed')fail_('BAD_REQUEST','未確定の行です');r.status='open';r.confirmedBy='';r.version++;
 }else fail_('BAD_REQUEST','操作が不正です');
 balanceRecalc_(rows,original);writeLedger_(ss,rows);
 return {ok:true,data:{rowId:id,action:action,ledger:rows}};
}
function overview_(ss,member,payload){var all=practices_(ss).sort(function(a,b){return a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime);});
 var id=str_(payload.practiceId)|| (all.length?all[all.length-1].practiceId:'');if(!id)fail_('NOT_FOUND','日程がありません');var p=practice_(ss,id),pay=paymentRows_(ss,id),pm={};pay.forEach(function(r){pm[str_(r[1])]={completed:bool_(r[2]),version:Number(r[3])||0};});
 var roster=attendees_(ss,id).map(function(a){var o=pm[a.participantId]||{completed:false,version:0};return {participantId:a.participantId,name:a.name,nameKana:a.nameKana,category:a.category,fee:fee_(a.category,p.hours),attending:true,memo:a.memo,collectionCompleted:o.completed,paymentVersion:o.version,categoryVersion:a.categoryVersion};});
 // Shared dynamic numbering: sorted every read, never a mutation key.
 roster=SMMatchCore.numbered(roster).map(function(a){a.participantId=a.participationId;return a;});
 var ledger=entries_(ss).find(function(r){return r.rowId==='P-'+id;});var completed=roster.filter(function(a){return a.collectionCompleted;});var total=completed.reduce(function(a,b){return a+b.fee;},0);
 return {ok:true,data:{role:member.role,actorName:member.name,practice:p,practices:all,participants:roster,ledger:ledger||null,expected:roster.reduce(function(a,b){return a+b.fee;},0),completedFee:total,completedCount:completed.length,attendingCount:roster.length}};
}
function monthLedger_(ss,member,payload){var month=str_(payload.month)||today_().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>today_().slice(0,7))fail_('BAD_REQUEST','対象月が不正です');
 var sorted=entries_(ss).filter(function(r){return r.date<=today_();}); // persisted ledger order matches balance calculation
 var prior=sorted.filter(function(r){return r.date<month+'-01';});var within=sorted.filter(function(r){return r.date.slice(0,7)===month;});
 var carried=prior.length?prior[prior.length-1].balance:0;return {ok:true,data:{month,carried,rows:within,closingBalance:within.length?within[within.length-1].balance:carried,role:member.role}};
}
function dispatch_(body){if(!body||body.sharedSecret!==conf_('BACKEND_SECRET')||!conf_('BACKEND_SECRET'))fail_('UNAUTHORIZED','API接続を確認できません');
 // Guest sharing verifies a short-lived token; LINE login is not required.
 if(body.op==='match.guest.get')return accessGuestGet16_(ss_(),body.guestToken);
 if(!/^U[0-9a-f]{32}$/i.test(body.lineUserId||''))fail_('UNAUTHORIZED','LINEユーザーIDが不正です');
 // Unregistered LINE users may apply or check pending status (never administer).
 if(body.op==='member.apply'||body.op==='member.status')
   return accessRegistration16_(ss_(),body.lineUserId,body.op,body.payload||{});
 // v0.15.12: measure only this read-only startup request (no IDs or secrets logged).
 var smProfile=body.op==='match.bootstrap',smT0=smProfile?Date.now():0;
 var ss=ss_(),smT1=smProfile?Date.now():0,
     member=member_(ss,body.lineUserId),smT2=smProfile?Date.now():0,
     op=str_(body.op),payload=body.payload||{};
 if(op==='session')return {ok:true,data:{memberId:member.memberId,name:member.name,role:member.role}};
 if(op.indexOf('member.manage.')===0)return accessManagement16_(ss,member,op,payload);
 if(op==='match.share.issue')return accessShareIssue16_(ss,member,payload);
 if(op==='match.share.revoke')return accessShareRevoke16_(ss,member,payload);
 // Match reads and roster reads are allowed for registered LINE members.
 if(op==='roster.line')return {ok:true,data:{text:formatRosterForLine_(ss,str_(payload.practiceId))}};
 // v0.15.8 起動専用・読み取りAPI（操作ID不要。認証・利用登録確認後に実行）
 if(op==='match.bootstrap'){
   var smResult=matchBootstrapV158_(ss,member,payload);
   if(smResult&&smResult.ok&&smResult.data&&smResult.data.bootstrapTimings){
     // Durations only; no identifiers or secrets are returned.
     smResult.data.bootstrapTimings.sheetOpenMs=smT1-smT0;
     smResult.data.bootstrapTimings.memberAuthMs=smT2-smT1;
     smResult.data.bootstrapTimings.dispatchTotalMs=Date.now()-smT0;
   }
   return smResult;
 }
 if(op.indexOf('match.')===0)return matchApiDispatch_(ss,member,op,payload);
 requireDuty_(member);
 if(['overview','ledger.list'].indexOf(op)>=0)return withLock_(function(){return op==='overview'?overview_(ss,member,payload):monthLedger_(ss,member,payload);});
 if(['payment.set','category.set','adjustment.set','expense.set','ledger.change'].indexOf(op)<0)fail_('BAD_REQUEST','API操作が不正です');
 var opId=checkOpId_(payload);
 return withLock_(function(){
   var done=auditExisting_(ss,opId,op,member);if(done)return done;
   var result;
   if(op==='payment.set')result=setPayment_(ss,member,payload);
   else if(op==='category.set')result=setCategory_(ss,member,payload);
   else if(op==='adjustment.set')result=changeMoney_(ss,member,payload,'adjustment');
   else if(op==='expense.set')result=changeMoney_(ss,member,payload,'expense');
   else result=mutateLedger_(ss,member,payload);
   audit_(ss,opId,op,member,str_(payload.rowId||payload.participantId||payload.practiceId),result);
   return result;
 });
}
function doPost(e){var response;try{if(!e||!e.postData||!e.postData.contents)fail_('BAD_REQUEST','要求がありません');response=dispatch_(JSON.parse(e.postData.contents));}catch(err){response={ok:false,code:err.smCode||'INTERNAL',error:err.smCode?err.message:'サーバー側で処理できませんでした'};console.error(err);}return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);}
/** One-time setup only for a BLANK, NEW spreadsheet. Must be manually run in editor. */
function setupNewSystem(){var ss=ss_();var names=Object.keys(SM.headers);if(names.some(function(name){return !!ss.getSheetByName(name);}))throw new Error('既存の新システム用シートを検出したためセットアップを中止しました');
 var openingDate=conf_('OPENING_DATE'),openingBalance=Number(conf_('OPENING_BALANCE'));
 if(!iso_(openingDate)||!Number.isSafeInteger(openingBalance)||openingBalance<0)throw new Error('OPENING_DATE/OPENING_BALANCEを設定してください');
 names.forEach(function(name){var sh=ss.insertSheet(name),head=SM.headers[name];sh.getRange(1,1,1,head.length).setValues([head]);sh.setFrozenRows(1);sh.getRange(1,1,1,head.length).setBackground('#1976d2').setFontColor('#ffffff').setFontWeight('bold');if(name==='練習日程'||name==='全体収支管理表')sh.getRange('A:A').setNumberFormat('@');if(name==='練習日程')sh.getRange('D:E').setNumberFormat('@');});
 var ledger=sheet_(ss,'全体収支管理表');ledger.appendRow([openingDate,'前回からの引継',0,0,openingBalance,'','OPENING','opening','','confirmed',1,0,'','','','']);ledger.getRange('C:E').setNumberFormat('#,##0"円"');
 return '新しいスプレッドシートに初期シートを作成しました。メンバー・当番チーム・練習日程・出欠を登録してからsyncPracticeRowsInNewSystem()を実行してください。';
}
/** Manual migration helper: creates practice ledger lines from new master only. */
function syncPracticeRowsInNewSystem(){return withLock_(function(){var ss=ss_(),rows=entries_(ss),original=entries_(ss),n=0;
 practices_(ss).forEach(function(p){if(rows.some(function(r){return r.rowId==='P-'+p.practiceId;}))return;
 rows.push({date:p.date,label:p.place,income:practiceIncome_(ss,p.practiceId,0),expense:0,balance:0,confirmedBy:'',rowId:'P-'+p.practiceId,kind:'practice',practiceId:p.practiceId,status:'open',version:1,adjustment:0,item:'',payee:'',receiptFileId:'',createdBy:'MIGRATION'});n++;});
 balanceRecalc_(rows,original);writeLedger_(ss,rows);return n+'件の練習日収支行を作成しました';});}

/** Read-only reconciliation check for operators; safe to run before migration/cutover. */
function checkLedgerConsistencyInNewSystem(){var ss=ss_(),rows=entries_(ss),issues=[];
 rows.filter(function(r){return r.kind==='practice';}).forEach(function(r){try{var expected=practiceIncome_(ss,r.practiceId,r.adjustment);if(expected!==r.income)issues.push({rowId:r.rowId,storedIncome:r.income,expectedIncome:expected});}catch(e){issues.push({rowId:r.rowId,error:String(e.message)});}});
 var previous=rows.map(function(r){return Object.assign({},r);});try{
   balanceRecalc_(rows,[]);
   rows.forEach(function(r){var stored=previous.find(function(x){return x.rowId===r.rowId;});if(stored&&stored.balance!==r.balance)issues.push({kind:'balance',rowId:r.rowId,storedBalance:stored.balance,expectedBalance:r.balance});});
 }catch(e){issues.push({kind:'balance',error:String(e.message)});}
 return issues.length?issues:'整合性チェックOK';}

/** Member-facing roster text; include only current attending persons, latest numbers. */
function formatRosterForLine_(ss,practiceId){
 var p=practice_(ss,practiceId);
 var rows=SMMatchCore.numbered(matchRoster_(ss,practiceId));
 var labels={member:'',student:' [学]',visitor:' [ビ]',duty:' [当]',shuttle:' [シ]'};
 return '■'+p.date+' '+p.place+'\n'+rows.map(function(r){var suffix=labels[r.category]||'';return r.number+'. '+r.displayName+suffix;}).join('\n');
}


// ==================== MatchApi.gs ====================
/**
 * v0.9 MATCH API: add to the NEW v0.8 Apps Script project only.
 * Requires Code.gs + MatchEngine.gs in same NEW GAS project.
 * Storage is revisioned/append-only, but this is NOT production-grade multi-sheet ACID.
 */
var MATCH_SHEETS = {
  '試合セッション': ['practiceId','activeRevisionId','sessionVersion','settingsVersion','updatedAt'],
  '試合版管理': ['revisionId','practiceId','stage','stateJSON','sha256','operationId','createdAt','chunkIndex','chunkTotal'],
  '試合操作履歴': ['operationId','practiceId','actorMemberId','action','sessionVersion','createdAt','details']
};
function setupMatchSheetsForNewSystem(){
  var ss=ss_();
  Object.keys(MATCH_SHEETS).forEach(function(name){
    if(ss.getSheetByName(name))throw new Error('既に'+name+'が存在します。既存データは更新しません');
  });
  Object.keys(MATCH_SHEETS).forEach(function(name){
    var sh=ss.insertSheet(name),h=MATCH_SHEETS[name];
    sh.getRange(1,1,1,h.length).setValues([h]);sh.setFrozenRows(1);
    sh.getRange(1,1,1,h.length).setBackground('#1976d2').setFontColor('#fff').setFontWeight('bold');
  });
  return '対戦表用の新規3シートを作成しました';
}
function matchRows_(ss,name){var sh=ss.getSheetByName(name);if(!sh)fail_('SETUP','試合シートがありません: '+name);
  return sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,MATCH_SHEETS[name].length).getValues():[];}
function matchRoster_(ss,practiceId){
  practice_(ss,practiceId);
  return sheetRows_(ss,'出欠回答').filter(function(r){return str_(r[0])===practiceId;}).map(function(r){
    return {participationId:str_(r[1]),name:norm_(r[2]),nameKana:norm_(r[3]),category:str_(r[4]),attending:bool_(r[5]),memo:str_(r[6])};
  });
}
function matchHash_(txt){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,txt)
  .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function matchFindSession_(ss,practiceId){
  var rows=matchRows_(ss,'試合セッション'),matches=[];
  rows.forEach(function(r,i){if(str_(r[0])===practiceId)matches.push({row:i+2,revId:str_(r[1])});});
  if(matches.length>1)fail_('STORAGE_INCOMPLETE','セッション行が重複しています');
  return matches[0]||null;
}
/**
 * Revision data is split into 30,000 UTF-16 character chunks (below Sheets cell
 * character limits), then read back, hashed and marked ready BEFORE switching
 * the active revision pointer. Legacy 7-column, single-row revisions are readable.
 * We retain every committed revision for investigation/recovery; no overwrite.
 */
var MATCH_CHUNK_CHARS = 30000;
var MATCH_MAX_CHUNKS = 30;  // refuse oversized writes without changing the active version
function matchLoad_(ss,practiceId){
  var ref=matchFindSession_(ss,practiceId);if(!ref)return null;
  var rows=matchRows_(ss,'試合版管理'),versions=rows.filter(function(r){return str_(r[0])===ref.revId;});
  if(!versions.length)fail_('STORAGE_INCOMPLETE','有効な試合版が見つかりません');
  var total=Number(versions[0][8])||1, seen={},chunks=[];
  if(total<1||total>MATCH_MAX_CHUNKS||versions.length!==total)fail_('STORAGE_INCOMPLETE','試合版の分割数が不整合です');
  versions.forEach(function(row){
    var i=Number(row[7])||1;
    if(str_(row[1])!==practiceId||str_(row[2])!=='ready'||
       str_(row[4])!==str_(versions[0][4])||Number(row[8]||1)!==total||
       !Number.isInteger(i)||i<1||i>total||seen[i])fail_('STORAGE_INCOMPLETE','試合版の分割データが不正です');
    chunks[i-1]=str_(row[3]);seen[i]=true;
  });
  var json=chunks.join('');
  if(matchHash_(json)!==str_(versions[0][4]))fail_('STORAGE_INCOMPLETE','保存済みの試合版が不整合です');
  try{return JSON.parse(json);}catch(e){fail_('STORAGE_INCOMPLETE','対戦表データが読み取れません');}
}
function matchCommit_(ss,practiceId,state,operationId,member,action){
  var json=JSON.stringify(state),chunks=[];
  for(var n=0;n<json.length;n+=MATCH_CHUNK_CHARS)chunks.push(json.slice(n,n+MATCH_CHUNK_CHARS));
  if(!chunks.length)chunks=[''];
  if(chunks.length>MATCH_MAX_CHUNKS)fail_('STORAGE_LIMIT','対戦表の履歴が保存上限に達しました。管理者に連絡してください');
  var rev='RV-'+Utilities.getUuid(),sha=matchHash_(json),revisions=ss.getSheetByName('試合版管理');
  var r=revisions.getLastRow()+1, now=now_();
  var staged=chunks.map(function(part,i){return [rev,practiceId,'staging',part,sha,operationId,now,i+1,chunks.length];});
  // Staging only: failure here leaves the old active pointer intact.
  revisions.getRange(r,1,staged.length,9).setValues(staged);
  SpreadsheetApp.flush();
  var values=revisions.getRange(r,1,staged.length,9).getValues(),readback=values.map(function(v){return str_(v[3]);}).join('');
  if(values.length!==chunks.length||values.some(function(v,i){return str_(v[0])!==rev||Number(v[7])!==i+1||Number(v[8])!==chunks.length||str_(v[2])!=='staging';})||
     matchHash_(readback)!==sha)fail_('STORAGE_INCOMPLETE','試合版の検証に失敗しました');
  revisions.getRange(r,3,chunks.length,1).setValues(chunks.map(function(){return ['ready'];}));
  SpreadsheetApp.flush();
  var pointer=matchFindSession_(ss,practiceId),sh=ss.getSheetByName('試合セッション');
  if(!pointer)sh.appendRow([practiceId,rev,state.sessionVersion,state.settingsVersion,now_()]);
  else{
    // Version columns are advisory; changing revision pointer B is commit marker.
    sh.getRange(pointer.row,3,1,3).setValues([[state.sessionVersion,state.settingsVersion,now_()]]);
    SpreadsheetApp.flush();sh.getRange(pointer.row,2).setValue(rev);
  }
  SpreadsheetApp.flush();
  // Failure of audit AFTER pointer update cannot undo an already committed action.
  try{ss.getSheetByName('試合操作履歴').appendRow([operationId,practiceId,member.memberId,action,state.sessionVersion,now_(),rev]);}
  catch(err){console.error('match audit append failed; committed revision='+rev+' '+err);}
}
function matchCreationFingerprint_(payload){
  return JSON.stringify(['create',Object.keys(payload).filter(function(k){return k!=='operationId';}).sort().map(function(k){return [k,payload[k]];})]);
}
function matchView_(ss,member,payload){
  var practiceId=str_(payload.practiceId);if(!practiceId)fail_('BAD_REQUEST','練習IDが必要です');
  var state=matchLoad_(ss,practiceId),currentRoster=matchRoster_(ss,practiceId);
  var numbered=SMMatchCore.numbered(currentRoster),map={};
  numbered.forEach(function(p){map[p.participationId]={number:p.number,name:p.displayName};});
  if(state){
    // Read-only snapshot refresh: no automatic regeneration, no change to saved revision.
    state.people=currentRoster;
    if(member.role!=='duty'&&member.role!=='admin'){
      // Internal history / operation IDs are not needed by read-only participants.
      delete state.undoHistory;delete state.lastAction;delete state.lastProgress;
      delete state.appliedOperations;delete state.people;
    }
  }
  return {ok:true,data:{practiceId:practiceId,role:member.role,session:state,
    participants:numbered,numberMap:map,visibleRounds:state?SMMatchCore.visible(state):[]}};
}
function matchText_(view){
  var s=view.session;if(!s)return '対戦表はまだ作成されていません。';
  if(s.sessionState==='finished')return '本日の対戦表進行は終了しました。';
  var rounds=SMMatchCore.visible(s),chosen=rounds.slice(0,2),map=view.numberMap;
  if(!chosen.length)return '対戦予定はありません。';
  return chosen.map(function(r,i){
    var label=i===0?(r.state==='running'?'進行中':'待機中'):'次の試合';
    var lines=['■第'+r.roundNumber+'試合【'+label+'】'];
    r.courts.forEach(function(c){
      function team(xs){return xs.map(function(k){var p=map[k];return p?(p.number+' '+p.name):('番号なし '+k);}).join('・');}
      lines.push('第'+c.courtNumber+'コート\n'+team(c.teamA)+'\nVS\n'+team(c.teamB));
    });return lines.join('\n');
  }).join('\n\n')+'\n\n詳しい予定はWeb画面で確認';
}
function matchApiDispatch_(ss,member,op,payload){
  var p=str_(payload.practiceId);
  if(op==='match.practices')return {ok:true,data:{practices:practices_(ss).map(function(x){return {practiceId:x.practiceId,date:x.date,place:x.place};})}};
  if(op==='match.get'||op==='match.line'){
    var view=matchView_(ss,member,payload);
    if(op==='match.line')return {ok:true,data:{text:matchText_(view.data),practiceId:p}};
    return view;
  }
  requireDuty_(member);
  if(op==='match.operation'){
    var checkedId=checkOpId_(payload);
    return withLock_(function(){
      var current=matchLoad_(ss,p);
      return {ok:true,data:{practiceId:p,operationId:checkedId,
        applied:!!(current&&current.appliedOperations&&current.appliedOperations[checkedId]),
        sessionVersion:current?current.sessionVersion:0,settingsVersion:current?current.settingsVersion:0}};
    });
  }
  var operationId=checkOpId_(payload);
  return withLock_(function(){
    var old=matchLoad_(ss,p),roster=matchRoster_(ss,p),result,kind=str_(payload.action);
    if(op==='match.create'){
      if(old){if(old.appliedOperations&&old.appliedOperations[operationId]){
          var fingerprint=old.appliedOperations[operationId];
          if(fingerprint!==matchCreationFingerprint_(payload)&&fingerprint!==JSON.stringify(['create']))fail_('OP_ID_REUSE','操作IDの再利用を検知しました');
          return matchView_(ss,member,payload);
        }
        fail_('CONFLICT','既に対戦表が作成されています');}
      var state=SMMatchCore.create({practiceId:p,people:roster,enabledCourts:payload.enabledCourts||[1,2,3],
        lookaheadCount:payload.lookaheadCount||5,excludedIds:payload.excludedIds||[],
        fixedGroups:payload.fixedGroups||[],seed:payload.seed||17,candidateCount:payload.candidateCount||120});
      state.appliedOperations[operationId]=matchCreationFingerprint_(payload);
      matchCommit_(ss,p,state,operationId,member,'create');return matchView_(ss,member,payload);
    }
    if(op!=='match.change')fail_('BAD_REQUEST','試合操作が不正です');
    if(!old)fail_('NOT_FOUND','対戦表が作成されていません');
    old.people=roster; // current attendance always used at the NEXT advance/generation
    var actionPayload={};Object.keys(payload).forEach(function(k){if(k!=='action'&&k!=='practiceId')actionPayload[k]=payload[k];});
    try{result=SMMatchCore.action(old,kind,actionPayload);}
    catch(e){fail_(e.code||'BAD_REQUEST',e.message);}
    if(result.sessionVersion===old.sessionVersion&&result.settingsVersion===old.settingsVersion)return matchView_(ss,member,payload);
    matchCommit_(ss,p,result,operationId,member,kind);
    return matchView_(ss,member,payload);
  });
}


// ==================== StagingDiagnostics.gs ====================
/**
 * v0.15 diagnostic. READ ONLY: no sheet inserts, writes or flush operations.
 * Run manually within a NEW, nonproduction GAS project.
 * Never return secrets, registered LINE user IDs or member names.
 */
function verifyStagingEnvironmentV15() {
  var report={version:'0.15',readOnly:true,checkedAt:now_(),status:'ready',issues:[],
    spreadsheetConfigured:!!conf_('SPREADSHEET_ID'),backendSecretConfigured:!!conf_('BACKEND_SECRET'),
    openingDateConfigured:iso_(conf_('OPENING_DATE')),
    openingBalanceConfigured:/^\d+$/.test(conf_('OPENING_BALANCE')),sheets:[]};
  ['spreadsheetConfigured','backendSecretConfigured','openingDateConfigured','openingBalanceConfigured'].forEach(function(k){
    if(!report[k])report.issues.push({code:'PROPERTY_MISSING',item:k});
  });
  if(!report.spreadsheetConfigured){report.status='needs_attention';return report;}
  var ss;
  try{ss=ss_();}catch(e){report.issues.push({code:'SPREADSHEET_INACCESSIBLE',item:'SPREADSHEET_ID'});report.status='needs_attention';return report;}
  var all={};Object.keys(SM.headers).forEach(function(k){all[k]=SM.headers[k];});
  Object.keys(MATCH_SHEETS).forEach(function(k){all[k]=MATCH_SHEETS[k];});
  Object.keys(all).forEach(function(name){
    var expected=all[name],sh=ss.getSheetByName(name),entry={name:name,exists:!!sh,headersMatch:false,rows:0};
    if(!sh){report.issues.push({code:'SHEET_MISSING',item:name});report.sheets.push(entry);return;}
    entry.rows=Math.max(0,sh.getLastRow()-1);
    var actual=[];
    try{actual=sh.getRange(1,1,1,expected.length).getValues()[0];}
    catch(e){report.issues.push({code:'SHEET_UNREADABLE',item:name});report.sheets.push(entry);return;}
    entry.headersMatch=expected.every(function(h,i){return String(actual[i])===String(h);});
    if(!entry.headersMatch)report.issues.push({code:'HEADER_MISMATCH',item:name});
    report.sheets.push(entry);
  });
  // Only counts and schema names are returned. No participant records are exposed.
  report.status=report.issues.length?'needs_attention':'ready';
  return report;
}


// ==================== StagingSmokeV152.gs ====================
/**
 * 全力☆スマッシュ v0.15.2: STAGING ONLY GAS smoke checks.
 * This file is never intended for production. Keep it in a separate staging GAS project.
 * The hard-coded ID and marker ensure it cannot write to the live club workbook.
 * Never log LINE user IDs, shared secrets or live participant names.
 */
var SM_STAGING_V152_ID = '1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
var SM_STAGING_V152_MARKER = '全力☆スマッシュ｜v0.15 接続検証専用シート';
var SM_STAGING_V152_PRACTICE = 'TEST-20261116';

function stagingV152_(requireReady){
  if(conf_('SPREADSHEET_ID') !== SM_STAGING_V152_ID){
    fail_('STAGING_ONLY','検証用SPREADSHEET_IDと一致しません。処理を中止します。');
  }
  var ss=ss_();
  var guide=ss.getSheetByName('検証ガイド');
  if(!guide || String(guide.getRange('A1').getValue())!==SM_STAGING_V152_MARKER){
    fail_('STAGING_ONLY','検証用シートの識別情報が一致しません。処理を中止します。');
  }
  if(requireReady){
    var ready=verifyStagingEnvironmentV15();
    if(ready.status!=='ready'){
      fail_('SETUP','診断に不一致があります。verifyStagingEnvironmentV15()のissuesを確認してください。');
    }
  }
  return {ss:ss,guide:guide};
}

/** Step 1. READ ONLY. Returns just state, counts and status, never secrets or names. */
function runStagingReadCheckV152(){
  var ctx=stagingV152_(false);
  var report=verifyStagingEnvironmentV15();
  var practice=ctx.ss.getSheetByName('練習日程').getRange('A2').getValue();
  var participants=ctx.ss.getSheetByName('出欠回答');
  return {step:'read',status:report.status,issues:report.issues,
    sheetCount:ctx.ss.getSheets().length,
    testPracticeFound:String(practice)===SM_STAGING_V152_PRACTICE,
    participantRows:Math.max(0,participants.getLastRow()-1)};
}

/**
 * Step 2. Writes only to the RESERVED, initially-empty guide cells A20:C20,
 * reads back, and clears them in finally. Does not touch match/accounting data.
 */
function runStagingWriteReadCheckV152(){
  var ctx=stagingV152_(true);
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))fail_('BUSY','検証用書き込みロックを取得できません');
  var range=ctx.guide.getRange('A20:C20');
  var touched=false;
  try{
    if(!range.isBlank())fail_('STAGING_ONLY','検証専用セルA20:C20に既存データがあります。上書きしません。');
    var marker='SMOKE-'+Utilities.getUuid();
    var values=[[marker,'write-read-check',now_()]];
    touched=true;
    range.setValues(values);
    SpreadsheetApp.flush();
    var actual=range.getValues()[0];
    if(actual[0]!==marker||actual[1]!=='write-read-check'){
      fail_('READBACK_MISMATCH','書き込み後の読み戻しが一致しません');
    }
    return {step:'write-read',status:'passed',verifiedCells:3,cleanup:'finally'};
  }finally{
    try{if(touched){range.clearContent();SpreadsheetApp.flush();}}
    finally{lock.releaseLock();}
  }
}

/**
 * Step 3. Creates exactly one practice-scoped match session in STAGING ONLY,
 * leaves it stored for a real reload/inspection test. Idempotent on rerun.
 * This deliberately does NOT simulate a LINE identity or privileged API token.
 */
function runStagingMatchPersistenceCheckV152(){
  var ctx=stagingV152_(true),ss=ctx.ss;
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))fail_('BUSY','試合保存テストのロックを取得できません');
  try{
    var id=SM_STAGING_V152_PRACTICE;
    var existing=matchFindSession_(ss,id);
    if(existing){
      var saved=matchLoad_(ss,id);
      if(!saved||!saved.rounds||!saved.rounds.length)fail_('READBACK_MISMATCH','既存の試合版を読み戻せません');
      return {step:'match-persistence',status:'already_present',
        roundCount:saved.rounds.length,enabledCourts:saved.settings.enabledCourts,
        lookaheadCount:saved.settings.lookaheadCount,sessionVersion:saved.sessionVersion,
        noWrite:true};
    }
    var people=matchRoster_(ss,id);
    if(people.length!==16||people.some(function(p){return !p.attending;})){
      fail_('STAGING_ONLY','想定する架空参加者16名と一致しないため保存を中止します');
    }
    var fixedGroups=[
      {groupId:'TEST-PAIR',participationIds:['TEST-P001','TEST-P002']},
      {groupId:'TEST-TRIO',participationIds:['TEST-P003','TEST-P004','TEST-P005']}
    ];
    var state=SMMatchCore.create({practiceId:id,people:people,enabledCourts:[1,2,3],
      lookaheadCount:5,excludedIds:[],fixedGroups:fixedGroups,seed:17,candidateCount:120});
    if(state.rounds.length!==5)fail_('READBACK_MISMATCH','5試合を生成できませんでした');
    var opId='STAGING-'+Utilities.getUuid();
    state.appliedOperations[opId]=JSON.stringify(['staging-v152-create']);
    // Transaction method is the same one used by the real match API.
    matchCommit_(ss,id,state,opId,{memberId:'M-TEST-DUTY'},'staging-create');
    var readback=matchLoad_(ss,id);
    if(!readback || JSON.stringify(readback.rounds)!==JSON.stringify(state.rounds)||
       readback.settings.lookaheadCount!==5||readback.settings.enabledCourts.join(',')!=='1,2,3'){
      fail_('READBACK_MISMATCH','試合データの保存・読み戻しが一致しません');
    }
    return {step:'match-persistence',status:'passed',roundCount:readback.rounds.length,
      enabledCourts:readback.settings.enabledCourts,lookaheadCount:readback.settings.lookaheadCount,
      fixedGroupCount:readback.settings.fixedGroups.length,sessionVersion:readback.sessionVersion,
      savedToStaging:true};
  }finally{lock.releaseLock();}
}

/** These wrappers explicitly print only sanitized summaries in the GAS execution log. */
function logStagingReadCheckV152(){console.log(JSON.stringify(runStagingReadCheckV152()));}
function logStagingWriteReadCheckV152(){console.log(JSON.stringify(runStagingWriteReadCheckV152()));}
function logStagingMatchPersistenceCheckV152(){console.log(JSON.stringify(runStagingMatchPersistenceCheckV152()));}
function logStagingEnvironmentV15(){console.log(JSON.stringify(verifyStagingEnvironmentV15()));}
