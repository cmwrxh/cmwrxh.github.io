import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { validatePublicUrl } from '../worker/url-safety.js';

const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = process.env.SUPABASE_URL && key ? createClient(process.env.SUPABASE_URL,key,{auth:{autoRefreshToken:false,persistSession:false}}) : null;
const countries = new Set(['KE','NG','ZA','EG','GH','MA','TZ','UG','SN']);
const freeLimits = { monitors: 3, monthlyChecks: 100 };
const paidLimits = { monitors: 20, monthlyChecks: 10000 };

function safeError(error) { return String(error?.message || 'Request failed').slice(0,180); }
async function authenticate(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
  if (!token || !admin) return null;
  const {data,error}=await admin.auth.getUser(token);
  return error ? null : data?.user || null;
}
async function planFor(userId) {
  const {data,error}=await admin.from('monitor_account_entitlements').select('plan').eq('owner_id',userId).maybeSingle();
  if (error) throw new Error('Monitoring plan could not be verified.');
  return data?.plan === 'paid' ? 'paid' : 'free';
}
async function usageFor(userId) {
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const monitors = await admin.from('customer_monitors').select('id').eq('owner_id',userId);
  if(monitors.error) throw new Error('Monitoring usage could not be verified.');
  const ids=(monitors.data||[]).map(x=>x.id);
  if(!ids.length)return 0;
  const {count,error}=await admin.from('monitor_check_jobs').select('id',{count:'exact',head:true})
    .gte('scheduled_for',monthStart.toISOString()).in('monitor_id',ids);
  if(error) throw new Error('Monitoring usage could not be verified.');
  return count||0;
}
function response(res,status,payload){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(payload);}
export default async function handler(req,res){
  if(!['GET','POST','PATCH','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH, DELETE');return response(res,405,{error:'Method not allowed'});}
  if(!admin)return response(res,503,{error:'Monitoring is not configured on this deployment.'});
  const user=await authenticate(req);
  if(!user)return response(res,401,{error:'Sign in to manage monitors.'});
  const monitorId=String(req.query?.id||req.body?.id||'');
  try {
    if(req.method==='GET'){
      if(monitorId){
        const {data:monitor,error}=await admin.from('customer_monitors').select('*').eq('id',monitorId).eq('owner_id',user.id).maybeSingle();
        if(error)return response(res,503,{error:'Could not load monitor.'});
        if(!monitor)return response(res,404,{error:'Monitor not found.'});
        const [results,incidents,aggregates,alerts]=await Promise.all([
          admin.from('monitor_check_results').select('checked_at,result_class,http_status,response_ms,country_code,error_reason,details').eq('monitor_id',monitorId).order('checked_at',{ascending:false}).limit(500),
          admin.from('monitor_incidents').select('id,started_at,ended_at,affected_countries,state').eq('monitor_id',monitorId).order('started_at',{ascending:false}).limit(100),
          admin.from('monitor_daily_aggregates').select('day,country_code,success_count,target_failure_count,inconclusive_count,avg_response_ms,p95_response_ms').eq('monitor_id',monitorId).order('day',{ascending:false}).limit(90),
          admin.from('monitor_alert_log').select('alert_type,delivery_status,attempted_at,delivered_at,error_reason,created_at').eq('monitor_id',monitorId).order('created_at',{ascending:false}).limit(50)
        ]);
        for(const result of [results,incidents,aggregates,alerts])if(result.error)return response(res,503,{error:'Could not load monitor history.'});
        const {data:channels}=await admin.from('monitor_alert_channels').select('id,channel_type,destination,verified_at,muted_until,enabled').eq('owner_id',user.id);
        return response(res,200,{monitor,results:results.data||[],incidents:incidents.data||[],aggregates:aggregates.data||[],alerts:alerts.data||[],channels:channels||[]});
      }
      const {data,error}=await admin.from('customer_monitors').select('id,name,target_url,check_type,interval_minutes,regions,enabled,public_status_enabled,public_status_slug,next_check_at,last_check_at,created_at').eq('owner_id',user.id).order('created_at',{ascending:false});
      if(error)return response(res,503,{error:'Could not load monitors.'});
      const plan=await planFor(user.id);
      const latest={};
      for(const monitor of data||[]){
        const {data:rows}=await admin.from('monitor_check_results').select('result_class,checked_at,response_ms,country_code').eq('monitor_id',monitor.id).order('checked_at',{ascending:false}).limit(1);
        latest[monitor.id]=rows?.[0]||null;
      }
      return response(res,200,{monitors:(data||[]).map(m=>({...m,latest_result:latest[m.id]})),plan,limits:plan==='paid'?paidLimits:freeLimits});
    }
    if(req.method==='POST'){
      const name=typeof req.body?.name==='string'?req.body.name.trim():'';
      const type=['http','latency','lighthouse'].includes(req.body?.check_type)?req.body.check_type:'http';
      if(name.length<1||name.length>80)return response(res,400,{error:'Monitor name must be 1–80 characters.'});
      let targetUrl;
      try{targetUrl=await validatePublicUrl(String(req.body?.url||''));}catch(e){return response(res,400,{error:safeError(e)});}
      const plan=await planFor(user.id), limits=plan==='paid'?paidLimits:freeLimits;
      const {count,error:countError}=await admin.from('customer_monitors').select('id',{count:'exact',head:true}).eq('owner_id',user.id);
      if(countError)return response(res,503,{error:'Monitor usage could not be verified.'});
      if((count||0)>=limits.monitors)return response(res,429,{error:'You have reached the monitor limit for your plan.'});
      if(await usageFor(user.id)>=limits.monthlyChecks)return response(res,429,{error:'You have reached the monthly monitoring check limit.'});
      const interval=type==='lighthouse'?10080:(plan==='paid'?60:1440);
      const requestedRegions=Array.isArray(req.body?.regions)?[...new Set(req.body.regions.filter(x=>countries.has(x)))] : ['KE'];
      const regions=requestedRegions.length?requestedRegions:['KE'];
      if(type==='latency'&&regions.length>3)return response(res,400,{error:'Choose up to three African probe countries for this beta.'});
      const keyword=typeof req.body?.keyword==='string'?req.body.keyword.trim().slice(0,160)||null:null;
      const threshold=Number.isInteger(req.body?.latency_threshold_ms)?Math.min(60000,Math.max(1,req.body.latency_threshold_ms)):null;
      const {data,error}=await admin.from('customer_monitors').insert({owner_id:user.id,name,target_url:targetUrl,check_type:type,interval_minutes:interval,regions,keyword,latency_threshold_ms:threshold,next_check_at:new Date().toISOString()}).select('id,name,target_url,check_type,interval_minutes,regions,enabled,next_check_at,created_at').single();
      if(error)return response(res,503,{error:'Could not create monitor.'});
      return response(res,201,{monitor:data,plan,limits});
    }
    if(!/^[0-9a-f-]{36}$/i.test(monitorId))return response(res,400,{error:'A valid monitor id is required.'});
    const {data:monitor,error:lookupError}=await admin.from('customer_monitors').select('*').eq('id',monitorId).eq('owner_id',user.id).maybeSingle();
    if(lookupError)return response(res,503,{error:'Could not verify monitor ownership.'});
    if(!monitor)return response(res,404,{error:'Monitor not found.'});
    if(req.method==='PATCH'){
      const updates={updated_at:new Date().toISOString()};
      if(typeof req.body?.enabled==='boolean')updates.enabled=req.body.enabled;
      if(typeof req.body?.public_status_enabled==='boolean'){
        updates.public_status_enabled=req.body.public_status_enabled;
        if(req.body.public_status_enabled&&!monitor.public_status_slug)updates.public_status_slug=crypto.randomBytes(18).toString('base64url');
        if(!req.body.public_status_enabled)updates.public_status_slug=null;
      }
      if(typeof req.body?.name==='string'&&req.body.name.trim())updates.name=req.body.name.trim().slice(0,80);
      const {data,error}=await admin.from('customer_monitors').update(updates).eq('id',monitorId).eq('owner_id',user.id).select('id,name,enabled,public_status_enabled,public_status_slug,next_check_at').single();
      if(error)return response(res,503,{error:'Could not update monitor.'});
      return response(res,200,{monitor:data});
    }
    const {error}=await admin.from('customer_monitors').delete().eq('id',monitorId).eq('owner_id',user.id);
    if(error)return response(res,503,{error:'Could not delete monitor and its history.'});
    return response(res,200,{deleted:true,id:monitorId});
  }catch(e){return response(res,503,{error:safeError(e)});}
}
