import { runGlobalping } from './globalping.js';

// Keep the operational policy in code so the provider order, minimum and
// timeouts are reviewable without changing credentials or deployment secrets.
export const PROBE_POLICY = Object.freeze({
  minimumProbesPerCountry: 3,
  preferredProviderOrder: ['globalping'],
  providerTimeoutMs: { globalping: 9000 }
});

const adapters = new Map([['globalping', runGlobalping]]);

// Future adapters (RIPE Atlas, owned agents, Speedchecker) implement the same
// runMeasurement argument/result contract and can be registered without
// changing scanner/audit interpretation code.
export function registerProbeProvider(name, adapter) {
  if (!/^[a-z0-9-]+$/.test(name) || typeof adapter !== 'function') throw new TypeError('Invalid probe provider adapter.');
  adapters.set(name, adapter);
}

export function selectDiverseResults(results, minimum = 1) {
  const remaining = [...results];
  const selected = [];
  const seenAsn = new Set();
  const seenNetworks = new Set();
  while (remaining.length && selected.length < Math.max(1, minimum)) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const asn = item.asn == null ? '' : String(item.asn);
      const network = String(item.network_name || '').toLowerCase();
      const score = (asn && !seenAsn.has(asn) ? 2 : 0) + (network && !seenNetworks.has(network) ? 1 : 0);
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    if (chosen.asn != null) seenAsn.add(String(chosen.asn));
    if (chosen.network_name) seenNetworks.add(String(chosen.network_name).toLowerCase());
  }
  return selected;
}

export async function runMeasurement({ type, target, location }) {
  const attempts = [];
  for (const provider of PROBE_POLICY.preferredProviderOrder) {
    const adapter = adapters.get(provider);
    if (!adapter) { attempts.push({ provider, reason: 'Provider adapter is not installed.' }); continue; }
    try {
      const response = await adapter({
        type, target, location,
        limit: PROBE_POLICY.minimumProbesPerCountry,
        timeoutMs: PROBE_POLICY.providerTimeoutMs[provider] || 9000
      });
      const normalizedResults = selectDiverseResults(response.normalizedResults || [], PROBE_POLICY.minimumProbesPerCountry);
      if (normalizedResults.length) return { ...response, provider, normalizedResults, attempts };
      attempts.push({ provider, reason: 'Provider returned no completed results.' });
    } catch (error) {
      attempts.push({
        provider,
        status: Number.isInteger(error.status) ? error.status : null,
        reason: error.status === 429 ? 'Provider rate limit or quota reached.' : (error.message || 'Provider failed.')
      });
    }
  }
  const error = new Error(attempts.at(-1)?.reason || 'No configured provider returned a result.');
  error.status = attempts.some(a => a.status === 429) ? 429 : 503;
  error.attempts = attempts;
  throw error;
}
