// Browser-safe Supabase configuration for the current deployment. Never expose service-role credentials.
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Type','application/javascript; charset=utf-8');
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).send('window.AFRICALATENCY_SUPABASE_CONFIG = null;');}
  const url=process.env.SUPABASE_PUBLIC_URL||process.env.SUPABASE_URL;
  const anonKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if(!url||!anonKey){res.status(503);return res.send('window.AFRICALATENCY_SUPABASE_CONFIG = null;');}
  let parsed;
  try{parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw new Error('Invalid protocol');}
  catch{res.status(503);return res.send('window.AFRICALATENCY_SUPABASE_CONFIG = null;');}
  return res.status(200).send('window.AFRICALATENCY_SUPABASE_CONFIG = Object.freeze('+JSON.stringify({url:parsed.origin,anonKey})+');');
}
