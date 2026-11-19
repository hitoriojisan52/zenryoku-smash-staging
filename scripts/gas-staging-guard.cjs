#!/usr/bin/env node
'use strict';
// Fail-closed drift check for connected staging GAS. NEVER touch production.
// Usage: node scripts/gas-staging-guard.cjs REPO PULLED_DIR preflight|deploy|verify
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),
  cp=require('node:child_process');
const [repo,remote,mode]=process.argv.slice(2);
if(!repo||!remote||!['preflight','deploy','verify'].includes(mode))
  throw Error('Usage: gas-staging-guard REPO PULLED_DIR preflight|deploy|verify');
const STAGE_ID='1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac';
// clasp v3 pulls Apps Script server files as .js, even when tracked sources are .gs.
// Map by exact GAS file BASE name; never create a duplicate file on the server.
const files=['コード','AccessAndGuestV160'];
const baseline={
 'コード.gs':[
  '42441158bd229fdbea8cb097f11fd19a12ae6cfd430e70def829f4d2a6888008', // reviewed v0.16.27
  '7915fceaa72b62a40bc8e4d388e82f5b39d06aa62f37861681ea64a392bbbe7e', // v0.16.36b
  '8bc41f6e166b31f45d1c74453baede736f709567200b2240e3badebaa1847ab2'  // v0.16.36c
 ],
 'AccessAndGuestV160.gs':[
  '607c81715c3f599eca54b59b6e9b9e6d02f2414f1a03c42ea90798b2eb4b9785', // v0.16.27 original
  '8bf9995f7240028b4524acb96bd6f70d3af29d844ae1bf89b6f63592a06c19f9'  // v0.16.36
 ]
};
const clean=s=>s.replace(/\r\n/g,'\n').trimEnd()+'\n';
const checksum=s=>crypto.createHash('sha256').update(clean(s),'utf8').digest('hex');
const textFile=p=>fs.readFileSync(p,'utf8');
function history(file){
 const rel='gas-staging/'+file,h=new Set();
 let revs='';
 try{revs=cp.execFileSync('git',['log','-n','40','--format=%H','--',rel],{cwd:repo,encoding:'utf8'});}
 catch(e){throw Error('Unable to inspect trusted repository history: '+e.message);}
 for(const commit of revs.trim().split(/\s+/).filter(Boolean)){
  try{
   const data=cp.execFileSync('git',['show',commit+':'+rel],{cwd:repo,encoding:'utf8',maxBuffer:2*1024*1024});
   h.add(checksum(data));
  }catch(e){throw Error('Unable to read trusted Git source history');}
 }
 return h;
}
const manifestPath=path.join(remote,'appsscript.json');
if(!fs.existsSync(manifestPath))throw Error('Remote Apps Script manifest is missing; refusing push');
let remoteManifest;
try{remoteManifest=JSON.parse(textFile(manifestPath));}
catch(e){throw Error('Remote manifest is not valid JSON');}
// Read-only OAuth declaration diagnostic. Do not output the manifest or any
// OAuth tokens. This does not certify that the GAS owner granted the scope,
// and it NEVER changes the remote appsscript.json.
const scopes=remoteManifest.oauthScopes;
if(scopes!==undefined&&(!Array.isArray(scopes)||scopes.some(x=>typeof x!=='string')))
  throw Error('Remote manifest has an invalid oauthScopes declaration; refusing push');
const driveScope='https://www.googleapis.com/auth/drive';
const driveScopeStatus=scopes===undefined?'auto-detection':
  scopes.includes(driveScope)?'declared':'missing-required-drive-scope';
console.log('STAGING_DRIVE_CREATEFOLDER_SCOPE='+driveScopeStatus);
const overlay=[];
for(const base of files){
 const file=base+'.gs';
 const source=path.join(repo,'gas-staging',file),pulled=path.join(remote,base+'.js');
 if(!fs.existsSync(source)||!fs.existsSync(pulled))
   throw Error('Required existing script file missing: '+base+' (clasp pull should create .js)');
 if(fs.existsSync(path.join(remote,file)))
   throw Error('Ambiguous .gs/.js duplicate for '+base+'; refusing push');
 const src=textFile(source),existing=textFile(pulled);
 if(!src.includes(STAGE_ID))throw Error('Staging ID guard missing in tracked source: '+file);
 if(base==='AccessAndGuestV160' && !src.includes('logStageWithdrawPreflightV1636'))
   throw Error('Required withdrawal safety preflight absent');
 if(base==='コード' && !src.includes('function ledgerDate_'))
   throw Error('Required finance typed-date fix absent');
 const desired=checksum(src),current=checksum(existing);
 if(mode==='verify'){
  if(current!==desired)throw Error('Pushed source differs from GitHub: '+file);
  console.log('VERIFY OK: '+file+' sha256='+current.slice(0,12));
  continue;
 }
 const allowed=new Set([...baseline[file],...history(file)]);
 if(!allowed.has(current)){
  console.error('Remote source digest not approved for '+file+': '+current);
  throw Error('Remote GAS was edited outside reviewed Git history. No push performed.');
 }
 console.log('PREFLIGHT OK: '+file+' remote_sha='+current.slice(0,12)+' target_sha='+desired.slice(0,12));
 overlay.push({pulled,src});
}
// Validate *all* tracked sources before writing any local pulled file.
if(mode==='deploy')for(const {pulled,src} of overlay)fs.writeFileSync(pulled,src,'utf8');
if(mode==='preflight')console.log('Read-only preflight PASS: no GAS files or deployments were changed.');
else if(mode==='deploy')console.log('Overlay ready: only the two tracked GAS files were changed; remote manifest and other files retained.');
else console.log('GitHub source verification PASS.');
