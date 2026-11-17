/* Isolated membership administration only; no payment or match operations. */
(async function () {
  'use strict';
  const message = document.getElementById('connectionStatus');
  try {
    if (!await window.SMWithdrawSandbox.begin('manage')) return;
    const actor = await window.SMWithdrawSandbox.api('/api/session');
    if (actor?.role !== 'admin') {
      message.textContent = 'この画面は検証用の管理者アカウント専用です。';
      return;
    }
    window.SMLiveAccess.setup({api: window.SMWithdrawSandbox.api, actor: actor});
    message.textContent = 'LINE認証と管理者権限を確認しました。下のボタンから一覧を表示してください。';
  } catch (error) {
    message.textContent = error.message || String(error);
  }
})();