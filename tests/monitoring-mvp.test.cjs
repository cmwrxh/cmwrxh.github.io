const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('monitoring schema has owner isolation, queue dedupe, bounded worker claims and retention',()=>{
  const sql=read('sql/monitoring-mvp.sql');
  for(const table of ['customer_monitors','monitor_check_jobs','monitor_check_results','monitor_daily_aggregates','monitor_incidents','monitor_alert_channels','monitor_alert_log']) assert.match(sql,new RegExp('create table public\\.'+table));
  assert.match(sql,/enable row level security/g);
  assert.match(sql,/unique\(monitor_id, scheduled_for\)/);
  assert.match(sql,/for update skip locked/i);
  assert.match(sql,/interval '30 days'/);
  assert.match(sql,/monitor_rollup_daily/);
  assert.match(sql,/monitor_account_entitlements/);
  assert.match(sql,/10000 else 100/);
  assert.doesNotMatch(sql,/SLA|service.level.agreement/i);
});

test('monitoring worker retries checks, distinguishes probe failures and uses conservative concurrency',()=>{
  const worker=read('worker/monitoring.js');
  assert.match(worker,/Math\.min\(2/);
  assert.match(worker,/result_class:'probe_unavailable'/);
  assert.match(worker,/result_class:'system_failure'/);
  assert.match(worker,/Retry one time/);
  assert.match(worker,/validatePublicUrl/);
  assert.match(worker,/redirect:'manual'/);
  assert.match(worker,/monitor_purge_old_results/);
  assert.match(worker,/alertOwner\(supabase,monitor,open,'recovered'\)/);
  assert.match(worker,/Math\.floor\(Date\.now\(\)\/1800000\)/);
});

test('monitoring API enforces owner scope and server-side limits',()=>{
  const api=read('api/monitors.js');
  assert.match(api,/auth\.getUser\(token\)/);
  assert.match(api,/eq\('owner_id',user\.id\)/);
  assert.match(api,/freeLimits/);
  assert.match(api,/paidLimits/);
  assert.match(api,/validatePublicUrl/);
  assert.match(api,/monthly monitoring check limit/);
});

test('public status endpoint exposes only the limited status RPC and caveat',()=>{
  const api=read('api/monitor-status.js');
  const page=read('status.html');
  assert.match(api,/monitor_public_status/);
  assert.match(api,/do not guarantee availability/);
  assert.doesNotMatch(api,/target_url|country_code|probe_id|ip_address/);
  assert.match(page,/Measurements are observational/);
});

test('monitor dashboard labels insufficient data and never claims guarantees',()=>{
  const page=read('monitoring-dashboard.html');
  assert.match(page,/Not enough data yet/);
  assert.match(page,/do not guarantee availability/);
  assert.match(page,/30 days/);
  assert.match(page,/Mute email/);
});

test('scanner URL safety rejects private IPs and credential URLs',async()=>{
  const {validatePublicUrl}=await import('../worker/url-safety.js');
  await assert.rejects(()=>validatePublicUrl('http://127.0.0.1/'),/Private or reserved/);
  await assert.rejects(()=>validatePublicUrl('http://10.0.0.1/'),/Private or reserved/);
  await assert.rejects(()=>validatePublicUrl('http://user:pass@example.com/'),/credentials/);
  await assert.rejects(()=>validatePublicUrl('http://localhost/'),/Private, local/);
});

test('login, signup and monitoring dashboard use deployment-specific public auth config',()=>{
  const config=read('api/monitor-config.js');
  assert.match(config,/SUPABASE_PUBLIC_URL\|\|process\.env\.SUPABASE_URL/);
  assert.match(config,/SUPABASE_PUBLISHABLE_KEY\|\|process\.env\.SUPABASE_ANON_KEY/);
  assert.doesNotMatch(config,/SERVICE_ROLE|SECRET_KEY/);
  for(const file of ['login.html','signup.html','monitoring-dashboard.html']){
    const page=read(file);
    assert.match(page,/AFRICALATENCY_SUPABASE_CONFIG/);
    assert.doesNotMatch(page,/uzihwtxffklisczqvurf\.supabase\.co/);
  }
});
