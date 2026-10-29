import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { summarizeRun, overallGrade } from './scoring.js';
import { validateRedirectChain } from './url-safety.js';
import { SCAN_PROFILES, normalizeRunCount, normalizeScanProfile } from './scan-profiles.js';

const timeoutMs = Math.max(60000, Math.min(90000, Number(process.env.LIGHTHOUSE_TIMEOUT_MS) || 75000));

async function runLighthouseOnce(url, device, profileId) {
  const profile = SCAN_PROFILES[profileId];
  if (!profile || profile.device !== device) throw new Error('Invalid scan profile for device.');
  const safeUrl = await validateRedirectChain(url);
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    chromeFlags: ['--headless', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  let timer;
  try {
    const run = lighthouse(safeUrl, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      emulatedFormFactor: device === 'desktop' ? 'desktop' : 'mobile',
      throttlingMethod: device === 'desktop' ? 'provided' : 'simulate',
      ...(profile.throttling ? { throttling: profile.throttling } : {}),
      screenEmulation: device === 'desktop'
        ? { mobile: false, width: 1440, height: 1000, deviceScaleFactor: 1, disabled: true }
        : { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false }
    });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out')), timeoutMs);
    });
    const result = await Promise.race([run, timeout]);
    return summarizeRun(result.lhr);
  } finally {
    clearTimeout(timer);
    try {
      await chrome.kill();
    } catch {
      // Ignore cleanup errors so they do not mask the Lighthouse result or original failure.
    }
  }
}

async function runPageSpeed(url, device, profileId) {
  if (profileId === '3g-class') throw new Error('The selected 3G-class profile requires local Lighthouse; PageSpeed Insights cannot apply this custom profile.');
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) throw new Error('PageSpeed fallback is not configured.');
  const params = new URLSearchParams({ url, strategy: device === 'desktop' ? 'DESKTOP' : 'MOBILE', key });
  for (const category of ['PERFORMANCE','ACCESSIBILITY','BEST_PRACTICES','SEO']) params.append('category', category);
  const response = await fetch('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' + params.toString(), { signal: AbortSignal.timeout(Math.min(timeoutMs, 20000)) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.lighthouseResult) throw new Error('PageSpeed Insights provider failed.');
  const result = summarizeRun(payload.lighthouseResult);
  result.provider = 'PageSpeed Insights';
  return result;
}
async function runOne(url, device, profileId) {
  const provider = String(process.env.LIGHTHOUSE_PROVIDER || 'local').toLowerCase();
  if (provider === 'pagespeed') return runPageSpeed(url, device, profileId);
  try {
    const result = await runLighthouseOnce(url, device, profileId);
    result.provider = 'local Lighthouse';
    return result;
  } catch (error) {
    if (process.env.PAGESPEED_API_KEY && profileId !== '3g-class') {
      const fallback = await runPageSpeed(url, device, profileId);
      fallback.providerFallback = 'PageSpeed Insights';
      return fallback;
    }
    throw error;
  }
}

export async function runLighthouse(url, device, runCount = 1, requestedProfile = null) {
  const profileId = normalizeScanProfile(requestedProfile, device);
  const count = normalizeRunCount(runCount);
  if (!profileId || count === null) throw new Error('Invalid scan profile or run count.');
  const runs = [];
  for (let i = 0; i < count; i += 1) runs.push(await runOne(url, device, profileId));
  if (runs.length === 1) return runs[0];
  const medianMetric = key => {
    const values = runs.map(r => r.metrics?.[key]).filter(Number.isFinite).sort((a,b) => a-b);
    if (!values.length) return null;
    const mid = Math.floor(values.length / 2);
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  };
  const medianScore = key => {
    const values = runs.map(r => r[key]).filter(Number.isFinite).sort((a,b) => a-b);
    if (!values.length) return null;
    const mid = Math.floor(values.length / 2);
    return Math.round(values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2);
  };
  const merged = {
    ...runs[0],
    performance: medianScore('performance'),
    structure: medianScore('structure'),
    scores: {
      accessibility: medianScoreFrom(runs, 'scores.accessibility'),
      bestPractices: medianScoreFrom(runs, 'scores.bestPractices'),
      seo: medianScoreFrom(runs, 'scores.seo')
    },
    metrics: Object.fromEntries(['lcpMs','fcpMs','tbtMs','cls','speedIndexMs','ttfbMs','fullyLoadedTimeMs'].map(key => [key, medianMetric(key)])),
    runCount: runs.length,
    aggregation: 'median of ' + runs.length + ' Lighthouse runs',
    provider: runs.every(r => r.provider === runs[0].provider) ? runs[0].provider : 'mixed providers'
  };
  merged.grade = overallGrade(merged.performance, merged.structure);
  merged.runVariability = {
    label: 'Observed range across ' + runs.length + ' runs; not a confidence interval',
    performanceRange: range(runs.map(r => r.performance)),
    structureRange: range(runs.map(r => r.structure)),
    metricRanges: Object.fromEntries(['lcpMs','fcpMs','tbtMs','cls','speedIndexMs','ttfbMs','fullyLoadedTimeMs'].map(key => [key, range(runs.map(r => r.metrics?.[key]))]))
  };
  return merged;
}
function medianScoreFrom(runs, path) {
  const values = runs.map(r => path.split('.').reduce((v,k) => v?.[k], r)).filter(Number.isFinite).sort((a,b) => a-b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return Math.round(values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2);
}
function range(values) {
  const v = values.filter(Number.isFinite);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}
