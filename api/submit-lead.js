import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    company_name,
    contact_email,
    current_latency_ms,
    target_latency_ms,
    monthly_requests,
    estimated_monthly_loss
  } = req.body || {};

  // Basic validation
  if (!contact_email) {
    return res.status(400).json({ error: 'Contact email is required' });
  }

  // Grab environment variables securely from Vercel
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing database credentials.' });
  }

  try {
    // Initialize Supabase client with the secure service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract user IP from Vercel headers for regional telemetry attribution
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Insert lead data into your calculator_leads table
    const { data, error } = await supabase
      .from('calculator_leads')
      .insert([
        {
          company_name: company_name || null,
          contact_email,
          user_ip: userIp,
          current_latency_ms: current_latency_ms || 0,
          target_latency_ms: target_latency_ms || 0,
          monthly_requests: monthly_requests || 0,
          estimated_monthly_loss: estimated_monthly_loss || 0,
          status: 'new'
        }
      ])
      .select();

    if (error) {
      console.error('Supabase insertion error:', error);
      return res.status(500).json({ success: false, error: 'Failed to save lead record.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Lead captured successfully',
      data: data[0]
    });

  } catch (err) {
    console.error('Server error handling lead submission:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
