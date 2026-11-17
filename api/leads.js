const MAX_BODY_BYTES = 20 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FREE_WEBMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.ke',
  'outlook.com', 'outlook.co.uk', 'hotmail.com', 'hotmail.co.uk', 'live.com',
  'live.co.uk', 'msn.com', 'icloud.com', 'icloud.co.uk', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me', 'aol.com', 'gmx.com', 'mail.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'fastmail.com', 'tutanota.com',
  'tuta.com', 'hey.com', 'inbox.com', 'hushmail.com', 'rediffmail.com',
  'qq.com', '163.com', '126.com', 'sina.com', 'mail.ru', 'bk.ru', 'list.ru',
  'naver.com', 'daum.net', 'hanmail.net'
]);

export function isCorporateEmail(email) {
  const domain = String(email || '').trim().toLowerCase().split('@').pop() || '';
  return Boolean(domain.includes('.') && !FREE_WEBMAIL_DOMAINS.has(domain));
}

function normalizeScannedUrl(value) {
  if (value == null || value === '') return { value: null };
  if (typeof value !== 'string' || value.length > 2048) return { error: 'Invalid scanned website URL.' };
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid');
    if (parsed.port && !['80', '443'].includes(parsed.port)) throw new Error('invalid');
    if (!parsed.hostname || parsed.hostname === 'localhost') throw new Error('invalid');
    parsed.hash = '';
    // Do not retain query-string tokens or visitor-specific parameters in lead records.
    parsed.search = '';
    return { value: parsed.toString(), domain: parsed.hostname.toLowerCase() };
  } catch {
    return { error: 'Enter a valid public HTTP or HTTPS website URL.' };
  }
}

export function validateLeadPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid submission.' };
  if (body.website) return { error: 'Invalid submission.' };

  const leadType = String(body.lead_type || 'full_report');
  if (!['full_report', 'founding_pilot'].includes(leadType)) return { error: 'Invalid lead type.' };

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const companyName = typeof body.company_name === 'string' ? body.company_name.trim() : '';
  const rawDomain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';
  const source = typeof body.source === 'string' ? body.source.trim() : 'website';
  const scanId = body.scan_id == null || body.scan_id === '' ? null : String(body.scan_id);
  const scanned = normalizeScannedUrl(body.scanned_url);
  if (scanned.error) return { error: scanned.error };
  const domain = rawDomain || scanned.domain || '';

  if (fullName.length > 120 || companyName.length > 150 || domain.length > 253 || source.length > 80) {
    return { error: 'One or more fields exceed the allowed length.' };
  }
  if (domain && !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    return { error: 'Enter a valid domain.' };
  }
  if (scanId && !UUID_RE.test(scanId)) return { error: 'Invalid scan reference.' };

  return {
    value: {
      lead_type: leadType,
      email,
      full_name: fullName || null,
      company_name: companyName || null,
      domain: domain || null,
      scanned_url: scanned.value,
      scan_id: scanId,
      source: source || 'website',
      email_updates_opt_in: body.email_updates_opt_in === true
    }
  };
}

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

async function notifyLeadWebhook(lead, leadId, createdAt) {
  const configured = String(process.env.LEAD_WEBHOOK_URL || '').trim();
  if (!configured) return;
  let target;
  try {
    target = new URL(configured);
    if (target.protocol !== 'https:') throw new Error('Webhook must use HTTPS.');
  } catch (error) {
    console.error('[leads] webhook URL is invalid:', error?.message || 'invalid URL');
    return;
  }
  const payload = {
    event: 'scan_report_unlocked',
    lead_id: leadId || null,
    lead_type: lead.lead_type,
    email: lead.email,
    company_name: lead.company_name,
    domain: lead.domain,
    scanned_url: lead.scanned_url,
    scan_id: lead.scan_id,
    source: lead.source,
    created_at: createdAt || new Date().toISOString()
  };
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) console.error('[leads] webhook returned HTTP', response.status);
  } catch (error) {
    console.error('[leads] webhook delivery failed:', error?.message || 'unknown error');
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { success: false, error: 'Method not allowed.' });
  }

  if (Number(req.headers['content-length'] || 0) > MAX_BODY_BYTES) {
    return json(res, 413, { success: false, error: 'Request too large.' });
  }

  const parsed = validateLeadPayload(req.body);
  if (parsed.error) return json(res, 400, { success: false, error: parsed.error });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(res, 503, { success: false, error: 'Lead capture is temporarily unavailable.' });
  }

  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');

  try {
    const rateLimitResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/check_ip_rate_limit`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_ip_address: ip,
          p_endpoint: 'scan-leads',
          p_max_requests: 5,
          p_window_minutes: 60
        })
      }
    );
    if (!rateLimitResponse.ok) {
      console.error('[leads] rate-limit check failed:', rateLimitResponse.status);
      return json(res, 503, { success: false, error: 'Unable to verify submission. Please try again.' });
    }
    if (await rateLimitResponse.json() !== true) {
      res.setHeader('Retry-After', '3600');
      return json(res, 429, { success: false, error: 'Too many submissions. Please try again later.' });
    }

    const dbResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/scan_leads`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(parsed.value)
    });
    if (!dbResponse.ok) {
      console.error('[leads] insert failed:', dbResponse.status, (await dbResponse.text()).slice(0, 500));
      return json(res, 503, { success: false, error: 'Could not save your request. Please try again.' });
    }

    const rows = await dbResponse.json();
    const lead = Array.isArray(rows) ? rows[0] : null;
    if (parsed.value.lead_type === 'full_report' && isCorporateEmail(parsed.value.email)) {
      void notifyLeadWebhook(parsed.value, lead?.id || null, lead?.created_at || null);
    }
    return json(res, 201, { success: true, lead_id: lead?.id || null });
  } catch (error) {
    console.error('[leads] request failed:', error?.message || 'unknown error');
    return json(res, 503, { success: false, error: 'Lead capture is temporarily unavailable.' });
  }
}
