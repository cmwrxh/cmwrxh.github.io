import { validatePublicUrl, validateRedirectChain } from './url-safety.js';
import { runLighthouse } from './provider.js';

const REGIONS = new Set(['KE','NG','ZA','EG','GH','MA','TZ','UG','SN']);
const concurrency = Math.max(1, Math.min(2, Number(process.env.MONITOR_CONCURRENCY) || 1));
let ticking = false;

function reason(value) { return String(value || 'Check failed').replace(/[\r\n\t]+/g,' ').slice(0,220); }
async function readTextLimited(response, limit=1024*1024) {
  if (!response.body) return '';
  const reader=response.body.getReader(); const chunks=[]; let size=0;
  while(size<limit){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,limit-size);chunks.push(part);size+=part.byteLength;if(size>=limit){await reader.cancel().catch(()=>{});break;}}
  return new TextDecoder().decode(Buffer.concat(chunks));
}
async function httpCheck(monitor) {
  const started=Date.now();
  let current=await validatePublicUrl(monitor.target_url);
  for(let hop=0;hop<=5;hop++){
    const response=await fetch(current,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'AfricaLatency-Monitor/1.0'}});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location'); if(!location) return {result_class:'target_failure',http_status:response.status,response_ms:Date.now()-started,error_reason:'Redirect without Location header'};
      if(hop===5) return {result_class:'target_failure',http_status:response.status,response_ms:Date.now()-started,error_reason:'Redirect limit exceeded'};
      current=await validatePublicUrl(new URL(location,current).toString()); continue;
    }
    const body=monitor.keyword?await readTextLimited(response):'';
    const keywordMissing=monitor.keyword&&!body.includes(monitor.keyword);
    const ok=response.status>=200&&response.status<400&&!keywordMissing;
    return {result_class:ok?'success':'target_failure',http_status:response.status,response_ms:Date.now()-started,error_reason:keywordMissing?'Configured keyword was not found':(!ok?'HTTP status outside 2xx/3xx':null),details:{final_origin:new URL(current).origin}};
  }
  return {result_class:'target_failure',response_ms:Date.now()-started,error_reason:'Redirect limit exceeded'};
}
async function globalpingCheck(monitor,country) {
  if(!process.env.GP_API_TOKEN) return {result_class:'probe_unavailable',country_code:country,error_reason:'Globalping provider is not configured'};
  const headers={Authorization:'Bearer '+process.env.GP_API_TOKEN,'Content-Type':'application/json',Accept:'application/json'};
  try{
    const target=new URL(await validatePublicUrl(monitor.target_url)).hostname;
    const created=await fetch('https://api.globalping.io/v1/measurements',{method:'POST',headers,body:JSON.stringify({type:'ping',target,locations:[{country,limit:1}]}),signal:AbortSignal.timeout(8000)});
    const payload=await created.json().catch(()=>({}));
    if(!created.ok||!payload.id)return {result_class:'probe_unavailable',country_code:country,error_reason:created.status===422?'No matching community probe':'Globalping measurement could not be created'};
    const started=Date.now();
    while(Date.now()-started<12000){
      await new Promise(r=>setTimeout(r,1000));
      const poll=await fetch('https://api.globalping.io/v1/measurements/'+encodeURIComponent(payload.id),{headers,signal:AbortSignal.timeout(5000)});
      const data=await poll.json().catch(()=>({}));
      if(!poll.ok)return {result_class:'probe_unavailable',country_code:country,error_reason:'Globalping measurement could not be read'};
      if(data.status==='finished'||data.status==='failed'){
        const result=data.results?.[0]?.result;const times=(result?.timings||[]).map(t=>Number(t.rtt)).filter(Number.isFinite);
        if(data.status==='finished'&&times.length)return {result_class:'success',country_code:country,response_ms:Math.round(times.reduce((a,b)=>a+b,0)/times.length),details:{provider:'Globalping community probe'}};
        return {result_class:'probe_unavailable',country_code:country,error_reason:'No successful community probe result'};
      }
    }
    return {result_class:'probe_unavailable',country_code:country,error_reason:'Globalping measurement timed out'};
  }catch(e){return {result_class:'probe_unavailable',country_code:country,error_reason:reason(e.message)};}
}
async function runOne(supabase,job){
  const {data:monitor,error}=await supabase.from('customer_monitors').select('*').eq('id',job.monitor_id).maybeSingle();
  if(error||!monitor||!monitor.enabled){await supabase.from('monitor_check_jobs').update({state:'failed',last_error:'Monitor missing or disabled',updated_at:new Date().toISOString()}).eq('id',job.id).eq('lock_token',job.lock_token);return;}
  let outputs=[];
  try{
    if(monitor.check_type==='http') outputs=[await httpCheck(monitor)];
    else if(monitor.check_type==='latency') {
      const regions=(monitor.regions||['KE']).filter(x=>REGIONS.has(x)).slice(0,3);
      outputs=await regions.reduce(async(prev,country)=>{const acc=await prev;acc.push(await globalpingCheck(monitor,country));return acc;},Promise.resolve([]));
    } else {
      const safeUrl=await validateRedirectChain(monitor.target_url);
      const lh=await runLighthouse(safeUrl,'mobile',1);
      outputs=[{result_class:'success',response_ms:lh.metrics?.ttfbMs??null,details:{kind:'lighthouse',performance:lh.performance,structure:lh.structure,scores:lh.scores,metrics:lh.metrics,provider:lh.provider,grade:lh.grade}}];
    }
  }catch(e){outputs=[{result_class:'system_failure',error_reason:reason(e.message)}];}
  // Retry one time for a target/system failure; probe-unavailable results are not target downtime.
  if(outputs.some(o=>o.result_class==='target_failure'||o.result_class==='system_failure')&&job.attempt<2){
    await new Promise(r=>setTimeout(r,1000));
    try{
      const retry=monitor.check_type==='http'?[await httpCheck(monitor)]:monitor.check_type==='lighthouse'?[{result_class:'system_failure',error_reason:'Lighthouse retry requires the next scheduled run'}]:outputs;
      if(retry.some(o=>o.result_class==='success'))outputs=retry;
      else outputs=retry;
    }catch(e){outputs=[{result_class:'system_failure',error_reason:reason(e.message)}];}
  }
  const checkedAt=new Date().toISOString();
  const rows=outputs.map(o=>({monitor_id:monitor.id,job_id:job.id,checked_at:checkedAt,result_class:o.result_class,http_status:o.http_status??null,response_ms:o.response_ms??null,country_code:o.country_code??null,error_reason:o.error_reason?reason(o.error_reason):null,details:o.details??{}}));
  const {error:saveError}=await supabase.from('monitor_check_results').insert(rows);
  if(saveError){await supabase.from('monitor_check_jobs').update({state:'failed',last_error:'Could not persist result',updated_at:checkedAt}).eq('id',job.id).eq('lock_token',job.lock_token);return;}
  await updateIncident(supabase,monitor,outputs,checkedAt);
  await supabase.from('customer_monitors').update({last_check_at:checkedAt}).eq('id',monitor.id);
  await supabase.from('monitor_check_jobs').update({state:outputs.some(o=>o.result_class==='system_failure')?'failed':'completed',last_error:outputs.find(o=>o.error_reason)?.error_reason||null,updated_at:checkedAt,locked_at:null}).eq('id',job.id).eq('lock_token',job.lock_token);
}
async function alertOwner(supabase,monitor,incident,type){
  const dedupeKey=type+':'+incident.id;
  const {data:channels,error}=await supabase.from('monitor_alert_channels').select('id,destination,muted_until,enabled').eq('owner_id',monitor.owner_id).eq('enabled',true).not('verified_at','is',null);
  if(error||!channels?.length)return;
  for(const channel of channels){
    if(channel.muted_until&&new Date(channel.muted_until).getTime()>Date.now())continue;
    const {data:existing}=await supabase.from('monitor_alert_log').select('id').eq('channel_id',channel.id).eq('dedupe_key',dedupeKey).maybeSingle();
    if(existing)continue;
    const now=new Date().toISOString();
    const {data:log,error:logError}=await supabase.from('monitor_alert_log').insert({monitor_id:monitor.id,channel_id:channel.id,incident_id:incident.id,alert_type:type,dedupe_key:dedupeKey,delivery_status:'queued',attempted_at:now}).select('id').single();
    if(logError||!log)continue;
    let status='failed', deliveredAt=null, errorReason='Email provider is not configured on this preview.';
    if(process.env.RESEND_API_KEY&&process.env.MONITOR_FROM_EMAIL){
      try{
        const subject='AfricaLatency: '+(type==='down'?'monitor incident':'monitor recovered')+' — '+monitor.name;
        const body='<p>Monitor: '+String(monitor.name).replace(/[&<>"]/g,'')+'</p><p>State: '+(type==='down'?'Incident detected after repeated failed checks.':'A successful check confirmed recovery.')+'</p><p>Measured by AfricaLatency checks and community probes. Probe availability varies and measurements do not guarantee availability.</p>';
        const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MONITOR_FROM_EMAIL,to:[channel.destination],subject,html:body}),signal:AbortSignal.timeout(8000)});
        if(response.ok){status='sent';deliveredAt=new Date().toISOString();errorReason=null;}else errorReason='Email provider rejected the message.';
      }catch{errorReason='Email provider request failed.';}
    }
    await supabase.from('monitor_alert_log').update({delivery_status:status,delivered_at:deliveredAt,error_reason:errorReason}).eq('id',log.id);
  }
}
async function updateIncident(supabase,monitor,outputs,checkedAt){
  const {data:open}=await supabase.from('monitor_incidents').select('id,affected_countries,started_at').eq('monitor_id',monitor.id).eq('state','open').maybeSingle();
  if(outputs.some(o=>o.result_class==='success')&&open){
    await supabase.from('monitor_incidents').update({state:'recovered',ended_at:checkedAt}).eq('id',open.id);
    await alertOwner(supabase,monitor,open,'recovered');
    return;
  }
  const targetFailures=outputs.filter(o=>o.result_class==='target_failure');
  if(!targetFailures.length)return;
  const {data:recent}=await supabase.from('monitor_check_results').select('result_class,country_code,checked_at').eq('monitor_id',monitor.id).eq('result_class','target_failure').order('checked_at',{ascending:false}).limit(2);
  // Require at least two failed observations; probe/system failures never count as target downtime.
  if((recent||[]).length<2)return;
  const affected=[...new Set([...(open?.affected_countries||[]),...targetFailures.map(o=>o.country_code).filter(Boolean)])];
  if(open){await supabase.from('monitor_incidents').update({affected_countries:affected}).eq('id',open.id);}
  else { const {data:incident}=await supabase.from('monitor_incidents').insert({monitor_id:monitor.id,started_at:recent[1].checked_at||checkedAt,affected_countries:affected,state:'open'}).select('id').single(); if(incident)await alertOwner(supabase,monitor,incident,'down'); }
}
export async function monitoringTick(supabase){
  if(ticking||!supabase)return;
  ticking=true;
  try{
    await supabase.rpc('monitor_enqueue_due_jobs',{p_limit:50});
    await supabase.rpc('monitor_purge_old_results');
    await supabase.rpc('monitor_rollup_daily',{p_day:new Date(Date.now()-86400000).toISOString().slice(0,10)});
    const {data:jobs,error}=await supabase.rpc('monitor_claim_jobs',{p_limit:concurrency});
    if(error)throw error;
    for(const job of jobs||[])await runOne(supabase,job);
  }catch(e){console.warn('[monitoring] scheduler tick failed:',reason(e.message));}
  finally{ticking=false;}
}
