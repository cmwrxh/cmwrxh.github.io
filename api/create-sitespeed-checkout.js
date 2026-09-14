import { createClient } from '@supabase/supabase-js';

const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

const PRODUCT = { name: 'Website Speed Check', amountSubunit: 3900, currency: process.env.PAYSTACK_CURRENCY || 'USD' };

function validEmail(value) { return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function normalizeDomain(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const input = value.trim();
    const url = input.startsWith('http') ? new URL(input) : new URL(`https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || !url.hostname.includes('.') || url.hostname.length > 253) return null;
    return url.hostname.toLowerCase();
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.SUPABASE_URL || !supabaseKey) return res.status(500).json({ error: 'Checkout service is not configured.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const domain = normalizeDomain(body.domain);
  if (!name || !validEmail(email) || !domain) return res.status(400).json({ error: 'Please provide your name, a valid email address, and a valid domain.' });

  const reference = `wsc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { error: insertError } = await supabase.from('website_speed_checks').insert({ reference, name, email, domain, amount_subunit: PRODUCT.amountSubunit, currency: PRODUCT.currency, status: 'pending' });
  if (insertError) { console.error('Website Speed Check order insert failed:', insertError); return res.status(500).json({ error: 'Could not start checkout. Please try again.' }); }

  try {
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, amount: PRODUCT.amountSubunit, currency: PRODUCT.currency, reference,
        callback_url: `${process.env.SITE_URL || 'https://www.africalatency.dev'}/sitespeed-thank-you.html?reference=${reference}`,
        metadata: { product: PRODUCT.name, domain, name }
      })
    });
    const data = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !data.status || !data.data?.authorization_url) {
      await supabase.from('website_speed_checks').delete().eq('reference', reference);
      return res.status(502).json({ error: data.message || 'Payment provider error. Please try again.' });
    }
    return res.status(200).json({ authorization_url: data.data.authorization_url, reference });
  } catch (error) {
    console.error('Website Speed Check checkout failed:', error);
    await supabase.from('website_speed_checks').delete().eq('reference', reference);
    return res.status(502).json({ error: 'Unable to reach the payment provider. Please try again.' });
  }
}
