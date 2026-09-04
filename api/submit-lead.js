// api/submit-lead.js
//
// Calculator lead endpoint
// Flow: scan.js → submit-lead.js → Supabase + Resend
//
// Required Vercel environment variables:
// SUPABASE_URL
// SUPABASE_SERVICE_KEY
// RESEND_API_KEY
// NOTIFY_EMAIL
// RESEND_FROM_EMAIL

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle browser preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only POST is allowed
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  // --------------------------------------------------
  // Environment variables
  // --------------------------------------------------

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const notifyEmail = process.env.NOTIFY_EMAIL?.trim();
  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    'Brilliant Unicorn <charlie@brilliantunicorn.com>';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');

    return res.status(500).json({
      success: false,
      error: 'Server misconfigured: Supabase environment variables are missing.'
    });
  }

  try {
    // --------------------------------------------------
    // Read request body
    // --------------------------------------------------

    let body = req.body;

    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    body = body || {};

    const {
      company_name,
      contact_email,
      current_latency_ms,
      target_latency_ms,
      monthly_requests,
      estimated_monthly_loss
    } = body;

    // --------------------------------------------------
    // Validate lead
    // --------------------------------------------------

    if (!contact_email) {
      return res.status(400).json({
        success: false,
        error: 'Contact email is required.'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(contact_email)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address.'
      });
    }

    // --------------------------------------------------
    // Capture IP
    // --------------------------------------------------

    const forwardedFor = req.headers['x-forwarded-for'];

    const userIp = forwardedFor
      ? String(forwardedFor).split(',')[0].trim()
      : req.socket?.remoteAddress || 'Unknown';

    // --------------------------------------------------
    // Prepare database record
    // --------------------------------------------------

    const leadPayload = {
      company_name: company_name?.trim() || null,
      contact_email: contact_email.trim(),
      user_ip: userIp,
      current_latency_ms: Number(current_latency_ms) || 0,
      target_latency_ms: Number(target_latency_ms) || 0,
      monthly_requests: Number(monthly_requests) || 0,
      estimated_monthly_loss: Number(estimated_monthly_loss) || 0,
      status: 'new'
    };

    // --------------------------------------------------
   
