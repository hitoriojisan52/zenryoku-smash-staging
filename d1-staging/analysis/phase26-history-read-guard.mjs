/**
 * Phase26 design-only access policy. NO live route, auth request, database,
 * network, or PII. This helper does not verify a LINE token itself:
 * the future server must verify identity and role before constructing context.
 *
 * Admin-only is the conservative default proposal; later approval is required
 * before a real history viewer is exposed to any role.
 */
export const FORM_HISTORY_ACCESS_POLICY = Object.freeze({
  state: 'OFFLINE_DESIGN_ONLY',
  approvedStorageDesign: 'SEPARATE_READ_ONLY_HISTORY',
  provisionalReaderRoles: Object.freeze(['admin']),
  liveReadEndpointAuthorized: false,
  googleCopyAuthorized: false,
  liveD1WriteAuthorized: false,
  publicHistoryAccessAuthorized: false,
  allowAutoParticipantIdentityMatch: false,
  allowLedgerOrAttendanceMutation: false
});

export function authorizeProposedFormHistoryRead(request, context) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      request.operation !== 'preview-history-read' ||
      !/^SYNTHETIC-[A-Z0-9_-]{4,80}$/.test(request.snapshotId || ''))
    throw new Error('HISTORY_READ_REQUEST_REJECTED');

  // Fail closed: no client-provided roles or unauthenticated caller accepted.
  // This is a synthetic test gateway only, never a deployed permission endpoint.
  if (!context || context.serverTokenVerified !== true ||
      context.activeMemberVerified !== true ||
      context.role !== 'admin' ||
      context.actorIdType !== 'server-resolved-member-id')
    throw new Error('HISTORY_READ_FORBIDDEN');
  return Object.freeze({
    snapshotId: request.snapshotId,
    readOnly: true,
    scope: 'synthetic-history-only',
    viewerRole: 'admin',
    liveApiAuthorized: false
  });
}
