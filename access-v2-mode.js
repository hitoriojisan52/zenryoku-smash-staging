/* Stage-only opt-in selector. Read LIFF state without rewriting it.
 * LINE may carry ?accessUi=v2 inside liff.state until liff.init() completes.
 */
(function(w){
 'use strict';
 const direct=new URLSearchParams(w.location.search||'');
 let enabled=direct.get('accessUi')==='v2';
 if(!enabled){
   let state=direct.get('liff.state')||'';
   if(state.includes('?'))state=state.slice(state.indexOf('?')+1);
   if(state.includes('#'))state=state.split('#')[0];
   enabled=new URLSearchParams(state).get('accessUi')==='v2';
 }
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