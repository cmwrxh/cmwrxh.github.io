(function(){
'use strict';
const root=document.getElementById('crawler-live-activity');if(!root)return;
const $=id=>document.getElementById(id);
const config=window.AFRICALATENCY_SUPABASE_CONFIG;
const client=config&&window.supabase?.createClient?window.supabase.createClient(config.url,config.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
const projectSelect=$('crawler-live-project'),rangeSelect=$('crawler-live-range'),message=$('crawler-live-message'),tbody=$('crawler-live-events'),metrics=$('crawler-live-metrics');
let projects=[],session=null;
function node(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);return el;}
function say(text,isError){message.textContent=text;message.dataset.state=isError?'error':'ok';}
async function request(url,options={}){
 if(!client)throw new Error('Account configuration unavailable.');
 const authResult=await client.auth.getSession();
 if(authResult.error)throw authResult.error;
 session=authResult.data?.session||null;
 if(!session?.access_token){window.location.href='/login.html';throw new Error('Your session expired.');}
 const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+session.access_token,...(options.body?{'Content-Type':'application/json'}:{})}});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){window.location.href='/login.html';throw new Error('Your session expired.');}
 if(!response.ok)throw new Error(data.error||'Crawler request failed.');
 return data;
}
function showTab(tab){
 const setup=tab==='setup';
 $('crawler-live-activity-view').hidden=setup;$('crawler-live-setup-view').hidden=!setup;
 root.querySelectorAll('[data-crawler-view]').forEach(button=>{const active=button.dataset.crawlerView===tab;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));});
}
async function loadProjects(){
 const data=await request('/api/crawler-projects');
 projects=data.projects||[];
 projectSelect.replaceChildren(node('option','Choose a project'));projectSelect.firstChild.value='';
 $('crawler-live-project-list').replaceChildren();
 for(const project of projects){
  const option=node('option',project.project_name+' · '+project.domain);option.value=project.id;projectSelect.appendChild(option);
  const row=node('div');row.className='crawler-live-project-row';
  const details=node('div');details.append(node('strong',project.project_name),node('small',project.domain+' · '+((project.crawler_project_keys||[]).filter(k=>k.active).length)+' active key(s)'));
  row.append(details);
  const issueKey=node('button','Issue new key');issueKey.type='button';issueKey.addEventListener('click',async()=>{try{const result=await request('/api/crawler-projects',{method:'POST',body:JSON.stringify({project_id:project.id})});const keyBox=$('crawler-live-key');keyBox.hidden=false;keyBox.textContent='New key for '+result.project.domain+' (shown once):\\n'+result.key.secret+'\\nStore as AFRICALATENCY_CRAWLER_KEY. Revoke the old key after deploying the new one.';await loadProjects();showTab('setup');}catch(error){$('crawler-live-setup-message').textContent=error.message;}});
  row.append(issueKey);
  for(const key of project.crawler_project_keys||[]){
   if(!key.active)continue;
   const revoke=node('button','Revoke key');revoke.type='button';revoke.addEventListener('click',async()=>{if(!confirm('Revoke this crawler ingestion key?'))return;try{await request('/api/crawler-projects',{method:'DELETE',body:JSON.stringify({key_id:key.id})});await loadProjects();$('crawler-live-setup-message').textContent='Key revoked.';}catch(e){$('crawler-live-setup-message').textContent=e.message;}});
   row.append(revoke);
  }
  $('crawler-live-project-list').appendChild(row);
 }
 if(projects.length){projectSelect.value=projects[0].id;await loadActivity();}
 else say('No crawler projects yet. Open Setup to create one.');
}
let activityRequestSequence=0,activityController=null;
async function loadActivity(){
 const id=projectSelect.value,range=rangeSelect.value,sequence=++activityRequestSequence;
 if(activityController)activityController.abort();
 activityController=new AbortController();
 const controller=activityController;
 if(!id){say('Choose a project to view crawler activity.');return;}
 say('Loading crawler activity…');tbody.replaceChildren(node('tr'));
 try{
  const data=await request('/api/crawler-activity?project_id='+encodeURIComponent(id)+'&range='+encodeURIComponent(range),{signal:controller.signal});
  if(sequence!==activityRequestSequence||controller.signal.aborted||projectSelect.value!==id||rangeSelect.value!==range)return;
  const t=data.totals||{};
  metrics.replaceChildren();
  [['Verified visits',t.verified],['HTTP errors (403/429/5xx)',t.errors],['Spoofed claims',t.spoofed]].forEach(([label,value])=>{const card=node('div');card.append(node('small',label),node('strong',Number(value||0).toLocaleString()));metrics.appendChild(card);});
  tbody.replaceChildren();
  const rows=data.recent_events||[];
  if(!rows.length){const tr=node('tr');tr.append(node('td','No crawler events received yet.'));tr.firstChild.colSpan=5;tbody.appendChild(tr);}
  for(const event of rows){const tr=node('tr');[new Date(event.observed_at).toLocaleString(),event.bot_name,event.verification_status,event.http_status??'—',event.path].forEach(value=>tr.appendChild(node('td',value)));tbody.appendChild(tr);}
  const trend=$('crawler-live-error-trend');if(trend){trend.replaceChildren();const buckets=data.error_timeline||[];const max=Math.max(1,...buckets.map(x=>x.count));for(const bucket of buckets){const row=node('div');row.className='crawler-live-trend-row';const date=new Date(bucket.hour);const labelText=range==='24h'?date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString([], {month:'short',day:'numeric'});const label=node('small',labelText);const bar=node('span');bar.className='crawler-live-trend-bar';bar.style.width=(bucket.count/max*100)+'%';const count=node('strong',bucket.count);row.append(label,bar,count);trend.appendChild(row);}}
  say('Showing '+rows.length+' recent events for '+data.project.domain+'. Refreshes every 60 seconds while this page is open.');
 }catch(error){if(error.name==='AbortError'||controller.signal.aborted)return;if(sequence===activityRequestSequence)say(error.message,true);}
}
$('crawler-live-refresh').addEventListener('click',loadActivity);
projectSelect.addEventListener('change',loadActivity);rangeSelect.addEventListener('change',loadActivity);
root.querySelectorAll('[data-crawler-view]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.crawlerView)));
$('crawler-live-project-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=$('crawler-live-create');button.disabled=true;
 try{
  const body=Object.fromEntries(new FormData(form).entries());
  const result=await request('/api/crawler-projects',{method:'POST',body:JSON.stringify(body)});
  const keyBox=$('crawler-live-key');keyBox.hidden=false;keyBox.textContent='Project created: '+result.project.domain+'\n\nAPI key (shown once):\n'+result.key.secret+'\n\nStore as AFRICALATENCY_CRAWLER_KEY on your server/edge environment. Never expose it in client-side code.';
  $('crawler-live-setup-message').textContent=result.warning;form.reset();await loadProjects();projectSelect.value=result.project.id;
  showTab('activity');await loadActivity();
 }catch(error){$('crawler-live-setup-message').textContent=error.message;}
 finally{button.disabled=false;}
});
(async()=>{try{if(!client){say('Account configuration unavailable.',true);return;}const result=await client.auth.getSession();session=result.data?.session;if(!session){say('Sign in to manage crawler projects.',true);return;}await loadProjects();}catch(error){say(error.message,true);}})();
setInterval(()=>{if(!document.hidden&&!$('crawler-live-activity-view').hidden&&projectSelect.value)loadActivity();},60000);
})();
