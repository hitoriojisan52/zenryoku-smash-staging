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
function dateTimeJst(value){
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return String(value??'');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
   timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(d).map(p=>[p.type,p.value]));
 return date(parts.year+'-'+parts.month+'-'+parts.day)+' '+parts.hour+':'+parts.minute;
}
window.SMDate={date,dateTimeJst};
})();