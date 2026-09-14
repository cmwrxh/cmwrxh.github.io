// Creates the hosted Paystack checkout for the fixed $247 Africa Latency Audit.
import { createClient } from '@supabase/supabase-js';

const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

const PRODUCT = {
  name: 'Africa Latency Audit',
  amountSubunit: 24700,
  currency: process.env.PAYSTACK_CURRENCY || 'USD',
};

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeDomain(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = value.trim().startsWith('http') ? new URL(value.trim()) : new URL(`https://${value.trim()}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || !url.hostname.includes('.') || url.hostname.length > 253) return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.SUPABASE_URL || !supabaseKey) {
    return res.status(500).json({ error: 'Checkout service is not configured.' });
  }

  const { email, domain } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const hostname = normalizeDomain(domain);

  if (!isValidEmail(normalizedEmail)) return res.status(400).json({ error: 'Please provide a valid email address.' });
  if (!hostname) return res.status(400).json({ error: 'Please provide a valid domain or URL.' });

  const reference = `al_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const { error: insertError } = await supabase.from('audit_orders').insert({
    reference,
    email: normalizedEmail,
    domain: hostname,
    amount_kobo: PRODUCT.amountSubunit,
    currency: PRODUCT.currency,
    status: 'pending',
  });

  if (insertError) {
    console.error('Supabase order insert failed:', insertError);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }

  try {
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        amount: PRODUCT.amountSubunit,
        currency: PRODUCT.currency,
        reference,
        callback_url: `${process.env.SITE_URL || 'https://www.africalatency.dev'}/audit-processing.html?reference=${reference}`,
        metadata: { domain: hostname, product: PRODUCT.name },
      }),
    });

    const paystackData = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !paystackData.status || !paystackData.data?.authorization_url) {
      console.error('Paystack initialization failed:', paystackData);
      await supabase.from('audit_orders').delete().eq('reference', reference);
      return res.status(502).json({ error: paystackData.message || 'Payment provider error. Please try again.' });
    }

    return res.status(200).json({ authorization_url: paystackData.data.authorization_url, reference });
  } catch (error) {
    console.error('Checkout creation failed:', error);
    await supabase.from('audit_orders').delete().eq('reference', reference);
    return res.status(502).json({ error: 'Unable to reach the payment provider. Please try again.' });
  }
}
