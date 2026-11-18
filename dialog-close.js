/* v0.16.44 - Consistent top-right Close control on staging dialogs.
 * Preserve existing click handlers and cancellation/confirmation semantics.
 * Do not introduce a close control on the uninterruptible busy dialog.
 */
(function(){
 'use strict';
 const clean=s=>String(s||'').replace(/\s+/g,'').replace(/^✕/,'');
 for(const dialog of document.querySelectorAll('dialog')){
  if(dialog.id==='stageBusyDialog')continue;
  const buttons=Array.from(dialog.querySelectorAll('button'));
  const existing=buttons.find(b=>clean(b.textContent)==='閉じる');
  if(dialog.id==='participantDialog'&&existing){
   // The original participant heading already has a right-edge close control.
   existing.classList.add('stage-header-close');
   continue;
  }
  const cancel=buttons.find(b=>/^(キャンセル|いいえ)$/.test(clean(b.textContent)));
  if(!existing&&!cancel)continue;
  const row=document.createElement('div');
  row.className='stage-close-row';
  let closeButton=existing;
  if(!closeButton){
   closeButton=document.createElement('button');
   closeButton.type='button';
   closeButton.className='btn-outline';
   closeButton.textContent='✕ 閉じる';
   // Delegate to the original cancel path so pending state and locks are reset.
   closeButton.addEventListener('click',()=>{
    if(dialog.inert||!dialog.open||!cancel.isConnected||cancel.disabled)return;
    cancel.click();
   });
  }else{
   closeButton.textContent='✕ 閉じる';
  }
  closeButton.classList.add('stage-dialog-top-close');
  closeButton.setAttribute('aria-label','閉じる');
  row.append(closeButton);
  dialog.insertBefore(row,dialog.firstChild);
  dialog.classList.add('stage-has-top-close');
 }
})();
