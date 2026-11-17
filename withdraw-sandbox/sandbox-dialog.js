/* v0.16.14 shared sandbox UI: modal confirmation/error, screen-wide busy lock, bottom toast. */
(function (global) {
 'use strict';
 const $=id=>document.getElementById(id);
 const confirmDialog=$('confirmActionDialog'),busyDialog=$('sandboxBusyDialog');
 const ok=$('doConfirmAction'),cancel=$('cancelConfirmAction'),toastEl=$('toast');
 const main=document.querySelector('main'),memberDialog=$('memberAccessDialog');
 let pending=null,processing=false,toastTimer=null;
 function settle(){
   if(!pending)return;
   const previous=pending;pending=null;
   confirmDialog.setAttribute('role','dialog');
   cancel.hidden=false;
   if(previous.focus&&previous.focus.isConnected&&!previous.focus.inert)previous.focus.focus({preventScroll:true});
   previous.resolve(confirmDialog.returnValue==='confirm');
 }
 cancel.addEventListener('click',()=>{if(confirmDialog.open)confirmDialog.close('cancel');});
 ok.addEventListener('click',()=>{if(confirmDialog.open)confirmDialog.close('confirm');});
 confirmDialog.addEventListener('close',settle);
 confirmDialog.addEventListener('cancel',event=>{if(pending?.error)event.preventDefault();});
 busyDialog.addEventListener('cancel',event=>event.preventDefault());
 busyDialog.addEventListener('close',()=>{
   // Busy dialog is controlled only by run(), never by user interactions.
   if(processing&&!busyDialog.open)busyDialog.showModal();
 });
 function modal(options,isError){
   if(pending||processing)return Promise.resolve(false);
   const o=options||{};
   $('confirmActionTitle').textContent=String(o.title||(isError?'【処理できませんでした】':'確認'));
   $('confirmActionText').textContent=String(o.message||'');
   ok.textContent=String(o.confirmLabel||(isError?'閉じる':'実行する'));
   ok.className=o.danger&&!isError?'sb-danger':'btn-blue';
   cancel.hidden=!!isError;
   confirmDialog.setAttribute('role',isError?'alertdialog':'dialog');
   confirmDialog.returnValue='';
   const focus=document.activeElement;
   return new Promise(resolve=>{
     pending={resolve,focus,error:!!isError};
     confirmDialog.showModal();
     (isError?ok:cancel).focus({preventScroll:true});
   });
 }
 function formatError(e){
   const raw=e?.message||String(e||'不明なエラーが発生しました。');
   const code=String(e?.code||'');
   if(e?.appliedButRefreshFailed){
     return {title:'【更新内容を確認してください】',message:'更新は受け付けましたが、最新の一覧を表示できません。\n「更新」で確認してください。\n'+raw};
   }
   if(e?.mutationUncertain){
     return {title:'【変更内容を確認してください】',message:'通信が切れました。更新されたか確認できません。\n「更新」で確認してください。\n'+raw};
   }
   if(code==='NETWORK_ERROR'||code==='REQUEST_TIMEOUT'||e?.status>=500){
     return {title:'【通信エラー】',message:'通信できませんでした。\n通信状況を確認し、「更新」してください。\n'+raw};
   }
   if(e?.status===409||code==='VERSION_CONFLICT'){
     return {title:'【内容が変わりました】',message:'ほかの人が先に変更しました。\n「更新」してからやり直してください。\n'+raw};
   }
   return {title:'【操作できませんでした】',message:raw};
 }
 function showError(e){const msg=formatError(e);toastEl?.classList.remove('show');return modal({title:msg.title,message:msg.message,confirmLabel:'閉じる'},true);}
 function toast(value){if(!toastEl)return;toastEl.textContent=String(value||'');toastEl.classList.remove('error');toastEl.classList.add('show');if(toastTimer!==null)clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3500);}
 function setBusy(active,label){
   processing=active;
   if(main){main.inert=active;main.setAttribute('aria-busy',String(active));}
   if(memberDialog?.open)memberDialog.inert=active;
   if(active){
     $('sandboxBusyText').textContent=String(label||'処理中です…');
     if(!busyDialog.open)busyDialog.showModal();
   }else{
     if(busyDialog.open)busyDialog.close();
     if(memberDialog)memberDialog.inert=false;
   }
 }
 async function run(label,work,options){
   if(processing||pending)return {ok:false,ignored:true};
   setBusy(true,label);
   let value,failed;
   try{value=await work();}
   catch(error){failed=error;}
   finally{setBusy(false);}
   if(failed){
     await showError(failed);
     return {ok:false,error:failed};
   }
   if(options?.success)toast(options.success);
   return {ok:true,value};
 }
 function isUncertain(e){return ['NETWORK_ERROR','REQUEST_TIMEOUT','OPERATION_UNCONFIRMED'].includes(e?.code)||Number(e?.status)>=500;}
 function formatDate(value){
   const s=String(value||'');
   if(!s)return '';
   const zoned=/(?:Z|[+-]\d\d:\d\d)$/i.test(s);
   if(zoned){
     const date=new Date(s);
     if(Number.isFinite(date.getTime())){
       const parts=new Intl.DateTimeFormat('ja-JP',{
         timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
         weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
       }).formatToParts(date);
       const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
       return p.year+'/'+p.month+'/'+p.day+'（'+p.weekday+'） '+p.hour+':'+p.minute;
     }
   }
   const match=/^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(s);
   if(!match)return s;
   const weekday=['日','月','火','水','木','金','土'][new Date(Date.UTC(+match[1],+match[2]-1,+match[3])).getUTCDay()];
   return match[1]+'/'+match[2]+'/'+match[3]+'（'+weekday+'）'+(match[4]?' '+match[4]+':'+match[5]:'');
 }
 global.SMSandboxUI=Object.freeze({
   confirm:o=>modal(o,false),showError,run,toast,isBusy:()=>processing,
   isUncertain,formatDate
 });
})(window);