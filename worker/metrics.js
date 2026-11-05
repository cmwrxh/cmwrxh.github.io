const counters = {
  scansStarted: 0,
  scansCompleted: 0,
  scansFailed: 0,
  retriesScheduled: 0,
  queueWaitMs: { count: 0, total: 0, max: 0 },
  stages: Object.create(null),
  probes: Object.create(null),
  dbQueries: { count: 0, totalMs: 0, maxMs: 0 }
};

function boundedName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'unknown';
}
export function recordScanStarted(queueWaitMs) {
  counters.scansStarted++;
  const value = Math.max(0, Number(queueWaitMs) || 0);
  counters.queueWaitMs.count++;
  counters.queueWaitMs.total += value;
  counters.queueWaitMs.max = Math.max(counters.queueWaitMs.max, value);
}
export function recordScanCompleted() { counters.scansCompleted++; }
export function recordScanFailed() { counters.scansFailed++; }
export function recordRetryScheduled() { counters.retriesScheduled++; }
export function recordStage(name, elapsedMs) {
  const key = boundedName(name);
  const value = Math.max(0, Number(elapsedMs) || 0);
  const item = counters.stages[key] || (counters.stages[key] = { count: 0, totalMs: 0, maxMs: 0 });
  item.count++;
  item.totalMs += value;
  item.maxMs = Math.max(item.maxMs, value);
}
export function recordProbe(countryCode, status) {
  const key = boundedName(countryCode).toUpperCase();
  const item = counters.probes[key] || (counters.probes[key] = { measured: 0, unavailable: 0 });
  if (status === 'measured') item.measured++;
  else item.unavailable++;
}
export function recordDbQuery(elapsedMs) {
  const value = Math.max(0, Number(elapsedMs) || 0);
  counters.dbQueries.count++;
  counters.dbQueries.totalMs += value;
  counters.dbQueries.maxMs = Math.max(counters.dbQueries.maxMs, value);
}
export function metricsSnapshot() {
  const memory = process.memoryUsage();
  return {
    generatedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    process: {
      pid: process.pid,
      cpuUserMicros: process.cpuUsage().user,
      cpuSystemMicros: process.cpuUsage().system,
      memoryBytes: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, external: memory.external }
    },
    counters: JSON.parse(JSON.stringify(counters))
  };
}
