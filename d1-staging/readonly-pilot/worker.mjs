/**
 * D1 read-only prototype. NOT deployed or connected to the current LINE/Worker.
 *
 * All requests require an explicit staging gate and a distinct 32+ char secret.
 * These two endpoints return COUNTS ONLY; never profile/attendance/ledger rows.
 * No write API, no dynamic SQL, no CORS, no cookie/LINE authentication.
 * Must not be deployed publicly or treated as a replacement for the existing
 * LINE+GAS authorization flow.
 */
const PILOT_OWNER_MARKER='ZENRYOKU_D1_PILOT_STAGE_REPO_20261121';
const noStoreHeaders = {
  'X-D1-Pilot-Identity':PILOT_OWNER_MARKER,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};
const reply = (status, data) => new Response(JSON.stringify(data), {
  status, headers: noStoreHeaders
});
const HIDE = () => reply(404, {ok:false,code:'PILOT_DISABLED'});
const invalid = code => reply(400,{ok:false,code});

function safeSecretMatch(received, secret) {
  // Comparing all bytes prevents per-character early exit. No token is logged.
  // This is a *pilot-only* static bearer gate, not LINE auth/role validation.
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return false;
  if (typeof received !== 'string') return false;
  const expected = 'Bearer ' + secret;
  if (received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

async function count(db, sql, ...params) {
  // All queries are static SELECT statements defined below, no user-built SQL.
  const row = await db.prepare(sql).bind(...params).first();
  if (!row || !Number.isSafeInteger(row.n) || row.n < 0) throw new Error('QUERY_RESULT_INVALID');
  return row.n;
}

const READ_SQL = Object.freeze({
  practice: 'SELECT COUNT(*) AS n FROM practices WHERE practice_id = ?',
  attendees: 'SELECT COUNT(*) AS n FROM attendances WHERE practice_id = ?',
  payments: 'SELECT COUNT(*) AS n FROM payments WHERE practice_id = ?',
  ledger: 'SELECT COUNT(*) AS n FROM ledger_rows WHERE ledger_date >= ? AND ledger_date < ?'
});
function nextMonth(month) {
  const year = Number(month.slice(0,4));
  const mm = Number(month.slice(5,7));
  const next = mm === 12 ? [year+1,1] : [year,mm+1];
  return String(next[0]).padStart(4,'0')+'-'+String(next[1]).padStart(2,'0')+'-01';
}
function uniqueParam(url, field) {
  if (url.searchParams.size !== 1 || !url.searchParams.has(field)) return null;
  return url.searchParams.get(field);
}

export async function handleD1Pilot(request, env = {}) {
  if (env.D1_PILOT_ENABLED !== 'true' || !env.ZENRYOKU_STAGE_DB || !env.PILOT_READ_TOKEN) return HIDE();
  if (!safeSecretMatch(request.headers.get('Authorization'),env.PILOT_READ_TOKEN)) {
    return reply(401,{ok:false,code:'PILOT_UNAUTHORIZED'});
  }
  if (request.method !== 'GET') return reply(405,{ok:false,code:'READ_ONLY',});
  let url;
  try { url = new URL(request.url); } catch (_) { return invalid('INVALID_URL'); }
  try {
    if (url.pathname === '/pilot/overview-counts') {
      const practiceId = uniqueParam(url,'practiceId');
      if (!practiceId || !/^[A-Za-z0-9_-]{8,100}$/.test(practiceId)) return invalid('INVALID_PRACTICE_ID');
      const db=env.ZENRYOKU_STAGE_DB;
      const [practiceCount,attendeeCount,paymentCount] = await Promise.all([
        count(db,READ_SQL.practice,practiceId),
        count(db,READ_SQL.attendees,practiceId),
        count(db,READ_SQL.payments,practiceId)
      ]);
      return reply(200,{ok:true,mode:'staging-counts-only',data:{
        practiceCount,attendeeCount,paymentCount
      }});
    }
    if (url.pathname === '/pilot/ledger-counts') {
      const month=uniqueParam(url,'month');
      if (!month || !/^(?:20[2-9][0-9])-(?:0[1-9]|1[0-2])$/.test(month)) return invalid('INVALID_MONTH');
      const ledgerCount=await count(env.ZENRYOKU_STAGE_DB,READ_SQL.ledger,month+'-01',nextMonth(month));
      return reply(200,{ok:true,mode:'staging-counts-only',data:{ledgerCount}});
    }
    return reply(404,{ok:false,code:'NOT_FOUND'});
  } catch (_) {
    // No SQL statement, secret, user data or internal error leaves the Worker.
    return reply(503,{ok:false,code:'PILOT_READ_FAILED'});
  }
}
export default {fetch:handleD1Pilot};
