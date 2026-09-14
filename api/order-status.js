// Returns the current order state and, when ready, a seven-day signed PDF URL.
import { createClient } from '@supabase/supabase-js';

const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const reference = typeof req.query?.reference === 'string' ? req.query.reference : '';
  if (!reference || reference.length > 60) return res.status(400).json({ error: 'reference is required' });

  const { data: order, error } = await supabase
    .from('audit_orders')
    .select('status, domain, report_path, error_message')
    .eq('reference', reference)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found' });

  let downloadUrl = null;
  if (order.status === 'ready' && order.report_path) {
    const { data: signed } = await supabase.storage
      .from('reports')
      .createSignedUrl(order.report_path, 60 * 60 * 24 * 7);
    downloadUrl = signed?.signedUrl ?? null;
  }

  return res.status(200).json({
    status: order.status,
    domain: order.domain,
    downloadUrl,
    errorMessage: order.status === 'failed' ? (order.error_message || 'The report could not be generated.') : undefined,
  });
}
