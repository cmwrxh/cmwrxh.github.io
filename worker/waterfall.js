function numeric(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return (url.origin + url.pathname).slice(0, 300);
  } catch {
    return '';
  }
}

export function buildWaterfall(resources, options = {}) {
  const reason = typeof options.error === 'string' ? options.error.trim().slice(0, 180) : '';
  if (reason) {
    return { status: 'error', reason, requestCount: null, timedRequestCount: 0, rows: [] };
  }
  if (options.auditAvailable !== true) {
    return {
      status: 'unavailable',
      reason: 'Lighthouse did not return network-requests audit details.',
      requestCount: null,
      timedRequestCount: 0,
      rows: []
    };
  }
  if (!Array.isArray(resources)) {
    return {
      status: 'unavailable',
      reason: 'Lighthouse network-requests details were not a request list.',
      requestCount: null,
      timedRequestCount: 0,
      rows: []
    };
  }
  if (resources.length === 0) {
    return {
      status: 'empty',
      reason: 'Lighthouse returned zero network requests for this scan.',
      requestCount: 0,
      timedRequestCount: 0,
      rows: []
    };
  }

  const rows = resources.slice(0, 80).map((resource) => {
    const startRaw = numeric(resource?.startTime);
    const endRaw = numeric(resource?.endTime);
    const networkStart = numeric(resource?.networkRequestTime);
    const networkEnd = numeric(resource?.networkEndTime);
    const startMs = startRaw !== null ? startRaw : networkStart;
    const endMs = endRaw !== null ? endRaw : networkEnd;
    const validTiming = startMs !== null && endMs !== null && endMs >= startMs;
    let url = safeUrl(resource?.url);
    return {
      url,
      resourceType: typeof resource?.resourceType === 'string' ? resource.resourceType.slice(0, 40) : null,
      statusCode: numeric(resource?.statusCode),
      transferSizeBytes: numeric(resource?.transferSize),
      resourceSizeBytes: numeric(resource?.resourceSize),
      startMs,
      endMs,
      durationMs: validTiming ? endMs - startMs : null,
      timingStatus: validTiming ? 'measured' : 'unavailable',
      timingReason: validTiming ? null : 'A valid request start and end offset were not both returned.',
      startSource: startRaw !== null ? 'startTime' : networkStart !== null ? 'networkRequestTime' : null,
      endSource: endRaw !== null ? 'endTime' : networkEnd !== null ? 'networkEndTime' : null
    };
  });
  return {
    status: rows.some(row => row.timingStatus === 'measured') ? 'available' : 'unavailable',
    reason: rows.some(row => row.timingStatus === 'measured')
      ? null
      : 'Resource rows were returned, but none included a valid start/end timing pair.',
    requestCount: resources.length,
    timedRequestCount: rows.filter(row => row.timingStatus === 'measured').length,
    rows
  };
}
