/* Isolated LINE LIFF authentication and allowlisted sandbox APIs. v0.16.31: withdrawal POST disabled. */
(function () {
  'use strict';
  const C = window.SMASH_WITHDRAW_SANDBOX_CONFIG || {};
  const EXACT_WORKER = 'https://zenryoku-smash-withdraw-sandbox-api.hitori-ojisan-52.workers.dev';
  const EXACT_ORIGIN = 'https://hitoriojisan52.github.io';
  const EXACT_PATH = '/zenryoku-smash-staging/withdraw-sandbox/';
  const endpoints = new Set([
    '/api/session',
    '/api/member/status',
    '/api/member/apply',
    '/api/member/manage/list',
    '/api/member/manage/decide',
    '/api/member/manage/role'
  ]);
  let idToken = '';
  async function begin(page) {
    if (location.origin !== EXACT_ORIGIN || !location.pathname.startsWith(EXACT_PATH)) {
      throw new Error('検証専用GitHub Pagesの画面から開いてください。');
    }
    if (C.apiBaseUrl !== EXACT_WORKER) {
      throw new Error('検証専用WorkerのURLが一致しません。');
    }
    const liffId = page === 'register' ? C.registerLiffId : C.manageLiffId;
    if (!liffId || liffId.startsWith('REPLACE_')) {
      throw new Error('新しい検証専用LIFF IDが未設定です。LINE DevelopersでLIFFを追加してください。');
    }
    if (!window.liff) throw new Error('LINE LIFF SDKが読み込めませんでした。');
    let startTimer;
    try {
      await Promise.race([
        liff.init({liffId: liffId}),
        new Promise((_,reject) => {
          startTimer=setTimeout(() => {
            const e=new Error('LINE認証の初期化が時間内に完了しませんでした。画面を開き直してください。');
            e.code='LIFF_INIT_TIMEOUT';reject(e);
          },25000);
        })
      ]);
    } finally {
      clearTimeout(startTimer);
    }
    if (!liff.isLoggedIn()) {
      liff.login({redirectUri: location.href});
      return false;
    }
    idToken = liff.getIDToken() || '';
    if (!idToken) throw new Error('LINE IDトークンを取得できませんでした。');
    return true;
  }
  async function api(path, payload) {
    if (!endpoints.has(path)) {
      throw new Error('この検証画面では許可されていないAPIです。退会APIは無効です。');
    }
    // Fail closed even if a caller bypasses or alters the management UI.
    // This stage validates only the confirmation UX, not destructive operations.
    if(path==='/api/member/manage/withdraw')
      throw new Error('この画面は退会の確認専用です。退会APIは利用できません。');
    if (!idToken) throw new Error('LINE認証が未完了です。');
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 30000);
    let res, result;
    try {
      res = await fetch(EXACT_WORKER + path, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken},
        body: JSON.stringify(payload || {}),
        cache: 'no-store',
        signal: controller.signal
      });
      result = await res.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        const issue = new Error('通信が時間内に完了しませんでした。');
        issue.code = 'REQUEST_TIMEOUT';
        throw issue;
      }
      if (error instanceof SyntaxError) {
        const issue = new Error('サーバーから正しいJSON応答を取得できませんでした。');
        issue.code = 'INVALID_RESPONSE';
        throw issue;
      }
      const issue = new Error('サーバーとの通信に失敗しました。');
      issue.code = 'NETWORK_ERROR';
      throw issue;
    } finally {
      clearTimeout(deadline);
    }
    if (!res.ok || !result?.ok) {
      const error = new Error(result?.error || result?.message || 'APIエラー HTTP ' + res.status);
      error.status = res.status;
      error.code = result?.code || '';
      throw error;
    }
    return result.data;
  }
  window.SMWithdrawSandbox = Object.freeze({
    begin: begin,
    api: api,
    withdrawUiEnabled: false // Preview-only; Worker/GAS remain separately gated
  });
})();