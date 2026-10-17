const API_BASE = 'https://api.globalping.io/v1';

function probeFetch(path, token, options = {}) {
  return fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function poll(id, token, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await probeFetch(`/measurements/${id}`, token);
    if (!response.ok) {
      const error = new Error(`Globalping result request failed (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (payload.status && payload.status !== 'in-progress') return payload;
    await wait(500);
  }
  const error = new Error('Globalping probe timed out.');
  error.status = 504;
  throw error;
}

export function classifyProbe(probe = {}) {
  const tags = Array.isArray(probe.tags) ? probe.tags.filter(v => typeof v === 'string').slice(0, 30) : [];
  const joined = tags.join(' ').toLowerCase();
  if (/real[-_ ]?user/.test(joined)) return 'real-user';
  if (/mobile|cellular/.test(joined)) return 'mobile';
  if (/datacenter|data[-_ ]?center|colo/.test(joined)) return 'datacenter';
  if (/fixed|static/.test(joined)) return 'fixed';
  return 'unknown';
}

export function normalizeGlobalpingResult(payload, requestedCountry) {
  const items = Array.isArray(payload?.results) ? payload.results : [];
  return items.map(item => {
    const probe = item?.probe || {};
    const result = item?.result || {};
    const country = probe.country || requestedCountry || null;
    const tags = Array.isArray(probe.tags) ? probe.tags.filter(v => typeof v === 'string').slice(0, 30) : [];
    return {
      provider: 'globalping',
      probe_type: classifyProbe(probe),
      country,
      city: probe.city || null,
      asn: Number.isInteger(probe.asn) ? probe.asn : (Number.isInteger(probe.asnNumber) ? probe.asnNumber : null),
      network_name: typeof probe.network === 'string' ? probe.network.slice(0, 180) : null,
      tags,
      timestamp: payload.createdAt || payload.updatedAt || result.timestamp || null,
      metrics: result.timings && typeof result.timings === 'object' ? result.timings : {},
      status: result.status || payload.status || 'unknown',
      raw_provider_payload: item
    };
  });
}

export async function runGlobalping({ type, target, location, limit = 1, timeoutMs = 9000 }) {
  const token = process.env.GP_API_TOKEN;
  if (!token) {
    const error = new Error('Globalping provider is not configured.');
    error.status = 503;
    throw error;
  }
  const response = await probeFetch('/measurements', token, {
    method: 'POST',
    body: JSON.stringify({ type, target, locations: [{ ...location, limit }] })
  });
  if (response.status !== 202 && response.status !== 200) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.error?.message || `Globalping request failed (HTTP ${response.status}).`);
    error.status = response.status;
    error.providerPayload = payload;
    throw error;
  }
  const created = await response.json();
  const payload = created.id ? await poll(created.id, token, timeoutMs) : created;
  return {
    provider: 'globalping',
    rawPayload: payload,
    normalizedResults: normalizeGlobalpingResult(payload, location.country || null)
  };
}
