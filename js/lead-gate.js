(()=>{'use strict';
const app=document.getElementById('rd-app');
const params=new URLSearchParams(location.search);
const match=location.pathname.match(/^\\/reports\\/([a-f0-9-]{36})\\/?$/i);
const scanId=match?match[1]:params.get('id');
if(!app||!scanId||!/^[a-f0-9-]{36}$/i.test(scanId))return;
const key='africalatency:report-unlocked:'+scanId;
let summary,gate,upsell,unlocked=false;
const readUnlock=()=>{try{return Boolean(JSON.parse(localStorage.getItem(key)||'null')?.unlocked)}catch{return false}};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
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
 const score=document.querySelector('#rd-scores .rd-score')?.querySelector('.rd-score-value')?.textContent?.trim()||'Pending';
 const countries=measuredCountries().sort((a,b)=>a.ms-b.ms);
 const fastest=countries[0],slowest=countries[countries.length-1];
 const teaser=document.getElementById('rd-ai-crawler-teaser');
 const bot=teaser&&!teaser.hidden?'At least one AI crawler is permitted by robots.txt':'Not confirmed by this scan';
 const cards=[
  ['Overall score',score,'Reported AfricaLatency grade'],
  ['Fastest country',fastest?fastest.label+' · '+formatMs(fastest.ms):'No measured result','Available community probe result'],
  ['Slowest country',slowest?slowest.label+' · '+formatMs(slowest.ms):'No measured result','Available community probe result'],
  ['AI crawler access',bot,teaser&&!teaser.hidden?'Actual crawler visits are not verified':'Robots.txt permission result unavailable']
 ];
 summary.innerHTML=cards.map(([label,value,note])=>'<div class="lg-summary-card"><span class="lg-summary-label">'+esc(label)+'</span><strong class="lg-summary-value">'+esc(value)+'</strong><span class="lg-summary-note">'+esc(note)+'</span></div>').join('');
}
function setLocked(locked){
 document.querySelectorAll('.rd-tabs,.rd-panel,#rd-score-breakdown-trigger,#rd-score-breakdown').forEach(el=>{
  el.classList.toggle('lg-locked',locked);
  if(locked){el.setAttribute('aria-hidden','true');if('inert'in el)el.inert=true;}
  else{el.removeAttribute('aria-hidden');if('inert'in el)el.inert=false;}
 });
 if(gate)gate.hidden=!locked;
 if(upsell)upsell.hidden=locked;
}
function unlock(email){
 unlocked=true;
 try{localStorage.setItem(key,JSON.stringify({unlocked:true,email,unlocked_at:new Date().toISOString()}));}catch{}
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
 gate.innerHTML='<h2 id="lg-gate-title">Unlock your full scan report</h2><p>Enter your work email to unlock the full 9-country breakdown, prioritized fix guide and available AI crawler-readiness details.</p><form class="lg-gate-form"><label><span class="lg-summary-label">Work email</span><input type="email" name="email" autocomplete="email" maxlength="254" placeholder="you@company.com" required></label><button type="submit">Unlock full report</button><p class="lg-gate-status" role="status" aria-live="polite"></p></form>';
 summary.insertAdjacentElement('afterend',gate);
 upsell=document.createElement('aside');upsell.className='lg-upsell';upsell.hidden=true;
 upsell.innerHTML='<p><strong>Your full report is unlocked.</strong> Want 24/7 alerts when your site slows down or blocks AI bots? Claim a Founding Pilot spot or book a KES 3,500 Audit.</p><div class="lg-upsell-actions"><a href="/#founding-pilot">Claim a Founding Pilot spot</a><a class="secondary" href="/audit-checkout">Book a KES 3,500 Audit</a></div>';
 gate.insertAdjacentElement('afterend',upsell);
 gate.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,email=String(new FormData(form).get('email')||'').trim().toLowerCase();
  const button=form.querySelector('button'),status=form.querySelector('.lg-gate-status');
  if(!email||!form.querySelector('input[type=email]').checkValidity()){status.textContent='Enter a valid work email.';status.dataset.state='error';return;}
  button.disabled=true;button.textContent='Unlocking…';status.textContent='Saving your access…';status.dataset.state='';
  try{
   const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,lead_type:'full_report',scan_id:scanId,source:'scan-report-gate'})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.success)throw new Error(result.error||'We could not save your email. Please try again.');
   unlock(email);status.textContent='Full report unlocked.';status.dataset.state='success';
  }catch(error){status.textContent=error.message||'Unable to unlock the report. Please try again.';status.dataset.state='error';button.disabled=false;button.textContent='Unlock full report';}
 });
 renderSummary();
 unlocked=readUnlock();
 setLocked(!unlocked);
}
const observer=new MutationObserver(records=>{
 if(!app.hidden)mount();
 if(records.some(record=>!summary||!summary.contains(record.target)))renderSummary();
});
observer.observe(app,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true,characterData:true});
const teaser=document.getElementById('rd-ai-crawler-teaser');
if(teaser)new MutationObserver(renderSummary).observe(teaser,{attributes:true,attributeFilter:['hidden']});
if(!app.hidden)mount();
})();