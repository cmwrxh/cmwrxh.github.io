import crypto from 'node:crypto';
import {getRumAdminClient,normalizedHostname,requireUser,setNoStore} from '../lib/rum-beta-client.js';
const issueKey=async(admin,project)=>{
  const secret='clg_live_'+crypto.randomBytes(32).toString('hex');
  const keyHash=crypto.createHash('sha256').update(secret).digest('hex');
  const {data:key,error}=await admin.from('crawler_project_keys').insert({project_id:project.id,key_hash:keyHash,key_prefix:secret.slice(0,18)}).select('id,key_prefix,label,active').single();
  if(error||!key){console.error('[crawler-projects] key creation failed:',error?.code||'database error');return{error:true};}
  return{key:{...key,secret}};
};
export default async function handler(req,res){
  setNoStore(res);
  if(!['GET','POST','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, DELETE');return res.status(405).json({error:'Method not allowed'});}
  let admin;try{admin=getRumAdminClient();}catch{return res.status(503).json({error:'Crawler projects are unavailable.'});}
  const auth=await requireUser(req,admin);if(auth.error)return res.status(auth.status).json({error:auth.error});
  if(req.method==='DELETE'){
    const keyId=String(req.body?.key_id||'');
    if(!/^[0-9a-f-]{36}$/i.test(keyId))return res.status(400).json({error:'A valid key_id is required.'});
    const {data:key,error}=await admin.from('crawler_project_keys').select('id,crawler_projects!inner(owner_id)').eq('id',keyId).eq('crawler_projects.owner_id',auth.user.id).not('project_id','is',null).maybeSingle();
    if(error){console.error('[crawler-projects] key ownership lookup failed:',error.code||'database error');return res.status(503).json({error:'Crawler key storage is unavailable.'});}
    if(!key)return res.status(404).json({error:'Crawler key not found.'});
    const {data:revoked,error:updateError}=await admin.from('crawler_project_keys').update({active:false}).eq('id',keyId).eq('active',true).select('id').maybeSingle();
    if(updateError){console.error('[crawler-projects] key revoke failed:',updateError.code||'database error');return res.status(503).json({error:'Could not revoke crawler key.'});}
    return res.status(200).json({revoked:Boolean(revoked),key_id:keyId});
  }
  if(req.method==='GET'){
    const {data,error}=await admin.from('crawler_projects').select('id,project_name,domain,is_active,created_at,crawler_project_keys(id,key_prefix,label,active,created_at,last_used_at)').eq('owner_id',auth.user.id).order('created_at',{ascending:false});
    if(error){console.error('[crawler-projects] project list failed:',error.code||'database error');return res.status(503).json({error:'Could not load crawler projects.'});}
    return res.status(200).json({projects:data||[],project_limit:10});
  }
  const requestedProjectId=String(req.body?.project_id||'');
  if(requestedProjectId){
    if(!/^[0-9a-f-]{36}$/i.test(requestedProjectId))return res.status(400).json({error:'A valid project_id is required.'});
    const {data:owned,error:ownedError}=await admin.from('crawler_projects').select('id,project_name,domain').eq('id',requestedProjectId).eq('owner_id',auth.user.id).maybeSingle();
    if(ownedError){console.error('[crawler-projects] project ownership lookup failed:',ownedError.code||'database error');return res.status(503).json({error:'Crawler project storage is unavailable.'});}
    if(!owned)return res.status(404).json({error:'Crawler project not found.'});
    const issued=await issueKey(admin,owned);
    if(issued.error)return res.status(503).json({error:'Could not issue a new crawler key.'});
    return res.status(201).json({project:owned,key:issued.key,warning:'Copy this key now. It cannot be retrieved later.'});
  }
  const projectName=String(req.body?.project_name||'').trim().slice(0,120),domain=normalizedHostname(req.body?.domain);
  if(!projectName||!domain)return res.status(400).json({error:'Enter a project name and valid domain.'});
  const {data:project,error:projectError}=await admin.from('crawler_projects').insert({owner_id:auth.user.id,project_name:projectName,domain}).select('id,project_name,domain').single();
  if(projectError||!project){
    if(projectError?.code==='23514')return res.status(429).json({error:'You have reached the limit of 10 crawler projects per account.'});
    if(projectError?.code==='23505')return res.status(409).json({error:'This domain is already registered to your account.'});
    console.error('[crawler-projects] project creation failed:',projectError?.code||'database error');
    return res.status(503).json({error:'Could not create crawler project.'});
  }
  const issued=await issueKey(admin,project);
  if(issued.error){
    const {error:deleteError}=await admin.from('crawler_projects').delete().eq('id',project.id).eq('owner_id',auth.user.id);
    if(deleteError)console.error('[crawler-projects] compensating project cleanup failed:',deleteError.code||'database error');
    return res.status(503).json({error:'Project was created but its ingestion key could not be issued. Refresh projects and issue a key.'});
  }
  return res.status(201).json({project,key:issued.key,warning:'Copy this key now. It cannot be retrieved later.'});
}
