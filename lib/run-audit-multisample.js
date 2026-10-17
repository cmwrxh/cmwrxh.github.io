// Isolated Step 1 audit runner. Do not connect to the checkout/webhook until
// rate-limit and execution-duration tests are completed.
import { mapWithConcurrency, summarizeSamples } from './audit-sampling.js';

const GP_API_BASE = 'https://api.globalping.io/v1';
const GP_TOKEN = process.env.GLOBALPING_API_TOKEN || process.env.GP_API_TOKEN;
const SAMPLE_COUNT = 3;
const MAX_CONCURRENT_MEASUREMENTS = 2;
const POLL_INTERVAL_MS = 600;
const MEASUREMENT_TIMEOUT_MS = 25000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function gpFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(GP_TOKEN ? { Authorization: `Bearer ${GP_TOKEN}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${GP_API_BASE}${path}`, { ...options, headers });
}

async function runHttpSample(location, target, sampleNumber) {
  const createResponse = await gpFetch('/measurements', {
    method: 'POST',
    body: JSON.stringify({
      type: 'http',
      target,
      locations: [{ country: location.country, limit: 1 }],
      measurementOptions: { request: { method: 'GET' }, protocol: 'https' },
    }),
  });
  const created = await createResponse.json().catch(() => ({}));
  if (createResponse.status === 429) throw new Error('Globalping rate limit reached');
  if (!createResponse.ok || !created.id) {
    throw new Error(created?.error?.message || `Globalping create failed (HTTP ${createResponse.status})`);
  }

  const started = Date.now();
  while (Date.now() - started < MEASUREMENT_TIMEOUT_MS) {
    const response = await gpFetch(`/measurements/${encodeURIComponent(created.id)}`, { method: 'GET' });
    if (response.status === 429) throw new Error('Globalping result polling rate limit reached');
    if (!response.ok) throw new Error(`Globalping result fetch failed (HTTP ${response.status})`);
    const data = await response.json().catch(() => ({}));
    if (data.status && data.status !== 'in-progress') {
      const probeResult = data?.results?.[0]?.result;
      const timings = probeResult?.timings || {};
      const hasMetric = ['dns', 'tls', 'firstByte', 'total'].some((key) => Number.isFinite(timings[key]));
      if (!probeResult || !hasMetric || probeResult.status === 'error') {
        throw new Error(probeResult?.error || probeResult?.rawOutput || 'Probe returned no usable HTTP timings');
      }
      return {
        sampleNumber,
        measurementId: created.id,
        status: data.status,
        dnsMs: Number.isFinite(timings.dns) ? timings.dns : null,
        tlsMs: Number.isFinite(timings.tls) ? timings.tls : null,
        ttfbMs: Number.isFinite(timings.firstByte) ? timings.firstByte : null,
        totalMs: Number.isFinite(timings.total) ? timings.total : null,
        statusCode: Number.isFinite(probeResult.statusCode) ? probeResult.statusCode : null,
      };
    }
    // Globalping documents no more than 2 result requests/second/measurement.
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for Globalping probe');
}

export async function runAuditMultiSample(domain, locations, options = {}) {
  if (!GP_TOKEN) throw new Error('Globalping token is not configured for the audit runner.');
  const sampleCount = Number.isInteger(options.sampleCount)
    ? Math.max(3, Math.min(options.sampleCount, 5))
    : SAMPLE_COUNT;
  const concurrency = Number.isInteger(options.concurrency)
    ? Math.max(1, Math.min(options.concurrency, MAX_CONCURRENT_MEASUREMENTS))
    : MAX_CONCURRENT_MEASUREMENTS;
  const target = String(domain).replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target)) throw new Error('Invalid audit target domain.');

  // This is 31 countries × 3 samples = 93 Globalping measurement tests by default.
  // At the documented 250 unauthenticated / 500 authenticated tests per hour,
  // multiple concurrent audits can exhaust quota. This runner limits concurrency,
  // preserves per-sample failures and does not silently retry or multiply tests.
  const jobs = locations.flatMap((location) =>
    Array.from({ length: sampleCount }, (_, index) => ({ location, sampleNumber: index + 1 }))
  );
  const raw = await mapWithConcurrency(jobs, concurrency, async (job) => {
    try {
      return { locationCode: job.location.country, locationLabel: job.location.label, ...(await runHttpSample(job.location, target, job.sampleNumber)) };
    } catch (error) {
      return { locationCode: job.location.country, locationLabel: job.location.label, sampleNumber: job.sampleNumber, error: error instanceof Error ? error.message : 'measurement failed' };
    }
  });

  const perLocation = locations.map((location) => {
    const samples = raw.filter((row) => row.locationCode === location.country);
    const successful = samples.filter((row) => !row.error);
    return {
      location: location.label,
      countryCode: location.country,
      samples,
      summary: summarizeSamples(samples),
      successfulSamples: successful.length,
      failedSamples: samples.length - successful.length,
    };
  });
  const successes = raw.filter((row) => !row.error).length;
  return {
    domain: target,
    generatedAt: new Date().toISOString(),
    methodology: { tool: 'Globalping HTTP measurements', requestedSamplesPerCountry: sampleCount, maxConcurrentMeasurements: concurrency, totalMeasurementTestsRequested: jobs.length, successfulMeasurementTests: successes, failedMeasurementTests: jobs.length - successes },
    perLocation,
  };
}
