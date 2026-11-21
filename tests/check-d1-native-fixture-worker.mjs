import assert from 'node:assert/strict';
import {SQL,handleNativeFixture,exerciseNativeBatch,NATIVE_FIXTURE_OWNER} from '../d1-staging/native-fixture/worker.mjs';

class MockD1 {
  constructor(){ this.rows=new Map();this.badFingerprint=false;this.unsafeBatch=false; }
  prepare(sql){
    const db=this;
    const stmt=(args=[])=>({
      bind:(...newArgs)=>stmt(newArgs),
      run:()=>db.run(sql,args),
      first:()=>db.first(sql,args)
    });
    return stmt();
  }
  async first(sql,args){
    if(sql===SQL.fingerprint) return {
      members:this.badFingerprint?2:1,practices:1,payments:1,
      ledgers:2,sessions:1,revisions:3,audits:2
    };
    if(sql===SQL.count) return {n:[...this.rows.values()].filter(x=>x.run===args[0]).length};
    if(sql===SQL.revision) return {version:this.rows.get(args[0])?.version};
    throw new Error('unexpected query');
  }
  async run(sql,args){
    if(sql===SQL.create) return {meta:{changes:0}};
    if(sql===SQL.insert||sql===SQL.insertIgnore){
      const [id,run,seq]=args;
      if(seq<0) throw Error('CHECK constraint');
      const duplicated=this.rows.has(id)||[...this.rows.values()].some(x=>x.run===run&&x.seq===seq);
      if(duplicated){
        if(sql===SQL.insertIgnore) return {meta:{changes:0}};
        throw Error('UNIQUE constraint');
      }
      this.rows.set(id,{run,seq,version:0});
      return {meta:{changes:1}};
    }
    if(sql===SQL.cas){
      const row=this.rows.get(args[0]);
      if(!row||row.version!==0)return {meta:{changes:0}};
      row.version++;
      return {meta:{changes:1}};
    }
    throw Error('unexpected write');
  }
  async batch(stmts){
    const saved=new Map([...this.rows].map(([k,v])=>[k,{...v}]));
    try{
      const result=[];
      for(const s of stmts)result.push(await s.run());
      return result;
    }catch(e){
      if(!this.unsafeBatch)this.rows=saved;
      throw e;
    }
  }
}

const bearer='a'.repeat(43);
const env={NATIVE_FIXTURE_ENABLED:'true',NATIVE_FIXTURE_RUN_TOKEN:bearer,
  ZENRYOKU_FIXTURE_DB:new MockD1()};
const req=(path,method='GET',token=bearer)=>new Request('https://fixture-worker.example'+path,{
  method,headers:token?{Authorization:'Bearer '+token}:{}
});

assert.match(NATIVE_FIXTURE_OWNER,/^ZENRYOKU_D1_NATIVE_FIXTURE/);
assert.ok(!Object.values(SQL).some(x=>/\b(?:DELETE|DROP|ALTER|ATTACH)\b/i.test(x)));
assert.ok(!Object.values(SQL).some(x=>/\b(?:UPDATE|INSERT)\s+(?:INTO\s+)?(?:members|payments|ledger_rows|match_sessions|operation_audit)\b/i.test(x)));
assert.equal((await handleNativeFixture(req('/native/health'),{})).status,404);
assert.equal((await handleNativeFixture(req('/native/health','GET',null),env)).status,401);
assert.equal((await handleNativeFixture(req('/native/health','GET','wrong'),env)).status,401);
assert.equal((await handleNativeFixture(req('/native/health'),env)).status,200);
assert.equal((await handleNativeFixture(req('/native/run'),env)).status,405);
assert.equal((await handleNativeFixture(req('/native/run?sql=delete','POST'),env)).status,400);
assert.equal((await handleNativeFixture(req('/api/overview'),env)).status,404);
assert.equal((await handleNativeFixture(req('/native/health','POST'),env)).status,405);
const first=await handleNativeFixture(req('/native/run','POST'),env);
assert.equal(first.status,200);
const body=await first.json();
assert.deepEqual(body.results,{
  nativeBatchRollback:true,nativeBatchCommit:true,idempotentReplay:true,casSingleWinner:true
});
assert.equal(env.ZENRYOKU_FIXTURE_DB.rows.size,2);
assert.equal((await handleNativeFixture(req('/native/run','POST'),env)).status,200);
assert.equal(env.ZENRYOKU_FIXTURE_DB.rows.size,4);
const wrong=new MockD1();wrong.badFingerprint=true;
assert.equal((await handleNativeFixture(req('/native/run','POST'),{...env,ZENRYOKU_FIXTURE_DB:wrong})).status,503);
assert.equal(wrong.rows.size,0);
const nonAtomic=new MockD1();nonAtomic.unsafeBatch=true;
assert.equal((await handleNativeFixture(req('/native/run','POST'),{...env,ZENRYOKU_FIXTURE_DB:nonAtomic})).status,503);
assert.equal(nonAtomic.rows.size,1);
assert.ok((await exerciseNativeBatch(new MockD1())).casSingleWinner);
console.log('PASS: Phase15 auth isolation, expected native atomic rollback/commit, CAS, idempotency, invalid D1 fail-closed');
