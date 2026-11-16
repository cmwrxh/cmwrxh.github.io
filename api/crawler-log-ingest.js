import crypto from 'node:crypto';
import { getRumAdminClient,setNoStore } from '../lib/rum-beta-client.js';
import { verifyCrawler } from '../lib/crawler-bot-verification.js';
const MAX_EVENTS=100,MAX_BODY_BYTES=256*1024,KEY_RE=/^clg_live_[a-f0-9]{64}$/;
const hashKey=key=>crypto.createHash('sha256').update(key).digest('hex');
const cleanPath=value=>typeof value==='string'&&value.startsWith('/')?value.split(/[?#]/,1)[0].slice(0,512)||'/':'/';
const intOrNull=(value,min,max)=>value===null||value===undefined||value===''?null:Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
export default async function handler(req,res){
  setNoStore(res);
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(Number(req.headers['content-length']||0)>MAX_BODY_BYTES)return res.status(413).json({error:'Payload too large.'});
  const match=String(req.headers.authorization||'').match(/^Bearer\s+(clg_live_[a-f0-9]{64})$/i);
  if(!match||!KEY_RE.test(match[1]))return res.status(401).json({error:'Invalid crawler ingestion key.'});
  const events=req.body?.events;
  if(!Array.isArray(events)||events.length<1||events.length>MAX_EVENTS)return res.status(400).json({error:'Send between 1 and 100 events per batch.'});
  let admin;try{admin=getRumAdminClient();}catch{return res.status(503).json({error:'Crawler ingestion storage is unavailable.'});}
  try{
    const {data:key,error:keyError}=await admin.from('crawler_project_keys')
      .select('id,project_id,requests_per_hour,active,crawler_projects!inner(id,domain,is_active)')
      .eq('key_hash',hashKey(match[1])).eq('active',true).maybeSingle();
    if(keyError||!key||!key.crawler_projects?.is_active)return res.status(401).json({error:'Invalid or disabled crawler ingestion key.'});
    const {data:allowed,error:rateError}=await admin.rpc('crawler_allow_ingest',{p_key_id:key.id,p_request_limit:key.requests_per_hour,p_event_limit:key.requests_per_hour*100,p_event_count:events.length});
    if(rateError)return res.status(503).json({error:'Crawler ingestion rate limiter is unavailable.'});
    if(allowed!==true)return res.status(429).json({error:'Crawler ingestion rate limit reached.'});
    const rows=[];
    for(const event of events){
      if(!event||typeof event!=='object')continue;
      const observed=new Date(event.timestamp||Date.now());
      if(!Number.isFinite(observed.getTime())||observed.getTime()>Date.now()+300000||observed.getTime()<Date.now()-90*86400000)continue;
      const host=String(event.host||'').toLowerCase().replace(/\.$/,'');
      const projectDomain=String(key.crawler_projects.domain||'').toLowerCase();
      if(!host || (host!==projectDomain && !host.endsWith('.'+projectDomain)))continue;
      const ua=String(event.user_agent||'').slice(0,1024),sourceIp=String(event.source_ip||'').trim();
      const verified=await verifyCrawler({userAgent:ua,sourceIp});
      if(verified.botName==='other')continue;
      rows.push({project_id:key.project_id,observed_at:observed.toISOString(),bot_name:verified.botName,verification_status:verified.status,
        http_status:intOrNull(event.http_status,100,599),path:cleanPath(event.path),response_time_ms:intOrNull(event.response_time_ms,0,3600000),
        bytes_served:intOrNull(event.bytes_served,0,Number.MAX_SAFE_INTEGER),
        country_edge_code:/^[A-Za-z]{2}$/.test(String(event.country_edge_code||''))?String(event.country_edge_code).toUpperCase():null});
    }
    if(rows.length){const {error}=await admin.from('crawler_log_events').insert(rows);if(error){console.error('[crawler-ingest] insert failed:',error.code||'database error');return res.status(503).json({error:'Could not store crawler events.'});}}
    await admin.from('crawler_project_keys').update({last_used_at:new Date().toISOString()}).eq('id',key.id);
    return res.status(202).json({accepted:rows.length,received:events.length});
  }catch(error){console.error('[crawler-ingest] request failed:',error?.message||'unknown error');return res.status(503).json({error:'Crawler ingestion is temporarily unavailable.'});}
}
