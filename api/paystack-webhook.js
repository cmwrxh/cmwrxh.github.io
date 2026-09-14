// Paystack webhook: acknowledge quickly, then complete the paid audit in the
// Vercel function lifecycle using waitUntil so the customer is not left waiting
// on a webhook timeout.

import crypto from 'crypto';
import { waitUntil } from '@vercel/functions';
import { createClient } from '@supabase/supabase-js';
import { runAudit } from '../lib/run-audit.js';
import { generateReportPdf } from '../lib/generate-report-pdf.js';

export const config = {
  api: { bodyParser: false },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sendReportEmail(email, domain, downloadUrl) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'AfricaLatency <reports@africalatency.dev>',
      to: email,
      subject: `Your Africa Latency Audit for ${domain} is ready`,
      html: `
        <p>Your Africa Latency Audit for <strong>${domain}</strong> is ready.</p>
        <p><a href="${downloadUrl}">Download your report (PDF)</a></p>
        <p>This link expires in 7 days. Reply to this email if you have any questions about the results.</p>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Report email failed: ${response.status} ${body}`);
  }
}

async function processPaidOrder(reference) {
  const { data: order, error: orderError } = await supabase
    .from('audit_orders')
    .select('reference, email, domain, status, report_path')
    .eq('reference', reference)
    .single();

  if (orderError || !order) throw new Error('Paid order could not be found.');
  if (order.status === 'ready') return;

  try {
    const auditResult = await runAudit(order.domain);
    const pdfBuffer = await generateReportPdf(auditResult, reference);
    const reportPath = `${reference}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(reportPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: signed, error: signedError } = await supabase.storage
      .from('reports')
      .createSignedUrl(reportPath, 60 * 60 * 24 * 7);

    if (signedError || !signed?.signedUrl) {
      throw signedError || new Error('Could not create report download URL.');
    }

    const { error: readyError } = await supabase
      .from('audit_orders')
      .update({
        status: 'ready',
        report_path: reportPath,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('reference', reference);

    if (readyError) throw readyError;

    // A report that is already stored and marked ready must never be turned
    // into a failed order solely because email delivery failed.
    try {
      await sendReportEmail(order.email, order.domain, signed.signedUrl);
    } catch (emailError) {
      console.error('Report email delivery failed after report completion:', emailError);
    }
  } catch (error) {
    console.error('Self-serve audit failed:', error);
    await supabase
      .from('audit_orders')
      .update({
        status: 'failed',
        error_message: String(error?.message || error).slice(0, 1000),
      })
      .eq('reference', reference);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return res.status(500).send('Webhook service is not configured');
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-paystack-signature'];
  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  if (!signature || !crypto.timingSafeEqual(Buffer.from(String(signature)), Buffer.from(expected))) {
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (event.event !== 'charge.success') {
    return res.status(200).send('ignored');
  }

  const reference = event.data?.reference;
  if (!reference) return res.status(400).send('Missing reference');

  const { data: order, error: orderError } = await supabase
    .from('audit_orders')
    .select('reference, amount_kobo, currency, status')
    .eq('reference', reference)
    .single();

  if (orderError || !order) return res.status(404).send('Order not found');
  if (order.status === 'ready' || order.status === 'scanning') return res.status(200).send('already processing');

  if (
    Number(event.data?.amount) !== Number(order.amount_kobo) ||
    String(event.data?.currency || '').toUpperCase() !== String(order.currency || '').toUpperCase()
  ) {
    console.error('Paystack amount/currency mismatch:', {
      reference,
      expectedAmount: order.amount_kobo,
      receivedAmount: event.data?.amount,
      expectedCurrency: order.currency,
      receivedCurrency: event.data?.currency,
    });
    return res.status(400).send('Payment details do not match order');
  }

  const { error: markError } = await supabase
    .from('audit_orders')
    .update({ status: 'scanning', paid_at: event.data?.paid_at || new Date().toISOString() })
    .eq('reference', reference)
    .eq('status', 'pending');

  if (markError) {
    console.error('Could not mark order as scanning:', markError);
    return res.status(500).send('Could not update order');
  }

  waitUntil(processPaidOrder(reference));
  return res.status(200).send('ok');
}
