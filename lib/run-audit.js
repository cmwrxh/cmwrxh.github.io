// Runs the fixed Africa Latency Audit measurement set through Globalping.
// Results are polled until the measurements are complete before the PDF is built.

const PROBE_LOCATIONS = ['Nairobi', 'Lagos', 'Accra', 'Johannesburg'];
const GP_API_BASE = 'https://api.globalping.io/v1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function globalpingFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(process.env.GLOBALPING_API_TOKEN
      ? { Authorization: `Bearer ${process.env.GLOBALPING_API_TOKEN}` }
      : {}),
    ...(options.headers || {}),
  };
  return fetch(`${GP_API_BASE}${path}`, { ...options, headers });
}

async function runProbe(location, target) {
  const createResponse = await globalpingFetch('/measurements', {
    method: 'POST',
    body: JSON.stringify({
      type: 'http',
      target,
      locations: [{ city: location, limit: 1 }],
      measurementOptions: {
        request: { method: 'GET' },
        protocol: 'HTTPS',
      },
    }),
  });

  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !created.id) {
    throw new Error(
      created?.error?.message || `Globalping request failed for ${location}: ${createResponse.status}`
    );
  }

  const started = Date.now();
  const timeoutMs = 30000;
  while (Date.now() - started < timeoutMs) {
    const resultResponse = await globalpingFetch(`/measurements/${created.id}`, { method: 'GET' });
    const result = await resultResponse.json().catch(() => ({}));

    if (!resultResponse.ok) {
      throw new Error(`Could not fetch Globalping result for ${location}: ${resultResponse.status}`);
    }

    if (result.status && result.status !== 'in-progress') {
      return { location, raw: result };
    }

    await sleep(1000);
  }

  throw new Error(`Globalping measurement timed out for ${location}.`);
}

function summarizeTiming(rawResult) {
  const probeResult = rawResult?.results?.[0]?.result;
  const timings = probeResult?.timings || {};

  return {
    dnsMs: timings.dns ?? null,
    tlsMs: timings.tls ?? null,
    ttfbMs: timings.firstByte ?? null,
    totalMs: timings.total ?? null,
    statusCode: probeResult?.statusCode ?? null,
  };
}

export async function runAudit(domain) {
  const target = domain.replace(/^https?:\/\//i, '').split('/')[0];

  const results = await Promise.allSettled(
    PROBE_LOCATIONS.map((location) => runProbe(location, target))
  );

  const perLocation = results.map((result, index) => {
    const location = PROBE_LOCATIONS[index];
    if (result.status === 'fulfilled') {
      return { location, ...summarizeTiming(result.value.raw) };
    }
    return {
      location,
      error: result.reason?.message || 'measurement failed',
    };
  });

  const successful = perLocation.filter((item) => Number.isFinite(item.ttfbMs));
  const worstTtfb = successful.length
    ? successful.reduce((a, b) => (a.ttfbMs > b.ttfbMs ? a : b))
    : null;
  const bestTtfb = successful.length
    ? successful.reduce((a, b) => (a.ttfbMs < b.ttfbMs ? a : b))
    : null;

  if (!successful.length) {
    throw new Error('No African probe returned a usable HTTP timing result.');
  }

  return {
    domain: target,
    generatedAt: new Date().toISOString(),
    perLocation,
    summary: {
      worstLocation: worstTtfb?.location ?? null,
      worstTtfbMs: worstTtfb?.ttfbMs ?? null,
      bestLocation: bestTtfb?.location ?? null,
      bestTtfbMs: bestTtfb?.ttfbMs ?? null,
    },
  };
}
