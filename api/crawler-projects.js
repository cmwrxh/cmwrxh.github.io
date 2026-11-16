import crypto from 'node:crypto';
import {getRumAdminClient,normalizedHostname,requireUser,setNoStore} from '../lib/rum-beta-client.js';
export default async function handler(req,res){
  setNoStore(res);
  if(!['GET','POST','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, DELETE');return res.status(405).json({error:'Method not allowed'});}
  let admin;try{admin=getRumAdminClient();}catch{return res.status(503).json({error:'Crawler projects are unavailable.'});}
  const auth=await requireUser(req,admin);if(auth.error)return res.status(auth.status).json({error:auth.error});
  if(req.method==='DELETE'){
    const keyId=String(req.body?.key_id||'');
    if(!/^[0-9a-f-]{36}$/i.test(keyId))return res.status(400).json({error:'A valid key_id is required.'});
    const {data:key,error}=await admin.from('crawler_project_keys').select('id,project_id,crawler_projects!inner(owner_id)').eq('id',keyId).eq('crawler_projects.owner_id',auth.user.id).maybeSingle();
    if(error||!key)return res.status(404).json({error:'Crawler key not found.'});
    const {error:updateError}=await admin.from('crawler_project_keys').update({active:false}).eq('id',keyId);
    if(updateError)return res.status(503).json({error:'Could not revoke crawler key.'});
    return res.status(200).json({revoked:true,key_id:keyId});
  }
  if(req.method==='GET'){
    const {data,error}=await admin.from('crawler_projects').select('id,project_name,domain,is_active,created_at,crawler_project_keys(id,key_prefix,label,active,created_at,last_used_at)').eq('owner_id',auth.user.id).order('created_at',{ascending:false});
    if(error)return res.status(503).json({error:'Could not load crawler projects.'});return res.status(200).json({projects:data||[]});
  }
  const projectName=String(req.body?.project_name||'').trim().slice(0,120),domain=normalizedHostname(req.body?.domain);
  if(!projectName||!domain)return res.status(400).json({error:'Enter a project name and valid domain.'});
  const {data:project,error:projectError}=await admin.from('crawler_projects').insert({owner_id:auth.user.id,project_name:projectName,domain}).select('id,project_name,domain').single();
  if(projectError||!project)return res.status(409).json({error:'Could not create project. The domain may already be registered.'});
  const secret='clg_live_'+crypto.randomBytes(32).toString('hex'),keyHash=crypto.createHash('sha256').update(secret).digest('hex');
  const {data:key,error:keyError}=await admin.from('crawler_project_keys').insert({project_id:project.id,key_hash:keyHash,key_prefix:secret.slice(0,18)}).select('id,key_prefix,label,active').single();
  if(keyError||!key){await admin.from('crawler_projects').delete().eq('id',project.id).eq('owner_id',auth.user.id);return res.status(503).json({error:'Could not create an ingestion key.'});}
  return res.status(201).json({project,key:{...key,secret},warning:'Copy this key now. It cannot be retrieved later.'});
}
