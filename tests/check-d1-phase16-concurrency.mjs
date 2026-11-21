import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SQL,handleNativeFixture} from '../d1-staging/native-fixture/worker.mjs';
import {CONCURRENCY_SQL} from '../d1-staging/native-fixture/concurrency.mjs';

class MockD1 {
  constructor(){
    this.rows=new Map();this.operations=new Map();
    this.pending=Promise.resolve();this.invalidFixture=false;this.injectFailure=false;
  }
  prepare(sql){
    const db=this;
    const statement=(args=[])=>({
      bind:(...n)=>statement(n),
      run:()=>db.run(sql,args),
      first:()=>db.first(sql,args)
    });
    return statement();
  }
  async first(sql,args){
    if(sql===SQL.fingerprint)return {
      members:this.invalidFixture?2:1,practices:1,payments:1,
      ledgers:2,sessions:1,revisions:3,audits:2
    };
    if(sql===CONCURRENCY_SQL.operation)return this.operations.get(args[0])||null;
    if(sql===CONCURRENCY_SQL.state){
      return {version:this.rows.get(args[0])?.version??null,
        operationCount:[...this.operations.values()].filter(o=>o.probe_id===args[1]).length};
    }
    throw Error('UNEXPECTED_QUERY');
  }
  async run(sql,args){
    if(sql===CONCURRENCY_SQL.createOperations)return {meta:{changes:0}};
    if(sql===CONCURRENCY_SQL.seed){
      if(this.rows.has(args[0]))throw Error('DUPLICATE_SEED');
      this.rows.set(args[0],{run_id:args[1],version:0});
      return {meta:{changes:1}};
    }
    if(sql===CONCURRENCY_SQL.claim){
      const [op,probe,version,lookup,run,expected]=args;
      assert.equal(probe,lookup);assert.equal(version,expected);
      const row=this.rows.get(probe);
      if(this.operations.has(op)||!row||row.run_id!==run||row.version!==expected)
        return {meta:{changes:0}};
      this.operations.set(op,{probe_id:probe,expected_version:version});
      return {meta:{changes:1}};
    }
    if(sql===CONCURRENCY_SQL.update){
      if(this.injectFailure)throw Error('SIMULATED_BATCH_FAILURE');
      const [probe,run,version,op,target,expected]=args;
      const row=this.rows.get(probe),audit=this.operations.get(op);
      if(!row||row.run_id!==run||row.version!==version||
        !audit||audit.probe_id!==target||audit.probe_id!==probe||
        audit.expected_version!==expected)return {meta:{changes:0}};
      row.version++;
      return {meta:{changes:1}};
    }
    throw Error('UNEXPECTED_WRITE');
  }
  async batch(statements){
    const perform=async()=>{
      const saveRows=new Map([...this.rows].map(([k,v])=>[k,{...v}]));
      const saveOps=new Map([...this.operations].map(([k,v])=>[k,{...v}]));
      try{
        const results=[];
        for(const statement of statements)results.push(await statement.run());
        return results;
      }catch(e){
        this.rows=saveRows;this.operations=saveOps;
        throw e;
      }
    };
    const current=this.pending.then(perform);
    this.pending=current.catch(()=>{});
    return current;
  }
}
const bearer='x'.repeat(43);
const db=new MockD1();
const env={NATIVE_FIXTURE_ENABLED:'true',NATIVE_CONCURRENCY_ENABLED:'true',
  NATIVE_FIXTURE_RUN_TOKEN:bearer,ZENRYOKU_FIXTURE_DB:db};
const endpoint='https://fixtures.example.test';
function request(path,body,token=bearer){
  return new Request(endpoint+path,{method:'POST',
    headers:{...(token?{Authorization:'Bearer '+token}:{}),
      ...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function post(path,body,envOverride=env,token=bearer){
  const response=await handleNativeFixture(request(path,body,token),envOverride);
  return {status:response.status,data:await response.json()};
}
assert.ok(Object.entries(CONCURRENCY_SQL).every(([name,sql])=>
  typeof name==='string'&&typeof sql==='string'&&
  !/\b(?:DROP|DELETE|ALTER|ATTACH|PRAGMA|REPLACE)\b/i.test(sql)));
assert.ok(Object.values(CONCURRENCY_SQL).every(sql=>
  !/\b(?:INSERT|UPDATE)\s+(?:OR\s+IGNORE\s+)?(?:INTO\s+)?(?:members|payments|ledger_rows|match_sessions|operation_audit)\b/i.test(sql)));
assert.equal((await post('/native/concurrent/seed',undefined,{})).status,404);
assert.equal((await post('/native/concurrent/seed',undefined,env,null)).status,401);
assert.equal((await post('/native/concurrent/seed',undefined,{...env,NATIVE_CONCURRENCY_ENABLED:'false'})).status,404);
assert.equal((await post('/native/concurrent/cas',{unexpected:true})).status,400);
assert.equal((await post('/native/concurrent/state',{probeId:'not-a-phase16-fixture'})).status,400);
const wrong=new MockD1();wrong.invalidFixture=true;
assert.equal((await post('/native/concurrent/seed',undefined,{...env,ZENRYOKU_FIXTURE_DB:wrong})).status,503);
assert.equal(wrong.rows.size,0);

const seeded=(await post('/native/concurrent/seed',undefined));
assert.equal(seeded.status,200);
const probeId=seeded.data.probeId;
assert.match(probeId,/^phase16-[0-9a-f-]{36}-case$/);
const x=randomUUID(),y=randomUUID();
const candidates=await Promise.all([
  post('/native/concurrent/cas',{probeId,operationId:x,expectedVersion:0}),
  post('/native/concurrent/cas',{probeId,operationId:y,expectedVersion:0})
]);
assert.deepEqual(candidates.map(c=>c.data.applied).sort(),[false,true]);
assert.deepEqual(candidates.map(c=>c.status),[200,200]);
const winner=candidates[0].data.applied?x:y;
const replay=await post('/native/concurrent/cas',{probeId,operationId:winner,expectedVersion:0});
assert.deepEqual(replay.data,{ok:true,applied:true,replayed:true});
const stale=await post('/native/concurrent/cas',{probeId,operationId:randomUUID(),expectedVersion:0});
assert.deepEqual(stale.data,{ok:true,applied:false,replayed:false});
let status=await post('/native/concurrent/state',{probeId});
assert.deepEqual(status.data,{ok:true,version:1,operationCount:1});

const second=(await post('/native/concurrent/seed')).data.probeId, op=randomUUID();
const twins=await Promise.all([
  post('/native/concurrent/cas',{probeId:second,operationId:op,expectedVersion:0}),
  post('/native/concurrent/cas',{probeId:second,operationId:op,expectedVersion:0})
]);
assert.ok(twins.every(x=>x.status===200&&x.data.applied));
assert.deepEqual(twins.map(x=>x.data.replayed).sort(),[false,true]);
assert.deepEqual((await post('/native/concurrent/state',{probeId:second})).data,
  {ok:true,version:1,operationCount:1});

const third=(await post('/native/concurrent/seed')).data.probeId;
const reused=await post('/native/concurrent/cas',{probeId:third,operationId:op,expectedVersion:0});
assert.deepEqual(reused,{status:409,data:{ok:false,code:'OPERATION_ID_REUSED'}});
assert.deepEqual((await post('/native/concurrent/state',{probeId:third})).data,
  {ok:true,version:0,operationCount:0});
const failed=new MockD1();failed.injectFailure=true;
const isolated={...env,ZENRYOKU_FIXTURE_DB:failed};
const failId=(await post('/native/concurrent/seed',undefined,isolated)).data.probeId;
assert.equal((await post('/native/concurrent/cas',
  {probeId:failId,operationId:randomUUID(),expectedVersion:0},isolated)).status,503);
assert.deepEqual((await post('/native/concurrent/state',{probeId:failId},isolated)).data,
  {ok:true,version:0,operationCount:0});

console.log('PASS: Phase16 bounded synthetic independent-request CAS, replay-after-lost-response, duplicate id, cross-target reuse and rollback mock');
