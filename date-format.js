/* 全力☆スマッシュ display-only Japanese date formatting.
 * Keep YYYY-MM-DD in Sheets/API and native input[type=date]; format only visible text.
 * Uses UTC calendar arithmetic to avoid device timezone and DST weekday shifts.
 */
(function(){'use strict';
const WEEK=['日','月','火','水','木','金','土'];
const pad=v=>String(v).padStart(2,'0');
function parseDate(value){
 const match=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/.exec(String(value??''));
 if(!match)return null;
 const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
 if(y<1||y>9999||m<1||m>12||d<1||d>31)return null;
 const utc=new Date(0);utc.setUTCFullYear(y,m-1,d);utc.setUTCHours(0,0,0,0);
 if(utc.getUTCFullYear()!==y||utc.getUTCMonth()+1!==m||utc.getUTCDate()!==d)return null;
 return {year:y,month:m,day:d,weekday:WEEK[utc.getUTCDay()]};
}
function date(value,weekday=true){
 const parsed=parseDate(value);if(!parsed)return String(value??'');
 return String(parsed.year).padStart(4,'0')+'/'+pad(parsed.month)+'/'+pad(parsed.day)+(weekday?'('+parsed.weekday+')':'');
}
function dateTimeJst(value,weekday=true){
 // GAS getValues() can stringify a native Date as
 // "Wed Nov 18 2026 20:10:47 GMT+0900 (GMT+09:00)".
 // Display it in JST; never display the raw English Date.toString().
 const raw=String(value??'').trim();
 const naive=/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(raw);
 const source=naive?naive[1]+'-'+naive[2]+'-'+naive[3]+'T'+naive[4]+'+09:00':value;
 const d=new Date(source);
 if(Number.isNaN(d.getTime()))return String(value??'');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
   timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(d).map(p=>[p.type,p.value]));
 return date(parts.year+'-'+parts.month+'-'+parts.day,weekday)+' '+parts.hour+':'+parts.minute;
}
function practiceLabel(practice){
 const p=practice||{},ymd=date(p.date);
 const hhmm=value=>{
  const s=String(value??'').trim(),m=/^(\d{1,2}):(\d{2})$/.exec(s);
  return m?String(Number(m[1])).padStart(2,'0')+':'+m[2]:s;
 };
 const start=hhmm(p.startTime),end=hhmm(p.endTime);
 const time=start&&end?start+'～'+end:'';
 const place=String(p.place||'開催場所未登録').trim();
 return [ymd,time,place].filter(Boolean).join(' ');
}
// Staging screens must agree on TODAY in Japan, regardless of device locale.
function todayJst(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(now).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function upcomingPractices(rows,minimumDate=todayJst()){
 return (Array.isArray(rows)?rows:[]).filter(p=>p&&typeof p.date==='string'&&
  /^\d{4}-\d{2}-\d{2}$/.test(p.date)&&p.date>=minimumDate)
  .slice().sort((a,b)=>a.date.localeCompare(b.date)||
   String(a.startTime||'').localeCompare(String(b.startTime||''))||
   String(a.practiceId||'').localeCompare(String(b.practiceId||'')));
}
function nearestPractice(rows,minimumDate=todayJst()){
 return upcomingPractices(rows,minimumDate)[0]||null;
}
window.SMDate={date,dateTimeJst,practiceLabel,todayJst,upcomingPractices,nearestPractice};
})();