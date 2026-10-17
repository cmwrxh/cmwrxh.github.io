function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  res.setHeader('Cache-Control', 'no-store');
  const ip = req.headers['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress;
  const cfCountry = clean(req.headers['cf-ipcountry'], 2);
  let data = {};
  if (ip && !String(ip).startsWith('127.') && String(ip) !== '::1') {
    try {
      const response = await fetch('https://ipapi.co/' + encodeURIComponent(String(ip)) + '/json/', { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(2500) });
      if (response.ok) data = await response.json();
    } catch { /* Show unknown rather than guessing. */ }
  }
  const asn = clean(data.asn, 32);
  const org = clean(data.org, 120);
  const knownMobile = /safaricom|airtel|mtn|vodacom|orange|telkom|glo mobile|9mobile|econet|m-pesa/i.test(org);
  return res.status(200).json({
    asn: asn || null,
    operator: org || null,
    country_code: clean(data.country_code || cfCountry, 2) || null,
    country_name: clean(data.country_name, 80) || null,
    known_mobile_operator: knownMobile
  });
}