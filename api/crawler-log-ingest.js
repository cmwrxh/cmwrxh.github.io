import crypto from 'node:crypto';
import { getRumAdminClient,setNoStore } from '../lib/rum-beta-client.js';
import { verifyCrawler } from '../lib/crawler-bot-verification.js';
const MAX_EVENTS=100,MAX_BODY_BYTES=256*1024,KEY_RE=/^clg_live_[a-f0-9]{64}$/;
const hashKey=key=>crypto.createHash('sha256').update(key).digest('hex');
const intOrNull=(value,min,max)=>value===null||value===undefined||value===''?null:Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
export function validateCrawlerEvent(event){
  if(!event||typeof event!=='object'||Array.isArray(event))return 'Each event must be an object.';
  if(typeof event.timestamp!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(event.timestamp)||!Number.isFinite(Date.parse(event.timestamp)))return 'Every event requires a valid timestamp.';
  const time=Date.parse(event.timestamp),now=Date.now();
  if(time>now+300000||time<now-90*86400000)return 'Event timestamp is outside the accepted 90-day window.';
  if(!Number.isInteger(event.http_status)||event.http_status<100||event.http_status>599)return 'Every event requires an integer http_status between 100 and 599.';
  if(typeof event.path!=='string'||!event.path.startsWith('/')||event.path.length>512||/[?#]/.test(event.path))return 'Every event requires a path beginning with / and without a query string or fragment.';
  if(typeof event.host!=='string'||!event.host.trim())return 'Every event requires a host.';
  if(typeof event.user_agent!=='string'||!event.user_agent.trim()||event.user_agent.length>1024)return 'Every event requires a user_agent of at most 1024 characters.';
  if(typeof event.source_ip!=='string'||!event.source_ip.trim())return 'Every event requires a source_ip.';
  if(typeof event.idempotency_key!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/.test(event.idempotency_key))return 'Every event requires an idempotency_key (8-128 safe characters).';
  if(event.response_time_ms!==undefined&&event.response_time_ms!==null&&intOrNull(event.response_time_ms,0,3600000)===null)return 'response_time_ms must be an integer from 0 to 3600000.';
  if(event.bytes_served!==undefined&&event.bytes_served!==null&&intOrNull(event.bytes_served,0,Number.MAX_SAFE_INTEGER)===null)return 'bytes_served must be a non-negative integer.';
  if(event.country_edge_code!==undefined&&event.country_edge_code!==null&&!/^[A-Za-z]{2}$/.test(String(event.country_edge_code)))return 'country_edge_code must be a two-letter country code.';
  return null;
}
export default async function handler(req,res){
  setNoStore(res);
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(Number(req.headers['content-length']||0)>MAX_BODY_BYTES)return res.status(413).json({error:'Payload too large.'});
  const match=String(req.headers.authorization||'').match(/^Bearer\s+(clg_live_[a-f0-9]{64})$/i);
  if(!match||!KEY_RE.test(match[1]))return res.status(401).json({error:'Invalid crawler ingestion key.'});
  const events=req.body?.events;
  if(!Array.isArray(events)||events.length<1||events.length>MAX_EVENTS)return res.status(400).json({error:'Send between 1 and 100 events per batch.'});
  for(let i=0;i<events.length;i++){const error=validateCrawlerEvent(events[i]);if(error)return res.status(400).json({error,index:i});}
  let admin;try{admin=getRumAdminClient();}catch{return res.status(503).json({error:'Crawler ingestion storage is unavailable.'});}
  try{
    const {data:key,error:keyError}=await admin.from('crawler_project_keys')
      .select('id,project_id,requests_per_hour,active,crawler_projects!inner(id,domain,is_active,owner_id)')
      .eq('key_hash',hashKey(match[1])).eq('active',true).maybeSingle();
    if(keyError){console.error('[crawler-ingest] key lookup failed:',keyError.code||'database error');return res.status(503).json({error:'Crawler key storage is unavailable.'});}
    if(!key||!key.active||!key.crawler_projects?.is_active)return res.status(401).json({error:'Invalid or disabled crawler ingestion key.'});
    const {data:allowed,error:rateError}=await admin.rpc('crawler_allow_ingest',{
      p_key_id:key.id,p_request_limit:key.requests_per_hour,p_event_limit:key.requests_per_hour*100,p_event_count:events.length
    });
    if(rateError){console.error('[crawler-ingest] rate limiter failed:',rateError.code||'database error');return res.status(503).json({error:'Crawler ingestion rate limiter is unavailable.'});}
    if(allowed!==true){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((3600000-(Date.now()%3600000))/1000))));return res.status(429).json({error:'Crawler ingestion rate limit reached.'});}

    const projectDomain=String(key.crawler_projects.domain||'').toLowerCase();
    const candidates=events.filter(event=>{
      const host=event.host.toLowerCase().replace(/\.$/,'');
      return host===projectDomain||host.endsWith('.'+projectDomain);
    });
    if(candidates.length!==events.length)return res.status(400).json({error:'Every event host must match the registered project domain or a subdomain.'});

    const verifiedEvents=await Promise.all(candidates.map(async event=>{
      const verified=await verifyCrawler({userAgent:event.user_agent,sourceIp:event.source_ip});
      if(verified.botName==='other')return null;
      return {
        observed_at:new Date(event.timestamp).toISOString(),bot_name:verified.botName,verification_status:verified.status,
        http_status:event.http_status,path:event.path,response_time_ms:intOrNull(event.response_time_ms,0,3600000),
        bytes_served:intOrNull(event.bytes_served,0,Number.MAX_SAFE_INTEGER),
        country_edge_code:event.country_edge_code?String(event.country_edge_code).toUpperCase():null,
        idempotency_key:event.idempotency_key
      };
    }));
    const rows=verifiedEvents.filter(Boolean);
    if(!rows.length)return res.status(202).json({accepted:0,received:events.length,duplicates:0});

    // Recheck the key immediately before the atomic insert. The SQL function also locks
    // the key row through insertion, serializing this write against a concurrent revoke.
    const {data:activeKey,error:activeKeyError}=await admin.from('crawler_project_keys')
      .select('id,active').eq('id',key.id).eq('active',true).maybeSingle();
    if(activeKeyError){console.error('[crawler-ingest] active-key recheck failed:',activeKeyError.code||'database error');return res.status(503).json({error:'Crawler key status is unavailable.'});}
    if(!activeKey?.active)return res.status(401).json({error:'Crawler ingestion key has been revoked.'});

    const {data:accepted,error:insertError}=await admin.rpc('crawler_insert_events',{p_key_id:key.id,p_events:rows});
    if(insertError){
      if(insertError.code==='28000')return res.status(401).json({error:'Crawler ingestion key has been revoked.'});
      console.error('[crawler-ingest] atomic insert failed:',insertError.code||'database error');
      return res.status(503).json({error:'Could not store crawler events.'});
    }
    await admin.from('crawler_project_keys').update({last_used_at:new Date().toISOString()}).eq('id',key.id).eq('active',true);
    return res.status(202).json({accepted:Number(accepted)||0,received:events.length,duplicates:Math.max(0,rows.length-(Number(accepted)||0))});
  }catch(error){console.error('[crawler-ingest] request failed:',error?.message||'unknown error');return res.status(503).json({error:'Crawler ingestion is temporarily unavailable.'});}
}
