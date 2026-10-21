const { isIP } = require('node:net');

function parsePublicDomain(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (!hostname || hostname.length > 253 || !hostname.includes('.')) return null;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname)) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname)) return null;
  return hostname;
}

function verificationTxtRecord(domain, token) {
  return { name: '_africalatency.' + domain, value: 'africalatency-verification=' + token };
}

function hasVerificationTxt(records, token) {
  if (!Array.isArray(records)) return false;
  const expected = 'africalatency-verification=' + token;
  return records.some((record) => {
    const value = Array.isArray(record) ? record.join('') : String(record);
    return value.trim() === expected;
  });
}

module.exports = { parsePublicDomain, verificationTxtRecord, hasVerificationTxt };
