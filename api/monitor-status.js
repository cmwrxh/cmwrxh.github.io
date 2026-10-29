import {createClient} from '@supabase/supabase-js';
const key=process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const db=process.env.SUPABASE_URL&&key?createClient(process.env.SUPABASE_URL,key,{auth:{autoRefreshToken:false,persistSession:false}}):null;
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=30, stale-while-revalidate=30');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const slug=String(req.query?.slug||'');
  if(!/^[a-zA-Z0-9_-]{12,80}$/.test(slug)||!db)return res.status(404).json({error:'Status page not found.'});
  const {data,error}=await db.rpc('monitor_public_status',{p_slug:slug});
  if(error||!data)return res.status(404).json({error:'Status page not found.'});
  return res.status(200).json({...data,measurementNote:'Measured by AfricaLatency checks and community probes. Probe availability varies by country and provider. Results are observational and do not guarantee availability.'});
}
