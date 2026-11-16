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
  const {data:summary,error:summaryError}=await admin.rpc('crawler_activity_summary',{p_project_id:projectId,p_since:since});
  if(summaryError||!summary)return res.status(503).json({error:'Crawler activity aggregation is unavailable.'});
  return res.status(200).json({project,range,from:since,...summary,recent_events:events||[]});
}
