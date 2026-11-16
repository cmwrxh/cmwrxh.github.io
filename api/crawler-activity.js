import {getRumAdminClient,requireUser,setNoStore} from '../lib/rum-beta-client.js';
const HOURS={'24h':24,'7d':168,'30d':720};
export default async function handler(req,res){
  setNoStore(res);if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  let admin;try{admin=getRumAdminClient();}catch{return res.status(503).json({error:'Crawler activity is unavailable.'});}
  const auth=await requireUser(req,admin);if(auth.error)return res.status(auth.status).json({error:auth.error});
  const projectId=String(req.query?.project_id||''),range=String(req.query?.range||'24h');
  if(!/^[0-9a-f-]{36}$/i.test(projectId)||!HOURS[range])return res.status(400).json({error:'Invalid project or range.'});
  const {data:project,error:projectError}=await admin.from('crawler_projects').select('id,project_name,domain').eq('id',projectId).eq('owner_id',auth.user.id).maybeSingle();
  if(projectError||!project)return res.status(404).json({error:'Crawler project not found.'});
  const since=new Date(Date.now()-HOURS[range]*3600000).toISOString();
  const {data:events,error}=await admin.from('crawler_log_events').select('observed_at,bot_name,verification_status,http_status,path,response_time_ms,bytes_served,country_edge_code').eq('project_id',projectId).gte('observed_at',since).order('observed_at',{ascending:false}).limit(1000);
  if(error)return res.status(503).json({error:'Could not load crawler events.'});
  const rows=events||[],verified=rows.filter(x=>x.verification_status==='verified_bot'),errors=rows.filter(x=>[403,429].includes(x.http_status)||(x.http_status>=500&&x.http_status<=599)),byBot={};
  for(const row of verified)byBot[row.bot_name]=(byBot[row.bot_name]||0)+1;
  const errorHours=new Map();for(const row of errors){const hour=new Date(row.observed_at);hour.setMinutes(0,0,0);const key=hour.toISOString();errorHours.set(key,(errorHours.get(key)||0)+1);}
  const errorTimeline=Array.from({length:Math.min(24,HOURS[range])},(_,i)=>{const hour=new Date(Date.now()-(Math.min(24,HOURS[range])-1-i)*3600000);hour.setMinutes(0,0,0);const key=hour.toISOString();return{hour:key,count:errorHours.get(key)||0};});
  return res.status(200).json({project,range,from:since,error_timeline:errorTimeline,totals:{events:rows.length,verified:verified.length,spoofed:rows.filter(x=>x.verification_status==='spoofed_bot').length,unverified:rows.filter(x=>x.verification_status==='unverified').length,errors:errors.length},by_bot:byBot,error_events:errors.slice(0,100),recent_events:rows.slice(0,100)});
}
