/* Shared in-app confirm/error modal matching the original 運用管理ツール design. */
(function (global) {
  'use strict';
  let pending = null;
  const byId = id => document.getElementById(id);
  const root = () => byId('matchConfirmOverlay');
  const okBtn = () => byId('matchConfirmOk');
  const cancelBtn = () => byId('matchConfirmCancel');
  const box = () => root().querySelector('.match-modal-box');

  function finish(result) {
    if (!pending) return;
    const { resolve, previousFocus } = pending;
    pending = null;
    root().hidden = true;
    root().classList.remove('match-modal-is-error');
    cancelBtn().hidden = false;
    box().setAttribute('role', 'dialog');
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    resolve(result);
  }

  cancelBtn().addEventListener('click', () => finish(false));
  okBtn().addEventListener('click', () => finish(true));
  // Error dialogs require a conscious acknowledgement: touching the backdrop does not hide them.
  root().addEventListener('click', e => {
    if (e.target === root() && pending && !pending.isError) finish(false);
  });
  document.addEventListener('keydown', e => {
    if (!pending) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!pending.isError) finish(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = pending.isError ? [okBtn()] : [cancelBtn(), okBtn()];
    const index = focusables.indexOf(document.activeElement);
    if (e.shiftKey && index <= 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
    else if (!e.shiftKey && index >= focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
  });

  function open({ title, message, confirmLabel, danger = false, isError = false }) {
    if (pending) return Promise.resolve(false);
    const previousFocus = document.activeElement;
    byId('matchConfirmTitle').textContent = title;
    byId('matchConfirmMessage').textContent = message;
    okBtn().textContent = confirmLabel;
    okBtn().classList.toggle('match-modal-danger', Boolean(danger && !isError));
    cancelBtn().hidden = isError;
    box().setAttribute('role', isError ? 'alertdialog' : 'dialog');
    root().classList.toggle('match-modal-is-error', isError);
    root().hidden = false;
    (isError ? okBtn() : cancelBtn()).focus({ preventScroll: true });
    return new Promise(resolve => { pending = { resolve, previousFocus, isError }; });
  }

  function errorDetails(error, labelForId) {
    const original = error && error.message ? String(error.message) : String(error || '不明なエラーです');
    const code = error && error.code;
    if (code === 'INVALID_LINEUP' || original.includes('除外・欠席中の参加者')) {
      const missing = [...original.matchAll(/除外・欠席中の参加者\s+([A-Za-z0-9_-]+)/g)].map(x => x[1]);
      const closedCourts = [...original.matchAll(/使用停止中のコート\s+(\d+)/g)].map(x => x[1]);
      const brokenGroups = original.includes('固定グループの組み合わせが変わりました');
      const duplicates = original.includes('参加者の重複');
      const reasons = [];
      if (missing.length) {
        const unique = [...new Set(missing)];
        reasons.push(`除外・欠席中の参加者が予定試合に含まれています。\n${unique.map(id => typeof labelForId === 'function' ? labelForId(id) : id).join('\n')}`);
      }
      if (closedCourts.length) reasons.push(`使用停止中のコートが含まれています（第${[...new Set(closedCourts)].join('・第')}コート）。`);
      if (brokenGroups) reasons.push('固定ペア・トリオの現在の設定と、予定試合の組み合わせが一致しません。');
      if (duplicates) reasons.push('同じ参加者が複数のチームに割り当てられています。');
      if (!reasons.length) reasons.push(original);
      return {
        title: '【試合を開始できません】',
        message: `${reasons.join('\n\n')}\n\n参加状態・設定を元に戻すか、対戦表を再生成してください。\n生成済みの対戦表は変更していません。`
      };
    }
    if (code === 'OPERATION_UNKNOWN' || code === 'OPERATION_UNCONFIRMED' || code === 'APPLIED_REFRESH_FAILED') {
      return { title: '【操作結果の確認が必要です】', message: original };
    }
    if (code === 'VERSION_CONFLICT' || (error && error.status === 409)) {
      return { title: '【他の担当者による更新】', message: '他の担当者が先に更新したため、今回の操作は実行されませんでした。\n最新の内容を確認してから、もう一度操作してください。' };
    }
    if (/Failed to fetch|NetworkError|fetch failed|通信に失敗|Load failed/i.test(original)) {
      return { title: '【通信エラー】', message: 'サーバーとの通信に失敗しました。操作が保存されたか確認できません。\n「更新」で最新の状態を確認し、必要なら再操作してください。' };
    }
    return { title: '【操作できませんでした】', message: original };
  }

  global.SMMatchConfirm = {
    ask({ title, message, confirmLabel = '実行する', danger = false }) {
      return open({ title, message, confirmLabel, danger });
    },
    showError(error, labelForId) {
      // Hide any success toast from a preceding action: the failure must be unambiguous.
      byId('matchToast')?.classList.remove('visible');
      const details = errorDetails(error, labelForId);
      return open({ ...details, confirmLabel: '閉じる', isError: true });
    },
    errorDetails,
    isOpen() { return Boolean(pending); },
  };
})(window);
