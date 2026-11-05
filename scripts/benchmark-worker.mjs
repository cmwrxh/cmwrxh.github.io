const base = String(process.env.BENCHMARK_WORKER_URL || '').replace(/\/$/, '');
const token = String(process.env.SCAN_INTERNAL_TOKEN || '');
const apiKey = String(process.env.BENCHMARK_API_KEY || '');
const urls = String(process.env.BENCHMARK_URLS || 'https://example.com,https://www.iana.org/domains/reserved,https://www.cloudflare.com')
  .split(',').map((value) => value.trim()).filter(Boolean);
const repetitions = Math.max(1, Math.min(100, Number(process.env.BENCHMARK_REPETITIONS) || 10));
const timeoutMs = Math.max(60000, Number(process.env.BENCHMARK_TIMEOUT_MS) || 300000);
if (!base || !token || !apiKey) throw new Error('Set BENCHMARK_WORKER_URL, SCAN_INTERNAL_TOKEN and BENCHMARK_API_KEY in the local environment.');

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'x-api-key': apiKey,
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
for (let repetition = 1; repetition <= repetitions; repetition++) {
  for (const url of urls) {
    const started = Date.now();
    const job = await request('/internal/jobs', {
      method: 'POST',
      body: JSON.stringify({ url, device: 'mobile' })
    });
    if (!job.jobId) throw new Error('Worker did not return a job ID for ' + url);
    const deadline = started + timeoutMs;
    let status;
    while (Date.now() < deadline) {
      status = await request('/internal/jobs/' + encodeURIComponent(job.jobId));
      if (status.status === 'completed' || status.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!status || status.status !== 'completed') throw new Error('Benchmark scan did not complete for ' + url + ': ' + (status?.status || 'timeout'));
    results.push({
      repetition, url, elapsedMs: Date.now() - started,
      performance: status.summary?.performance ?? null,
      lcpMs: status.summary?.metrics?.lcpMs ?? null,
      measuredCountries: status.africaLatencySummary?.measuredCountries ?? null,
      requestedCountries: status.africaLatencySummary?.requestedCountries ?? null
    });
  }
}
const sorted = results.map((item) => item.elapsedMs).sort((a, b) => a - b);
const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? null;
const p95 = sorted[Math.ceil((sorted.length - 1) * 0.95)] ?? null;
process.stdout.write(JSON.stringify({
  generatedAt: new Date().toISOString(), count: results.length, repetitions,
  p50ElapsedMs: p50, p95ElapsedMs: p95, results
}, null, 2) + '\n');
