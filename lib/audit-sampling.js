// Step 1 foundation: reusable sample statistics and bounded concurrency.
// This module is intentionally not wired into the live checkout/webhook flow yet.
export function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export function summarizeSamples(samples, metricKeys = ['dnsMs', 'tlsMs', 'ttfbMs', 'totalMs']) {
  const valid = samples.filter((sample) => sample && !sample.error);
  const summary = {
    requestedSamples: samples.length,
    sampleCount: valid.length,
    failureCount: samples.length - valid.length,
  };
  for (const key of metricKeys) {
    const values = valid.map((sample) => sample[key]).filter(Number.isFinite);
    summary[key] = {
      median: median(values),
      p95: percentile(values, 0.95),
      sampleCount: values.length,
    };
  }
  return summary;
}

// Preserves input order in returned results and never runs more than concurrency tasks at once.
export async function mapWithConcurrency(items, concurrency, worker) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new TypeError('concurrency must be a positive integer');
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error: error instanceof Error ? error.message : 'measurement failed' };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}
