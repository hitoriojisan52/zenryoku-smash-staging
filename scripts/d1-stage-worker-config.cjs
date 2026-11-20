'use strict';
// Isolated staging Worker config generator. Never changes the legacy Worker.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ACCOUNT = '5817f07a73dbb56011012074ce1b11c5';
const NAME = 'zenryoku-smash-d1-pilot-stage';
const DATABASE = 'zenryoku-smash-staging-d1';
const BINDING = 'ZENRYOKU_STAGE_DB';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOT = path.resolve(__dirname,'..');
const CONFIG = path.join(ROOT,'d1-staging','readonly-pilot','.wrangler.stage.runtime.json');

function verifyAccount(account) {
  assert.equal((account||'').toLowerCase(),ACCOUNT,'Worker deploy account mismatch');
}
function validateDb(id) {
  assert.match(id||'',ID,'Staging D1 UUID is required');
  assert.notEqual(id.toLowerCase(),'00000000-0000-0000-0000-000000000000');
  return id.toLowerCase();
}
function makeConfig(id) {
  return {
    name:NAME,
    main:'worker.mjs',
    compatibility_date:'2026-11-16',
    workers_dev:true,
    preview_urls:false,
    keep_vars:true,
    vars:{D1_PILOT_ENABLED:'true'},
    d1_databases:[{binding:BINDING,database_name:DATABASE,database_id:validateDb(id)}]
  };
}
function parseDeployedUrl(raw) {
  // Parse complete hostnames, never a partial ".workers.dev" suffix from an
  // attacker-controlled longer hostname in a build log.
  const links=[...raw.matchAll(/https:\/\/[^\s\"'<>]+/g)].map(m=>m[0].replace(/[),;]+$/,''));
  const candidates=links.map(x=>{try{return new URL(x);}catch(_){return null;}})
    .filter(x=>x && x.hostname.startsWith(NAME+'.'));
  assert.ok(candidates.length,'Expected isolated Worker URL not found in deploy output');
  const origins=[];
  for(const url of candidates){
    assert.equal(url.protocol,'https:');
    const tail=url.hostname.slice(NAME.length+1);
    assert.match(tail,/^[a-z0-9-]+\.workers\.dev$/,'Unexpected Worker hostname suffix');
    assert.equal(url.port,'');
    origins.push(url.origin);
  }
  const unique=[...new Set(origins)];
  assert.equal(unique.length,1,'Multiple distinct Worker URLs in deploy output');
  return unique[0];
}

const command=process.argv[2];
if(command==='self-test'){
  const uuid='11111111-2222-4333-8444-555555555555';
  verifyAccount(ACCOUNT);
  assert.throws(()=>verifyAccount('wrong-account'));
  assert.throws(()=>validateDb('not-uuid'));
  const cfg=makeConfig(uuid);
  assert.equal(cfg.name,NAME);
  assert.notEqual(cfg.name,'zenryoku-smash-staging-api');
  assert.equal(cfg.d1_databases[0].database_name,DATABASE);
  assert.equal(cfg.d1_databases[0].binding,BINDING);
  assert.equal(cfg.workers_dev,true);
  const sample='Deployed '+ 'https://'+NAME+'.exampleaccount.workers.dev';
  assert.equal(parseDeployedUrl(sample),'https://'+NAME+'.exampleaccount.workers.dev');
  assert.throws(()=>parseDeployedUrl('https://zenryoku-smash-staging-api.example.workers.dev'));
  assert.throws(()=>parseDeployedUrl('https://'+NAME+'.example.workers.dev.evil.example'));
  console.log('PASS: isolated Worker name, staging account/DB guards, config and URL allowlist');
}else if(command==='prepare'){
  verifyAccount(process.env.D1_STAGE_ACCOUNT_ID);
  const cfg=makeConfig(process.env.D1_STAGE_DATABASE_ID);
  fs.writeFileSync(CONFIG,JSON.stringify(cfg,null,2)+'\n',{mode:0o600});
  console.log('Generated isolated staging Worker D1 binding config; legacy gateway untouched');
}else if(command==='extract-url'){
  assert.ok(process.argv[3]&&process.argv[4],'deploy log and output filename required');
  const raw=fs.readFileSync(process.argv[3],'utf8');
  fs.writeFileSync(process.argv[4],parseDeployedUrl(raw)+'\n',{mode:0o600});
  console.log('Validated isolated workers.dev URL for remote smoke');
}else{
  throw new Error('Usage: self-test | prepare | extract-url <deploy.log> <url-file>');
}
