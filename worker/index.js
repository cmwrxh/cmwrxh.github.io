import express from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { runLighthouse } from './provider.js';
import { validatePublicUrl } from './url-safety.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
const PORT = Number(process.env.PORT) || 3100;
const INTERNAL_TOKEN = process.env.SCAN_INTERNAL_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const GP_API_TOKEN = process.env.GP_API_TOKEN;
const MAX_QUEUE = Math.max(1, Math.min(50, Number(process.env.SCAN_MAX_QUEUE) || 12));
const RETENTION_DAYS = Math.max(1, Math.min(90, Number(process.env.SCAN_ANON_RETENTION_DAYS) || 7));
const IP_HASH_SECRET = process.env.IP_HASH_SECRET;
const API_KEY_PREFIX = 'al_live_';
const signedUrlCache = new Map();
let lastAlertAt = 0;
let busy = false;
let lastJobAt = Date.now();

const countries = [
  { code: 'KE', name: 'Kenya' }, { code: 'NG', name: 'Nigeria' },
  { code: 'ZA', name: 'South Africa' }, { code: 'EG', name: 'Egypt' },
  { code: 'GH', name: 'Ghana' }, { code: 'MA', name: 'Morocco' },
  { code: 'TZ', name: 'Tanzania' }, { code: 'UG', name: 'Uganda' },
  { code: 'SN', name: 'Senegal' }
];

function authorized(req) {
  if (!INTERNAL_TOKEN) return false;
  const header = String(req.headers.authorization || '');
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  return supplied.length === INTERNAL_TOKEN.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(INTERNAL_TOKEN));
}
function clientIp(req) {
  const value = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
  return value.split(',')[0].trim().slice(0, 100);
}
function hashIp(ip) {
  if (!IP_HASH_SECRET) throw new Error('IP_HASH_SECRET is not configured');
  return crypto.createHmac('sha256', IP_HASH_SECRET).update(ip).digest('hex');
}
function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}
async function userFromRequest(req) {
  const token = String(req.headers['x-user-token'] || '').trim();
  if (!token || !supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data?.user || null;
}
function publicSummary(job, screenshotUrl = null) {
  const result = job.result || {};
  return {
    jobId: job.id,
    reportId: job.public_id,
    url: job.url,
    device: job.device,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    queuePosition: job.queue_position || null,
    createdAt: job.created_at,
    completedAt: job.completed_at,
    testedFrom: result.testedFrom || 'Cloud worker',
    africaLatencySummary: result.africaLatencySummary || null,
    lighthouseVersion: result.lighthouseVersion || null,
    chromeVersion: result.chromeVersion || null,
    screenshotUrl,
    summary: result.summary || null,
    africaLatency: result.africaLatency || countries.map(c => ({ country: c.name, countryCode: c.code, status: 'unavailable', rttMs: null })),
    locked: true
  };
}
async function signedScreenshot(job) {
  if (!job.screenshot) return null;
  const cached = signedUrlCache.get(job.screenshot);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data } = await supabase.storage.from('scan-screenshots').createSignedUrl(job.screenshot, 3600);
  if (!data?.signedUrl) return null;
  signedUrlCache.set(job.screenshot, { url: data.signedUrl, expiresAt: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
async function findJob(id) {
  let { data } = await supabase.from('scan_jobs').select('*').eq('id', id).maybeSingle();
  if (!data) ({ data } = await supabase.from('scan_jobs').select('*').eq('public_id', id).maybeSingle());
  return data || null;
}
async function reportFor(req, job) {
  const user = await userFromRequest(req);
  const rawApiKey = String(req.headers['x-api-key'] || '');
  const apiKeyRecord = rawApiKey ? await validateApiKey(rawApiKey) : null;
  if (rawApiKey && !apiKeyRecord) return null;
  let unlocked = Boolean(apiKeyRecord && apiKeyRecord.user_id === job.user_id);
  if (user && job.status === 'completed') {
    if (!job.user_id) {
      const { data } = await supabase.from('scan_jobs').update({ user_id: user.id }).eq('id', job.id).is('user_id', null).select('*').maybeSingle();
      if (data) job = data;
    }
    unlocked = job.user_id === user.id;
  }
  const screenshotUrl = await signedScreenshot(job);
  const response = publicSummary(job, screenshotUrl);
  response.locked = !unlocked;
  if (unlocked) response.fullReport = job.result?.fullReport || null;
  return response;
}

async function validateApiKey(raw) {
  if (typeof raw !== 'string' || !raw.startsWith(API_KEY_PREFIX)) return null;
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  const { data } = await supabase.from('scan_api_keys').select('id,user_id,requests_per_hour,active').eq('key_hash', digest).eq('active', true).maybeSingle();
  return data || null;
}

async function globalpingCountry(url, country) {
  if (!GP_API_TOKEN) return { country: country.name, countryCode: country.code, status: 'unavailable', rttMs: null, reason: 'Provider not configured' };
  const host = new URL(url).hostname;
  const headers = { Authorization: `Bearer ${GP_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  try {
    const created = await fetch('https://api.globalping.io/v1/measurements', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'ping', target: host, locations: [{ country: country.code, limit: 1 }] }),
      signal: AbortSignal.timeout(8000)
    });
    const payload = await created.json().catch(() => ({}));
    if (!created.ok || !payload.id) return { country: country.name, countryCode: country.code, status: 'unavailable', rttMs: null, reason: created.status === 422 ? 'No matching probe' : 'Measurement unavailable' };
    const start = Date.now();
    while (Date.now() - start < 12000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const polled = await fetch(`https://api.globalping.io/v1/measurements/${encodeURIComponent(payload.id)}`, { headers, signal: AbortSignal.timeout(5000) });
      if (!polled.ok) continue;
      const data = await polled.json().catch(() => ({}));
      if (!data.status || data.status === 'in-progress') continue;
      const item = data.results?.[0];
      const result = item?.result || {};
      let avg = Number(result.stats?.rtt?.avg ?? result.stats?.avg ?? result.stats?.average ?? result.timings?.total);
      if (!Number.isFinite(avg) && typeof result.rawOutput === 'string') {
        const match = result.rawOutput.match(/(?:rtt|round-trip).*?=\s*[0-9.]+\/([0-9.]+)/i);
        if (match) avg = Number(match[1]);
      }
      if (item?.result?.status === 'finished' && Number.isFinite(avg) && avg >= 0) return { country: country.name, countryCode: country.code, status: 'measured', rttMs: Math.round(avg), probe: item.probe?.city || null };
      return { country: country.name, countryCode: country.code, status: 'unavailable', rttMs: null, reason: 'No completed ping result' };
    }
    return { country: country.name, countryCode: country.code, status: 'unavailable', rttMs: null, reason: 'Probe timed out' };
  } catch {
    return { country: country.name, countryCode: country.code, status: 'unavailable', rttMs: null, reason: 'Probe request failed' };
  }
}
async function getAfricaLatency(url) {
  // Keep provider load bounded; one ping per country, at most two concurrent.
  const out = [];
  for (let i = 0; i < countries.length; i += 2) {
    const batch = countries.slice(i, i + 2);
    out.push(...await Promise.all(batch.map(country => globalpingCountry(url, country))));
  }
  const values = out.filter(x => x.status === 'measured').map(x => x.rttMs).sort((a,b) => a-b);
  const median = values.length ? (values.length % 2 ? values[(values.length - 1) / 2] : Math.round((values[values.length / 2 - 1] + values[values.length / 2]) / 2)) : null;
  return { countries: out, medianRttMs: median, measuredCountries: values.length, requestedCountries: countries.length };
}

async function saveScreenshot(jobId, dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const path = `${jobId}/page.${ext}`;
  const { error } = await supabase.storage.from('scan-screenshots').upload(path, buffer, { contentType: `image/${match[1]}`, upsert: true });
  if (error) {
    console.warn('[scan-worker] screenshot upload failed:', error.message);
    return null;
  }
  return path;
}

async function executeJob(job) {
  const update = async (fields) => supabase.from('scan_jobs').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', job.id);
  const user = job.user_id ? { id: job.user_id } : null;
  const runCount = user ? 3 : 1;
  await update({ status: 'processing', stage: 'fetching', progress: 12, error_message: null });
  const safeUrl = await validatePublicUrl(job.url);
  await update({ stage: 'lighthouse', progress: 30 });
  const lighthouseResult = await runLighthouse(safeUrl, job.device, runCount);
  const screenshot = await saveScreenshot(job.id, lighthouseResult.screenshotDataUrl);
  const summary = {
    grade: lighthouseResult.grade,
    performance: lighthouseResult.performance,
    structure: lighthouseResult.structure,
    scores: lighthouseResult.scores,
    provider: lighthouseResult.provider || 'local Lighthouse',
    metrics: lighthouseResult.metrics,
    requestCount: lighthouseResult.requestCount,
    pageWeightBytes: lighthouseResult.pageWeightBytes,
    runCount: lighthouseResult.runCount || 1,
    aggregation: lighthouseResult.aggregation || 'single Lighthouse run'
  };
  await update({ stage: 'africa', progress: 72, screenshot });
  const africaLatency = await getAfricaLatency(safeUrl);
  await update({ stage: 'report', progress: 92 });
  const result = {
    testedFrom: process.env.TEST_LOCATION_LABEL || 'Cloud worker',
    lighthouseVersion: lighthouseResult.lighthouseVersion,
    chromeVersion: lighthouseResult.chromeVersion,
    summary,
    africaLatency: africaLatency.countries,
    africaLatencySummary: { medianRttMs: africaLatency.medianRttMs, measuredCountries: africaLatency.measuredCountries, requestedCountries: africaLatency.requestedCountries },
    fullReport: {
      scores: lighthouseResult.scores,
      metrics: lighthouseResult.metrics,
      requestCount: lighthouseResult.requestCount,
      pageWeightBytes: lighthouseResult.pageWeightBytes,
      opportunities: lighthouseResult.opportunities,
      auditList: lighthouseResult.auditList || [],
      resourceDetails: lighthouseResult.resourceDetails || [],
      runCount: lighthouseResult.runCount || 1,
      provider: lighthouseResult.provider || 'local Lighthouse',
      aggregation: lighthouseResult.aggregation || 'single Lighthouse run',
      runVariability: lighthouseResult.runVariability || null,
      testedFrom: process.env.TEST_LOCATION_LABEL || 'Cloud worker'
    }
  };
  const { error } = await update({ status: 'completed', stage: 'completed', progress: 100, result, completed_at: new Date().toISOString(), error_message: null });
  if (error) throw error;
  // Materialize the completed worker result for authenticated report history.
  // The scan_jobs record remains the execution source of truth.
  const metrics = lighthouseResult.metrics || {};
  const scanRow = {
    scan_job_id: job.id,
    public_id: job.public_id,
    user_id: job.user_id || null,
    target_url: job.url,
    probe_location: process.env.TEST_LOCATION_LABEL || 'Cloud worker; African probes reported separately',
    device_emulation: job.device === 'desktop' ? 'Desktop Chrome' : 'Mobile Chrome',
    connection_profile: job.device === 'mobile' ? 'Lighthouse simulated mobile profile' : 'Not reported',
    ali_grade: summary.grade || '—',
    performance_score: summary.performance !== null && summary.performance !== undefined && summary.performance !== '' && Number.isFinite(Number(summary.performance)) ? Math.round(Number(summary.performance)) : null,
    structure_score: summary.structure !== null && summary.structure !== undefined && summary.structure !== '' && Number.isFinite(Number(summary.structure)) ? Math.round(Number(summary.structure)) : null,
    lcp_ms: metrics.lcpMs !== null && metrics.lcpMs !== undefined && metrics.lcpMs !== '' && Number.isFinite(Number(metrics.lcpMs)) ? Math.round(Number(metrics.lcpMs)) : null,
    tbt_ms: metrics.tbtMs !== null && metrics.tbtMs !== undefined && metrics.tbtMs !== '' && Number.isFinite(Number(metrics.tbtMs)) ? Math.round(Number(metrics.tbtMs)) : null,
    cls_score: metrics.cls !== null && metrics.cls !== undefined && metrics.cls !== '' && Number.isFinite(Number(metrics.cls)) ? Number(metrics.cls) : null,
    fcp_ms: metrics.fcpMs !== null && metrics.fcpMs !== undefined && metrics.fcpMs !== '' && Number.isFinite(Number(metrics.fcpMs)) ? Math.round(Number(metrics.fcpMs)) : null,
    speed_index_ms: metrics.speedIndexMs !== null && metrics.speedIndexMs !== undefined && metrics.speedIndexMs !== '' && Number.isFinite(Number(metrics.speedIndexMs)) ? Math.round(Number(metrics.speedIndexMs)) : null,
    ttfb_ms: metrics.ttfbMs !== null && metrics.ttfbMs !== undefined && metrics.ttfbMs !== '' && Number.isFinite(Number(metrics.ttfbMs)) ? Math.round(Number(metrics.ttfbMs)) : null,
    total_page_bytes: lighthouseResult.pageWeightBytes !== null && lighthouseResult.pageWeightBytes !== undefined && lighthouseResult.pageWeightBytes !== '' && Number.isFinite(Number(lighthouseResult.pageWeightBytes)) ? Math.round(Number(lighthouseResult.pageWeightBytes)) : null,
    total_requests: lighthouseResult.requestCount !== null && lighthouseResult.requestCount !== undefined && lighthouseResult.requestCount !== '' && Number.isFinite(Number(lighthouseResult.requestCount)) ? Math.round(Number(lighthouseResult.requestCount)) : null,
    issues_json: lighthouseResult.opportunities || [],
    structure_audits_json: lighthouseResult.auditList || [],
    waterfall_json: lighthouseResult.resourceDetails || [],
    isp_hop_telemetry_json: null,
    speed_visualization_json: null,
    summary_json: summary,
    full_report_json: result.fullReport,
    africa_latency_json: result.africaLatency,
    completed_at: new Date().toISOString()
  };
  const { error: reportError } = await supabase.from('scans').upsert(scanRow, { onConflict: 'scan_job_id' });
  if (reportError) console.warn('[scan-worker] report materialization failed:', reportError.message);
}

async function processQueue() {
  if (busy || !supabase) return;
  busy = true;
  try {
    const { data: jobs, error } = await supabase.rpc('claim_next_scan_job');
    if (error) throw error;
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    if (!job) return;
    lastJobAt = Date.now();
    try {
      await executeJob(job);
    } catch (error) {
      const message = /timed out/i.test(String(error?.message)) ? 'Timed out while testing the website.' : /unreachable|ENOTFOUND|hostname could not be resolved/i.test(String(error?.message)) ? 'Site unreachable. Check that the public URL is correct.' : 'The scan could not be completed. Please try again later.';
      await supabase.from('scan_jobs').update({
        status: 'failed', stage: 'failed', progress: 100, error_message: message,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('id', job.id);
      console.warn('[scan-worker] job failed:', job.id, String(error?.message || error).slice(0, 300));
    }
  } catch (error) {
    console.error('[scan-worker] queue poll failed:', String(error?.message || error).slice(0, 300));
  } finally {
    busy = false;
  }
}

app.get('/healthz', (_req, res) => res.json({ ok: true, busy, lastJobAt, queueCap: MAX_QUEUE }));
app.use('/internal', (req, res, next) => authorized(req) ? next() : res.status(401).json({ error: 'Unauthorized' }));

app.post('/internal/jobs', async (req, res) => {
  if (!supabase || !IP_HASH_SECRET) return res.status(503).json({ error: 'Scan worker is not configured.' });
  const { url, device = 'mobile', turnstileVerified = false } = req.body || {};
  if (!['mobile', 'desktop'].includes(device)) return res.status(400).json({ error: 'Invalid device.' });
  let normalized;
  try { normalized = await validatePublicUrl(url); } catch (e) { return res.status(400).json({ error: e.message }); }
  const user = await userFromRequest(req);
  const apiKey = String(req.headers['x-api-key'] || '');
  const keyRecord = apiKey ? await validateApiKey(apiKey) : null;
  if (apiKey && !keyRecord) return res.status(401).json({ error: 'Invalid API key.' });
  if (!user && !keyRecord && turnstileVerified !== true) return res.status(403).json({ error: 'Bot verification is required.' });
  const ipHash = user || keyRecord ? null : hashIp(clientIp(req));
  const endpoint = keyRecord ? 'api-lighthouse' : 'scan';
  if (keyRecord) {
    const keyLimitHash = hashIp('api-key:' + keyRecord.id);
    const { data: allowed, error } = await supabase.rpc('check_scan_rate_limit', {
      p_ip_hash: keyLimitHash, p_endpoint: endpoint, p_max_requests: Math.max(1, Number(keyRecord.requests_per_hour) || 60), p_window_minutes: 60
    });
    if (error) return res.status(503).json({ error: 'Rate-limit service is temporarily unavailable.' });
    if (allowed !== true) return res.status(429).json({ error: 'API rate limit reached.' });
    await supabase.from('scan_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRecord.id);
  }
  if (!user && !keyRecord) {
    const { data: allowed, error } = await supabase.rpc('check_scan_rate_limit', {
      p_ip_hash: ipHash, p_endpoint: endpoint, p_max_requests: 3, p_window_minutes: 60
    });
    if (error) return res.status(503).json({ error: 'Rate-limit service is temporarily unavailable.' });
    if (allowed !== true) return res.status(429).json({ error: 'Free scan limit reached. Please try again in an hour or sign in.' });
  }
  if (user) {
    const { data: allowed, error } = await supabase.rpc('check_scan_rate_limit', {
      p_ip_hash: hashIp('user:' + user.id), p_endpoint: 'user', p_max_requests: 20, p_window_minutes: 60
    });
    if (error) return res.status(503).json({ error: 'Rate-limit service is temporarily unavailable.' });
    if (allowed !== true) return res.status(429).json({ error: 'Scan limit reached. Please try again later.' });
  }
  const cacheSince = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  let cacheQuery = supabase.from('scan_jobs').select('id,public_id,status,stage,progress,created_at')
    .eq('url', normalized).eq('device', device).eq('status', 'completed').eq('result->summary->>runCount', String(user || keyRecord ? 3 : 1)).gte('created_at', cacheSince);
  cacheQuery = user || keyRecord ? cacheQuery.eq('user_id', user?.id || keyRecord.user_id) : cacheQuery.is('user_id', null);
  const { data: cached } = await cacheQuery.order('completed_at', { ascending: false }).limit(1).maybeSingle();
  if (cached) return res.status(200).json({ jobId: cached.id, reportId: cached.public_id, queuePosition: 0, cacheHit: true });
  let activeQuery = supabase.from('scan_jobs').select('id,public_id,created_at').eq('url', normalized).eq('device', device).in('status', ['queued','processing']);
  activeQuery = user || keyRecord ? activeQuery.eq('user_id', user?.id || keyRecord.user_id) : activeQuery.is('user_id', null);
  const { data: activeJob } = await activeQuery.order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (activeJob) {
    const { count: ahead } = await supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).in('status',['queued','processing']).lt('created_at',activeJob.created_at);
    return res.status(202).json({ jobId: activeJob.id, reportId: activeJob.public_id, queuePosition: (ahead || 0) + 1, cacheHit: false, reusedActiveJob: true });
  }
  const { data: jobRows, error } = await supabase.rpc('enqueue_scan_job', {
    p_url: normalized, p_device: device, p_user_id: user?.id || keyRecord?.user_id || null,
    p_ip_hash: ipHash, p_max_queue: MAX_QUEUE
  });
  if (error) {
    if (String(error.message || '').includes('SCAN_QUEUE_FULL')) return res.status(429).json({ error: 'The scan queue is full right now. Please try again shortly.' });
    console.error('[scan-worker] enqueue failed:', String(error.message || error).slice(0,200));
    return res.status(503).json({ error: 'Unable to queue the scan.' });
  }
  const job = Array.isArray(jobRows) ? jobRows[0] : jobRows;
  if (!job) return res.status(503).json({ error: 'Unable to queue the scan.' });
  const { count: ahead } = await supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).in('status',['queued','processing']).lt('created_at',job.created_at);
  return res.status(202).json({ jobId: job.id, reportId: job.public_id, queuePosition: (ahead || 0) + 1, cacheHit: false });
});

app.get('/internal/jobs/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Worker is not configured.' });
  const job = await findJob(String(req.params.id).slice(0, 80));
  if (!job) return res.status(404).json({ error: 'Scan not found.' });
  const user = await userFromRequest(req);
  const rawApiKey = String(req.headers['x-api-key'] || '');
  const apiKeyRecord = rawApiKey ? await validateApiKey(rawApiKey) : null;
  if (rawApiKey && !apiKeyRecord) return res.status(401).json({ error: 'Invalid API key.' });
  let unlocked = Boolean(apiKeyRecord && apiKeyRecord.user_id === job.user_id);
  if (user && job.status === 'completed') {
    if (!job.user_id) {
      const { data } = await supabase.from('scan_jobs').update({ user_id: user.id }).eq('id', job.id).is('user_id', null).select('*').maybeSingle();
      if (data) Object.assign(job, data);
      await supabase.from('scans').update({ user_id: user.id }).eq('scan_job_id', job.id).is('user_id', null);
    }
    unlocked = job.user_id === user.id;
  }
  const screenshotUrl = await signedScreenshot(job);
  const payload = publicSummary(job, screenshotUrl);
  payload.locked = !unlocked;
  if (unlocked) payload.fullReport = job.result?.fullReport || null;
  if (job.status === 'failed') payload.error = job.error_message || 'Scan failed.';
  return res.json(payload);
});

app.get('/internal/health/queue', async (_req, res) => {
  const { count: queued } = await supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).eq('status','queued');
  const { count: processing } = await supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).eq('status','processing');
  const oldestCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: stuck } = await supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).eq('status','processing').lt('updated_at', oldestCutoff);
  if ((stuck || 0) > 0) console.error('[ALERT] scan worker has a stuck job', { stuck, queued, processing });
  return res.json({ queued: queued || 0, processing: processing || 0, stuck: stuck || 0, queueCap: MAX_QUEUE, retentionDays: RETENTION_DAYS });
});

async function retentionSweep() {
  if (!supabase) return;
  const rateCutoff = new Date(Date.now() - 2 * 86400000).toISOString();
  await supabase.from('scan_rate_limits').delete().lt('window_started_at', rateCutoff);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  const { data: expired } = await supabase.from('scan_jobs').select('id,screenshot').is('user_id', null).lt('created_at', cutoff).limit(100);
  for (const job of expired || []) {
    if (job.screenshot) await supabase.storage.from('scan-screenshots').remove([job.screenshot]).catch(() => {});
    await supabase.from('scan_jobs').delete().eq('id', job.id).is('user_id', null);
  }
}
setInterval(() => { processQueue(); }, 2000).unref();
setInterval(async () => {
  if (!supabase) return;
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: stuck } = await supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).eq('status','processing').lt('updated_at', cutoff);
  const { count: queued } = await supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).eq('status','queued');
  if ((stuck || 0) > 0 || ((queued || 0) > 0 && Date.now() - lastJobAt > 10 * 60 * 1000)) {
    const alert = { stuck: stuck || 0, queued: queued || 0, busy, lastJobAt };
    console.error('[ALERT] scan queue stalled', alert);
    if (process.env.SCAN_ALERT_WEBHOOK_URL && Date.now() - lastAlertAt > 10 * 60 * 1000) {
      lastAlertAt = Date.now();
      fetch(process.env.SCAN_ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'AfricaLatency scan queue stalled', ...alert }), signal: AbortSignal.timeout(5000) }).catch(() => {});
    }
  }
}, 60000).unref();
setInterval(() => { retentionSweep().catch(e => console.warn('[scan-worker] retention sweep failed', e.message)); }, 60 * 60 * 1000).unref();
app.listen(PORT, '0.0.0.0', () => console.log(`AfricaLatency Lighthouse worker listening on ${PORT}; concurrency=1`));
