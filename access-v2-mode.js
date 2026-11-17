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
})(window);