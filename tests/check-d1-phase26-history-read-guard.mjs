import assert from 'node:assert/strict';
import {FORM_HISTORY_ACCESS_POLICY as policy,authorizeProposedFormHistoryRead as auth}
  from '../d1-staging/analysis/phase26-history-read-guard.mjs';

assert.equal(policy.approvedStorageDesign, 'SEPARATE_READ_ONLY_HISTORY');
assert.equal(policy.liveReadEndpointAuthorized, false);
assert.equal(policy.googleCopyAuthorized, false);
assert.equal(policy.liveD1WriteAuthorized, false);
assert.equal(policy.publicHistoryAccessAuthorized, false);
assert.equal(policy.allowAutoParticipantIdentityMatch, false);
assert.equal(policy.allowLedgerOrAttendanceMutation, false);

const req = {operation:'preview-history-read', snapshotId:'SYNTHETIC-SNAPSHOT-A1'};
const server = {serverTokenVerified:true,activeMemberVerified:true,
  role:'admin',actorIdType:'server-resolved-member-id'};
const allowed=auth(req,server);
assert.deepEqual(allowed, {
  snapshotId:'SYNTHETIC-SNAPSHOT-A1',readOnly:true,
  scope:'synthetic-history-only',viewerRole:'admin',liveApiAuthorized:false
});
assert.equal(Object.isFrozen(allowed),true);
for(const role of ['member','duty','visitor',null,undefined]){
  assert.throws(()=>auth(req,{...server,role}),/HISTORY_READ_FORBIDDEN/);
}
for(const changes of [
  {serverTokenVerified:false},
  {activeMemberVerified:false},
  {actorIdType:'client-supplied'},
  {serverTokenVerified:undefined}
]){
  assert.throws(()=>auth(req,{...server,...changes}),/HISTORY_READ_FORBIDDEN/);
}
for(const invalid of [
  {operation:'delete-history',snapshotId:req.snapshotId},
  {operation:'preview-history-read',snapshotId:'real-id'},
  {operation:'preview-history-read',snapshotId:'SYNTHETIC-\nDROP'},
  {operation:'preview-history-read',snapshotId:1},
  null,
  {operation:'preview-history-read'}
]){
  assert.throws(()=>auth(invalid,server),/HISTORY_READ_REQUEST_REJECTED/);
}
assert.throws(()=>auth(req,null),/HISTORY_READ_FORBIDDEN/);
console.log('PHASE26_HISTORY_READ_GUARD_PASS: server-verified admin-only synthetic preview, no public/live API, no D1/Google writes');
