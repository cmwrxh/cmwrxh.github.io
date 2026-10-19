import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://api.globalping.io/v1';
const TARGET = 'https://africalatency.dev/';
const country = String(process.env.COUNTRY || '').toUpperCase();
const allowed = new Set(['KE', 'ZA', 'NG', 'GH', 'EG', 'UG', 'TZ']);
const probeLimit = Number(process.env.PROBE_LIMIT || 3);
if (!allowed.has(country)) throw new Error('COUNTRY must be one of: ' + [...allowed].join(', '));
if (![3, 5].includes(probeLimit)) throw new Error('PROBE_LIMIT must be 3 or 5.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const requestedAt = new Date().toISOString();
const outputDir = 'measurement-output';
await mkdir(outputDir, { recursive: true });
const filename = `${outputDir}/measurement-${country}-${requestedAt.replaceAll(':', '-')}.json`;

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'user-agent': 'AfricaLatency-SampleReport-Research/1.0 (manual GitHub Actions run)', accept: 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Globalping API HTTP ${response.status}: ${JSON.stringify(body).slice(0, 800)}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { body, headers: Object.fromEntries(response.headers.entries()) };
}

let artifact;
try {
  // Unauthenticated public API only: no tokens, account credits, or GitHub secrets.
  const limitCheck = await getJson(API + '/limits');
  const request = { type: 'http', target: TARGET, locations: [{ country, limit: probeLimit }] };
  const created = await getJson(API + '/measurements', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request)
  });
  const measurementId = created.body.id;
  if (!measurementId) throw new Error('Globalping response did not include a measurement ID.');

  let result;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(1000); // Poll at 1 request/second, below the documented 2/sec limit.
    result = (await getJson(`${API}/measurements/${encodeURIComponent(measurementId)}`)).body;
    if (result.status && !['in-progress', 'in_progress'].includes(result.status)) break;
  }
  if (!result || ['in-progress', 'in_progress'].includes(result.status)) {
    throw new Error(`Measurement ${measurementId} timed out. Check the Globalping result before retrying.`);
  }

  const entries = Array.isArray(result.results) ? result.results : [];
  const probes = entries.map(entry => {
    const probe = entry.probe || {};
    const detail = entry.result || {};
    return {
      probe: {
        continent: probe.continent ?? null,
        country: probe.country ?? null,
        region: probe.region ?? null,
        city: probe.city ?? null,
        network: probe.network ?? null,
        asn: probe.asn ?? null,
        tags: probe.tags ?? null
      },
      status: entry.status ?? detail.status ?? null,
      timings: detail.timings ?? null,
      statusCode: detail.statusCode ?? null,
      error: entry.error ?? detail.error ?? null,
      rawResult: detail
    };
  });
  artifact = {
    schemaVersion: 1,
    provider: 'Globalping',
    requestedAt,
    completedAt: new Date().toISOString(),
    target: TARGET,
    country,
    requestedProbeLimit: probeLimit,
    measurementId,
    measurementUrl: `https://globalping.io/measurement/${measurementId}`,
    measurementType: 'http',
    status: result.status ?? null,
    probesCount: result.probesCount ?? probes.length,
    successfulProbeCount: probes.filter(p => p.status === 'finished' || p.status === 'success' || (p.status === null && p.timings)).length,
    rateLimitSnapshot: limitCheck.body,
    request,
    probes,
    rawResponse: result,
    notes: [
      'One measurement only; this is not five time-separated runs.',
      'Probe selection is dynamic and may change between runs.',
      'Network and ASN are included only when Globalping returns them.',
      'HTTP timings are separate from Lighthouse page-quality scores.',
      'RIPE Atlas is not queried or combined with these results.'
    ]
  };
  await writeFile(filename, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ artifact: filename, country, measurementId, status: artifact.status, probesCount: artifact.probesCount, successfulProbeCount: artifact.successfulProbeCount, measurementUrl: artifact.measurementUrl }, null, 2));
} catch (error) {
  artifact = {
    schemaVersion: 1,
    provider: 'Globalping',
    requestedAt,
    target: TARGET,
    country,
    requestedProbeLimit: probeLimit,
    status: 'unavailable-or-failed',
    reason: error.message,
    httpStatus: error.status ?? null,
    apiError: error.body ?? null,
    notes: ['No substitute or fabricated result is generated. Investigate the error before retrying.']
  };
  await writeFile(filename, JSON.stringify(artifact, null, 2));
  throw error;
}
