// api/submit-lead.js
//
// Environment variables required in Vercel:
// SUPABASE_URL
// SUPABASE_SERVICE_KEY
// RESEND_API_KEY
// NOTIFY_EMAIL
// RESEND_FROM_EMAIL

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');

    return res.end(
      JSON.stringify({
        success: false,
        error: 'Method not allowed'
      })
    );
  }

  // Read environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    'Brilliant Unicorn <charlie@brilliantunicorn.com>';

  // Check Supabase configuration
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');

    return res.end(
      JSON.stringify({
        success: false,
        error:
          'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_KEY is missing.'
      })
    );
  }

  try {
    // Parse request body
    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');

        return res.end(
          JSON.stringify({
            success: false,
            error: 'Invalid JSON request body.'
          })
        );
      }
    }

    body = body || {};

    // Extract lead information
    const {
      company_name,
      contact_email,
      current_latency_ms,
      target_latency_ms,
      monthly_requests,
      estimated_monthly_loss
    } = body;

    // Validate email
    if (!contact_email || typeof contact_email !== 'string') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Contact email is required.'
        })
      );
    }

    // Basic email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(contact_email.trim())) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Please provide a valid email address.'
        })
      );
    }

    // Get visitor IP
    const forwardedFor = req.headers['x-forwarded-for'];

    const userIp =
      forwardedFor ||
      req.headers['x-real-ip'] ||
      (req.socket && req.socket.remoteAddress) ||
      'Unknown';

    // Prepare Supabase record
    const leadPayload = {
      company_name: company_name ? String(company_name).trim() : null,
      contact_email: contact_email.trim(),
      user_ip: userIp,
      current_latency_ms: Number(current_latency_ms) || 0,
      target_latency_ms: Number(target_latency_ms) || 0,
      monthly_requests: Number(monthly_requests) || 0,
      estimated_monthly_loss:
        Number(estimated_monthly_loss) || 0,
      status: 'new'
    };

    // --------------------------------------------------
    // 1. SAVE LEAD TO SUPABASE
    // --------------------------------------------------

    const supabaseEndpoint =
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/calculator_leads`;

    const dbResponse = await fetch(supabaseEndpoint, {
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
      console.error(
        'Supabase error:',
        dbResponse.status,
        dbResponseText
      );

      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: `Supabase Error (${dbResponse.status}): ${dbResponseText}`
        })
      );
    }

    // --------------------------------------------------
    // 2. SEND EMAIL NOTIFICATION VIA RESEND
    // --------------------------------------------------

    let emailWarning = null;

    if (resendApiKey && notifyEmail) {
      try {
        const emailResponse = await fetch(
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
              subject: `New scan lead: ${
                leadPayload.company_name ||
                leadPayload.contact_email
              }`,
              html: `
                <h2>New Africa Latency Lead</h2>

                <p>
                  <strong>Company:</strong>
                  ${leadPayload.company_name || 'N/A'}
                </p>

                <p>
                  <strong>Email:</strong>
                  ${leadPayload.contact_email}
                </p>

                <p>
                  <strong>Current latency:</strong>
                  ${leadPayload.current_latency_ms} ms
                </p>

                <p>
                  <strong>Target latency:</strong>
                  ${leadPayload.target_latency_ms} ms
                </p>

                <p>
                  <strong>Monthly requests:</strong>
                  ${leadPayload.monthly_requests}
                </p>

                <p>
                  <strong>Estimated monthly loss:</strong>
                  ${leadPayload.estimated_monthly_loss}
                </p>

                <p>
                  <strong>IP address:</strong>
                  ${userIp}
                </p>

                <hr>

                <p>
                  <strong>Source:</strong>
                  africalatency.dev
                </p>
              `
            })
          }
        );

        if (!emailResponse.ok) {
          const emailErrorText = await emailResponse.text();

          emailWarning =
            `Email not sent (HTTP ${emailResponse.status}): ${emailErrorText}`;

          console.error('Resend error:', emailWarning);
        }
      } catch (emailError) {
        emailWarning =
          `Email not sent: ${emailError.message}`;

        console.error('Resend exception:', emailError);
      }
    } else {
      emailWarning =
        'Email not sent: RESEND_API_KEY or NOTIFY_EMAIL is not configured.';
    }

    // --------------------------------------------------
    // 3. SUCCESS RESPONSE
    // --------------------------------------------------

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');

    return res.end(
      JSON.stringify({
        success: true,
        message: 'Lead captured successfully',
        emailWarning: emailWarning || undefined
      })
    );

  } catch (error) {
    // Unexpected server error
    console.error('submit-lead unexpected error:', error);

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');

    return res.end(
      JSON.stringify({
        success: false,
        error: `Server Error: ${error.message}`
      })
    );
  }
};
