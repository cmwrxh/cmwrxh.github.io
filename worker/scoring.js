export function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * AfricaLatency Structure score (0-100):
 * 40% Lighthouse Best Practices, 35% SEO, 25% a key accessibility audit
 * subset: color-contrast, image-alt, label, link-name, button-name,
 * document-title, html-has-lang, meta-viewport. Each audit is weighted by
 * Lighthouse's numeric weight when present; missing/not-applicable audits
 * are omitted and the remaining audit weights are renormalized. If no
 * key accessibility audits are available, use category accessibility score
 * with the other categories renormalized.
 */
export function structureScore(categories, audits = {}) {
  const best = categories?.['best-practices']?.score;
  const seo = categories?.seo?.score;
  const weights = { 'best-practices': 0.40, seo: 0.35, accessibility: 0.25 };
  const accessIds = [
    'color-contrast', 'image-alt', 'label', 'link-name',
    'button-name', 'document-title', 'html-has-lang', 'meta-viewport'
  ];
  const access = [];
  for (const id of accessIds) {
    const audit = audits[id];
    if (!audit || audit.scoreDisplayMode === 'notApplicable' || audit.score == null) continue;
    const weight = Number(audit.weight) > 0 ? Number(audit.weight) : 1;
    access.push({ score: Number(audit.score) * 100, weight });
  }
  const accessScore = access.length
    ? access.reduce((sum, item) => sum + item.score * item.weight, 0) / access.reduce((sum, item) => sum + item.weight, 0)
    : (categories?.accessibility?.score == null ? null : Number(categories.accessibility.score) * 100);
  const parts = [
    { key: 'best-practices', value: best == null ? null : Number(best) * 100, weight: weights['best-practices'] },
    { key: 'seo', value: seo == null ? null : Number(seo) * 100, weight: weights.seo },
    { key: 'accessibility', value: accessScore, weight: weights.accessibility }
  ].filter(item => Number.isFinite(item.value));
  if (!parts.length) return null;
  const weightTotal = parts.reduce((sum, item) => sum + item.weight, 0);
  return clampScore(parts.reduce((sum, item) => sum + item.value * item.weight, 0) / weightTotal);
}

export function overallGrade(performance, structure) {
  if (!Number.isFinite(performance) || !Number.isFinite(structure)) return null;
  const score = performance * 0.70 + structure * 0.30;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function summarizeRun(lhr) {
  const audits = lhr?.audits || {};
  const categories = lhr?.categories || {};
  const performance = categories.performance?.score == null ? null : clampScore(categories.performance.score * 100);
  const structure = structureScore(categories, audits);
  const ms = id => Number.isFinite(Number(audits[id]?.numericValue)) ? Number(audits[id].numericValue) : null;
  const score = id => categories[id]?.score == null ? null : clampScore(categories[id].score * 100);
  const opportunities = Object.values(audits)
    .filter(a => a && (a.details?.type === 'opportunity' || a.details?.type === 'table') && a.score != null && a.score < 1)
    .sort((a, b) => (Number(b.details?.overallSavingsMs) || 0) - (Number(a.details?.overallSavingsMs) || 0))
    .slice(0, 8)
    .map(a => ({ id: a.id, title: String(a.title || a.id).slice(0, 180), description: String(a.description || '').slice(0, 500), savingsMs: Number(a.details?.overallSavingsMs) || null }));
  const screenshot = audits['final-screenshot']?.details?.data || null;
  const requests = audits['network-requests']?.details?.items || [];
  const pageWeight = requests.reduce((sum, r) => sum + (Number(r.transferSize) || 0), 0);
  const ua = String(lhr.userAgent || lhr.environment?.networkUserAgent || '');
  const chromeVersion = (ua.match(/Chrome\\/([0-9.]+)/) || [])[1] || null;
  return {
    lighthouseVersion: lhr.lighthouseVersion || null,
    chromeVersion,
    testedUrl: lhr.finalDisplayedUrl || lhr.requestedUrl || null,
    performance, structure, grade: overallGrade(performance, structure),
    scores: { accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') },
    metrics: {
      lcpMs: ms('largest-contentful-paint'),
      fcpMs: ms('first-contentful-paint'),
      tbtMs: ms('total-blocking-time'),
      cls: ms('cumulative-layout-shift'),
      speedIndexMs: ms('speed-index'),
      ttfbMs: ms('server-response-time')
    },
    requestCount: requests.length || null,
    pageWeightBytes: pageWeight || null,
    opportunities,
    screenshotDataUrl: typeof screenshot === 'string' && screenshot.startsWith('data:image/') ? screenshot : null
  };
}
