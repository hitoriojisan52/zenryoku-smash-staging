/* v0.16.48 — screen-only shared action toolbar. No absolute overlays or negative margins.
 * Preserve the ORIGINAL button objects, IDs and listeners while relocating
 * their visible controls into the header. New Close controls delegate to the
 * original Cancel handler, so confirmation state and locks are unchanged.
 */
(function(){
 'use strict';
 const clean=s=>String(s||'').replace(/\s+/g,'').replace(/^[✕×]/,'');
 // Navigation/management SCREENS only. Editing, confirmation and error
 // POPUPS retain their existing bottom Cancel/Close/Execute controls; they
 // must never acquire an extra synthetic top-right Close.
 const screenIds=new Set([
  'manageDialog','memberAccessDialog','cashDialog','visitorDialog',
  'visitorAdminDialog','participantDialog','scheduleDialog'
 ]);
 const topActions={
  memberAccessDialog:['memberAccessRefresh'],
  visitorAdminDialog:['visitorAdminRefresh'],
  participantDialog:['participantReload'],
  scheduleDialog:['scheduleAdd','scheduleReload']
 };
 for(const dialog of document.querySelectorAll('dialog')){
  if(!screenIds.has(dialog.id))continue; // no added Close on popups or busy overlay
  const buttons=Array.from(dialog.querySelectorAll('button'));
  const originalClose=buttons.find(b=>clean(b.textContent)==='閉じる');
  const cancel=buttons.find(b=>/^(キャンセル|いいえ)$/.test(clean(b.textContent)));
  if(!originalClose&&!cancel)continue;
  const title=dialog.querySelector('h2');
  if(!title)continue;
  const formerTitleParent=title.parentElement;
  const toolbar=document.createElement('div');
  toolbar.className='stage-dialog-toolbar';
  const actions=document.createElement('div');
  actions.className='stage-dialog-toolbar-actions';
  // Preserve original event handlers and IDs: these are NOT replacements.
  for(const id of topActions[dialog.id]||[]){
   const control=buttons.find(b=>b.id===id);
   if(!control)throw new Error('ダイアログの操作ボタンが見つかりません: '+id);
   actions.append(control);
  }
  let closeButton=originalClose;
  if(!closeButton){
   closeButton=document.createElement('button');
   closeButton.type='button';
   closeButton.className='btn-outline';
   closeButton.textContent='✕ 閉じる';
   closeButton.addEventListener('click',()=>{
    if(dialog.inert||!dialog.open||!cancel.isConnected||cancel.disabled)return;
    cancel.click();
   });
  }else{
   closeButton.textContent='✕ 閉じる';
  }
  closeButton.classList.add('stage-dialog-top-close');
  closeButton.setAttribute('aria-label','閉じる');
  // Close is ALWAYS the rightmost action, including after responsive wraps.
  actions.append(closeButton);
  toolbar.append(title,actions);
  dialog.insertBefore(toolbar,dialog.firstChild);
  dialog.classList.add('stage-has-toolbar');
  // Original heading containers become empty only on two list dialogs.
  // Remove their empty borders/margins, not the actual buttons.
  if(formerTitleParent!==dialog&&
     formerTitleParent.classList&&
     (formerTitleParent.classList.contains('participant-heading')||
      formerTitleParent.classList.contains('schedule-heading'))&&
     !formerTitleParent.children.length)formerTitleParent.remove();
 }
})();