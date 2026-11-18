/* v0.16.48 — reviewed member administration is the normal staging UI.
 * Legacy remains an explicit diagnostic rollback (?accessUi=legacy) only.
 * LINE may carry parameters inside liff.state; never rewrite the state.
 */
(function(w){
 'use strict';
 const direct=new URLSearchParams(w.location.search||'');
 let stateMode=direct.get('liff.state')||'';
 if(stateMode.includes('?'))stateMode=stateMode.slice(stateMode.indexOf('?')+1);
 if(stateMode.includes('#'))stateMode=stateMode.split('#')[0];
 const nestedMode=new URLSearchParams(stateMode).get('accessUi');
 const enabled=direct.get('accessUi')!=='legacy'&&nestedMode!=='legacy';
 w.SM_STAGE_ACCESS_V2=enabled;
 let statePreview=direct.get('liff.state')||'';
 if(statePreview.includes('?'))statePreview=statePreview.slice(statePreview.indexOf('?')+1);
 if(statePreview.includes('#'))statePreview=statePreview.split('#')[0];
 w.SM_STAGE_WITHDRAW_PREVIEW=enabled&&(
   direct.get('withdrawPreview')==='1'||new URLSearchParams(statePreview).get('withdrawPreview')==='1'
 );
 w.SM_STAGE_WITHDRAW_CHECK=w.SM_STAGE_WITHDRAW_PREVIEW&&(
   direct.get('withdrawCheck')==='1'||new URLSearchParams(statePreview).get('withdrawCheck')==='1'
 );
})(window);