export const SCAN_PROFILES = Object.freeze({
  mobile: Object.freeze({
    id: 'mobile',
    device: 'mobile',
    label: 'Mobile · slow 4G',
    throttling: Object.freeze({
      rttMs: 150,
      throughputKbps: 1638.4,
      requestLatencyMs: 150,
      downloadThroughputKbps: 1638.4,
      uploadThroughputKbps: 750,
      cpuSlowdownMultiplier: 4
    })
  }),
  '3g-class': Object.freeze({
    id: '3g-class',
    device: 'mobile',
    label: 'Mobile · 3G-class',
    throttling: Object.freeze({
      rttMs: 300,
      throughputKbps: 780,
      requestLatencyMs: 300,
      downloadThroughputKbps: 780,
      uploadThroughputKbps: 330,
      cpuSlowdownMultiplier: 4
    })
  }),
  desktop: Object.freeze({
    id: 'desktop',
    device: 'desktop',
    label: 'Desktop · unthrottled',
    throttling: null
  })
});

export function normalizeScanProfile(value, device = 'mobile') {
  if (value == null || value === '') return device === 'desktop' ? 'desktop' : 'mobile';
  if (typeof value !== 'string' || !Object.hasOwn(SCAN_PROFILES, value)) return null;
  const profile = SCAN_PROFILES[value];
  if (profile.device !== device) return null;
  return profile.id;
}

export function normalizeRunCount(value) {
  if (value == null || value === '' || value === 1 || value === '1') return 1;
  if (value === 3 || value === '3') return 3;
  return null;
}

export function profileMetadata(profileId, runs = 1) {
  const profile = SCAN_PROFILES[profileId];
  if (!profile) throw new TypeError('Unknown scan profile.');
  return {
    profile: profile.id,
    profileLabel: profile.label,
    requestedRuns: normalizeRunCount(runs) ?? 1,
    aggregationLabel: normalizeRunCount(runs) === 3 ? 'Median of 3 runs' : 'Single run',
    testConditions: profile.id === '3g-class'
      ? 'Simulated 3G-class connection; controlled lab conditions'
      : profile.id === 'mobile'
        ? 'Lighthouse simulated slow 4G; controlled lab conditions'
        : 'Desktop browser without network throttling; controlled lab conditions'
  };
}
