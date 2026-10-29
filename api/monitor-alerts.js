import { createClient } from '@supabase/supabase-js';
const key=process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const db=process.env.SUPABASE_URL&&key?createClient(process.env.SUPABASE_URL,key,{auth:{autoRefreshToken:false,persistSession:false}}):null;
function out(res,status,payload){res.setHeader('Cache-Control','no-store');return res.status(status).json(payload);}
async function sendEmail(to,subject,html){
  if(!process.env.RESEND_API_KEY||!process.env.MONITOR_FROM_EMAIL)return {ok:false,reason:'Email delivery is not configured on this preview.'};
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MONITOR_FROM_EMAIL,to:[to],subject,html}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)return {ok:false,reason:'Email provider rejected the message.'};
  return {ok:true};
}
export default async function handler(req,res){
  if(!['GET','POST','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, DELETE');return out(res,405,{error:'Method not allowed'});}
  if(!db)return out(res,503,{error:'Monitoring is not configured.'});
  const token=String(req.headers.authorization||'').replace(/^Bearer\\s+/i,'').trim();
  const {data:auth,error:authError}=token?await db.auth.getUser(token):{data:null,error:true};
  const user=auth?.user;
  if(authError||!user)return out(res,401,{error:'Sign in to manage alert channels.'});
  if(req.method==='GET'){
    const {data,error}=await db.from('monitor_alert_channels').select('id,channel_type,destination,verified_at,muted_until,enabled,created_at').eq('owner_id',user.id);
    if(error)return out(res,503,{error:'Could not load alert channels.'});
    return out(res,200,{channels:data||[],emailConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.MONITOR_FROM_EMAIL)});
  }
  if(req.method==='POST'){
    if(req.body?.action==='test'){
      const monitorId=String(req.body?.monitor_id||'');
      const {data:monitor}=await db.from('customer_monitors').select('id,name').eq('id',monitorId).eq('owner_id',user.id).maybeSingle();
      if(!monitor)return out(res,404,{error:'Monitor not found.'});
      const {data:channels,error}=await db.from('monitor_alert_channels').select('*').eq('owner_id',user.id).eq('enabled',true).not('verified_at','is',null);
      if(error)return out(res,503,{error:'Could not load alert channel.'});
      if(!channels?.length)return out(res,400,{error:'Add a confirmed email alert channel first.'});
      const channel=channels[0];const result=await sendEmail(channel.destination,'AfricaLatency monitoring test','<p>This is a test alert from AfricaLatency monitoring for '+monitor.name.replace(/[&<>"]/g,'')+'.</p><p>Measurements are observational and depend on available probes.</p>');
      const now=new Date().toISOString();
      const {error:logError}=await db.from('monitor_alert_log').insert({monitor_id:monitor.id,channel_id:channel.id,alert_type:'test',dedupe_key:'test:'+crypto.randomUUID(),delivery_status:result.ok?'sent':'failed',attempted_at:now,delivered_at:result.ok?now:null,error_reason:result.reason||null});
      if(logError)return out(res,503,{error:'Could not record test alert delivery.'});
      return out(res,result.ok?200:503,{sent:result.ok,message:result.ok?'Test email accepted by provider.':'Email delivery is not configured or failed.'});
    }
    if(!user.email||!user.email_confirmed_at)return out(res,400,{error:'A confirmed account email is required for alerts.'});
    const {data:existing,error:findError}=await db.from('monitor_alert_channels').select('id').eq('owner_id',user.id).eq('channel_type','email').eq('destination',user.email).maybeSingle();
    if(findError)return out(res,503,{error:'Could not check existing alert channel.'});
    if(existing)return out(res,200,{channel:existing,message:'Email channel already exists.'});
    const {data,error}=await db.from('monitor_alert_channels').insert({owner_id:user.id,channel_type:'email',destination:user.email,verified_at:new Date().toISOString(),enabled:true}).select('id,channel_type,destination,verified_at,enabled').single();
    if(error)return out(res,503,{error:'Could not create alert channel.'});
    return out(res,201,{channel:data,message:'Confirmed account email added. Delivery requires email provider configuration.'});
  }
  const id=String(req.query?.id||req.body?.id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return out(res,400,{error:'A valid alert channel id is required.'});
  const {error}=await db.from('monitor_alert_channels').delete().eq('id',id).eq('owner_id',user.id);
  if(error)return out(res,503,{error:'Could not delete alert channel.'});
  return out(res,200,{deleted:true});
}
