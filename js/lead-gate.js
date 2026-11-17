(()=>{'use strict';
const app=document.getElementById('rd-app');
const params=new URLSearchParams(location.search);
const match=location.pathname.match(/^\/reports\/([a-f0-9-]{36})\/?$/i);
const scanId=match?match[1]:params.get('id');
if(!app||!scanId||!/^[a-f0-9-]{36}$/i.test(scanId))return;
const key='africalatency:report-unlocked:'+scanId;
let summary,gate,upsell,unlocked=false;
const readUnlock=()=>{try{return Boolean(JSON.parse(localStorage.getItem(key)||'null')?.unlocked)}catch{return false}};
const measuredCountries=()=>{
 const rows=[...document.querySelectorAll('#rd-country-table tbody tr')];
 return rows.map(row=>{
  const cells=[...row.querySelectorAll('td')];
  if(cells.length<3||!/measured/i.test(cells[2].textContent))return null;
  const label=cells[0].textContent.trim(),raw=cells[1].textContent.trim();
  const n=Number.parseFloat(raw.replace(/,/g,''));
  if(!label||!Number.isFinite(n))return null;
  return {label,ms:/\bs\b/i.test(raw)?n*1000:n};
 }).filter(Boolean);
};
const formatMs=n=>n>=1000?(n/1000).toFixed(2)+' s':Math.round(n)+' ms';
function renderSummary(){
 if(!summary)return;
 const score=document.querySelector('#rd-scores .rd-score:first-child .rd-score-value')?.textContent?.trim()||'Pending';
 const countries=measuredCountries().sort((a,b)=>a.ms-b.ms);
 const fastest=countries[0],slowest=countries[countries.length-1];
 const teaser=document.getElementById('rd-ai-crawler-teaser');
 const robotsState=teaser?.dataset.robotsStatus||'unavailable';
 const bot=robotsState==='allowed'?'At least one AI crawler is permitted by robots.txt':robotsState==='blocked'?'All checked AI crawlers are blocked by robots.txt':'robots.txt could not be checked';
 const cards=[
  ['Overall score',score,'Reported AfricaLatency grade'],
  ['Fastest country',fastest?fastest.label+' · '+formatMs(fastest.ms):'No measured result','Available community probe result'],
  ['Slowest country',slowest?slowest.label+' · '+formatMs(slowest.ms):'No measured result','Available community probe result'],
  ['AI crawler access',bot,robotsState==='allowed'?'Permission only; actual crawler visits are not verified':robotsState==='blocked'?'Explicit robots.txt restriction; origin access is not tested':'No permission result was available from this scan']
 ];
 summary.replaceChildren();
 cards.forEach(([label,value,note])=>{
  const card=document.createElement('div');card.className='lg-summary-card';
  const heading=document.createElement('span');heading.className='lg-summary-label';heading.textContent=label;
  const result=document.createElement('strong');result.className='lg-summary-value';result.textContent=value;
  const detail=document.createElement('span');detail.className='lg-summary-note';detail.textContent=note;
  card.append(heading,result,detail);summary.appendChild(card);
 });
}
function setLocked(locked){
 document.querySelectorAll('.rd-tabs,.rd-panel,#rd-score-breakdown-trigger,#rd-score-breakdown,#rd-executive-summary,#rd-executive-dialog').forEach(el=>{
  el.classList.toggle('lg-locked',locked);
  if(locked){el.setAttribute('aria-hidden','true');if('inert'in el)el.inert=true;}
  else{el.removeAttribute('aria-hidden');if('inert'in el)el.inert=false;}
 });
 if(gate)gate.hidden=!locked;
 if(upsell)upsell.hidden=locked;
}
function unlock(){
 unlocked=true;
 try{localStorage.setItem(key,JSON.stringify({unlocked:true,unlocked_at:new Date().toISOString()}));}catch{}
 setLocked(false);
}
function mount(){
 if(!app||app.hidden||document.getElementById('lg-summary'))return;
 summary=document.createElement('section');
 summary.id='lg-summary';summary.className='lg-summary';summary.setAttribute('aria-label','Scan top-line summary');summary.setAttribute('aria-live','polite');
 const scores=document.getElementById('rd-scores');
 if(!scores)return;
 scores.insertAdjacentElement('afterend',summary);
 gate=document.createElement('section');gate.className='lg-gate';gate.setAttribute('aria-labelledby','lg-gate-title');
 const title=document.createElement('h2');title.id='lg-gate-title';title.textContent='Unlock your full scan report';
 const intro=document.createElement('p');intro.textContent='Enter your work email to unlock the full 9-country breakdown, prioritized fix guide and available AI crawler-readiness details.';
 const form=document.createElement('form');form.className='lg-gate-form';
 const label=document.createElement('label');const labelText=document.createElement('span');labelText.className='lg-summary-label';labelText.textContent='Work email';
 const input=document.createElement('input');input.type='email';input.name='email';input.autocomplete='email';input.maxLength=254;input.placeholder='you@company.com';input.required=true;label.append(labelText,input);
 const submit=document.createElement('button');submit.type='submit';submit.textContent='Unlock full report';
 const statusNode=document.createElement('p');statusNode.className='lg-gate-status';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');
 form.append(label,submit,statusNode);gate.append(title,intro,form);
 summary.insertAdjacentElement('afterend',gate);
 upsell=document.createElement('aside');upsell.className='lg-upsell';upsell.hidden=true;
 const upsellCopy=document.createElement('p');
 const upsellHeading=document.createElement('strong');upsellHeading.textContent='Your full report is unlocked.';
 upsellCopy.append(upsellHeading,document.createTextNode(' Want hands-on optimization or early access to continuous monitoring? Claim a Founding Pilot spot or book a KES 3,500 Audit.'));
 const actions=document.createElement('div');actions.className='lg-upsell-actions';
 const pilotLink=document.createElement('a');pilotLink.href='/#founding-pilot';pilotLink.textContent='Claim a Founding Pilot spot';
 const auditLink=document.createElement('a');auditLink.href='/audit-checkout';auditLink.className='secondary';auditLink.textContent='Book a KES 3,500 Audit';
 actions.append(pilotLink,auditLink);upsell.append(upsellCopy,actions);
 gate.insertAdjacentElement('afterend',upsell);
 gate.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,email=String(new FormData(form).get('email')||'').trim().toLowerCase();
  const button=form.querySelector('button'),status=form.querySelector('.lg-gate-status');
  if(!email||!form.querySelector('input[type=email]').checkValidity()){status.textContent='Enter a valid work email.';status.dataset.state='error';return;}
  button.disabled=true;button.textContent='Unlocking…';status.textContent='Saving your access…';status.dataset.state='';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,lead_type:'full_report',scan_id:scanId,source:'scan-report-gate'}),signal:controller.signal});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.success)throw new Error(result.error||'We could not save your email. Please try again.');
   unlock();status.textContent='Full report unlocked.';status.dataset.state='success';
  }catch(error){status.textContent=error.name==='AbortError'?'The request timed out. Check your connection and try again.':(error.message||'Unable to unlock the report. Please try again.');status.dataset.state='error';button.disabled=false;button.textContent='Unlock full report';}
  finally{clearTimeout(timeout);}
 });
 renderSummary();
 unlocked=readUnlock();
 setLocked(!unlocked);
}
window.addEventListener('storage',event=>{
 if(event.key!==key||!event.newValue)return;
 try{if(JSON.parse(event.newValue)?.unlocked){unlocked=true;setLocked(false);}}catch{}
});
const observer=new MutationObserver(records=>{
 if(!app.hidden)mount();
 if(records.some(record=>!summary||!summary.contains(record.target)))renderSummary();
});
observer.observe(app,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true,characterData:true});
const teaser=document.getElementById('rd-ai-crawler-teaser');
if(teaser)new MutationObserver(renderSummary).observe(teaser,{attributes:true,attributeFilter:['hidden']});
if(!app.hidden)mount();
})();