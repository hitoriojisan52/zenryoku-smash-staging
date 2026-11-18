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
    // Existing v0.16 account applications; read-only source for enrollment dates.
    '登録申請':['requestId','lineUserId','displayName','status','requestedAt','decidedBy','decidedAt','memberId'],
    '当番チーム':['teamId','teamName','active'],
    'チーム所属':['teamId','memberId','active'],
    '練習日程':['practiceId','date','place','startTime','endTime','hours','enabled','remark','version'],
    '出欠回答':['practiceId','participantId','displayName','nameKana','category','attending','remark','version','registeredBy'],
    '集金記録':['practiceId','participantId','completed','version','updatedBy','updatedAt'],
    '全体収支管理表':['日付','開催場所・費目名','集金額','支出','残金','確認者','rowId','kind','practiceId','status','version','当日補正','費目','立替者','receiptFileId','作成者'],
    '操作履歴':['operationId','operation','actorMemberId','timestamp','targetId','resultJSON'],
    '現金確認記録':['practiceId','auditDate','countsJson','cashTotal','bookBalance','difference','version','updatedBy','updatedAt'],
    '日程削除アーカイブ':['operationId','practiceId','archivedAt','archivedBy','chunkIndex','chunkCount','snapshotChunk','status'],
    '参加者操作アーカイブ':['operationId','practiceId','participantId','action','beforeJson','createdAt','actorMemberId','status'],
    '試合削除アーカイブ':['operationId','practiceId','archivedAt','archivedBy','chunkIndex','chunkCount','snapshotChunk','status'],
    'ビジター申請':['requestId','practiceId','participantId','name','nameKana','memo','requestedByMemberId','status','version','requestedAt','reviewedAt','reviewedBy','lastOperationId'],
    'ビジター審査アーカイブ':['operationId','requestId','practiceId','actorMemberId','action','beforeJson','createdAt','status']
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
function auditExisting_(ss,opId,op,member){
 // Fast path: scan the operation-ID column only. Read the six audit fields
 // ONLY for an actual duplicate. Keep the newest matching row as before.
 // The caller holds LockService's script lock for the entire check + write.
 var sh=sheet_(ss,'操作履歴'),last=sh.getLastRow();
 if(last<2)return null;
 var ids=sh.getRange(2,1,last-1,1).getValues();
 for(var i=ids.length-1;i>=0;i--)if(ids[i][0]===opId){
  var row=sh.getRange(i+2,1,1,6).getValues()[0];
  if(row[0]!==opId)fail_('CONFLICT','操作履歴の内容が変更されています。再確認してください');
  if(row[1]!==op||row[2]!==member.memberId)fail_('CONFLICT','操作IDは別の処理で使用されています');
  try{return JSON.parse(row[5]);}catch(_){fail_('SETUP','操作履歴が壊れています');}
 }
 return null;
}
function audit_(ss,opId,op,member,target,result){sheet_(ss,'操作履歴').appendRow([opId,op,member.memberId,now_(),target,JSON.stringify(result)]);}
function entries_(ss){return sheetRows_(ss,'全体収支管理表').filter(function(r){return str_(r[6]);}).map(function(r){return {
 date:ledgerDate_(r[0]),label:str_(r[1]),income:Number(r[2])||0,expense:Number(r[3])||0,balance:Number(r[4])||0,
 confirmedBy:str_(r[5]),rowId:str_(r[6]),kind:str_(r[7]),practiceId:str_(r[8]),status:str_(r[9])||'open',
 version:Number(r[10])||0,adjustment:Number(r[11])||0,item:str_(r[12]),payee:norm_(r[13]),receiptFileId:str_(r[14]),createdBy:str_(r[15])
};});}
function fee_(cat,hours){var base=SM.fees[cat];var factor={2:6/8,3:7/8,4:1}[hours];if(base===undefined||factor===undefined)fail_('BAD_REQUEST','料金設定または時間区分が不正です');return Math.ceil(base*factor/100)*100;}
function practices_(ss){return sheetRows_(ss,'練習日程').map(function(r){return {practiceId:str_(r[0]),date:ledgerDate_(r[1]),place:str_(r[2]),startTime:scheduleTime_(r[3]),endTime:scheduleTime_(r[4]),hours:Number(r[5]),enabled:bool_(r[6])};}).filter(function(p){return p.practiceId&&p.enabled;});}
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
 var id=str_(payload.practiceId),p=practice_(ss,id),rows=entries_(ss);requireCollection_(ss,p,rows);var row=row_(rows,'P-'+id);unlockable_(row);expectVersion_(row.version,payload.expectedVersion);
 if(kind==='adjustment')row.adjustment=jpy_(payload.value,true);else row.expense=jpy_(payload.value,false);
 row.income=practiceIncome_(ss,id,row.adjustment);row.version++;
 var result=balanceRecalc_(rows,entries_(ss));writeLedger_(ss,result);
 return {ok:true,data:{practiceId:id,ledgerVersion:row.version,income:row.income,expense:row.expense,adjustment:row.adjustment,balance:row.balance}};
}
function setPayment_(ss,member,payload,profile){
 var mark=profile?Date.now():0;
 var id=str_(payload.practiceId),person=str_(payload.participantId),p=practice_(ss,id);
 if(profile){profile.practiceReadMs=Date.now()-mark;mark=Date.now();}
 var original=entries_(ss),rows=original.map(function(r){return Object.assign({},r);});requireCollection_(ss,p,original);var ledger=row_(rows,'P-'+id);
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
 if(cat!=='visitor'&&/^PV-/.test(person)&&visitorHasApproved_(ss,id,person))
  fail_('LOCKED','承認済みビジターの参加区分は変更できません');
 var ledgerRows=entries_(ss),ledger=row_(ledgerRows,'P-'+id);unlockable_(ledger);
 var sh=sheet_(ss,'出欠回答'),arr=sheetRows_(ss,'出欠回答'),ix=arr.findIndex(function(r){return str_(r[0])===id&&str_(r[1])===person;});
 if(ix<0||!bool_(arr[ix][5]))fail_('NOT_FOUND','参加者が見つかりません');var record=arr[ix],current=Number(record[7])||0;expectVersion_(current,payload.expectedVersion);
 var oldCat=str_(record[4]);
 if((cat==='visitor')!==(oldCat==='visitor'))
  fail_('LOCKED','ビジター区分は変更できません。新規登録はビジター申請から行ってください');
 var paid=paymentRows_(ss,id).some(function(r){return str_(r[1])===person&&bool_(r[2]);});
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
     var p=practice_(ss,str_(payload.practiceId));dateAllowed_(p.date);var access=collectionState_(ss,p,rows);if(!access.canStart)fail_('LOCKED',access.reason);id='P-'+p.practiceId;
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

/**
 * Cash audit is a separate snapshot from the financial ledger.
 * Matching the legacy v7 '+' / '-' interface never creates income, expenses,
 * balance changes or collection payments.
 */
var SM_CASH_DENOMINATIONS_=[10000,5000,1000,500,100,50,10,5,1];
function cashCounts_(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail_('BAD_REQUEST','金種枚数が不正です');
 var expected=SM_CASH_DENOMINATIONS_.map(String);
 if(Object.keys(raw).some(function(k){return expected.indexOf(k)<0;}))fail_('BAD_REQUEST','金種に不正な値があります');
 var clean={},total=0;
 SM_CASH_DENOMINATIONS_.forEach(function(denom){
  var key=String(denom),n=raw[key];
  if(!Number.isSafeInteger(n)||n<0||n>9999)fail_('BAD_REQUEST','枚数は0～9999の整数で入力してください');
  clean[key]=n;total+=denom*n;
 });
 if(!Number.isSafeInteger(total))fail_('BAD_REQUEST','現金の合計が不正です');
 return {counts:clean,total:total};
}
function cashRows_(ss){return sheetRows_(ss,'現金確認記録');}
function cashGet_(ss,member,payload){
 var id=str_(payload.practiceId),p=practice_(ss,id),ledger=entries_(ss).find(function(r){return r.rowId==='P-'+id;});
 if(ledger&&ledger.date!==p.date)fail_('SETUP','開催日と収支行の日付が一致しません');
 var sheet=cashRows_(ss),match=sheet.filter(function(r){return str_(r[0])===id;});
 if(match.length>1)fail_('SETUP','現金確認記録に重複データがあります');
 var saved=match[0],counts={};
 SM_CASH_DENOMINATIONS_.forEach(function(n){counts[String(n)]=0;});
 if(saved){
  if(ledgerDate_(saved[1])!==p.date)fail_('CONFLICT','保存された現金確認の日付が異なります');
  var raw;try{raw=JSON.parse(str_(saved[2]));}catch(_){fail_('SETUP','保存された金種枚数が不正です');}
  counts=cashCounts_(raw).counts;
 }
 return {ok:true,data:{practiceId:id,auditDate:p.date,found:!!ledger,
  bookBalance:ledger?ledger.balance:null,counts:counts,version:saved?(Number(saved[6])||0):0,
  savedBookBalance:saved?Number(saved[4]):null,updatedBy:saved?str_(saved[7]):'',updatedAt:saved?str_(saved[8]):''}};
}
function cashSave_(ss,member,payload){
 var id=str_(payload.practiceId),p=practice_(ss,id);
 dateAllowed_(p.date);
 var ledger=entries_(ss).find(function(r){return r.rowId==='P-'+id;});
 if(!ledger||ledger.date!==p.date)fail_('NOT_FOUND','指定日の収支行が見つかりません');
 var checked=cashCounts_(payload.counts),sh=sheet_(ss,'現金確認記録'),all=cashRows_(ss);
 var indexes=[];for(var i=0;i<all.length;i++)if(str_(all[i][0])===id)indexes.push(i);
 if(indexes.length>1)fail_('SETUP','現金確認記録に重複データがあります');
 var ix=indexes.length?indexes[0]:-1,old=ix>=0?all[ix]:null,current=old?(Number(old[6])||0):0;
 expectVersion_(current,payload.expectedVersion);
 if(old&&ledgerDate_(old[1])!==p.date)fail_('CONFLICT','保存済みの日付と開催日が異なります');
 var version=current+1,difference=checked.total-ledger.balance;
 if(!Number.isSafeInteger(difference))fail_('BAD_REQUEST','現金差額が大きすぎます');
 var next=[id,p.date,JSON.stringify(checked.counts),checked.total,ledger.balance,
  difference,version,member.memberId,now_()];
 if(ix>=0)sh.getRange(ix+2,1,1,9).setValues([next]);else sh.appendRow(next);
 return {ok:true,data:{practiceId:id,auditDate:p.date,found:true,counts:checked.counts,
  bookBalance:ledger.balance,actual:checked.total,difference:difference,version:version,
  updatedBy:member.memberId,updatedAt:next[8]}};
}


/* v0.16.38a: old-v7 practice schedule management on fixed IDs.
 * "確定" publishes an enabled practice to new LINE/LIFF reads; no legacy
 * per-date sheet or Google Form is created. Existing rows remain untouched.
 */
function scheduleTime_(value){
 if(Object.prototype.toString.call(value)==='[object Date]'){
  if(!Number.isFinite(value.getTime()))fail_('SETUP','時刻のデータが不正です');
  return Utilities.formatDate(value,'Asia/Tokyo','HH:mm');
 }
 var m=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(str_(value));
 if(!m)return str_(value);
 return ('0'+Number(m[1])).slice(-2)+':'+m[2];
}
function scheduleTimeMinutes_(value){
 var m=/^([01]\d|2[0-3]):[0-5]\d$/.exec(value);
 if(!m)fail_('BAD_REQUEST','時間帯を確認してください');
 return Number(value.slice(0,2))*60+Number(value.slice(3));
}
function scheduleData_(payload){
 var date=str_(payload.date).replace(/\//g,'-'),place=str_(payload.place),
     startTime=scheduleTime_(payload.startTime),endTime=scheduleTime_(payload.endTime),
     hours=Number(payload.hours),remark=str_(payload.remark);
 if(!iso_(date)||date<today_())fail_('BAD_REQUEST','本日以降の開催日を指定してください');
 if(!place||place.length>100||remark.length>200)fail_('BAD_REQUEST','開催場所・備考を確認してください');
 if([2,3,4].indexOf(hours)<0||!Number.isSafeInteger(hours))fail_('BAD_REQUEST','時間区分は2・3・4から選択してください');
 var start=scheduleTimeMinutes_(startTime),end=scheduleTimeMinutes_(endTime);
 if(end<=start)fail_('BAD_REQUEST','終了時刻は開始時刻より後にしてください'); // 時間区分は料金用、実際の練習時間とは独立
 return {date:date,place:place,startTime:startTime,endTime:endTime,hours:hours,remark:remark};
}
function scheduleRows_(ss){
 var rows=sheetRows_(ss,'練習日程'),out=[],seenId={},seenDate={};
 rows.forEach(function(r,i){
  var id=str_(r[0]);if(!id)return;
  var date=ledgerDate_(r[1]),version=r[8]===''||r[8]===null?0:Number(r[8]);
  if(!iso_(date)||seenId[id]||seenDate[date]||!Number.isSafeInteger(version)||version<0)
   fail_('SETUP','練習日程マスタに重複または不正な行があります');
  seenId[id]=true;seenDate[date]=true;
  out.push({practiceId:id,date:date,place:str_(r[2]),startTime:scheduleTime_(r[3]),
   endTime:scheduleTime_(r[4]),hours:Number(r[5]),enabled:bool_(r[6]),
   remark:str_(r[7]),version:version,rowNumber:i+2});
 });
 return out;
}
function scheduleList_(ss,member,payload){
 var rows=scheduleRows_(ss).filter(function(r){return r.date>=today_();})
  .sort(function(a,b){return a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime);})
  .map(function(r){var o=Object.assign({},r);delete o.rowNumber;return o;});
 return {ok:true,data:{schedules:rows}};
}

/** A confirmed schedule is deletable, but finalized financial entries are not.
 * Archive every affected physical row before any destructive update. The archive
 * is intentionally retained with the operation audit for manual recovery.
 * Google Sheets has no multi-sheet transaction, so pending archives block reuse.
 */
var SCHEDULE_DELETE_TABS_=[
 ['出欠回答',0,9],['集金記録',0,6],['現金確認記録',0,9],
 ['試合セッション',0,5],['試合版管理',1,9],['試合操作履歴',1,7],
 ['閲覧リンク',1,6],['ビジター申請',1,13]
];
function scheduleDeleteTargets_(ss,id){
 var found={};
 SCHEDULE_DELETE_TABS_.forEach(function(spec){
  var name=spec[0],sh=sheet_(ss,name),last=sh.getLastRow(),items=[];
  if(last>1)sh.getRange(2,1,last-1,spec[2]).getValues().forEach(function(row,i){
   if(str_(row[spec[1]])===id)items.push({rowNumber:i+2,cells:row});
  });
  found[name]=items;
 });
 return found;
}
function scheduleArchiveHas_(ss,id){
 var sh=sheet_(ss,'日程削除アーカイブ'),last=sh.getLastRow();
 if(last<2)return false;
 // The archive can contain huge match-revision chunks. Scan IDs (column B)
 // without rereading large snapshot JSON for every schedule edit/delete.
 return sh.getRange(2,2,last-1,1).getValues().some(function(r){return str_(r[0])===id;});
}
function scheduleDeletePlan_(ss,existing){
 var id=existing.practiceId,original=entries_(ss);
 var affected=original.filter(function(r){return r.practiceId===id||r.rowId==='P-'+id;});
 if(affected.some(function(r){return r.kind==='opening';}))
  fail_('SETUP','引継行は日程削除の対象にできません');
 if(affected.some(function(r){return r.status==='confirmed';}))
  fail_('LOCKED','収支確定済みです。確定解除してから削除してください');
 var retained=original.filter(function(r){return affected.indexOf(r)===-1;})
  .map(function(r){return Object.assign({},r);}); // independent copies: preserve finalized-row balance baseline
 // Existing finalized balances must remain exactly unchanged.
 balanceRecalc_(retained,original);
 var targets=scheduleDeleteTargets_(ss,id),counts={};
 Object.keys(targets).forEach(function(name){counts[name]=targets[name].length;});
 counts['全体収支管理表']=affected.length;
 return {ledgerBefore:original,ledgerAfter:retained,ledgerRemoved:affected,
  targets:targets,counts:counts};
}
function scheduleDeletePreview_(ss,member,payload){
 var id=str_(payload.practiceId),rows=scheduleRows_(ss);
 var matches=rows.filter(function(p){return p.practiceId===id;});
 if(matches.length!==1)fail_('NOT_FOUND','日程が見つかりません');
 var existing=matches[0];
 expectVersion_(existing.version,payload.expectedVersion);
 if(scheduleArchiveHas_(ss,id))
  fail_('CONFLICT','日程の削除処理履歴があります。管理者に確認してください');
 var plan=scheduleDeletePlan_(ss,existing);
 return {ok:true,data:{practiceId:id,version:existing.version,
  counts:plan.counts,canDelete:true}};
}
function scheduleArchivePrepare_(ss,member,operationId,existing,plan){
 if(scheduleArchiveHas_(ss,existing.practiceId))
  fail_('CONFLICT','削除処理中の記録があります。管理者に確認してください');
 var snapshot={schema:1,practiceId:existing.practiceId,
  schedule:sheet_(ss,'練習日程').getRange(existing.rowNumber,1,1,9).getValues()[0],
  ledgerRemoved:plan.ledgerRemoved,ledgerBefore:plan.ledgerBefore,
  targets:plan.targets};
 var serialized=JSON.stringify(snapshot),size=12000,chunks=[];
 for(var i=0;i<serialized.length;i+=size)chunks.push(serialized.slice(i,i+size));
 if(!chunks.length)chunks=['{}'];
 if(chunks.length>3000)fail_('LIMIT','削除対象が多いため管理者に確認してください');
 var sheet=sheet_(ss,'日程削除アーカイブ'),first=sheet.getLastRow()+1;
 // Grow only the staging archive sheet if chunk count exceeds its grid size.
 if(first+chunks.length-1>sheet.getMaxRows())
  sheet.insertRowsAfter(sheet.getMaxRows(),first+chunks.length-1-sheet.getMaxRows());
 var time=now_(),write=chunks.map(function(chunk,i){
  return [operationId,existing.practiceId,time,member.memberId,i+1,chunks.length,
    safeCell_(chunk),i===0?'prepared':''];
 });
 sheet.getRange(first,1,chunks.length,8).setValues(write);
 SpreadsheetApp.flush(); // ensure recovery archive is committed before deletion
 return {sheet:sheet,firstRow:first};
}
function scheduleDeleteExecute_(ss,member,payload,existing){
 var id=existing.practiceId,plan=scheduleDeletePlan_(ss,existing);
 var archived=scheduleArchivePrepare_(ss,member,str_(payload.operationId),existing,plan);
 // Hide the date from all LIFF reads before removing its linked data.
 sheet_(ss,'練習日程').getRange(existing.rowNumber,7,1,3)
   .setValues([[false,safeCell_(existing.remark),existing.version+1]]);
 if(plan.ledgerRemoved.length)writeLedger_(ss,plan.ledgerAfter);
 SCHEDULE_DELETE_TABS_.forEach(function(spec){
  var items=plan.targets[spec[0]];
  var sh=sheet_(ss,spec[0]);
  items.slice().sort(function(a,b){return b.rowNumber-a.rowNumber;})
    .forEach(function(item){sh.deleteRow(item.rowNumber);});
 });
 sheet_(ss,'練習日程').deleteRow(existing.rowNumber);
 archived.sheet.getRange(archived.firstRow,8).setValue('completed');
 return {ok:true,data:{practiceId:id,action:'delete',
  version:existing.version+1,removed:plan.counts,archived:true}};
}

function scheduleChange_(ss,member,payload){
 var action=str_(payload.action),id=str_(payload.practiceId),
     rows=scheduleRows_(ss),sh=sheet_(ss,'練習日程');
 if(action==='add'){
  if(!/^PR-[A-Za-z0-9_-]{8,96}$/.test(id)||rows.some(function(r){return r.practiceId===id;}))
   fail_('BAD_REQUEST','新しい日程IDが不正です');
  var data=scheduleData_(payload);
  if(rows.some(function(r){return r.date===data.date;}))
   fail_('CONFLICT','同じ開催日が登録されています');
  var record=[id,data.date,safeCell_(data.place),data.startTime,data.endTime,data.hours,false,
   safeCell_(data.remark),1];
  sh.appendRow(record);
  return {ok:true,data:{practiceId:id,action:action,version:1}};
 }
 var matches=rows.filter(function(r){return r.practiceId===id;});
 if(matches.length!==1)fail_('NOT_FOUND','日程が見つかりません');
 var existing=matches[0];
 expectVersion_(existing.version,payload.expectedVersion);
 if(scheduleArchiveHas_(ss,id))fail_('CONFLICT','日程の削除処理履歴があります。管理者に確認してください');
 if(action==='delete')return scheduleDeleteExecute_(ss,member,payload,existing);
 if(existing.enabled)fail_('FORBIDDEN','確定済みの日程は修正できません');
 if(existing.date<today_())fail_('BAD_REQUEST','過去の日程は修正できません');
 if(action==='edit'){
  if(scheduleDeleteTargets_(ss,id)['出欠回答'].length||scheduleDeleteTargets_(ss,id)['集金記録'].length||entries_(ss).some(function(r){return r.practiceId===id;}))fail_('CONFLICT','関連データがあるため修正できません');
  var update=scheduleData_(payload);
  if(rows.some(function(r){return r.practiceId!==id&&r.date===update.date;}))
   fail_('CONFLICT','同じ開催日が登録されています');
  sh.getRange(existing.rowNumber,1,1,9).setValues([[
   id,update.date,safeCell_(update.place),update.startTime,update.endTime,update.hours,
   false,safeCell_(update.remark),existing.version+1
  ]]);
  return {ok:true,data:{practiceId:id,action:action,version:existing.version+1}};
 }
 if(action==='confirm'){
  var confirmed=[id,existing.date,safeCell_(existing.place),existing.startTime,existing.endTime,
    existing.hours,true,safeCell_(existing.remark),existing.version+1];
  sh.getRange(existing.rowNumber,1,1,9).setValues([confirmed]);
  return {ok:true,data:{practiceId:id,action:action,version:existing.version+1}};
 }
 fail_('BAD_REQUEST','日程操作が不正です');
}


/** v0.16.38c: collection is allowed only on/after the meeting day AND
 * after the immediately preceding published meeting's ledger is finalized.
 * The hours field is the fee category, NOT the meeting's elapsed duration.
 */
function collectionState_(ss,p,ledgerRows){
 var ordered=practices_(ss).slice().sort(function(a,b){return a.date.localeCompare(b.date)||a.practiceId.localeCompare(b.practiceId);});
 var previous=null;
 for(var i=0;i<ordered.length;i++)if(ordered[i].date<p.date)previous=ordered[i];
 var previousLedger=previous?ledgerRows.find(function(r){return r.rowId==='P-'+previous.practiceId;}):null;
 var priorOpen=!!previous&&(!previousLedger||previousLedger.status!=='confirmed');
 var future=p.date>today_();
 var current=ledgerRows.find(function(r){return r.rowId==='P-'+p.practiceId;});
 var finished=!!current&&current.status==='confirmed',reasons=[];
 if(future)reasons.push('開催日前');
 if(priorOpen)reasons.push('前日程の収支未確定');
 if(finished)reasons.push('この日程の収支確定済み');
 if(!current&&!future&&!priorOpen)reasons.push('集金・収支データ未作成');
 return {canCollect:!!current&&!future&&!priorOpen&&!finished,
  canStart:!future&&!priorOpen&&!finished,
  future:future,previousUnconfirmed:priorOpen,confirmed:finished,
  previousPracticeId:previous?previous.practiceId:'',
  reason:reasons.join('／')+(reasons.length?'のため集金できません':'')};
}
function ensureCollectionLedger_(ss,member,p,oldRows){
 var current=oldRows.find(function(r){return r.rowId==='P-'+p.practiceId;});
 var state=collectionState_(ss,p,oldRows);
 if(current||!state.canStart)return oldRows;
 var rows=oldRows.map(function(r){return Object.assign({},r);});
 rows.push({date:p.date,label:p.place,income:practiceIncome_(ss,p.practiceId,0),
  expense:0,balance:0,confirmedBy:'',rowId:'P-'+p.practiceId,kind:'practice',
  practiceId:p.practiceId,status:'open',version:1,adjustment:0,
  item:'',payee:'',receiptFileId:'',createdBy:member.memberId});
 balanceRecalc_(rows,oldRows); // never shift the balance of finalized rows
 writeLedger_(ss,rows);
 // The deterministic row ID, checked under ScriptLock by overview, prevents
 // duplicate creation even if a mobile client retries the read request.
 audit_(ss,'AUTO-PRACTICE-'+p.practiceId,'ledger.auto',member,p.practiceId,
  {ok:true,data:{practiceId:p.practiceId,ledgerVersion:1}});
 return rows;
}
function requireCollection_(ss,p,ledgerRows){
 var access=collectionState_(ss,p,ledgerRows);
 if(!access.canCollect)fail_('LOCKED',access.reason||'集金操作はまだ開始できません');
 return access;
}

function overview_(ss,member,payload){var all=practices_(ss).sort(function(a,b){return a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime);});
 var id=str_(payload.practiceId)|| (all.length?all[all.length-1].practiceId:'');
 if(!id)return {ok:true,data:{role:member.role,actorName:member.name,practice:null,practices:[],participants:[],ledger:null,collectionAccess:{canCollect:false,reason:'開催日がありません'},expected:0,completedFee:0,completedCount:0,attendingCount:0}};
 var p=practice_(ss,id),ledgerRows=ensureCollectionLedger_(ss,member,p,entries_(ss)),access=collectionState_(ss,p,ledgerRows),pay=paymentRows_(ss,id),pm={};pay.forEach(function(r){pm[str_(r[1])]={completed:bool_(r[2]),version:Number(r[3])||0};});
 var roster=attendees_(ss,id).map(function(a){var o=pm[a.participantId]||{completed:false,version:0};return {participantId:a.participantId,name:a.name,nameKana:a.nameKana,category:a.category,fee:fee_(a.category,p.hours),attending:true,memo:a.memo,collectionCompleted:o.completed,paymentVersion:o.version,categoryVersion:a.categoryVersion};});
 // Shared dynamic numbering: sorted every read, never a mutation key.
 roster=SMMatchCore.numbered(roster).map(function(a){a.participantId=a.participationId;return a;});
 var ledger=ledgerRows.find(function(r){return r.rowId==='P-'+id;});var completed=roster.filter(function(a){return a.collectionCompleted;});var total=completed.reduce(function(a,b){return a+b.fee;},0);
 return {ok:true,data:{role:member.role,actorName:member.name,practice:p,practices:all,participants:roster,ledger:ledger||null,collectionAccess:access,expected:roster.reduce(function(a,b){return a+b.fee;},0),completedFee:total,completedCount:completed.length,attendingCount:roster.length}};
}
function monthLedger_(ss,member,payload){var month=str_(payload.month)||today_().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>today_().slice(0,7))fail_('BAD_REQUEST','対象月が不正です');
 var sorted=entries_(ss).filter(function(r){return r.date<=today_();}); // persisted ledger order matches balance calculation
 var prior=sorted.filter(function(r){return r.date<month+'-01';});var within=sorted.filter(function(r){return r.date.slice(0,7)===month;});
 var carried=prior.length?prior[prior.length-1].balance:0;return {ok:true,data:{month,carried,rows:within,closingBalance:within.length?within[within.length-1].balance:carried,role:member.role}};
}


/**
 * v0.16.38d: legacy-v7 participation editing on immutable participant IDs.
 * Legacy email/timestamp metadata was never imported into the new 9-column
 * roster: expose null rather than guessing or fabricating contact data.
 */
function participantMatchLocked_(ss,id){
 matchDeleteArchiveStatus_(ss,id,'',null); // block changes after an interrupted match deletion
 // Match sheets use their own schema (not SM.headers). Reading them with
 // sheetRows_ dereferences SM.headers['試合セッション'] and throws TypeError.
 // Only the practice ID column is needed for this access guard.
 var sh=sheet_(ss,'試合セッション'),last=sh.getLastRow();
 return last>1&&sh.getRange(2,1,last-1,1).getValues().some(function(r){
   return str_(r[0])===id;
 });
}
function participantRows_(ss,practiceId){
 var rows=sheetRows_(ss,'出欠回答').filter(function(r){return str_(r[0])===practiceId;}),
     seen={},out=[];
 rows.forEach(function(r){
  var id=str_(r[1]),version=Number(r[7])||0,cat=str_(r[4]);
  if(!id||seen[id]||!Number.isSafeInteger(version)||version<0||
     SM.fees[cat]===undefined)fail_('SETUP','参加者の登録内容が不正です');
  seen[id]=true;
  out.push({practiceId:practiceId,participantId:id,name:norm_(r[2]),
   nameKana:norm_(r[3]),category:cat,attending:bool_(r[5]),memo:str_(r[6]),
   version:version,registeredBy:str_(r[8]),registeredAt:null});
 });
 return out;
}
function participantList_(ss,member,payload){
 var dates=practices_(ss).sort(function(a,b){return a.date.localeCompare(b.date);});
 var id=str_(payload.practiceId)||(dates.length?dates[dates.length-1].practiceId:'');
 if(!id)return {ok:true,data:{practices:[],practiceId:'',participants:[],
   matchLocked:false,financeLocked:false,financeStatus:''}};
 var p=practice_(ss,id),rows=participantRows_(ss,id),payments=paymentRows_(ss,id),
     seenPayment={},paid={};
 // Resolve the participant's OWN stable account ID, not the visitor sponsor.
 // Keep the approved account's display name authoritative on read, without
 // writing to the participation/finance/match sheets.
 var membersById=Object.create(null),ambiguousMemberIds=Object.create(null);
 sheetRows_(ss,'メンバー').forEach(function(m){
  var mid=str_(m[0]);
  if(!mid)return;
  if(membersById[mid])ambiguousMemberIds[mid]=true;
  else membersById[mid]={name:norm_(m[1]),lineUserId:str_(m[2])};
 });
 var registrationById=Object.create(null),ambiguousRegistrations=Object.create(null);
 sheetRows_(ss,'登録申請').forEach(function(reg){
  var mid=str_(reg[7]);if(str_(reg[3])!=='approved'||!mid)return;
  if(registrationById[mid])ambiguousRegistrations[mid]=true;
  else registrationById[mid]={lineUserId:str_(reg[1]),requestedAt:str_(reg[4])};
 });
 // A visitor is registered on APPROVAL, not on the application date.
 var approvedVisitors=Object.create(null),ambiguousVisitors=Object.create(null);
 sheetRows_(ss,'ビジター申請').forEach(function(req){
  if(str_(req[1])!==id||str_(req[7])!=='approved')return;
  var participantId=str_(req[2]);if(!participantId)return;
  if(approvedVisitors[participantId])ambiguousVisitors[participantId]=true;
  else approvedVisitors[participantId]=str_(req[10]);
 });
 rows.forEach(function(r){
  if(r.category==='visitor'){
   r.lineUserId=null;
   r.registeredAt=ambiguousVisitors[r.participantId]?null:
    (approvedVisitors[r.participantId]||null);
   return;
  }
  var master=ambiguousMemberIds[r.participantId]?null:membersById[r.participantId];
  if(master&&master.name)r.name=master.name;
  r.lineUserId=master&&/^U[0-9a-f]{32}$/i.test(master.lineUserId)?
   master.lineUserId:null;
  var reg=ambiguousRegistrations[r.participantId]?null:registrationById[r.participantId];
  r.registeredAt=master&&reg&&master.lineUserId===reg.lineUserId?
   (reg.requestedAt||null):null;
 });
 payments.forEach(function(r){
  var person=str_(r[1]);if(seenPayment[person])fail_('SETUP','集金記録が重複しています');
  seenPayment[person]=true;paid[person]=bool_(r[2]);
 });
 rows.forEach(function(r){r.collectionCompleted=!!paid[r.participantId];});
 var ledgers=entries_(ss).filter(function(r){return r.rowId==='P-'+id;});
 if(ledgers.length>1)fail_('SETUP','対象日の収支行が重複しています');
 return {ok:true,data:{practices:dates,practiceId:id,practice:p,
  participants:rows,financeStatus:ledgers[0]?ledgers[0].status:'',
  financeLocked:!!ledgers[0]&&ledgers[0].status==='confirmed',
  matchLocked:participantMatchLocked_(ss,id)}};
}
function participantArchivePending_(ss,id){
 return sheetRows_(ss,'参加者操作アーカイブ').some(function(r){
  return str_(r[2])===id&&str_(r[7])!=='completed';
 });
}
function participantChange_(ss,member,payload,visitorDecisionInternal){
 var id=str_(payload.practiceId),person=str_(payload.participantId),
     action=str_(payload.action);
 if(action!=='edit'&&action!=='delete')fail_('BAD_REQUEST','参加者操作が不正です');
 // An approved visitor's application must never stay 'approved' after their
 // roster row is deleted. Route deletion through the admin rejection action.
 if(action==='delete'&&!visitorDecisionInternal&&/^PV-/.test(person)){
   var linked=visitorRequests_(ss).filter(function(r){
     return r.practiceId===id&&r.participantId===person&&r.status==='approved';
   });
   if(linked.length>1)fail_('SETUP','承認済みビジターの申請履歴が重複しています');
   if(linked.length===1){
     // Preserve the old participant-list Delete UI for admins. The deletion
     // is an actual visitor rejection so the applicant's status stays true.
     if(member.role!=='admin')
       fail_('FORBIDDEN','承認済みビジターの削除・却下は管理者のみ実行できます');
     var linkedPerson=sheetRows_(ss,'出欠回答').filter(function(r){
       return str_(r[0])===id&&str_(r[1])===person;
     });
     if(linkedPerson.length!==1)fail_('STORAGE_INCOMPLETE','削除する参加者が見つかりません');
     expectVersion_(Number(linkedPerson[0][7])||0,payload.expectedVersion);
     var decision=visitorDecision_(ss,member,{requestId:linked[0].requestId,
       expectedVersion:linked[0].version,action:'reject',operationId:payload.operationId});
     return {ok:true,data:{practiceId:id,participantId:person,
       action:'delete',version:Number(payload.expectedVersion)+1,
       archived:true,visitorRequestId:decision.data.requestId,
       visitorStatus:'rejected'}};
   }
 }
 var p=practice_(ss,id);
 if(participantMatchLocked_(ss,id))
  fail_('LOCKED','対戦表作成済みのため参加情報を変更できません');
 var sh=sheet_(ss,'出欠回答'),all=sheetRows_(ss,'出欠回答'),positions=[];
 all.forEach(function(r,i){if(str_(r[0])===id&&str_(r[1])===person)positions.push(i);});
 if(positions.length!==1)fail_(positions.length?'SETUP':'NOT_FOUND','参加者IDを確認できません');
 var ix=positions[0],old=all[ix],version=Number(old[7])||0;
 expectVersion_(version,payload.expectedVersion);
 if(participantArchivePending_(ss,person))
  fail_('CONFLICT','参加者の変更処理履歴があります。管理者に確認してください');
 var paymentSh=sheet_(ss,'集金記録'),allPayments=sheetRows_(ss,'集金記録'),paymentPositions=[];
 allPayments.forEach(function(r,i){if(str_(r[0])===id&&str_(r[1])===person)paymentPositions.push(i);});
 if(paymentPositions.length>1)fail_('SETUP','集金記録が重複しています');
 var paymentIx=paymentPositions.length?paymentPositions[0]:-1,
     oldPayment=paymentIx>=0?allPayments[paymentIx]:null,
     wasPaid=oldPayment&&bool_(oldPayment[2]),wasAttending=bool_(old[5]);
 if(wasPaid&&!wasAttending)fail_('SETUP','欠席者に集金済みの記録があります');
 var ledgers=entries_(ss),matched=ledgers.filter(function(r){return r.rowId==='P-'+id;});
 if(matched.length>1)fail_('SETUP','開催日の収支行が重複しています');
 if(matched.length&&matched[0].status==='confirmed')
  fail_('LOCKED','収支確定済みの参加者は変更できません');
 var name=norm_(old[2]),kana=norm_(old[3]),cat=str_(old[4]),
     attending=wasAttending,memo=str_(old[6]);
 if(action==='edit'){
  if(typeof payload.attending!=='boolean')fail_('BAD_REQUEST','出欠を確認してください');
  var oldCategory=str_(old[4]),visitorIdentity=oldCategory==='visitor';
  cat=str_(payload.category);attending=payload.attending;memo=str_(payload.memo);
  if((cat==='visitor')!==visitorIdentity)
   fail_('LOCKED','ビジター区分は変更できません。新規登録はビジター申請から行ってください');
  // Member display names come from the approved member master. No name/kana
  // editing via attendance, even if the old attendance row has a stale name.
  var canonicalName=norm_(old[2]);
  if(!visitorIdentity){
   var masterMatches=sheetRows_(ss,'メンバー').filter(function(m){
    return str_(m[0])===person;
   });
   if(masterMatches.length>1)fail_('SETUP','利用登録のメンバーIDが重複しています');
   if(masterMatches.length===1&&norm_(masterMatches[0][1]))
    canonicalName=norm_(masterMatches[0][1]);
   if((payload.name!==undefined&&norm_(payload.name)!==canonicalName)||
      (payload.nameKana!==undefined&&norm_(payload.nameKana)!==norm_(old[3])))
    fail_('LOCKED','メンバーの氏名・カナは参加者一覧から変更できません');
  }
  name=visitorIdentity?norm_(payload.name):canonicalName;
  kana=visitorIdentity?norm_(payload.nameKana):norm_(old[3]);
  if(!name||name.length>60||kana.length>100||SM.fees[cat]===undefined||
     memo.length>200||/^[=+@]/.test(name)||/^[=+@]/.test(kana)||
     /[\u0000-\u001f]/.test(memo))
   fail_('BAD_REQUEST','氏名・区分・備考を確認してください');
 }
 // Duty/admin edits in 参加者一覧 must also refresh the approved
 // visitor application, or the original member will see stale data.
 // Requester edits use visitorModify_ and perform their own sync.
 var linkedApproved=null;
 if(action==='edit'&&!visitorDecisionInternal&&/^PV-/.test(person)&&
    visitorHasApproved_(ss,id,person)){
  var linkedRows=visitorRequests_(ss).filter(function(r){
   return r.practiceId===id&&r.participantId===person&&r.status==='approved';
  });
  if(linkedRows.length!==1)
   fail_('STORAGE_INCOMPLETE','承認済みビジターの申請履歴を確認できません');
  linkedApproved=linkedRows[0];
  if(visitorDecisionArchiveCheck_(ss,linkedApproved.requestId,
       str_(payload.operationId),member))
   fail_('CONFLICT','審査の操作IDが既に使用されています');
 }
 var oldFee=wasPaid?fee_(str_(old[4]),p.hours):0,
     newFee=action==='edit'&&attending&&wasPaid?fee_(cat,p.hours):0,
     delta=newFee-oldFee,ledgerResult=null;
 if(delta){
  if(!matched.length)fail_('SETUP','集金済みですが収支行が見つかりません');
  var mutable=ledgers.map(function(r){return Object.assign({},r);});
  var target=mutable.find(function(r){return r.rowId==='P-'+id;});
  target.income+=delta;target.version++;
  balanceRecalc_(mutable,ledgers);
  ledgerResult=mutable;
 }
 var dropPayment=!!oldPayment&&(action==='delete'||!attending);
 var archive=sheet_(ss,'参加者操作アーカイブ'),snapshot=JSON.stringify({
  schema:1,practiceId:id,participantId:person,attendance:old,
  payment:oldPayment,ledgerBefore:matched[0]||null,delta:delta,
  visitorRequest:linkedApproved
 });
 if(snapshot.length>38000)fail_('LIMIT','参加者の変更情報が大きすぎます');
 var ar=archive.getLastRow()+1;
 archive.appendRow([str_(payload.operationId),id,person,action,
    snapshot,now_(),member.memberId,'prepared']);
 SpreadsheetApp.flush();
 if(action==='delete')sh.deleteRow(ix+2);
 else sh.getRange(ix+2,1,1,9).setValues([[id,person,safeCell_(name),
    safeCell_(kana),cat,attending,safeCell_(memo),version+1,str_(old[8])]]);
 if(dropPayment)paymentSh.deleteRow(paymentIx+2);
 if(ledgerResult)writeLedger_(ss,ledgerResult);
 if(linkedApproved){
  var requests=sheet_(ss,'ビジター申請');
  requests.getRange(linkedApproved.row,4,1,3).setValues([[
   safeCell_(name),safeCell_(kana),safeCell_(memo)]]);
  requests.getRange(linkedApproved.row,9).setValue(linkedApproved.version+1);
  requests.getRange(linkedApproved.row,13).setValue(str_(payload.operationId));
 }
 archive.getRange(ar,8).setValue('completed');
 return {ok:true,data:{practiceId:id,participantId:person,action:action,
   version:version+1,attending:action==='edit'&&attending,category:cat,
   ledgerChanged:!!ledgerResult,archived:true}};
}

/* v0.16.38b: member-authenticated visitor proxy registration.
 * Registered club members may register visitors without a LINE identity for
 * the visitor. All records are fixed IDs with original registrar attribution.
 * Financial ledger/payment records and existing match rounds are untouched.
 */
function visitorAvailablePractices_(ss,member,payload){
 var rows=practices_(ss).filter(function(p){return p.date>=today_();})
 .sort(function(a,b){return a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime);});
 return {ok:true,data:{practices:rows}};
}

/* v0.16.40 — one-way visitor request / approval workflow.
 * Members see only submissions attributed to their verified memberId.
 * Approved requests generate actual attendance; pending/rejected never do.
 * No refunds: while the selected ledger is OPEN, paid rejection removes
 * collection and recomputes ledger using participantChange_(). Once the
 * practice ledger is CONFIRMED no approval/rejection/delete can mutate it.
 */
function visitorRequests_(ss){
 return sheetRows_(ss,'ビジター申請').map(function(r,i){
  return {row:i+2,requestId:str_(r[0]),practiceId:str_(r[1]),
   participantId:str_(r[2]),name:norm_(r[3]),nameKana:norm_(r[4]),
   memo:str_(r[5]),requestedByMemberId:str_(r[6]),status:str_(r[7]),
   version:Number(r[8])||0,requestedAt:str_(r[9]),
   reviewedAt:str_(r[10]),reviewedBy:str_(r[11]),
   lastOperationId:str_(r[12])};
 }).filter(function(r){return !!r.requestId;});
}
function visitorHasApproved_(ss,practiceId,participantId){
 return visitorRequests_(ss).some(function(r){
  return r.practiceId===practiceId&&r.participantId===participantId&&r.status==='approved';
 });
}
function visitorPublic_(r,dates,admin,attendees){
 var p=dates.find(function(x){return x.practiceId===r.practiceId;});
 var registered=r.status==='approved'&&attendees?attendees.filter(function(x){
  return str_(x[0])===r.practiceId&&str_(x[1])===r.participantId;
 }):[];
 if(registered.length>1)fail_('SETUP','ビジターの参加者情報が重複しています');
 return {requestId:r.requestId,practiceId:r.practiceId,participantId:r.participantId,
  date:p?p.date:'',place:p?p.place:'',
  name:r.name,nameKana:r.nameKana,memo:r.memo,
  status:r.status,attending:registered.length?bool_(registered[0][5]):null,
  version:r.version,requestedAt:r.requestedAt,
  reviewedAt:r.reviewedAt,
  requestedByMemberId:admin?r.requestedByMemberId:undefined,
  reviewedBy:admin?r.reviewedBy:undefined};
}
function visitorPracticeOptions_(dates){
 return dates.map(function(p){return {practiceId:p.practiceId,date:p.date,
   place:p.place,startTime:p.startTime,endTime:p.endTime};});
}
function visitorMine_(ss,member){
 var rows=visitorRequests_(ss).filter(function(r){return r.requestedByMemberId===member.memberId&&r.status!=='withdrawn';});
 var dates=practices_(ss),attendees=sheetRows_(ss,'出欠回答');
 return {ok:true,data:{requests:rows.map(function(r){return visitorPublic_(r,dates,false,attendees);})
  .sort(function(a,b){return b.requestedAt.localeCompare(a.requestedAt)||b.requestId.localeCompare(a.requestId);}),
  practices:visitorPracticeOptions_(dates)}};
}
function visitorAdminList_(ss,member){
 if(member.role!=='admin')fail_('FORBIDDEN','ビジターの承認・却下は管理者だけが操作できます');
 var dates=practices_(ss),attendees=sheetRows_(ss,'出欠回答');
 var requests=visitorRequests_(ss).filter(function(r){return r.status!=='withdrawn';}).map(function(r){return visitorPublic_(r,dates,true,attendees);});
 var members=sheetRows_(ss,'メンバー'),nameById={};
 members.forEach(function(r){nameById[str_(r[0])]=norm_(r[1]);});
 requests.forEach(function(r){r.requestedByName=nameById[r.requestedByMemberId]||'退会済みメンバー';});
 requests.sort(function(a,b){return b.requestedAt.localeCompare(a.requestedAt)||b.requestId.localeCompare(a.requestId);});
 return {ok:true,data:{requests:requests,practices:visitorPracticeOptions_(dates)}};
}
function visitorRequest_(ss,member,payload){
 var requestId=str_(payload.requestId),participantId=str_(payload.participantId),
  id=str_(payload.practiceId);
 if(!/^VR-[A-Za-z0-9_-]{8,96}$/.test(requestId)||
    !/^PV-[A-Za-z0-9_-]{8,96}$/.test(participantId))
  fail_('BAD_REQUEST','ビジター申請IDが不正です');
 var practice=practice_(ss,id);
 if(practice.date<today_())fail_('BAD_REQUEST','過去の開催日は申請できません');
 var ledger=entries_(ss).filter(function(r){return r.rowId==='P-'+id;});
 if(ledger.length>1)fail_('SETUP','収支に重複した開催行があります');
 if(ledger.length&&ledger[0].status==='confirmed')
  fail_('LOCKED','収支確定済みの開催日には申請できません');
 var name=norm_(payload.name),nameKana=norm_(payload.nameKana),memo=str_(payload.memo);
 if(!name||name.length>60||/^[=+@]/.test(name)||nameKana.length>100||/^[=+@]/.test(nameKana)||
    memo.length>200||/[\u0000-\u001f]/.test(memo))
  fail_('BAD_REQUEST','お名前・カナ・備考を確認してください');
 var all=visitorRequests_(ss),existing=all.filter(function(r){return r.requestId===requestId;});
 if(existing.length){
  var r=existing[0];
  if(existing.length!==1||r.participantId!==participantId||r.practiceId!==id||
     r.requestedByMemberId!==member.memberId||r.name!==name||
     r.nameKana!==nameKana||r.memo!==memo)
   fail_('CONFLICT','申請IDが既に別の申請で使用されています');
  return {ok:true,data:{requestId:r.requestId,participantId:r.participantId,
    practiceId:r.practiceId,status:r.status,version:r.version}};
 }
 if(all.some(function(r){return r.participantId===participantId})||
    sheetRows_(ss,'出欠回答').some(function(r){return str_(r[1])===participantId}))
  fail_('CONFLICT','ビジターIDが重複しています');
 sheet_(ss,'ビジター申請').appendRow([
  requestId,id,participantId,safeCell_(name),safeCell_(nameKana),safeCell_(memo),
  member.memberId,'pending',0,now_(),'','',''
 ]);
 return {ok:true,data:{requestId:requestId,participantId:participantId,practiceId:id,
  status:'pending',version:0}};
}
function visitorDecisionArchiveCheck_(ss,requestId,operationId,member){
 var sh=sheet_(ss,'ビジター審査アーカイブ'),last=sh.getLastRow(),replay=false;
 if(last<2)return replay;
 var keys=sh.getRange(2,1,last-1,2).getValues();
 keys.forEach(function(key,i){
  var operation=str_(key[0]),id=str_(key[1]);
  if(operation!==operationId&&id!==requestId)return;
  var row=sh.getRange(i+2,1,1,8).getValues()[0];
  if(operation===operationId&&(id!==requestId||str_(row[3])!==member.memberId))
   fail_('CONFLICT','操作IDが別の審査に使用されています');
  if(str_(row[7])!=='completed')
   fail_('STORAGE_INCOMPLETE','ビジター審査の保存が完了していません。管理者に復旧を依頼してください');
  if(operation===operationId)replay=true;
 });
 return replay;
}
function visitorDecision_(ss,member,payload){
 if(member.role!=='admin')fail_('FORBIDDEN','ビジター審査は管理者だけが操作できます');
 var id=str_(payload.requestId),action=str_(payload.action),opId=checkOpId_(payload);
 if(action!=='approve'&&action!=='reject')fail_('BAD_REQUEST','審査操作が不正です');
 var existing=visitorRequests_(ss).filter(function(r){return r.requestId===id;});
 if(existing.length!==1)fail_('NOT_FOUND','申請を確認できません');
 var r=existing[0],archiveReplay=visitorDecisionArchiveCheck_(ss,id,opId,member);
 if(archiveReplay){
  if(r.lastOperationId!==opId)fail_('CONFLICT','申請が別の操作で変更されています');
  return {ok:true,data:{requestId:id,practiceId:r.practiceId,
    status:r.status,version:r.version,operationId:opId}};
 }
 expectVersion_(r.version,payload.expectedVersion);
 if(r.status==='rejected')fail_('LOCKED','却下済みの申請は再承認・変更できません');
 if(action==='approve'&&r.status!=='pending')
  fail_('LOCKED','承認済みの申請を再度承認できません');
 if(action==='reject'&&r.status!=='pending'&&r.status!=='approved')
  fail_('LOCKED','却下できる申請ではありません');
 var practice=practice_(ss,r.practiceId),
     ledger=entries_(ss).filter(function(x){return x.rowId==='P-'+r.practiceId;});
 if(ledger.length>1)fail_('SETUP','収支行が重複しています');
 if(ledger.length&&ledger[0].status==='confirmed')
  fail_('LOCKED','収支確定後のビジター却下・削除・承認はできません');
 var participant=sheetRows_(ss,'出欠回答').filter(function(x){
  return str_(x[0])===r.practiceId&&str_(x[1])===r.participantId;
 });
 if(r.status==='pending'&&participant.length)
  fail_('STORAGE_INCOMPLETE','承認前のビジターが既に参加者一覧に存在します');
 if(action==='approve'||r.status==='approved'){
  if(participantMatchLocked_(ss,r.practiceId))
   fail_('LOCKED','対戦表を削除してから承認・却下してください');
 }
 if(action==='approve'){
  // Fixed participant IDs are globally unique, not merely unique per date.
  if(sheetRows_(ss,'出欠回答').some(function(row){return str_(row[1])===r.participantId;}))
   fail_('CONFLICT','対象のビジターIDは既に参加者一覧に存在します');
 }else if(r.status==='approved'){
  if(participant.length!==1)fail_('STORAGE_INCOMPLETE','承認済みビジターの参加情報が確認できません');
  if(str_(participant[0][4])!=='visitor')fail_('SETUP','参加区分がビジターではありません');
  if(participantArchivePending_(ss,r.participantId))
   fail_('STORAGE_INCOMPLETE','参加者の変更処理が未完了です。管理者に復旧を依頼してください');
  // Dry-run the same fee/ledger checks participantChange_ will repeat.
  var paid=paymentRows_(ss,r.practiceId).filter(function(x){return str_(x[1])===r.participantId;});
  if(paid.length>1)fail_('SETUP','集金記録が重複しています');
  if(paid.length&&bool_(paid[0][2])){
   if(!bool_(participant[0][5]))
    fail_('SETUP','欠席者に集金済みの記録があります');
   if(ledger.length!==1)fail_('SETUP','集金済みの収支行がありません');
   var old=entries_(ss),mutable=old.map(function(x){return Object.assign({},x);});
   var row=mutable.filter(function(x){return x.rowId==='P-'+r.practiceId;})[0];
   row.income-=fee_(str_(participant[0][4]),practice.hours);row.version++;
   balanceRecalc_(mutable,old); // blocks future finalized balances from changing
  }
 }
 // A durable recovery snapshot is written before touching roster or request.
 var archive=sheet_(ss,'ビジター審査アーカイブ'),archiveRow=archive.getLastRow()+1;
 var before=JSON.stringify({schema:1,request:r,attendee:participant[0]||null,
   ledger:ledger[0]||null,collection:action==='reject'?
    paymentRows_(ss,r.practiceId).filter(function(x){return str_(x[1])===r.participantId;}):[]});
 if(before.length>38000)fail_('LIMIT','審査情報が大きすぎるため保存できません');
 archive.appendRow([opId,id,r.practiceId,member.memberId,action,before,now_(),'prepared']);
 SpreadsheetApp.flush();
 if(action==='approve'){
  sheet_(ss,'出欠回答').appendRow([
   r.practiceId,r.participantId,safeCell_(r.name),safeCell_(r.nameKana),
   'visitor',true,safeCell_(r.memo),0,r.requestedByMemberId
  ]);
 }else if(r.status==='approved'){
  participantChange_(ss,member,{operationId:opId,practiceId:r.practiceId,
   participantId:r.participantId,expectedVersion:Number(participant[0][7])||0,
   action:'delete'},true);
 }
 var next=action==='approve'?'approved':'rejected';
 sheet_(ss,'ビジター申請').getRange(r.row,8,1,6).setValues([[
  next,r.version+1,str_(r.requestedAt),now_(),member.memberId,opId
 ]]);
 archive.getRange(archiveRow,8).setValue('completed');
 return {ok:true,data:{requestId:id,practiceId:r.practiceId,participantId:r.participantId,
  status:next,version:r.version+1,operationId:opId}};
}

/* v0.16.42: requester-only visitor application actions.
 * Pending requests may be withdrawn and permanently hidden; approved visitors
 * may have name/kana/memo edited, but not status, attendance, category or date.
 * The same finance/match constraints as participant management are enforced
 * server-side. Every operation is archived before its first data mutation.
 */
function visitorModify_(ss,member,payload){
 var id=str_(payload.requestId),action=str_(payload.action),
     opId=checkOpId_(payload);
 if(action!=='edit'&&action!=='delete')
  fail_('BAD_REQUEST','ビジター申請操作が不正です');
 var selected=visitorRequests_(ss).filter(function(x){return x.requestId===id;});
 if(selected.length!==1)fail_('NOT_FOUND','ビジター申請が見つかりません');
 var r=selected[0];
 if(r.requestedByMemberId!==member.memberId)
  fail_('FORBIDDEN','自分が登録したビジターのみ操作できます');
 var replay=visitorDecisionArchiveCheck_(ss,id,opId,member);
 if(replay){
  if(r.lastOperationId!==opId)fail_('CONFLICT','申請は別の操作で変更されています');
  return {ok:true,data:{requestId:id,practiceId:r.practiceId,
   status:r.status,version:r.version,operationId:opId}};
 }
 expectVersion_(r.version,payload.expectedVersion);
 if(action==='delete'&&r.status!=='pending')
  fail_('LOCKED','削除できるのは承認待ちの申請だけです');
 if(action==='edit'&&r.status!=='approved')
  fail_('LOCKED','修正できるのは承認済みのビジターだけです');
 var ledger=entries_(ss).filter(function(x){return x.rowId==='P-'+r.practiceId;});
 if(ledger.length>1)fail_('SETUP','対象日の収支行が重複しています');
 if(ledger.length&&ledger[0].status==='confirmed')
  fail_('LOCKED','収支確定後はビジターの修正・削除ができません');
 var people=sheetRows_(ss,'出欠回答'),matching=people.map(function(x,i){
  return {row:i+2,record:x};
 }).filter(function(x){return str_(x.record[0])===r.practiceId&&
   str_(x.record[1])===r.participantId;});
 if(action==='delete'&&matching.length)
  fail_('STORAGE_INCOMPLETE','承認待ちのビジターが既に参加者一覧に存在します');
 if(action==='edit'&&matching.length!==1)
  fail_('STORAGE_INCOMPLETE','承認済みビジターの参加者情報が見つかりません');
 if(action==='edit'){
  if(participantMatchLocked_(ss,r.practiceId))
   fail_('LOCKED','対戦表が作成済みです。削除後に修正してください');
  if(participantArchivePending_(ss,r.participantId))
   fail_('STORAGE_INCOMPLETE','参加者の変更処理が未完了です。管理者に確認してください');
  if(str_(matching[0].record[4])!=='visitor')
   fail_('SETUP','承認済みの参加区分がビジターではありません');
  if(str_(matching[0].record[8])!==member.memberId)
   fail_('FORBIDDEN','申請者と参加者の登録者が一致しません');
  var name=norm_(payload.name),kana=norm_(payload.nameKana),memo=str_(payload.memo);
  if(typeof payload.attending!=='boolean')
   fail_('BAD_REQUEST','出欠を確認してください');
  if(payload.category!==undefined&&str_(payload.category)!=='visitor')
   fail_('LOCKED','ビジターの参加区分は変更できません');
  if(!name||name.length>60||/^[=+@]/.test(name)||
     kana.length>100||/^[=+@]/.test(kana)||
     memo.length>200||/[\u0000-\u001f]/.test(memo))
   fail_('BAD_REQUEST','お名前・カナ・備考を確認してください');
 }
 var archive=sheet_(ss,'ビジター審査アーカイブ'),archiveRow=archive.getLastRow()+1;
 var snapshot=JSON.stringify({schema:2,action:action,request:r,
   attendee:action==='edit'?matching[0].record:null,ledger:ledger[0]||null});
 if(snapshot.length>38000)fail_('LIMIT','申請変更履歴を保存できません');
 archive.appendRow([opId,id,r.practiceId,member.memberId,'member.'+action,
  snapshot,now_(),'prepared']);
 SpreadsheetApp.flush();
 if(action==='edit'){
  // Reuse the exact participant-list mutation path: paid→absent clears the
  // checkbox and recalculates open ledgers; payment/category/attendance
  // conditions and match/finalized-balance guards stay identical.
  // Reusing this operationId links the nested participant archive to the
  // outer visitor archive for fail-closed recovery.
  participantChange_(ss,member,{
   operationId:opId,practiceId:r.practiceId,participantId:r.participantId,
   expectedVersion:Number(matching[0].record[7])||0,action:'edit',
   name:name,nameKana:kana,category:'visitor',
   attending:payload.attending,memo:memo
  },true);
  sheet_(ss,'ビジター申請').getRange(r.row,4,1,3)
   .setValues([[safeCell_(name),safeCell_(kana),safeCell_(memo)]]);
 }else{
  // Pending-only deletion leaves a terminal audit record, but does not
  // create/delete a participant row or change any financial balance.
  sheet_(ss,'ビジター申請').getRange(r.row,8).setValue('withdrawn');
 }
 sheet_(ss,'ビジター申請').getRange(r.row,9).setValue(r.version+1);
 sheet_(ss,'ビジター申請').getRange(r.row,13).setValue(opId);
 archive.getRange(archiveRow,8).setValue('completed');
 return {ok:true,data:{requestId:id,practiceId:r.practiceId,
  status:action==='delete'?'withdrawn':'approved',
  version:r.version+1,operationId:opId}};
}

function visitorRegister_(ss,member,payload){
 var practiceId=str_(payload.practiceId),participantId=str_(payload.participantId);
 if(!/^PV-[A-Za-z0-9_-]{8,96}$/.test(participantId))fail_('BAD_REQUEST','参加者IDが不正です');
 var p=practice_(ss,practiceId);
 if(p.date<today_())fail_('BAD_REQUEST','過去の開催日は登録できません');
 var ledger=entries_(ss).filter(function(r){return r.rowId==='P-'+practiceId;});
 if(ledger.length>1)fail_('SETUP','収支に重複した開催行があります');
 if(ledger.length===1&&ledger[0].status==='confirmed')
  fail_('CONFLICT','収支確定済みの開催日は登録できません');
 var name=norm_(payload.name),kana=norm_(payload.nameKana),memo=str_(payload.memo);
 if(!name||name.length>60||/^[=+@]/.test(name)||kana.length>100||/^[=+@]/.test(kana)||
    memo.length>200||/[\u0000-\u001f]/.test(memo))
  fail_('BAD_REQUEST','お名前・カナ・備考を確認してください');
 // The registerer's member ID is obtained server-side from the verified LINE user ID,
 // never from the caller. Same-named people receive independent participant IDs.
 var existing=sheetRows_(ss,'出欠回答');
 if(existing.some(function(r){return str_(r[1])===participantId}))
  fail_('CONFLICT','参加者IDが既に使われています');
 var row=[practiceId,participantId,safeCell_(name),safeCell_(kana),
    'visitor',true,safeCell_(memo),0,member.memberId];
 sheet_(ss,'出欠回答').appendRow(row);
 return {ok:true,data:{practiceId:practiceId,participantId:participantId,
  name:name,category:'visitor',attending:true,registeredBy:member.memberId}};
}

function dispatch_(body){if(!body||body.sharedSecret!==conf_('BACKEND_SECRET')||!conf_('BACKEND_SECRET'))fail_('UNAUTHORIZED','API接続を確認できません');
 // Guest sharing verifies a short-lived token; LINE login is not required.
 if(body.op==='match.guest.get')return accessGuestGet16_(ss_(),body.guestToken);
 if(!/^U[0-9a-f]{32}$/i.test(body.lineUserId||''))fail_('UNAUTHORIZED','LINEユーザーIDが不正です');
 // Unregistered LINE users may apply or check pending status (never administer).
 if(body.op==='member.apply'||body.op==='member.status')
   return accessRegistration16_(ss_(),body.lineUserId,body.op,body.payload||{});
 // v0.15.12: measure only this read-only startup request (no IDs or secrets logged).
 var smProfile=body.op==='match.bootstrap',smT0=smProfile?Date.now():0,
     paymentProfile=body.op==='payment.set'&&body.payload&&body.payload.profileTimings===true?{startedAt:Date.now()}:null;
 var ss=ss_(),smT1=smProfile||paymentProfile?Date.now():0,
     member=member_(ss,body.lineUserId),smT2=smProfile||paymentProfile?Date.now():0,
     op=str_(body.op),payload=body.payload||{};
 if(paymentProfile){
  paymentProfile.spreadsheetOpenMs=smT1-paymentProfile.startedAt;
  paymentProfile.memberAuthMs=smT2-smT1;
 }
 if(op==='session')return {ok:true,data:{memberId:member.memberId,name:member.name,role:member.role}};
 if(op.indexOf('member.manage.')===0)return accessManagement16_(ss,member,op,payload);
 if(op==='match.share.issue')return accessShareIssue16_(ss,member,payload);
 if(op==='match.share.revoke')return accessShareRevoke16_(ss,member,payload);
 // Match reads and roster reads are allowed for registered LINE members.
 if(op==='roster.line')return {ok:true,data:{text:formatRosterForLine_(ss,str_(payload.practiceId))}};
 // Member-level proxy visitor registration is deliberately before requireDuty_.
 if(op==='visitor.practices')return withLock_(function(){return visitorAvailablePractices_(ss,member,payload);});
 if(op==='visitor.register'||op==='visitor.request'){
   var visitorOpId=checkOpId_(payload);
   return withLock_(function(){
     var replay=auditExisting_(ss,visitorOpId,op,member);if(replay)return replay;
     var result=visitorRequest_(ss,member,payload);
     audit_(ss,visitorOpId,op,member,str_(payload.requestId),result);
     return result;
   });
 }
 if(op==='visitor.modify'){
  var modifyOpId=checkOpId_(payload);
  return withLock_(function(){
   var replay=auditExisting_(ss,modifyOpId,op,member);if(replay)return replay;
   var result=visitorModify_(ss,member,payload);
   audit_(ss,modifyOpId,op,member,str_(payload.requestId),result);
   return result;
  });
 }
 if(op==='visitor.mine')return withLock_(function(){return visitorMine_(ss,member);});
 if(op==='visitor.admin.list')return withLock_(function(){return visitorAdminList_(ss,member);});
 if(op==='visitor.decide'){
  var decisionOpId=checkOpId_(payload);
  return withLock_(function(){
   var replay=auditExisting_(ss,decisionOpId,op,member);if(replay)return replay;
   var result=visitorDecision_(ss,member,payload);
   audit_(ss,decisionOpId,op,member,str_(payload.requestId),result);
   return result;
  });
 }
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
 if(['overview','ledger.list','cash.get','schedule.list','schedule.delete.preview','participant.list'].indexOf(op)>=0)return withLock_(function(){return op==='overview'?overview_(ss,member,payload):op==='ledger.list'?monthLedger_(ss,member,payload):op==='cash.get'?cashGet_(ss,member,payload):op==='schedule.list'?scheduleList_(ss,member,payload):op==='schedule.delete.preview'?scheduleDeletePreview_(ss,member,payload):participantList_(ss,member,payload);});
 if(['payment.set','category.set','adjustment.set','expense.set','ledger.change','cash.save','schedule.change','participant.change'].indexOf(op)<0)fail_('BAD_REQUEST','API操作が不正です');
 var opId=checkOpId_(payload);
 return withLock_(function(){
   var mark=paymentProfile?Date.now():0;
   var done=auditExisting_(ss,opId,op,member);
   if(paymentProfile)paymentProfile.auditReadMs=Date.now()-mark;
   if(done)return done;
   var result;
   if(op==='payment.set')result=setPayment_(ss,member,payload,paymentProfile);
   else if(op==='category.set')result=setCategory_(ss,member,payload);
   else if(op==='adjustment.set')result=changeMoney_(ss,member,payload,'adjustment');
   else if(op==='expense.set')result=changeMoney_(ss,member,payload,'expense');
   else if(op==='cash.save')result=cashSave_(ss,member,payload);
   else if(op==='schedule.change')result=scheduleChange_(ss,member,payload);
   else if(op==='participant.change')result=participantChange_(ss,member,payload);
   else result=mutateLedger_(ss,member,payload);
   mark=paymentProfile?Date.now():0;
   audit_(ss,opId,op,member,str_(payload.rowId||payload.participantId||payload.practiceId),result);
   if(paymentProfile&&result&&result.ok&&result.data){
    paymentProfile.auditWriteMs=Date.now()-mark;
    paymentProfile.handlerMs=Date.now()-paymentProfile.startedAt;
    // Durations only: never send IDs/tokens/secrets or store timing metadata in the audit log.
    var keys=['spreadsheetOpenMs','memberAuthMs','lockWaitMs','auditReadMs',
      'practiceReadMs','ledgerReadMs','attendeeReadMs','paymentReadMs',
      'validationMs','paymentWriteMs','ledgerWriteMs','auditWriteMs','handlerMs'];
    var timings={};
    keys.forEach(function(k){timings[k]=Math.max(0,Math.round(paymentProfile[k]||0));});
    result.data.gasTimings=timings;
   }
   return result;
 },paymentProfile);
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

/* v0.16.39 — remove all match rows of exactly one practice after archiving.
 * No attendance, payments, fee schedules or ledger mutations are permitted.
 * Operates only under the existing GAS ScriptLock and verified duty/admin.
 */
var MATCH_DELETE_TABLES_=[
 ['試合セッション',0,5],['試合版管理',1,9],['試合操作履歴',1,7]
];
function matchDeleteArchiveStatus_(ss,practiceId,opId,member){
 var sh=sheet_(ss,'試合削除アーカイブ'),last=sh.getLastRow();
 if(last<2)return false;
 var ids=sh.getRange(2,1,last-1,2).getValues(),seen={},applied=false;
 ids.forEach(function(row,i){
  var op=str_(row[0]),id=str_(row[1]);
  if(!op||seen[op])return;
  seen[op]=true;
  if(id!==practiceId&&op!==opId)return;
  var record=sh.getRange(i+2,1,1,8).getValues()[0];
  if(op===opId&&id!==practiceId)fail_('CONFLICT','操作IDは別の日程で使用されています');
  if(id===practiceId&&str_(record[7])!=='completed')
   fail_('STORAGE_INCOMPLETE','対戦表の削除が完了していません。管理者に復旧を依頼してください');
  if(op===opId){
   if(member&&str_(record[3])!==member.memberId)fail_('CONFLICT','別の担当者の操作IDです');
   applied=true;
  }
 });
 return applied;
}
function matchDeletePlan_(ss,practiceId){
 var pointer=matchFindSession_(ss,practiceId);
 if(!pointer)fail_('NOT_FOUND','対戦表は既に削除されています');
 var matches={},counts={};
 MATCH_DELETE_TABLES_.forEach(function(spec){
  var sh=sheet_(ss,spec[0]),last=sh.getLastRow(),items=[];
  if(last>1)sh.getRange(2,1,last-1,spec[2]).getValues().forEach(function(row,i){
   if(str_(row[spec[1]])===practiceId)items.push({rowNumber:i+2,cells:row});
  });
  matches[spec[0]]=items;counts[spec[0]]=items.length;
 });
 if(matches['試合セッション'].length!==1||matches['試合セッション'][0].rowNumber!==pointer.row)
  fail_('STORAGE_INCOMPLETE','試合セッションの参照が不正です');
 var sh=sheet_(ss,'閲覧リンク'),last=sh.getLastRow(),links=[];
 if(last>1)sh.getRange(2,1,last-1,6).getValues().forEach(function(row,i){
  if(str_(row[1])===practiceId&&!str_(row[3]))links.push({rowNumber:i+2,cells:row});
 });
 counts['閲覧リンク失効']=links.length;
 return {targets:matches,links:links,counts:counts};
}
function matchDeleteExecute_(ss,member,payload,old,operationId){
 var id=str_(payload.practiceId);
 if(Number(payload.expectedSessionVersion)!==Number(old.sessionVersion)||
    Number(payload.expectedSettingsVersion)!==Number(old.settingsVersion))
  fail_('VERSION_CONFLICT','対戦表が変更されています。更新してから削除してください');
 var plan=matchDeletePlan_(ss,id),snapshot=JSON.stringify({
  schema:1,practiceId:id,sessionVersion:old.sessionVersion,
  settingsVersion:old.settingsVersion,targets:plan.targets,links:plan.links
 }),chunks=[],size=12000;
 for(var i=0;i<snapshot.length;i+=size)chunks.push(snapshot.slice(i,i+size));
 if(!chunks.length)chunks=['{}'];
 if(chunks.length>3000)fail_('STORAGE_LIMIT','対戦表の履歴が大きいため管理者へ連絡してください');
 var archive=sheet_(ss,'試合削除アーカイブ'),first=archive.getLastRow()+1;
 var last=first+chunks.length-1;
 if(last>archive.getMaxRows())archive.insertRowsAfter(archive.getMaxRows(),last-archive.getMaxRows());
 var time=now_(),records=chunks.map(function(chunk,i){
  return [operationId,id,time,member.memberId,i+1,chunks.length,safeCell_(chunk),i===0?'prepared':''];
 });
 archive.getRange(first,1,records.length,8).setValues(records);
 SpreadsheetApp.flush(); // recovery is durable before the first destructive write
 var links=sheet_(ss,'閲覧リンク');
 plan.links.forEach(function(item){links.getRange(item.rowNumber,4).setValue(time);});
 // Keep active pointer until LAST; an interrupted delete stays blocked
 // by the prepared archive even if the pointer has already disappeared.
 ['試合版管理','試合操作履歴','試合セッション'].forEach(function(name){
  var sheet=sheet_(ss,name);
  plan.targets[name].slice().sort(function(a,b){return b.rowNumber-a.rowNumber;})
   .forEach(function(item){sheet.deleteRow(item.rowNumber);});
 });
 archive.getRange(first,8).setValue('completed');
 var result={ok:true,data:{practiceId:id,deleted:true,archived:true,removed:plan.counts}};
 try{audit_(ss,operationId,'match.delete',member,id,result);}
 catch(err){console.error('match delete completed, audit failed for '+operationId+': '+err);}
 return result;
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
      var deleted=matchDeleteArchiveStatus_(ss,p,checkedId,member);
      var current=matchLoad_(ss,p);
      return {ok:true,data:{practiceId:p,operationId:checkedId,
        applied:deleted||!!(current&&current.appliedOperations&&current.appliedOperations[checkedId]),
        sessionVersion:current?current.sessionVersion:0,settingsVersion:current?current.settingsVersion:0}};
    });
  }
  var operationId=checkOpId_(payload);
  return withLock_(function(){
    var replay=matchDeleteArchiveStatus_(ss,p,op==='match.delete'?operationId:'',member);
    if(op==='match.delete'){
      if(replay)return matchView_(ss,member,payload);
      var current=matchLoad_(ss,p);
      if(!current)fail_('NOT_FOUND','対戦表は既に削除されています');
      matchDeleteExecute_(ss,member,payload,current,operationId);
      return matchView_(ss,member,payload);
    }
    var old=matchLoad_(ss,p),roster=matchRoster_(ss,p),result,kind=str_(payload.action);
    if(op==='match.create'){
      if(old){if(old.appliedOperations&&old.appliedOperations[operationId]){
          var fingerprint=old.appliedOperations[operationId];
          if(fingerprint!==matchCreationFingerprint_(payload)&&fingerprint!==JSON.stringify(['create']))fail_('OP_ID_REUSE','操作IDの再利用を検知しました');
          return matchView_(ss,member,payload);
        }
        fail_('CONFLICT','既に対戦表が作成されています');}
      // A newly confirmed schedule may have zero registrations. MatchEngine
      // raises {code:'NO_FEASIBLE_MATCH'} (not smCode), which doPost previously
      // masked as a generic server failure. Reject expected business conditions
      // explicitly; preserve the generic envelope for unexpected exceptions.
      var players=SMMatchCore.numbered(roster);
      if(players.length<4)
        fail_('NO_FEASIBLE_MATCH',
          players.length===0
            ?'この開催日の参加者はまだ登録されていません。4名以上の参加登録後に対戦表を作成してください。'
            :'参加者は現在'+players.length+'名です。ダブルスの対戦表作成には4名以上必要です。');
      var state;
      try{
        state=SMMatchCore.create({practiceId:p,people:roster,enabledCourts:payload.enabledCourts||[1,2,3],
          lookaheadCount:payload.lookaheadCount||5,excludedIds:payload.excludedIds||[],
          fixedGroups:payload.fixedGroups||[],seed:payload.seed||17,candidateCount:payload.candidateCount||120});
      }catch(err){
        if(err&&err.code==='NO_FEASIBLE_MATCH')
          fail_('NO_FEASIBLE_MATCH','対戦可能な2チームを構成できません。参加者の除外、固定ペア・トリオ、使用コートの設定を確認してください。');
        if(err&&['INVALID_ROSTER','INVALID_GROUP','INVALID_COURTS','INVALID_LOOKAHEAD','BAD_REQUEST'].indexOf(err.code)>=0)
          fail_(err.code,err.message);
        throw err; // never expose unexpected source detail to the frontend
      }
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
