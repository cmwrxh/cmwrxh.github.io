import crypto from 'node:crypto';

const base = String(process.env.BENCHMARK_WORKER_URL || '').replace(/\/$/, '');
const token = String(process.env.SCAN_INTERNAL_TOKEN || '');
const urls = String(process.env.BENCHMARK_URLS || 'https://example.com,https://www.iana.org/domains/reserved,https://www.cloudflare.com')
  .split(',').map((value) => value.trim()).filter(Boolean);
const timeoutMs = Math.max(60000, Number(process.env.BENCHMARK_TIMEOUT_MS) || 300000);

if (!base || !token) {
  throw new Error('Set BENCHMARK_WORKER_URL and SCAN_INTERNAL_TOKEN in the local environment.');
}

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Worker returned HTTP ' + response.status + ': ' + (payload.error || 'request failed'));
  return payload;
}

const results = [];
for (const url of urls) {
  const started = Date.now();
  const job = await request('/internal/jobs', {
    method: 'POST',
    body: JSON.stringify({
      url,
      device: 'mobile',
      turnstileVerified: true,
      firstGuestScan: true,
      guestProofHash: crypto.randomBytes(32).toString('hex'),
      deviceId: crypto.randomBytes(16).toString('hex')
    })
  });
  if (!job.jobId) throw new Error('Worker did not return a job ID for ' + url);
  const deadline = started + timeoutMs;
  let status;
  while (Date.now() < deadline) {
    status = await request('/internal/jobs/' + encodeURIComponent(job.jobId));
    if (status.status === 'completed' || status.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!status || status.status !== 'completed') {
    throw new Error('Benchmark scan did not complete for ' + url + ': ' + (status?.status || 'timeout'));
  }
  results.push({
    url,
    elapsedMs: Date.now() - started,
    performance: status.summary?.performance ?? null,
    lcpMs: status.summary?.metrics?.lcpMs ?? null,
    measuredCountries: status.africaLatencySummary?.measuredCountries ?? null,
    requestedCountries: status.africaLatencySummary?.requestedCountries ?? null
  });
}

const sorted = results.map((item) => item.elapsedMs).sort((a, b) => a - b);
const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? null;
const p95 = sorted[Math.ceil((sorted.length - 1) * 0.95)] ?? null;
process.stdout.write(JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: results.length,
  p50ElapsedMs: p50,
  p95ElapsedMs: p95,
  results
}, null, 2) + '\n');
