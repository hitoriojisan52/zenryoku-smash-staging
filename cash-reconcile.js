/* v0.16.37a: cash denomination calculator and month-ledger snapshot.
 * No persistence, finance mutations or new API endpoints. Staging UI only.
 */
(function(root){
 'use strict';
 const DENOMINATIONS=Object.freeze([10000,5000,2000,1000,500,100,50,10,5,1]);
 const LIMIT=9999;
 function validDate(date){
  if(typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return false;
  const t=new Date(date+'T00:00:00Z');
  return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===date;
 }
 function parseCount(value){
  const raw=String(value==null?'':value).trim();
  if(!raw)return 0;
  if(!/^(0|[1-9][0-9]{0,3})$/.test(raw))throw new Error('枚数は0～9999の整数で入力してください');
  const n=Number(raw);
  if(!Number.isSafeInteger(n)||n<0||n>LIMIT)throw new Error('枚数は0～9999の整数で入力してください');
  return n;
 }
 function cashTotal(counts){
  if(!counts||typeof counts!=='object')throw new Error('金種の入力がありません');
  let total=0;
  for(const yen of DENOMINATIONS){
   const amount=yen*parseCount(counts[yen]);
   total+=amount;
   if(!Number.isSafeInteger(total))throw new Error('合計金額が大きすぎます');
  }
  return total;
 }
 function asOfDate(ledger,date){
  if(!validDate(date)||!ledger||ledger.month!==date.slice(0,7)||!Array.isArray(ledger.rows))
   throw new Error('帳簿データの日付が一致しません。再読込してください');
  // The monthly ledger endpoint returns persisted rows in financial posting order.
  // The last row ON the specified date has that day's closing balance.
  const sameDay=ledger.rows.filter(row=>row.date===date);
  if(!sameDay.length)return {found:false,balance:null,provisional:false,rows:0};
  const final=sameDay[sameDay.length-1];
  if(!Number.isSafeInteger(final.balance))
   throw new Error('帳簿残金を確認できません。収支表を確認してください');
  const provisional=ledger.rows.some(row=>row.date<=date&&row.status!=='confirmed');
  return {found:true,balance:final.balance,provisional,rows:sameDay.length};
 }
 function reconcile(ledger,date,counts){
  const book=asOfDate(ledger,date),actual=cashTotal(counts);
  const difference=book.found?actual-book.balance:null;
  if(difference!==null&&!Number.isSafeInteger(difference))throw new Error('差額が計算可能な範囲を超えました');
  return {...book,actual,difference,match:book.found&&difference===0};
 }
 const api=Object.freeze({DENOMINATIONS,parseCount,cashTotal,asOfDate,reconcile,validDate});
 root.SMCashReconcile=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
