module.exports = async function handler(req, res) {
  // --------------------------------------------------
  // CORS
  // --------------------------------------------------

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --------------------------------------------------
  // METHOD CHECK
  // --------------------------------------------------

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // --------------------------------------------------
    // REQUEST SIZE PROTECTION
    // --------------------------------------------------

    const contentLength = Number(req.headers['content-length'] || 0);

    if (contentLength > 10000) {
      return res.status(413).json({
        success: false,
        error: 'Request too large'
      });
    }

    // --------------------------------------------------
    // REQUEST BODY
    // --------------------------------------------------

    const body = req.body || {};

    const {
      company_name,
      contact_email,
      website,
      current_latency_ms,
      target_latency_ms,
      monthly_requests,
      estimated_monthly_loss
    } = body;

    // --------------------------------------------------
    // HONEYPOT
    // --------------------------------------------------

    if (website && String(website).trim() !== '') {
      return res.status(400).json({
        success: false,
        error: 'Invalid submission'
      });
    }

    // --------------------------------------------------
    // INPUT VALIDATION
    // --------------------------------------------------

    const company = String(company_name || '').trim();
    const email = String(contact_email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    if (email.length > 254) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email'
      });
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email'
      });
    }

    if (company.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Company name is too long'
      });
    }

    // --------------------------------------------------
    // NUMERIC VALIDATION
    // --------------------------------------------------

    const latency = Number(current_latency_ms);
    const targetLatency = Number(target_latency_ms);
    const requests = Number(monthly_requests);
    const estimatedLoss = Number(estimated_monthly_loss);

    if (
      !Number.isFinite(latency) ||
      latency < 0 ||
      latency > 60000
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latency value'
      });
    }

    if (
      !Number.isFinite(targetLatency) ||
      targetLatency < 0 ||
      targetLatency > 60000
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid target latency'
      });
    }

    if (
      !Number.isFinite(requests) ||
      requests < 0 ||
      requests > 1000000000000
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid monthly requests'
      });
    }

    if (
      !Number.isFinite(estimatedLoss) ||
      estimatedLoss < 0 ||
      estimatedLoss > 1000000000000
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid estimated loss'
      });
    }

    // --------------------------------------------------
    // IP ADDRESS
    // --------------------------------------------------

    const forwardedFor =
      req.headers['x-forwarded-for'];

    const userIp = forwardedFor
      ? String(forwardedFor).split(',')[0].trim()
      : req.socket?.remoteAddress || 'unknown';

    // --------------------------------------------------
    // SUPABASE
    // --------------------------------------------------

    const supabaseUrl =
      process.env.SUPABASE_URL?.trim();

    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY?.trim();

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase environment variables missing');

      return res.status(500).json({
        success: false,
        error: 'Server misconfigured'
      });
    }

    // --------------------------------------------------
    // IP RATE LIMIT
    // --------------------------------------------------

    const rateLimitResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/check_ip_rate_limit`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_ip_address: userIp,
          p_endpoint: 'submit-lead',
          p_max_requests: 5,
          p_window_minutes: 60
        })
      }
    );

    if (!rateLimitResponse.ok) {
      console.error(
        'Rate limit check failed:',
        await rateLimitResponse.text()
      );

      return res.status(500).json({
        success: false,
        error: 'Unable to process request'
      });
    }

    const allowed = await rateLimitResponse.json();

    if (!allowed) {
      return res.status(429).json({
        success: false,
        error: 'Too many submissions. Please try again later.'
      });
    }

    // --------------------------------------------------
    // DUPLICATE EMAIL PROTECTION
    // --------------------------------------------------

    const duplicateCheckResponse = await fetch(
      `${supabaseUrl}/rest/v1/calculator_leads?select=id,created_at&contact_email=eq.${encodeURIComponent(email)}&created_at=gte.now()-interval.30.minutes&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (!duplicateCheckResponse.ok) {
      console.error(
        'Duplicate check failed:',
        await duplicateCheckResponse.text()
      );

      return res.status(500).json({
        success: false,
        error: 'Unable to process request'
      });
    }

    const duplicateLeads =
      await duplicateCheckResponse.json();

    if (Array.isArray(duplicateLeads) && duplicateLeads.length > 0) {
      return res.status(429).json({
        success: false,
        error:
          'A submission from this email was already received recently. Please try again later.'
      });
    }

    // --------------------------------------------------
    // HTML ESCAPING
    // --------------------------------------------------

    const escapeHtml = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const safeCompany = escapeHtml(company);
    const safeEmail = escapeHtml(email);
    const safeIp = escapeHtml(userIp);

    // --------------------------------------------------
    // LEAD PRIORITY
    // --------------------------------------------------

    let priority = 'Good';
    let priorityEmoji = '🟢';

    let recommendedAction =
      'No immediate latency concern detected. Continue monitoring.';

    if (latency >= 200) {
      priority = 'High Latency';
      priorityEmoji = '🔴';

      recommendedAction =
        'Recommend a detailed infrastructure latency audit.';
    } else if (latency >= 100) {
      priority = 'Needs Attention';
      priorityEmoji = '🟡';

      recommendedAction =
        'Recommend reviewing CDN, DNS, hosting region and API response times.';
    }

    // --------------------------------------------------
    // INSERT LEAD
    // --------------------------------------------------

    const leadData = {
      company_name: company || null,
      contact_email: email,
      current_latency_ms: Math.round(latency),
      target_latency_ms: Math.round(targetLatency),
      monthly_requests: Math.round(requests),
      estimated_monthly_loss: Math.round(estimatedLoss),
      user_ip: userIp
    };

    const insertResponse = await fetch(
      `${supabaseUrl}/rest/v1/calculator_leads`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(leadData)
      }
    );

    if (!insertResponse.ok) {
      console.error(
        'Supabase insert error:',
        await insertResponse.text()
      );

      return res.status(500).json({
        success: false,
        error: 'Unable to save lead'
      });
    }

    // --------------------------------------------------
    // RESEND
    // --------------------------------------------------

    const resendApiKey =
      process.env.RESEND_API_KEY?.trim();

    const notifyEmail =
      process.env.NOTIFY_EMAIL?.trim();

    const fromEmail =
      process.env.RESEND_FROM_EMAIL?.trim();

    let emailWarning = null;

    if (!resendApiKey || !notifyEmail || !fromEmail) {
      console.error(
        'Resend environment variables missing'
      );

      emailWarning =
        'Lead saved, but email notification is not configured.';
    } else {
      // --------------------------------------------------
      // SEND EMAIL
      // --------------------------------------------------

      const resendResponse = await fetch(
        'https://api.resend.com/emails',
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            from: fromEmail,
            to: [notifyEmail],

            subject:
              `New scan lead: ${company || email}`,

            html: `
              <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px;">

                <h2>
                  New Africa Latency Lead
                </h2>

                <p style="font-size: 18px;">
                  <strong>Priority:</strong>
                  ${priorityEmoji} ${priority}
                </p>

                <p>
                  <strong>Recommended Action:</strong>
                  ${recommendedAction}
                </p>

                <hr>

                <p>
                  <strong>Company:</strong>
                  ${safeCompany || 'N/A'}
                </p>

                <p>
                  <strong>Contact Email:</strong>
                  ${safeEmail}
                </p>

                <p>
                  <strong>Current Latency:</strong>
                  ${Math.round(latency)} ms
                </p>

                <p>
                  <strong>Target Latency:</strong>
                  ${Math.round(targetLatency)} ms
                </p>

                <p>
                  <strong>Monthly Requests:</strong>
                  ${Math.round(requests)}
                </p>

                <p>
                  <strong>Estimated Monthly Loss:</strong>
                  $${Math.round(estimatedLoss)}
                </p>

                <p>
                  <strong>IP Address:</strong>
                  ${safeIp}
                </p>

                <hr>

                <p style="font-size: 13px; color: #666;">
                  This lead was submitted through the Africa Latency calculator.
                </p>

              </div>
            `
          })
        }
      );

      const resendData =
        await resendResponse.json();

      if (!resendResponse.ok) {
        console.error(
          'Resend API error:',
          resendData
        );

        emailWarning =
          'Lead saved, but email notification failed.';
      }
    }

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    return res.status(200).json({
      success: true,
      message: 'Lead submitted successfully',
      priority,
      ...(emailWarning ? { warning: emailWarning } : {})
    });

  } catch (error) {
    console.error('Server Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
