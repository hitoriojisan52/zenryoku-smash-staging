'use strict';
// D1 schema-only bootstrap. This file NEVER deploys a Worker.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DB_NAME = 'zenryoku-smash-staging-d1';
const BINDING = 'ZENRYOKU_STAGE_DB';
const EXPECTED_ACCOUNT = '5817f07a73dbb56011012074ce1b11c5';
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const RUNTIME_FILE = path.join(__dirname, '..', 'd1-staging', '.wrangler.staging.runtime.json');

function validateId(id) {
  assert.match(id || '', UUID, 'D1_STAGE_DATABASE_ID must be a D1 UUID');
  assert.notEqual(id.toLowerCase(), '00000000-0000-0000-0000-000000000000');
  return id.toLowerCase();
}

function validateAccount(id) {
  assert.equal((id || '').toLowerCase(), EXPECTED_ACCOUNT, 'Cloudflare account must match the existing STAGING account');
}

function validateRemoteList(body, id) {
  const list = Array.isArray(body) ? body : Array.isArray(body.result) ? body.result : body.databases;
  assert.ok(Array.isArray(list), 'Unexpected wrangler d1 list JSON shape');
  const byId = list.filter(row => String(row.uuid || row.id || '').toLowerCase() === id);
  assert.equal(byId.length, 1, 'Staging D1 UUID was not found exactly once in this account');
  assert.equal(byId[0].name, DB_NAME, 'D1 UUID does not belong to the expected staging database name');
}

function config(id) {
  return {
    name: 'zenryoku-smash-d1-schema-control-stage',
    compatibility_date: '2026-11-16',
    d1_databases: [{
      binding: BINDING, database_name: DB_NAME, database_id: id,
      migrations_dir: 'migrations'
    }]
  };
}

function main() {
  const command = process.argv[2];
  if (command === 'self-test') {
    const id = '11111111-2222-4333-8444-555555555555';
    assert.equal(validateId(id), id);
    validateAccount(EXPECTED_ACCOUNT);
    validateRemoteList([{ uuid: id, name: DB_NAME }], id);
    assert.throws(() => validateRemoteList([{ uuid: id, name: 'production' }], id));
    assert.throws(() => validateRemoteList([], id));
    assert.throws(() => validateId('not-a-uuid'));
    assert.equal(config(id).d1_databases[0].migrations_dir, 'migrations');
    console.log('D1 staging config guard PASS');
    return;
  }
  validateAccount(process.env.D1_STAGE_ACCOUNT_ID);
  const id = validateId(process.env.D1_STAGE_DATABASE_ID);
  if (command === 'prepare') {
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(config(id), null, 2) + '\n', { flag: 'w', mode: 0o600 });
    console.log('Staging-only D1 Wrangler config generated');
    return;
  }
  if (command === 'verify-remote') {
    const file = process.argv[3];
    assert.ok(file, 'Missing wrangler D1 list result filename');
    validateRemoteList(JSON.parse(fs.readFileSync(file, 'utf8')), id);
    console.log('D1 account, UUID and staging name verified');
    return;
  }
  throw new Error('Supported commands: self-test | prepare | verify-remote');
}

main();
