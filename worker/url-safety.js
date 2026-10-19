import dns from 'node:dns/promises';
import net from 'node:net';

function ipv4Number(ip) {
  return ip.split('.').reduce((n, part) => (n * 256) + Number(part), 0) >>> 0;
}
function inV4(ip, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(ip) & mask) === (ipv4Number(base) & mask);
}
function isUnsafeIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    return [
      ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
      ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],
      ['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],
      ['224.0.0.0',4],['240.0.0.0',4]
    ].some(([base,bits]) => inV4(ip, base, bits));
  }
  if (version === 6) {
    const normalized = ip.toLowerCase().split('%')[0];
    if (normalized === '::' || normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('ff') || normalized.startsWith('2001:db8:') || normalized.startsWith('2001:10:') || normalized.startsWith('2002:')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (net.isIP(mapped) === 4) return isUnsafeIp(mapped);
    }
    return false;
  }
  return true;
}

export async function validatePublicUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter a valid public website URL.');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a valid public website URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS websites are supported.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not allowed.');
  if (url.port && !['80','443'].includes(url.port)) throw new Error('Only standard HTTP/HTTPS ports are allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw new Error('Private, local and metadata hostnames are not allowed.');
  }
  if (net.isIP(host)) {
    if (isUnsafeIp(host)) throw new Error('Private or reserved IP addresses are not allowed.');
  } else {
    let records;
    try { records = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error('The website hostname could not be resolved.'); }
    if (!records.length || records.some(record => isUnsafeIp(record.address))) {
      throw new Error('The hostname resolves to a private or reserved address.');
    }
  }
  url.hash = '';
  return url.toString();
}

export async function validateRedirectChain(input, maxRedirects = 5) {
  let current = await validatePublicUrl(input);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let response;
    try {
      response = await fetch(current, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    } catch {
      // A target may deny HEAD. DNS and URL checks still apply before Lighthouse.
      return current;
    }
    if (![301,302,303,307,308].includes(response.status)) return current;
    const location = response.headers.get('location');
    if (!location) return current;
    if (hop === maxRedirects) throw new Error('The website redirects too many times.');
    current = await validatePublicUrl(new URL(location, current).toString());
  }
  throw new Error('The website redirects too many times.');
}
