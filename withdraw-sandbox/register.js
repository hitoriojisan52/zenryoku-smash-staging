/* Isolated registration screen; reuses feature-branch access-ui.js. */
(async function () {
  'use strict';
  const message = document.getElementById('connectionStatus');
  try {
    if (!await window.SMWithdrawSandbox.begin('register')) return;
    message.textContent = '検証専用WorkerにLINE認証で接続しました。';
    window.SMAccess.showRegistration({api: window.SMWithdrawSandbox.api});
  } catch (error) {
    message.textContent = error.message || String(error);
  }
})();