// api/submit-lead.js
//
// IMPORTANT: This file reads all secrets from environment variables.
// Set these in Vercel: Project → Settings → Environment Variables
//   SUPABASE_URL             e.g. https://uzihwtxffklisczqvurf.supabase.co
//   SUPABASE_SERVICE_KEY     your Supabase service_role key (rotate it — see note below)
//   RESEND_API_KEY           your Resend API key
//   NOTIFY_EMAIL             the address you want lead alerts sent to
//   RESEND_FROM_EMAIL        a verified sender, e.g. alerts@africalatency.dev
//                            (use onboarding@resend.dev only for quick testing —
//                             it works without domain verification but looks unprofessional)
//
// After setting these in Vercel, redeploy for them to take effect.
// Never put real key values in this file or any file committed to git.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!supabaseUrl || !supabaseServiceKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: false,
      error: 'Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_KEY not set in Vercel environment variables.'
    }));
  }

  try {
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

    if (!contact_email) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Contact email is required' }));
    }

    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    const leadPayload = {
      company_name: company_name || null,
      contact_email: contact_email,
      user_ip: userIp,
      current_latency_ms: Number(current_latency_ms) || 0,
      target_latency_ms: Number(target_latency_ms) || 0,
      monthly_requests: Number(monthly_requests) || 0,
      estimated_monthly_loss: Number(estimated_monthly_loss) || 0,
      status: 'new'
    };

    // --- 1. Save to Supabase ---
    const dbResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/calculator_leads`, {
      method: 'POST',
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(leadPayload)
    });

    const dbResponseText = await dbResponse.text();

    if (!dbResponse.ok) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: false,
        error: `Supabase Error (${dbResponse.status}): ${dbResponseText}`
      }));
    }

    // --- 2. Send an email alert via Resend (best-effort — don't fail the
    //        whole request if only the email step has a problem, since the
    //        lead is already safely saved in Supabase at this point) ---
    let emailWarning = null;
    if (resendApiKey && notifyEmail) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [notifyEmail],
            subject: `New scan lead: ${company_name || contact_email}`,
            html: `
              <h2>New africalatency.dev lead</h2>
              <p><strong>Company:</strong> ${company_name || 'n/a'}</p>
              <p><strong>Email:</strong> ${contact_email}</p>
              <p><strong>Current latency:</strong> ${leadPayload.current_latency_ms}ms</p>
              <p><strong>Target latency:</strong> ${leadPayload.target_latency_ms}ms</p>
              <p><strong>Est. monthly loss:</strong> ${leadPayload.estimated_monthly_loss}</p>
              <p><strong>IP:</strong> ${userIp}</p>
            `
          })
        });

        if (!emailRes.ok) {
          const emailErrText = await emailRes.text();
          emailWarning = `Email not sent (HTTP ${emailRes.status}): ${emailErrText}`;
          console.error('Resend error:', emailWarning);
        }
      } catch (emailErr) {
        emailWarning = `Email not sent: ${emailErr.message}`;
        console.error('Resend exception:', emailErr);
      }
    } else {
      emailWarning = 'Email not sent: RESEND_API_KEY or NOTIFY_EMAIL not configured.';
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: true,
      message: 'Lead captured successfully',
      emailWarning: emailWarning || undefined
    }));

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: `Catch Error: ${err.message}` }));
  }
                                       }
