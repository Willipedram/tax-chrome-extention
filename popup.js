const $=s=>document.querySelector(s); let current=null, config={fields:[],exportMode:'single'};
const fa=n=>Number(n||0).toLocaleString('fa-IR');
async function activeTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return tab;}
async function loadConfig(){config=await chrome.storage.sync.get({fields:[],exportMode:'single'});}
async function scan(){const tab=await activeTab(); try{current=await chrome.tabs.sendMessage(tab.id,{type:'PEDRAM_GET_DATA'});}catch{current=null;} render();}
function render(){const ok=current?.isSupported; $('#status').textContent=ok?'صفحه قابل استخراج شناسایی شد':'صفحه پشتیبانی‌شده نیست'; $('#counts').textContent=`${fa(current?.fields?.length)} فیلد، ${fa(current?.tables?.length)} جدول`; $('#export').disabled=!ok; $('#warning').textContent=validate().join('، '); if(!current?.fields?.length){$('#preview').textContent='داده‌ای یافت نشد.';return;} $('#preview').innerHTML=`<table><thead><tr><th>بخش</th><th>فیلد</th><th>مقدار</th></tr></thead><tbody>${current.fields.slice(0,40).map(f=>`<tr><td>${f.sectionTitle}</td><td>${f.label}</td><td>${f.value}</td></tr>`).join('')}</tbody></table>`;}
function validate(){if(!current)return ['ابتدا صفحه را اسکن کنید']; const w=[]; if(current.fields.some(f=>!f.value))w.push('چند مقدار خالی است'); const dup=new Set(); if(current.fields.some(f=>{const k=f.category+f.label; if(dup.has(k))return true; dup.add(k)}))w.push('فیلد تکراری دیده شد'); return w;}
$('#refresh').onclick=scan; $('#settings').onclick=()=>chrome.runtime.openOptionsPage(); $('#fields').onclick=()=>chrome.runtime.openOptionsPage();
$('#export').onclick=async()=>{await loadConfig(); const blob=PedramExcelExporter.makeWorkbook(current,config); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`pedram-tax-export-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);};
loadConfig().then(scan);
