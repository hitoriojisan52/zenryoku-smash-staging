import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SQL,handleNativeFixture} from '../d1-staging/native-fixture/worker.mjs';
import {MATCH17_SQL} from '../d1-staging/native-fixture/approved-match17.mjs';

class MockD1 {
  constructor(){
    this.pointers=new Map();this.revisions=new Map();this.audits=new Map();
    this.queue=Promise.resolve();this.badFingerprint=false;
  }
  prepare(sql){
    const db=this;
    const stmt=(args=[])=>({
      bind:(...values)=>stmt(values),
      run:()=>db.run(sql,args),
      first:()=>db.first(sql,args)
    });
    return stmt();
  }
  async first(sql,a){
    if(sql===SQL.fingerprint)return {
      members:this.badFingerprint?2:1,practices:1,payments:1,ledgers:2,sessions:1,revisions:3,audits:2
    };
    if(sql===MATCH17_SQL.replay)return this.audits.get(a[0])??null;
    if(sql===MATCH17_SQL.state){
      return {
        version:this.pointers.get(a[0])?.version??null,
        revisions:[...this.revisions.values()].filter(x=>x.fixture_id===a[1]).length,
        audits:[...this.audits.values()].filter(x=>x.fixture_id===a[2]).length,
        hasActive:this.pointers.get(a[3])?.active_revision_id?1:0
      };
    }
    throw Error('Unexpected read');
  }
  async run(sql,a){
    if([MATCH17_SQL.pointerDDL,MATCH17_SQL.revisionDDL,MATCH17_SQL.auditDDL].includes(sql))
      return {meta:{changes:0}};
    if(sql===MATCH17_SQL.seed){
      if(this.pointers.has(a[0]))throw Error('UNIQUE POINTER');
      this.pointers.set(a[0],{version:0,active_revision_id:null});
      return {meta:{changes:1}};
    }
    if(sql===MATCH17_SQL.revision){
      const [rev,json,fixture,expected]=a;
      const p=this.pointers.get(fixture);
      if(!p||p.version!==expected||p.active_revision_id!==null)
        return {meta:{changes:0}};
      if(this.revisions.has(rev))throw Error('UNIQUE REVISION');
      this.revisions.set(rev,{fixture_id:fixture,state_json:json});
      return {meta:{changes:1}};
    }
    if(sql===MATCH17_SQL.pointer){
      const [rev,fixture,expected,rev2,fixture2]=a;
      assert.equal(rev,rev2);assert.equal(fixture,fixture2);
      const p=this.pointers.get(fixture),r=this.revisions.get(rev);
      if(!p||p.version!==expected||p.active_revision_id!==null||r?.fixture_id!==fixture)
        return {meta:{changes:0}};
      p.version++;
      p.active_revision_id=rev;
      return {meta:{changes:1}};
    }
    if(sql===MATCH17_SQL.audit){
      const [op,fixture,actor,expected,rev,status,lookupFixture,lookupRev,lookupVersion]=a;
      const p=this.pointers.get(fixture);
      assert.equal(lookupFixture,fixture);assert.equal(lookupRev,rev);
      if(!p||p.active_revision_id!==rev||p.version!==lookupVersion)
        return {meta:{changes:0}};
      if(status!=='committed')throw Error('AUDIT_CHECK_FAILED');
      if(this.audits.has(op))throw Error('AUDIT_UNIQUE_FAILED');
      this.audits.set(op,{
        fixture_id:fixture,actor_id:actor,action:'match.save',
        expected_version:expected,revision_id:rev
      });
      return {meta:{changes:1}};
    }
    throw Error('Unexpected mutation');
  }
  async batch(stmts){
    const doBatch=async()=>{
      const clone=m=>new Map([...m].map(([k,v])=>[k,{...v}]));
      const p=clone(this.pointers),r=clone(this.revisions),a=clone(this.audits);
      try{
        const results=[];
        for(const stmt of stmts)results.push(await stmt.run());
        return results;
      }catch(e){
        this.pointers=p;this.revisions=r;this.audits=a;
        throw e;
      }
    };
    const current=this.queue.then(doBatch);
    this.queue=current.catch(()=>{});
    return current;
  }
}
const bearer='Q'.repeat(43);
const database=new MockD1();
const env={NATIVE_FIXTURE_ENABLED:'true',NATIVE_APPROVED_MATCH_ENABLED:'true',
  NATIVE_FIXTURE_RUN_TOKEN:bearer,ZENRYOKU_FIXTURE_DB:database};
async function post(path,body,other=env,token=bearer){
  const response=await handleNativeFixture(
    new Request('https://fictitious-only.example'+path,{
      method:'POST',headers:{
        ...(token?{Authorization:'Bearer '+token}:{}),
        ...(body===undefined?{}:{'Content-Type':'application/json'})
      },...(body===undefined?{}:{body:JSON.stringify(body)})
    }),other
  );
  return {status:response.status,body:await response.json()};
}
const auditTargetPrefix='z_native_fixture_match17_';
assert.equal(Object.keys(MATCH17_SQL).length,9);
assert.ok(Object.values(MATCH17_SQL).every(s=>s.includes(auditTargetPrefix)));
assert.ok(Object.values(MATCH17_SQL).every(s=>!/\b(?:DELETE|DROP|ALTER|ATTACH|REPLACE)\b/i.test(s)));
assert.equal((await post('/native/match17/seed',undefined,{})).status,404);
assert.equal((await post('/native/match17/seed',undefined,env,null)).status,401);
assert.equal((await post('/native/match17/seed',undefined,{...env,NATIVE_APPROVED_MATCH_ENABLED:'false'})).status,404);
assert.equal((await post('/native/match17/save',{hacked:true})).status,400);
const badDb=new MockD1();badDb.badFingerprint=true;
assert.equal((await post('/native/match17/seed',undefined,{...env,ZENRYOKU_FIXTURE_DB:badDb})).status,503);
assert.equal(badDb.pointers.size,0);
const seed=async()=>{const r=await post('/native/match17/seed');assert.equal(r.status,200);return r.body.fixtureId;};
const state=async fixtureId=>(await post('/native/match17/state',{fixtureId}));
const save=async (fixtureId,operationId,injectAuditFailure=false,other=env)=>
  post('/native/match17/save',{fixtureId,operationId,expectedVersion:0,injectAuditFailure},other);

const a=await seed();
assert.match(a,/^phase17-[0-9a-f-]{36}-match$/);
assert.deepEqual((await state(a)).body,{ok:true,version:0,revisions:0,audits:0,hasActive:false});
const faultOp=randomUUID();
assert.equal((await save(a,faultOp,true)).status,503);
assert.deepEqual((await state(a)).body,{ok:true,version:0,revisions:0,audits:0,hasActive:false});
const first=await save(a,faultOp);
assert.deepEqual(first,{status:200,body:{ok:true,applied:true,replayed:false}});
assert.deepEqual((await state(a)).body,{ok:true,version:1,revisions:1,audits:1,hasActive:true});
assert.deepEqual(await save(a,faultOp),{status:200,body:{ok:true,applied:true,replayed:true}});
const stale=await save(a,randomUUID());
assert.deepEqual(stale,{status:409,body:{ok:false,code:'VERSION_CONFLICT'}});
const b=await seed();
assert.deepEqual(await save(b,faultOp),{status:409,body:{ok:false,code:'OPERATION_ID_REUSED'}});
assert.deepEqual((await state(b)).body,{ok:true,version:0,revisions:0,audits:0,hasActive:false});

const c=await seed(),d=await seed(),dupe=randomUUID();
const competitors=await Promise.all([save(c,dupe),save(d,dupe)]);
assert.deepEqual(competitors.map(x=>x.status).sort(),[200,409]);
const successful=competitors[0].status===200?c:d;
const unsuccessful=successful===c?d:c;
assert.deepEqual((await state(successful)).body,{ok:true,version:1,revisions:1,audits:1,hasActive:true});
assert.deepEqual((await state(unsuccessful)).body,{ok:true,version:0,revisions:0,audits:0,hasActive:false});
assert.deepEqual(await save(successful,dupe),{status:200,body:{ok:true,applied:true,replayed:true}});
assert.equal(database.audits.size,2);
console.log('PASS: Phase17 user-approved target ID B and audit failure rollback B, retry/parallel cross-target conflict, isolated probe-only mock');
