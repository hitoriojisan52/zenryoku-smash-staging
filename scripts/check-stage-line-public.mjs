/* Staging read-only public connectivity smoke, no LINE token, account,
 * Sheets, Drive or other personal data. This is NOT a LINE-login E2E test.
 * Does not post or change any remote state. */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const healthUrl='https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health';
const pageUrl='https://hitoriojisan52.github.io/zenryoku-smash-staging/live.html';
const configUrl='https://hitoriojisan52.github.io/zenryoku-smash-staging/runtime-config.js';
const sourceHtml=fs.readFileSync(new URL('../live.html',import.meta.url),'utf8');
const expectedScript=sourceHtml.match(/<script type="module" src="(live\.js\?v=[^"]+)"/)?.[1];
assert.ok(expectedScript,'Local LIFF page must declare its versioned live.js module');

async function fetchText(url){
 const response=await fetch(url,{method:'GET',cache:'no-store',
  signal:AbortSignal.timeout(12000)});
 assert.equal(response.status,200,'staging public GET did not return HTTP 200: '+new URL(url).pathname);
 return response.text();
}

async function smoke(){
 const health=JSON.parse(await fetchText(healthUrl));
 assert.equal(health.ok,true,'Worker health reports not ok');
 assert.equal(health.status,'deployed','Worker is not deployed');
 assert.equal(health.configured,true,'Worker lacks required staging settings');
 assert.equal(health.channelMatchesLiveLiff,true,'Worker LINE login channel differs from staging LIFF channel');
 const html=await fetchText(pageUrl);
 assert.ok(html.includes(expectedScript),'GitHub Pages has not yet served this staged LIFF script');
 const config=await fetchText(configUrl);
 assert.match(config,/liveLiffId:\s*["']2012602642-XBSkXduO["']/,
  'GitHub Pages LIFF config does not match staging management channel');
 assert.ok(config.includes('https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev'),
  'GitHub Pages config does not target the known staging Worker');
 console.log('PASS PUBLIC STAGING: Worker deployed and configured, LIFF channel matches, latest page and runtime config published');
 console.log('Worker public code revision: '+String(health.codeRevision||'unspecified').slice(0,90));
 console.log('This check does not prove LINE login, Webhook events, rich menus, GAS POST or real-user write operations');
}
let error;
for(let attempt=1;attempt<=8;attempt++){
 try{await smoke();error=null;break;}
 catch(e){error=e;console.log('Public read-only smoke attempt '+attempt+': '+String(e.message||e).slice(0,250));
  if(attempt<8)await new Promise(resolve=>setTimeout(resolve,5000));}
}
if(error){console.error('FAIL: staging public LINE/Worker health or Pages rollout could not be verified');process.exitCode=1;}
