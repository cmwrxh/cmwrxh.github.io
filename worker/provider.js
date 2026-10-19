import lighthouse from 'lighthouse';
import chromeLauncher from 'chrome-launcher';
import { summarizeRun } from './scoring.js';
import { validatePublicUrl } from './url-safety.js';

const timeoutMs = Math.max(60000, Math.min(90000, Number(process.env.LIGHTHOUSE_TIMEOUT_MS) || 75000));

async function runLighthouseOnce(url, device) {
  const safeUrl = await validatePublicUrl(url);
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
      screenEmulation: device === 'desktop'
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: true }
        : { mobile: true, width: 360, height: 800, deviceScaleFactor: 2, disabled: false }
    });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out')), timeoutMs);
    });
    const result = await Promise.race([run, timeout]);
    return summarizeRun(result.lhr);
  } finally {
    clearTimeout(timer);
    await chrome.kill().catch(() => {});
  }
}

export async function runLighthouse(url, device, runCount = 1) {
  const runs = [];
  for (let i = 0; i < runCount; i += 1) runs.push(await runLighthouseOnce(url, device));
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
  const { overallGrade } = await import('./scoring.js');
  const merged = {
    ...runs[0],
    performance: medianScore('performance'),
    structure: medianScore('structure'),
    scores: {
      accessibility: medianScoreFrom(runs, 'scores.accessibility'),
      bestPractices: medianScoreFrom(runs, 'scores.bestPractices'),
      seo: medianScoreFrom(runs, 'scores.seo')
    },
    metrics: Object.fromEntries(['lcpMs','fcpMs','tbtMs','cls','speedIndexMs','ttfbMs'].map(key => [key, medianMetric(key)])),
    runCount: runs.length,
    aggregation: 'median of 3 Lighthouse runs'
  };
  merged.grade = overallGrade(merged.performance, merged.structure);
  merged.runVariability = {
    performanceRange: range(runs.map(r => r.performance)),
    structureRange: range(runs.map(r => r.structure))
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
