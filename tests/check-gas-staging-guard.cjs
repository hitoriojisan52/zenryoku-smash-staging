#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
  cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'zensuma-gas-guard-'));
let n=0;const ok=(p,m)=>{assert.ok(p,m);n++;};
const files=['コード.gs','AccessAndGuestV160.gs'];
const run=(mode,expectFailure=false)=>{
 try{
  const out=cp.execFileSync(process.execPath,[path.join(root,'scripts/gas-staging-guard.cjs'),root,dir,mode],
   {cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
  if(expectFailure)throw Error('Unexpectedly passed: '+mode);
  return out;
 }catch(e){
  if(!expectFailure)throw e;
  if(e.message.startsWith('Unexpectedly passed:'))throw e;
  return String(e.stderr||e.message);
 }
};
try{
 fs.writeFileSync(path.join(dir,'appsscript.json'),'{"timeZone":"Asia/Tokyo","runtimeVersion":"V8"}\n');
 fs.writeFileSync(path.join(dir,'OtherFile.gs'),'function otherUnchanged_(){return 1;}\n');
 for(const file of files)fs.copyFileSync(path.join(root,'gas-staging',file),path.join(dir,file));
 const extraBefore=fs.readFileSync(path.join(dir,'OtherFile.gs'),'utf8');
 const manifestBefore=fs.readFileSync(path.join(dir,'appsscript.json'),'utf8');
 ok(run('preflight').includes('no GAS files or deployments were changed'),'read-only preflight');
 ok(run('deploy').includes('Overlay ready'),'overlay stage');
 ok(run('verify').includes('verification PASS'),'verify after overlay');
 ok(fs.readFileSync(path.join(dir,'OtherFile.gs'),'utf8')===extraBefore,'other remote source preserved');
 ok(fs.readFileSync(path.join(dir,'appsscript.json'),'utf8')===manifestBefore,'remote manifest preserved');
 const before=fs.readFileSync(path.join(dir,files[0]),'utf8');
 fs.writeFileSync(path.join(dir,files[0]),before+'\n// unreviewed manual edit');
 ok(run('deploy',true).includes('Remote source digest not approved'),'unknown remote change blocked');
 ok(fs.readFileSync(path.join(dir,files[0]),'utf8').includes('unreviewed manual edit'),'blocked write does not change edited file');
 ok(fs.readFileSync(path.join(dir,files[1]),'utf8')===fs.readFileSync(path.join(root,'gas-staging',files[1]),'utf8'),'other tracked file unchanged');
 fs.rmSync(path.join(dir,'appsscript.json'));
 ok(run('preflight',true).includes('manifest is missing'),'missing manifest blocked');
 console.log('PASS '+n+'/'+n+' staging GAS clasp drift, no-delete and manifest preservation tests');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
