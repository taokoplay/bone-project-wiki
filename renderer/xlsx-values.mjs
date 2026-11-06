const BUILTIN={1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',11:'0.00E+00',14:'mm-dd-yy',15:'d-mmm-yy',16:'d-mmm',17:'mmm-yy',18:'h:mm AM/PM',19:'h:mm:ss AM/PM',20:'h:mm',21:'h:mm:ss',22:'m/d/yy h:mm',45:'mm:ss',46:'[h]:mm:ss',47:'mmss.0'};
function formatCellValue(raw,formatId,custom,date1904,numberFormatter) {
 const value=Number(raw);if(!raw||!Number.isFinite(value))return raw;
 const format=custom||BUILTIN[formatId]||'';
 const code=format.split(';')[value<0?1:0]||format.split(';')[0];
 const clean=code.replace(/"[^"]*"|\\.|\[(?!h\]|m\]|s\])[^\]]*\]/gi,'');
 if(/[ydhs]/i.test(clean)||(/m/i.test(clean)&&!/[#0]/.test(clean))) {
  if(value<0||value>2958465)return raw;
  const whole=Math.floor(value),fraction=Math.round((value-whole)*86400),seconds=fraction%86400;
  const date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:31)+(whole-(!date1904&&whole>=60?1:0))*86400000);
  const pad=n=>String(n).padStart(2,'0');
  const day=!date1904&&whole===60?'1900-02-29':`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
  const time=`${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds/60)%60)}${/s/i.test(clean)?':'+pad(seconds%60):''}`;
  if(/[yd]/i.test(clean))return /h|s/i.test(clean)?`${day} ${time}`:day;
  if(/\[h\]/i.test(clean))return `${Math.floor(value*24)}:${pad(Math.floor(seconds/60)%60)}:${pad(seconds%60)}`;
  return time;
 }
 if(!/[0#]/.test(clean))return raw;
 const percent=clean.includes('%'),number=percent?value*100:value;
 const decimals=Math.min(10,(clean.match(/\.([0#]+)/)||[])[1]?.length||0);
 if(/E[+-]0/i.test(clean))return number.toExponential(decimals).replace('e','E');
 const result=numberFormatter(clean.includes(','),decimals).format(number);
 const currency=(code.match(/(?:\[\$([^\]-]+)(?:-[^\]]+)?\]|([$¥￥€£]))/)||[]).slice(1).find(Boolean)||'';
 return `${currency}${result}${percent?'%':''}`;
}
// Pools retain only numeric options, never cell values or workbook content.
export function createValueFormatter() {
 const formatters=new Map();
 const numberFormatter=(grouping,decimals)=>{
  const key=`${Number(grouping)}:${decimals}`;
  let formatter=formatters.get(key);
  if(!formatter) {
   formatter=new Intl.NumberFormat('en-US',{useGrouping:grouping,minimumFractionDigits:decimals,maximumFractionDigits:decimals});
   if(formatters.size>=32)formatters.delete(formatters.keys().next().value);
   formatters.set(key,formatter);
  }
  return formatter;
 };
 return (raw,formatId=0,custom='',date1904=false)=>formatCellValue(raw,formatId,custom,date1904,numberFormatter);
}
export const formatValue=createValueFormatter();
export function columnName(column) {let name='';for(let n=column;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
export function cellAddress(ref) {
 const match=/^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(ref||'');if(!match)return null;
 const col=[...match[1]].reduce((n,x)=>n*26+x.charCodeAt(0)-64,0),row=Number(match[2]);
 return col<=16384&&row<=1048576?{row,col}:null;
}
