(()=>{'use strict';
const status=document.getElementById('rd-status'),app=document.getElementById('rd-app'),retry=document.getElementById('rd-retry');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const ms=v=>finite(v)?(Number(v)>=1000?(Number(v)/1000).toFixed(2)+' s':Math.round(Number(v))+' ms'):'Unavailable';
const score=v=>finite(v)?Math.round(Number(v))+'%':'Unavailable';
const bytes=v=>finite(v)?(Number(v)===0?'0 B':Number(v)>=1048576?(Number(v)/1048576).toFixed(2)+' MB':Number(v)>=1024?(Number(v)/1024).toFixed(1)+' KB':Math.round(Number(v))+' B'):'Unavailable';
const fmtDate=v=>v?new Date(v).toLocaleString():'Timestamp unavailable';
const setStatus=t=>{status.hidden=false;status.textContent=t;if(retry)retry.hidden=false};
const table=(headers,rows)=>'<div class="rd-table-wrap"><table class="rd-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">No data returned by this scan.</td></tr>')+'</tbody></table></div>';
const params=new URLSearchParams(location.search);
const pathMatch=location.pathname.match(/^\/reports\/([a-f0-9-]{36})\/?$/i);
const id=pathMatch?pathMatch[1]:params.get('id');
if(!id||!/^[a-f0-9-]{36}$/i.test(id)){setStatus('This report link is invalid. Run a new scan to get a report.');return;}
const client=window.supabase?.createClient('https://uzihwtxffklisczqvurf.supabase.co','sb_publishable_dGaR1jgofny7tGVWh0TK2w_haSVNyWv');
document.getElementById('rd-pdf').addEventListener('click',()=>window.print());
document.getElementById('rd-share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);document.getElementById('rd-share').textContent='Link copied';}catch{window.prompt('Copy this report link',location.href)}});
document.getElementById('rd-compare').addEventListener('click',()=>{document.querySelector('[data-tab="history"]').click();document.getElementById('rd-history').scrollIntoView({behavior:'smooth',block:'center'})});
const openTab=name=>{const button=document.querySelector('[data-tab="'+name+'"]');if(button)button.click();const panel=document.querySelector('[data-panel="'+name+'"]');panel?.scrollIntoView({behavior:'smooth',block:'start'});};
document.getElementById('rd-monitor')?.addEventListener('click',()=>{openTab('alerts');document.getElementById('rd-alert-setup')?.focus();});
document.getElementById('rd-alert-setup')?.addEventListener('click',()=>openTab('alerts'));
document.getElementById('rd-page-settings')?.addEventListener('click',()=>{const note=document.getElementById('rd-page-settings-note');if(note){note.hidden=!note.hidden;}else{const n=document.createElement('p');n.id='rd-page-settings-note';n.className='rd-nav-note';n.textContent='This report reflects the device and test profile shown above. To change the test configuration, start a new scan and choose the available options there.';document.querySelector('.rd-parameters')?.after(n);}});
document.getElementById('rd-tags')?.addEventListener('click',()=>{let n=document.getElementById('rd-tags-note');if(!n){n=document.createElement('p');n.id='rd-tags-note';n.className='rd-nav-note';n.textContent='Report tags are not connected to saved account data yet. No tag has been created or saved.';document.querySelector('.rd-parameters')?.after(n);}else{n.hidden=!n.hidden;}});

document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==button.dataset.tab)}));
(async()=>{try{
let token='',user=null;if(client){const {data}=await client.auth.getSession();token=data?.session?.access_token||'';user=data?.session?.user||null;}
const response=await fetch('/api/scan/'+encodeURIComponent(id),{headers:token?{Authorization:'Bearer '+token}:{}});const data=await response.json().catch(()=>({}));
if(response.status===503)throw new Error('The report service is temporarily unavailable (HTTP 503). No result is being claimed. Retry shortly.');
if(response.status===429)throw new Error('Report request rate limit reached. Wait before refreshing.');
if(!response.ok)throw new Error(data.error||'Unable to load this report.');
if(data.status==='failed'){setStatus('Scan failed: '+(data.error||'the scan could not be completed')+'. No final scores are shown. Use Retry scan to start a new scan.');return;}
if(data.status==='partial'||data.partial===true){setStatus('Partial report: some measurements are unavailable. Missing values are not inferred. Use Retry scan if you need a fresh run.');return;}
if(data.status==='queued'){setStatus('Scan queued'+(finite(data.queuePosition)?' (position '+Math.round(Number(data.queuePosition))+')':'')+'. Current status only; this page does not poll indefinitely. Refresh later or retry.');return;}
if(data.status==='running'){setStatus('Scan running. Current stage: '+(data.stage||'in progress')+(finite(data.progress)?' ('+Math.round(Number(data.progress))+'% complete)':'')+'. Refresh later for an update.');return;}
if(data.status!=='completed'){setStatus('Scan status is unavailable. No final scores are shown. Refresh later or retry the scan.');return;}
status.hidden=true;app.hidden=false;
const summary=data.summary||{},m=summary.metrics||{},full=data.fullReport||{},fm=full.metrics||m;
document.title='Scan Results: '+(data.url||'Website')+' | AfricaLatency';
document.getElementById('rd-url').textContent=data.url||'Website';
document.getElementById('rd-meta').textContent='Report generated '+fmtDate(data.completedAt)+' · '+(summary.aggregation||'Single Lighthouse run')+(summary.runVariability?.label?' · '+summary.runVariability.label:'');
document.getElementById('rd-location').textContent=data.testedFrom||'Cloud worker (region not specified)';
document.getElementById('rd-device').textContent=data.device==='desktop'?'Desktop Chrome':data.device==='mobile'?'Mobile Chrome':'Not reported';
document.getElementById('rd-profile').textContent=summary.profileLabel||summary.testConditions||(data.device==='mobile'?'Lighthouse simulated mobile profile':'Unthrottled / not reported');
document.getElementById('rd-browser').textContent='Chrome '+(data.chromeVersion||'version unavailable')+' · Lighthouse '+(data.lighthouseVersion||'version unavailable');
const grade=summary.grade||'Unavailable';
document.getElementById('rd-scores').innerHTML=[['AfricaLatency grade',grade,'rd-grade rd-grade-'+String(grade).toLowerCase()],['Performance score',score(summary.performance),''],['Structure score',score(summary.structure),'']].map(x=>'<div class="rd-score"><div class="rd-score-label">'+esc(x[0])+'</div><div class="rd-score-value '+x[2]+'">'+esc(x[1])+'</div><div class="rd-score-label">'+(x[0]==='AfricaLatency grade'?'Reported scan grade':x[0]==='Performance score'?'Lighthouse score':'AfricaLatency structure score')+'</div></div>').join('');
const performanceCard=[...document.querySelectorAll('#rd-scores .rd-score')].find(el=>el.textContent.includes('Performance score'));
if(performanceCard&&finite(summary.performance)){const n=Math.max(0,Math.min(100,Number(summary.performance)));const ring=document.createElement('div');ring.className='rd-score-ring';ring.style.setProperty('--rd-score-progress',n+'%');ring.setAttribute('role','img');ring.setAttribute('aria-label','Lighthouse performance score '+Math.round(n)+' percent');ring.textContent=String(Math.round(n));performanceCard.prepend(ring);}
const METRIC_THRESHOLDS={
 LCP:{label:'Largest Contentful Paint',key:'lcpMs',unit:'time',good:2500,poor:4000,display:'s'},
 CLS:{label:'Cumulative Layout Shift',key:'cls',unit:'cls',good:0.10,poor:0.25},
 FCP:{label:'First Contentful Paint',key:'fcpMs',unit:'time',good:1800,poor:3000,display:'s'},
 TBT:{label:'Total Blocking Time (lab proxy)',key:'tbtMs',unit:'time',good:200,poor:600,display:'ms'},
 TTFB:{label:'Time to First Byte',key:'ttfbMs',unit:'time',good:800,poor:1800,display:'s'},
 SI:{label:'Speed Index',key:'speedIndexMs',unit:'time',good:3400,poor:5800,display:'s'}
};
const metricStatus=(key,value)=>{if(!finite(value))return 'Not returned for this scan';const t=METRIC_THRESHOLDS[key],n=Number(value);if(key==='CLS')return n<=t.good?'Good':n<=t.poor?'Needs improvement':'Poor';return n<=t.good?'Good':n<=t.poor?'Needs improvement':'Poor';};
const metricDisplay=(key,value)=>!finite(value)?'Not returned for this scan':key==='CLS'?Number(value).toFixed(3):ms(value);
const metricThresholdText=key=>'Good ≤ '+(key==='CLS'?'0.10':key==='LCP'?'2.5 s':key==='FCP'?'1.8 s':key==='TBT'?'200 ms':key==='TTFB'?'0.8 s':'3.4 s')+'; Poor above '+(key==='CLS'?'0.25':key==='LCP'?'4.0 s':key==='FCP'?'3.0 s':key==='TBT'?'600 ms':key==='TTFB'?'1.8 s':'5.8 s')+'.';
const vitalRows=[['LCP',m.lcpMs],['CLS',m.cls],['FCP',m.fcpMs],['TBT',m.tbtMs],['TTFB',m.ttfbMs],['SI',fm.speedIndexMs]];
document.getElementById('rd-vitals').innerHTML=vitalRows.map(([key,value])=>{const metric=METRIC_THRESHOLDS[key],verdict=metricStatus(key,value);return '<div class="rd-vital rd-vital-'+verdict.toLowerCase().replace(/\s+/g,'-')+'"><div class="rd-score-label">'+esc(metric.label)+'</div><div class="rd-vital metric">'+esc(metricDisplay(key,value))+'</div><span class="rd-status-pill rd-status-'+verdict.toLowerCase().replace(/\s+/g,'-')+'">'+esc(verdict)+'</span><p class="rd-muted">'+(key==='TBT'?'Lab proxy only; this is not INP. ':'')+'Thresholds: '+esc(metricThresholdText(key))+'</p></div>'}).join('');
const scoreBreakdownTrigger=document.getElementById('rd-score-breakdown-trigger'),scoreBreakdown=document.getElementById('rd-score-breakdown');
scoreBreakdownTrigger?.addEventListener('click',()=>{const open=scoreBreakdownTrigger.getAttribute('aria-expanded')!=='true';scoreBreakdownTrigger.setAttribute('aria-expanded',String(open));scoreBreakdown.hidden=!open;scoreBreakdownTrigger.innerHTML='<span aria-hidden="true">'+(open?'▴':'▾')+'</span> '+(open?'Hide score breakdown':'View score breakdown');});
const performanceScore=finite(summary.performance)?Number(summary.performance):null,structureScore=finite(summary.structure)?Number(summary.structure):null;
const composite=performanceScore!==null&&structureScore!==null?performanceScore*.70+structureScore*.30:null;
const gradeFromComposite=composite===null?'Not returned for this scan':composite>=90?'A':composite>=80?'B':composite>=70?'C':composite>=60?'D':'F';
const lhVersion=String(data.lighthouseVersion||summary.lighthouseVersion||full.lighthouseVersion||''),lhMajor=Number((lhVersion.match(/^(?:v)?(\d+)/)||[])[1]||0);
const scoreParts=[['Performance',performanceScore,.70],['Structure',structureScore,.30]];
const lhWeights=[['FCP',m.fcpMs,10],['SI',fm.speedIndexMs,10],['LCP',m.lcpMs,25],['TBT',m.tbtMs,30],['CLS',m.cls,25]];
scoreBreakdown.innerHTML='<div class="rd-breakdown-grid"><article><h3>Overall grade formula</h3><p>Overall score = 70% Performance + 30% Structure.</p><p class="rd-breakdown-equation">'+(composite===null?'Not returned for this scan':esc(performanceScore.toFixed(1))+' × 70% + '+esc(structureScore.toFixed(1))+' × 30% = '+esc(composite.toFixed(1)))+'</p><strong>Computed grade: '+esc(gradeFromComposite)+'</strong><p class="rd-muted">The reported grade remains the scan grade above. This calculation uses the worker’s documented weighting.</p></article><article><h3>Lighthouse Performance metric weights</h3>'+(lhMajor>=10?'<p class="rd-muted">Weights apply to the Lighthouse Performance component only (Lighthouse '+esc(lhVersion)+').</p><ul class="rd-score-weight-list">'+lhWeights.map(([key,value,weight])=>'<li><span>'+esc(key==='TBT'?'TBT (lab proxy)':key==='SI'?'Speed Index':key)+'</span><strong>'+weight+'%</strong><span>'+esc(metricDisplay(key==='SI'?'SI':key,value))+'</span></li>').join('')+'</ul>':'<p class="rd-empty">Metric weights are shown only when the payload identifies Lighthouse 10 or newer.</p>')+'</article></div>';

const audits=Array.isArray(full.auditList)?full.auditList:(Array.isArray(summary.auditList)?summary.auditList:[]);
const opportunities=Array.isArray(full.opportunities)?full.opportunities:(Array.isArray(summary.opportunities)?summary.opportunities:[]);
const issueTag=o=>{const id=String(o.id||'').toLowerCase(),title=String(o.title||'').toLowerCase(),desc=String(o.description||'').toLowerCase(),s=id+' '+title+' '+desc;if(/layout-shift|cumulative-layout-shift|\bcls\b/.test(s))return 'CLS';if(/long-task|total-blocking-time|mainthread|bootup-time|javascript execution|blocking time/.test(s))return 'TBT';if(/largest-contentful-paint|\blcp\b|image-delivery|preload-lcp|largest contentful/.test(s))return 'LCP';if(/first-contentful-paint|render-blocking|font-display|\bfcp\b|first contentful/.test(s))return 'FCP';return 'Other'};
const renderIssues=filter=>{const source=(opportunities.length?opportunities:audits.filter(a=>finite(a.score)&&Number(a.score)<100&&a.scoreDisplayMode!=='notApplicable').map(a=>({...a,savingsMs:null}))).slice().sort((a,b)=>(finite(b.savingsMs)?Number(b.savingsMs):-1)-(finite(a.savingsMs)?Number(a.savingsMs):-1));const items=source.filter(o=>filter==='All'||issueTag(o)===filter);document.getElementById('rd-issues').innerHTML='<p class="rd-muted">Ranked by estimated lab savings when Lighthouse returns them; no savings are invented.</p><div class="rd-filters">'+['All','FCP','LCP','TBT','CLS'].map(tag=>'<button type="button" class="rd-filter" data-issue-filter="'+tag+'" aria-pressed="'+String(tag===filter)+'">'+tag+'</button>').join('')+'</div>'+(items.length?items.map((o,index)=>'<details class="rd-accordion"><summary><span class="rd-issue-rank">#'+(index+1)+'</span> '+esc(o.title||'Optimization opportunity')+' <span class="rd-issue-tag">'+esc(issueTag(o))+'</span></summary><p>'+esc(o.description||'No additional details returned.')+'</p><p class="rd-muted">'+(finite(o.savingsMs)?'Potential lab savings: '+esc(ms(o.savingsMs)):'No savings estimate returned')+' · '+(opportunities.length?'Lighthouse opportunity':'Lighthouse audit finding; no time-savings estimate returned')+'</p></details>').join(''):'<div class="rd-empty">'+(filter==='All'?'No audit findings were returned for this report.':'No returned audit findings match this metric. Try All to see the available findings.')+'</div>');document.querySelectorAll('[data-issue-filter]').forEach(b=>b.addEventListener('click',()=>renderIssues(b.dataset.issueFilter)))};
renderIssues('All');
function resourcesForPayload(d){return Array.isArray(d?.fullReport?.resourceDetails)?d.fullReport.resourceDetails:[];}
const probeRows=Array.isArray(data.africaLatency)?data.africaLatency:[];
const measured=probeRows.filter(r=>r&&r.status==='measured'&&finite(r.rttMs)&&Number(r.rttMs)>=0);
const hubCards=probeRows.map(r=>'<div class="rd-hub"><strong>'+esc(r.country||r.countryCode||'Probe')+'</strong><span>'+(r.status==='measured'&&finite(r.rttMs)?esc(ms(r.rttMs))+' · measured': 'Unavailable / incomplete')+'</span></div>').join('');
document.getElementById('rd-hubs').innerHTML=hubCards||'<div class="rd-empty">No African probe measurements were returned.</div>';
document.getElementById('rd-grid').innerHTML=hubCards||'<div class="rd-empty">No probe data available.</div>';
const requestedCountries=[['KE','Kenya'],['NG','Nigeria'],['ZA','South Africa'],['EG','Egypt'],['GH','Ghana'],['MA','Morocco'],['TZ','Tanzania'],['UG','Uganda'],['SN','Senegal']];
const normCountry=value=>String(value||'').trim().toLowerCase().replace(/[^a-z]/g,'');
const countryRows=requestedCountries.map(([code,name])=>{const found=probeRows.find(r=>normCountry(r.countryCode)===normCountry(code)||normCountry(r.country)===normCountry(name));const available=Boolean(found&&found.status==='measured'&&finite(found.rttMs)&&Number(found.rttMs)>=0);return [esc(name),available?esc(ms(found.rttMs)):'Unavailable',available?'Measured':'Unavailable'];});
document.getElementById('rd-country-table').innerHTML=table(['Requested country','Probe timing','Status'],countryRows);
const payloadBytes=finite(full.pageWeightBytes)?Number(full.pageWeightBytes):(finite(summary.pageWeightBytes)?Number(summary.pageWeightBytes):(resourcesForPayload(data).length?resourcesForPayload(data).reduce((sum,r)=>sum+(finite(r.transferSize)?Number(r.transferSize):0),0):null));
document.getElementById('rd-data-cost').innerHTML=finite(payloadBytes)&&payloadBytes>0?'<p>Measured page payload: <strong>'+esc(bytes(payloadBytes))+'</strong>.</p><p>Estimated airtime cost is withheld until verified country/operator tariffs and a documented calculation model are configured.</p>':'This scan did not return a verified page payload size. No airtime cost is estimated.';
const performanceMetrics=[
 {name:'First Contentful Paint',key:'fcpMs',metricKey:'FCP',value:m.fcpMs,unit:'time',description:'How quickly content like text or images is painted onto your page.'},
 {name:'Speed Index',key:'speedIndexMs',metricKey:'SI',value:fm.speedIndexMs,unit:'time',description:'How quickly the contents of the page are visibly populated.'},
 {name:'Largest Contentful Paint',key:'lcpMs',metricKey:'LCP',value:m.lcpMs,unit:'time',description:'How long it takes for the largest visible content element to be painted.'},
 {name:'Total Blocking Time (lab proxy)',key:'tbtMs',metricKey:'TBT',value:m.tbtMs,unit:'time',description:'A lab proxy for main-thread blocking; this is not INP or CrUX field data.'},
 {name:'Cumulative Layout Shift',key:'cls',metricKey:'CLS',value:m.cls,unit:'cls',description:'How much the page layout shifts unexpectedly as it loads.'},
 {name:'Time to First Byte',key:'ttfbMs',metricKey:'TTFB',value:m.ttfbMs,unit:'time',description:'Time until the first byte of the response. Phase-level DNS/TCP/TLS timings are not included.'}
];
const metricVerdictLabel=(metric)=>metricStatus(metric.metricKey,metric.value);
const metricValue=(metric)=>metricDisplay(metric.metricKey,metric.value);
document.getElementById('rd-performance').innerHTML='<details class="rd-metric-details"><summary>Metric details</summary><p class="rd-muted">These are Lighthouse lab metrics, not CrUX field data. Values appear only when returned by the completed scan.</p><div class="rd-metric-detail-list">'+performanceMetrics.map(metric=>'<article class="rd-metric-detail"><div class="rd-metric-detail-heading"><h3>'+esc(metric.name)+'</h3><strong>'+esc(metricValue(metric))+'</strong></div><p>'+esc(metric.description)+'</p><p class="rd-metric-verdict rd-status-'+metricVerdictLabel(metric).toLowerCase().replace(/\s+/g,'-')+'">'+esc(metricVerdictLabel(metric))+'</p><small>'+esc(metricThresholdText(metric.metricKey))+'</small></article>').join('')+'</div></details>'+table(['Metric','Value','Source'],[['LCP',esc(metricDisplay('LCP',m.lcpMs)),'Lighthouse'],['TBT (lab proxy)',esc(metricDisplay('TBT',m.tbtMs)),'Lighthouse'],['CLS',esc(metricDisplay('CLS',m.cls)),'Lighthouse'],['FCP',esc(metricDisplay('FCP',m.fcpMs)),'Lighthouse'],['Speed Index',esc(metricDisplay('SI',fm.speedIndexMs)),'Lighthouse'],['TTFB',esc(metricDisplay('TTFB',m.ttfbMs)),'Lighthouse'],['Performance score',esc(score(summary.performance)),'Lighthouse'],['Structure score',esc(score(summary.structure)),'AfricaLatency composite'],['Page weight',esc(bytes(full.pageWeightBytes)),'Returned resource totals'],['Requests',esc(finite(full.requestCount)?String(full.requestCount):'Unavailable'),'Returned resource totals']]);
const structureAuditCatalog=[
 {id:'bootup-time',title:'Reduce JavaScript execution time',impact:'High',metrics:['TBT']},
 {id:'long-tasks',title:'Avoid long main-thread tasks',impact:'Low',metrics:['TBT']},
 {id:'back-forward-cache',title:'Allow back/forward cache restoration',impact:'Low',metrics:[]},
 {id:'redirects',title:'Avoid multiple page redirects',impact:'Low',metrics:['FCP','LCP']},
 {id:'render-blocking-resources',title:'Eliminate render-blocking resources',impact:'Low',metrics:['FCP','LCP']},
 {id:'total-byte-weight',title:'Avoid enormous network payloads',impact:'Low',metrics:['LCP'],match:['network-payloads']},
 {id:'critical-request-chains',title:'Avoid chaining critical requests',impact:'Low',metrics:['FCP','LCP']},
 {id:'non-composited-animations',title:'Avoid non-composited animations',impact:'Low',metrics:['CLS']},
 {id:'unused-css-rules',title:'Reduce unused CSS',impact:'Low',metrics:['FCP','LCP']},
 {id:'unused-javascript',title:'Reduce unused JavaScript',impact:'Low',metrics:['LCP']},
 {id:'dom-size',title:'Avoid an excessive DOM size',impact:'N/A',metrics:['TBT']},
 {id:'largest-contentful-paint-element',title:'Largest Contentful Paint element',impact:'N/A',metrics:['LCP']},
 {id:'legacy-javascript',title:'Avoid serving legacy JavaScript to modern browsers',impact:'N/A',metrics:['TBT']},
 {id:'mainthread-work-breakdown',title:'Minimize main-thread work',impact:'N/A',metrics:['TBT']},
 {id:'server-response-time',title:'Reduce initial server response time',impact:'N/A',metrics:['FCP','LCP']},
 {id:'third-party-summary',title:'Reduce the impact of third-party code',impact:'N/A',metrics:['TBT']},
 {id:'user-timings',title:'User Timing marks and measures',impact:'N/A',metrics:[]}
];
const structureAuditById=new Map(audits.filter(a=>a&&a.id).map(a=>[String(a.id),a]));
const structureAuditRows=structureAuditCatalog.map(item=>{
 const audit=structureAuditById.get(item.id)||(item.match||[]).map(id=>structureAuditById.get(id)).find(Boolean);
 const available=!!audit;
 const notApplicable=available&&(audit.scoreDisplayMode==='notApplicable'||audit.scoreDisplayMode==='manual'||audit.scoreDisplayMode==='informative');
 const passed=available&&!notApplicable&&finite(audit.score)&&Number(audit.score)>=0.9;
 const status=!available?'Not returned by Lighthouse':notApplicable?'N/A':passed?'Passed':'Needs improvement';
 const scoreText=!available?'Unavailable':notApplicable?'N/A':finite(audit.score)?Math.round(Number(audit.score)*100)+'%':'—';
 const finding=available?(audit.displayValue||audit.explanation||audit.description||status):'This audit was not included in the returned scan data.';
 return '<tr class="rd-audit-row" data-impact="'+esc(item.impact)+'" data-no-impact="'+(!item.metrics.length||item.impact==='N/A')+'"><td><strong>'+esc(item.title)+'</strong><small class="rd-audit-finding">'+esc(finding)+'</small></td><td><span class="rd-impact rd-impact-'+item.impact.toLowerCase().replace(/[^a-z]/g,'')+'">'+esc(item.impact)+'</span></td><td><div class="rd-audit-metric-tags">'+(item.metrics.length?item.metrics.map(tag=>'<span class="rd-audit-metric rd-audit-metric-'+tag.toLowerCase()+'">'+tag+'</span>').join(''):'<span class="rd-audit-metric rd-audit-metric-none">—</span>')+'</div></td><td><span class="rd-audit-status rd-audit-status-'+(passed?'pass':notApplicable?'na':available?'fail':'unknown')+'">'+esc(status)+'</span></td><td>'+esc(scoreText)+'</td></tr>';
}).join('');
document.getElementById('rd-structure').innerHTML='<div class="rd-structure-toolbar"><label class="rd-audit-toggle"><input id="rd-show-no-impact" type="checkbox"> Show No Impact</label><span class="rd-muted">Audit status and scores are taken from this scan. Missing audits are marked unavailable.</span></div><div class="rd-table-wrap"><table class="rd-table rd-structure-table"><thead><tr><th>Audit</th><th>Impact</th><th>Metrics</th><th>Status</th><th>Score</th></tr></thead><tbody>'+structureAuditRows+'</tbody></table></div>';
const showNoImpact=document.getElementById('rd-show-no-impact');
if(showNoImpact)showNoImpact.addEventListener('change',()=>{document.querySelectorAll('.rd-audit-row[data-no-impact="true"]').forEach(row=>{row.hidden=!showNoImpact.checked;});});
if(showNoImpact)document.querySelectorAll('.rd-audit-row[data-no-impact="true"]').forEach(row=>{row.hidden=true;});
const resources=Array.isArray(full.resourceDetails)?full.resourceDetails:(Array.isArray(summary.resourceDetails)?summary.resourceDetails:[]);
const requestAnalysis=full.requestAnalysis||data.requestAnalysis||summary.requestAnalysis||null;
const detailEl=document.getElementById('rd-page-details');
if(detailEl){
 const buckets=requestAnalysis?.categories||{};
 const localTotals={javascript:0,images:0,css:0,fonts:0,htmlOther:0};
 const classify=(r)=>{
   const type=String(r.resourceType||'').toLowerCase();
   const mime=String(r.mimeType||r.contentType||'').toLowerCase().split(';')[0].trim();
   const url=String(r.url||'').toLowerCase().split(/[?#]/)[0];
   if(/script|javascript|ecmascript/.test(type)||/javascript|ecmascript/.test(mime)||/\.(?:mjs|cjs|js)$/.test(url))return 'javascript';
   if(/stylesheet|css/.test(type)||mime==='text/css'||/\.css$/.test(url))return 'css';
   if(/font/.test(type)||/font|woff|truetype|opentype/.test(mime)||/\.(?:woff2?|ttf|otf|eot)$/.test(url))return 'fonts';
   if(/image/.test(type)||mime.startsWith('image/')||/\.(?:avif|bmp|gif|jpe?g|png|svg|webp|ico)$/.test(url))return 'images';
   return 'htmlOther';
 };
 resources.forEach(r=>{const bucket=classify(r),n=Number(r.transferSize);if(Number.isFinite(n)&&n>=0)localTotals[bucket]+=n;});
 const hasAggregate=Boolean(requestAnalysis?.resourceDataAvailable);
 const completeAggregate=hasAggregate&&(!finite(requestAnalysis?.classifiedResourceCount)||!finite(requestAnalysis?.requestCount)||Number(requestAnalysis.classifiedResourceCount)>=Number(requestAnalysis.requestCount));
 const bucketBytes=(key)=>completeAggregate&&buckets[key]&&finite(buckets[key].transferSizeBytes)?Number(buckets[key].transferSizeBytes):(hasAggregate&&!completeAggregate?null:(resources.length?localTotals[key]:null));
 const pageBytes=finite(full.pageWeightBytes)?Number(full.pageWeightBytes):finite(summary.pageWeightBytes)?Number(summary.pageWeightBytes):finite(requestAnalysis?.pageWeightBytes)?Number(requestAnalysis.pageWeightBytes):null;
 const requestCount=finite(full.requestCount)?Number(full.requestCount):finite(summary.requestCount)?Number(summary.requestCount):finite(requestAnalysis?.requestCount)?Number(requestAnalysis.requestCount):(resources.length?resources.length:null);
 const loadedMs=fm.fullyLoadedTimeMs??m.fullyLoadedTimeMs??requestAnalysis?.fullyLoadedTimeMs;
 const labels=[
  ['Fully loaded time',ms(loadedMs),finite(loadedMs)?'Last returned resource completion time':'Timing not returned by this scan'],
  ['Total page size',bytes(pageBytes),'Total transferred bytes returned by Lighthouse'],
  ['Total page requests',finite(requestCount)?String(requestCount):'Unavailable','Total requests returned by Lighthouse'],
  ['JavaScript',bytes(bucketBytes('javascript')),'Classified by resource type, MIME type, or URL extension'],
  ['Images',bytes(bucketBytes('images')),'Classified by resource type, MIME type, or URL extension'],
  ['CSS',bytes(bucketBytes('css')),'Classified by resource type, MIME type, or URL extension'],
  ['Fonts',bytes(bucketBytes('fonts')),'Classified by resource type, MIME type, or URL extension'],
  ['HTML / Other',bytes(bucketBytes('htmlOther')),'Unclassified and document resources']
 ];
 detailEl.innerHTML=labels.map(([label,value,source])=>'<div class="rd-page-detail"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><span>'+esc(source)+'</span></div>').join('');
 const note=document.getElementById('rd-page-details-note');
 if(note)note.textContent=completeAggregate?'Breakdown uses aggregate totals from all '+esc(requestAnalysis.requestCount??resources.length)+' returned resource request(s).':hasAggregate?'Category breakdown is incomplete for this saved report; total size and request count still use the complete Lighthouse totals.':'This report does not include resource aggregates; displayed categories use only resource rows available to this report.';
}

const timedResources=resources.filter(r=>finite(r.startTime)&&finite(r.endTime)&&Number(r.endTime)>=Number(r.startTime));
if(timedResources.length){const maxEnd=Math.max(1,...timedResources.map(r=>Number(r.endTime)));document.getElementById('rd-waterfall').innerHTML='<p class="rd-muted">Request start/end timing from Lighthouse. Phase-level DNS/TCP/TLS/TTFB timings are not included in this payload.</p>'+timedResources.map(r=>{const left=Math.max(0,Number(r.startTime)/maxEnd*100),width=Math.max(.6,(Number(r.endTime)-Number(r.startTime))/maxEnd*100);return '<div class="rd-waterfall-row"><div class="rd-waterfall-label" title="'+esc(r.url||'')+'">'+esc(r.url||'Resource')+'</div><div class="rd-waterfall-track"><span class="rd-waterfall-bar" style="margin-left:'+left+'%;width:'+width+'%"></span></div><div class="rd-waterfall-ms">'+esc(ms(Number(r.endTime)-Number(r.startTime)))+'</div></div>'}).join('')+table(['Resource URL','Type','HTTP status','Transferred'],resources.map(r=>['<span>'+esc(r.url||'—')+'</span>',esc(r.resourceType||'—'),esc(r.statusCode??'—'),esc(bytes(r.transferSize))]))}else{document.getElementById('rd-waterfall').innerHTML=resources.length?table(['Resource URL','Type','HTTP status','Transferred'],resources.map(r=>['<span>'+esc(r.url||'—')+'</span>',esc(r.resourceType||'—'),esc(r.statusCode??'—'),esc(bytes(r.transferSize))])):'<div class="rd-empty">No resource-level waterfall details were returned for this scan.</div>'};
const reportPath='/reports/'+id;
const safeNext=window.AfricaLatencyAuthNext?.getSafeNext(reportPath)||'/dashboard';
const signInHref='/login?next='+encodeURIComponent(safeNext);
const filmstrip=window.AfricaLatencyReportFilmstrip;
const filmstripOptions={screenshotUrl:data.screenshotUrl,metrics:{fcpMs:m.fcpMs,lcpMs:m.lcpMs,speedIndexMs:m.speedIndexMs},loggedIn:Boolean(user),signInHref};
const filmstripFrames=filmstrip?filmstrip.normalizeFrames(data.filmstrip):[];
const refreshFilmstrip=async()=>{const response=await fetch('/api/scan/'+encodeURIComponent(id)+'?refreshFilmstrip=1');if(!response.ok)throw new Error('Could not refresh signed frame URLs');const payload=await response.json();return payload.filmstrip||[];};
const filmstripRoot=document.getElementById('rd-filmstrip');
filmstripRoot.innerHTML=filmstrip?filmstrip.renderFilmstrip(filmstripFrames,filmstripOptions):'<div class="rd-empty">No filmstrip frames were returned for this scan.</div>';
filmstrip?.bindImageFailures(filmstripRoot,{refreshFilmstrip});
filmstrip?.bindInteractions(filmstripRoot);
if(user){const videoRoot=document.getElementById('rd-video');videoRoot.innerHTML=filmstrip?filmstrip.renderPlayer(filmstripFrames,filmstripOptions):'<div class="rd-empty">No filmstrip frames were returned for this scan.</div>';filmstrip?.bindPlayer(videoRoot);filmstrip?.bindImageFailures(videoRoot,{refreshFilmstrip});}
else{document.getElementById('rd-video').innerHTML='<div class="rd-playback-locked"><p>Sign in to play this scan frame by frame.</p><a class="rd-button" href="'+esc(signInHref)+'">Sign in to play</a></div>';}

if(user&&client){try{const {data:history,error}=await client.from('scans').select('public_id,target_url,ali_grade,performance_score,fully_loaded_time_ms,total_requests,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20);if(!error&&history?.length){document.getElementById('rd-history').innerHTML=table(['Date','Target','Grade','Performance','Load time','Requests'],history.map(x=>['<a href="/reports/'+encodeURIComponent(x.public_id)+'">'+esc(fmtDate(x.created_at))+'</a>',esc(x.target_url),esc(x.ali_grade||'—'),esc(score(x.performance_score)),esc(ms(x.fully_loaded_time_ms)),esc(x.total_requests??'Unavailable')]));}else{document.getElementById('rd-history').textContent=error?'History is not available for this account yet.':'No saved scan history is available yet.'}}catch{document.getElementById('rd-history').textContent='History is not available for this account yet.'}}else{document.getElementById('rd-history').innerHTML='Sign in to see saved reports. <a href="/login?next='+encodeURIComponent('/reports/'+id)+'">Log in</a>.'}
}catch(error){setStatus(error.message||'Unable to load this report.');}})();
})();