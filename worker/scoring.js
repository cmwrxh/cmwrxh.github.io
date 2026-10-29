import { buildWaterfall } from './waterfall.js';

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


function numericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
}

export function classifyResource(resource = {}) {
  const type = String(resource.resourceType || '').toLowerCase();
  const mime = String(resource.mimeType || resource.contentType || '').toLowerCase().split(';')[0].trim();
  const url = String(resource.url || '').toLowerCase().split(/[?#]/)[0];
  if (/script|javascript|ecmascript/.test(type) || /javascript|ecmascript/.test(mime) || /\.(?:mjs|cjs|js)$/.test(url)) return 'javascript';
  if (/stylesheet|css/.test(type) || mime === 'text/css' || /\.css$/.test(url)) return 'css';
  if (/font/.test(type) || /font|woff|truetype|opentype/.test(mime) || /\.(?:woff2?|ttf|otf|eot)$/.test(url)) return 'fonts';
  if (/image/.test(type) || mime.startsWith('image/') || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp|ico)$/.test(url)) return 'images';
  if (/document|html/.test(type) || /text\/html|application\/xhtml\+xml/.test(mime) || /\.html?$/.test(url)) return 'htmlOther';
  return 'htmlOther';
}

export function buildRequestAnalysis(resources, options = {}) {
  const rows = Array.isArray(resources) ? resources : [];
  const categories = {
    javascript: { requestCount: 0, transferSizeBytes: 0 },
    images: { requestCount: 0, transferSizeBytes: 0 },
    css: { requestCount: 0, transferSizeBytes: 0 },
    fonts: { requestCount: 0, transferSizeBytes: 0 },
    htmlOther: { requestCount: 0, transferSizeBytes: 0 }
  };
  let measuredBytes = 0;
  for (const resource of rows) {
    const bucket = classifyResource(resource);
    const size = numericValue(resource?.transferSize);
    categories[bucket].requestCount += 1;
    if (size !== null && size >= 0) {
      categories[bucket].transferSizeBytes += size;
      measuredBytes += size;
    }
  }
  const suppliedCount = numericValue(options.requestCount);
  const suppliedBytes = numericValue(options.pageWeightBytes);
  const suppliedLoaded = numericValue(options.fullyLoadedTimeMs);
  return {
    resourceDataAvailable: options.resourceDataAvailable !== undefined ? Boolean(options.resourceDataAvailable) : Array.isArray(resources),
    requestCount: suppliedCount !== null && suppliedCount >= 0 ? suppliedCount : rows.length,
    pageWeightBytes: suppliedBytes !== null && suppliedBytes >= 0 ? suppliedBytes : measuredBytes,
    fullyLoadedTimeMs: suppliedLoaded !== null && suppliedLoaded >= 0 ? suppliedLoaded : null,
    categories,
    classifiedResourceCount: rows.length
  };
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
  const thumbnailItems = audits['screenshot-thumbnails']?.details?.items;
  const filmstripFrames = (Array.isArray(thumbnailItems) ? thumbnailItems : []).slice(0, 10).map((item, index) => ({ timingMs: Number.isFinite(Number(item?.timing)) ? Math.max(0, Math.round(Number(item.timing))) : index, dataUrl: typeof item?.data === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(item.data) ? item.data : null })).filter(frame => frame.dataUrl);
  const requestItems = audits['network-requests']?.details?.items;
  const hasRequestItems = Array.isArray(requestItems);
  const requests = hasRequestItems ? requestItems : [];
  const normalizedResources = requests.map(r => {
    let safeUrl = '';
    try { const u = new URL(r.url); safeUrl = u.origin + u.pathname; } catch {}
    const networkStartMs = numericValue(r.networkRequestTime);
    const networkEndMs = numericValue(r.networkEndTime);
    const startTime = numericValue(r.startTime);
    const endTime = numericValue(r.endTime);
    return {
      url: safeUrl.slice(0, 300),
      resourceType: String(r.resourceType || '').slice(0, 40),
      mimeType: String(r.mimeType || '').slice(0, 100),
      statusCode: numericValue(r.statusCode),
      transferSize: numericValue(r.transferSize),
      resourceSize: numericValue(r.resourceSize),
      startTime: startTime !== null ? startTime : networkStartMs,
      endTime: endTime !== null ? endTime : networkEndMs
    };
  });
  const observedEndTimes = normalizedResources.map(r => r.endTime).filter(v => Number.isFinite(v) && v >= 0);
  const fullyLoadedTimeMs = observedEndTimes.length ? Math.max(...observedEndTimes) : numericValue(audits['fully-loaded']?.numericValue);
  const waterfallAudit = audits['network-requests'];
  const waterfall = buildWaterfall(requests, {
    auditAvailable: hasRequestItems,
    error: !hasRequestItems && typeof waterfallAudit?.errorMessage === 'string' ? waterfallAudit.errorMessage : null
  });
  const requestAnalysis = buildRequestAnalysis(normalizedResources, {
    requestCount: hasRequestItems ? requests.length : null,
    pageWeightBytes: hasRequestItems ? normalizedResources.reduce((sum, r) => sum + r.transferSize, 0) : null,
    fullyLoadedTimeMs,
    resourceDataAvailable: hasRequestItems
  });
  const auditList = Object.values(audits).filter(a => a && a.id).slice(0, 120).map(a => ({
    id: String(a.id).slice(0, 100),
    title: String(a.title || a.id).slice(0, 180),
    description: String(a.description || '').slice(0, 600),
    score: a.score == null ? null : Math.round(Number(a.score) * 100),
    scoreDisplayMode: String(a.scoreDisplayMode || '').slice(0, 40),
    displayValue: String(a.displayValue || '').slice(0, 180)
  }));
  const resourceDetails = normalizedResources.slice(0, 80);
  const ua = String(lhr.userAgent || lhr.environment?.networkUserAgent || '');
  const chromeVersion = (ua.match(/Chrome\/([0-9.]+)/) || [])[1] || null;
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
      ttfbMs: ms('server-response-time'),
      fullyLoadedTimeMs: requestAnalysis.fullyLoadedTimeMs
    },
    requestCount: requestAnalysis.resourceDataAvailable ? requestAnalysis.requestCount : null,
    pageWeightBytes: requestAnalysis.resourceDataAvailable ? requestAnalysis.pageWeightBytes : null,
    requestAnalysis,
    waterfall,
    opportunities,
    auditList,
    resourceDetails,
    screenshotDataUrl: typeof screenshot === 'string' && screenshot.startsWith('data:image/') ? screenshot : null,
    filmstripFrames
  };
}
