const state = {
  rum: { acceptedEvents: 0, rejectedRequests: 0 },
  crawler: { succeeded: 0, failed: 0 }
};
export function recordRumAccepted(count) { state.rum.acceptedEvents += Math.max(0, Number(count) || 0); }
export function recordRumRejected() { state.rum.rejectedRequests++; }
export function recordCrawlerAudit(success) { state.crawler[success ? 'succeeded' : 'failed']++; }
export function serviceMetricsSnapshot() {
  return { generatedAt: new Date().toISOString(), counters: JSON.parse(JSON.stringify(state)) };
}
