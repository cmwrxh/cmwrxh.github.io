module.exports = async function handler(req, res) {
  // --------------------------------------------------
  // CORS
  // --------------------------------------------------

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  // --------------------------------------------------
  // ONLY ALLOW POST
  // --------------------------------------------------

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

  // --------------------------------------------------
  // ENVIRONMENT VARIABLES
  // --------------------------------------------------

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    'Brilliant Unicorn <charlie@brilliantunicorn.com>';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');

    return res.end(
      JSON.stringify({
        success: false,
        error: 'Server misconfigured.'
      })
    );
  }

  try {
    // --------------------------------------------------
    // REQUEST SIZE PROTECTION
    // --------------------------------------------------

    const contentLength = Number(req.headers['content-length'] || 0);

    if (contentLength > 20 * 1024) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Request too large.'
        })
      );
    }

    // --------------------------------------------------
    // PARSE REQUEST BODY
    // --------------------------------------------------

    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
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

    // --------------------------------------------------
    // HONEYPOT BOT CHECK
    // --------------------------------------------------

    if (body.website) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Invalid submission.'
        })
      );
    }

    // --------------------------------------------------
    // EXTRACT FIELDS
    // --------------------------------------------------

    const {
      company_name,
      contact_email,
      current_latency_ms,
      target_latency_ms,
      monthly_requests,
      estimated_monthly_loss
    } = body;

    // --------------------------------------------------
    // EMAIL VALIDATION
    // --------------------------------------------------

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

    const email = contact_email.trim();

    if (email.length > 254) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Email address is too long.'
        })
      );
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Please provide a valid email address.'
        })
      );
    }

    // --------------------------------------------------
    // COMPANY NAME VALIDATION
    // --------------------------------------------------

    const company =
      company_name && typeof company_name === 'string'
        ? company_name.trim()
        : '';

    if (company.length > 150) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Company name is too long.'
        })
      );
    }

    // --------------------------------------------------
    // NUMERIC VALIDATION
    // --------------------------------------------------

    const latency = Number(current_latency_ms) || 0;
    const targetLatency = Number(target_latency_ms) || 0;
    const monthlyRequests = Number(monthly_requests) || 0;
    const estimatedLoss = Number(estimated_monthly_loss) || 0;

    if (
      latency < 0 ||
      latency > 100000 ||
      targetLatency < 0 ||
      targetLatency > 100000 ||
      monthlyRequests < 0 ||
      monthlyRequests > 1000000000000 ||
      estimatedLoss < 0 ||
      estimatedLoss > 1000000000000
    ) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Invalid diagnostic values.'
        })
      );
    }

    // --------------------------------------------------
    // VISITOR IP
    // --------------------------------------------------

    const forwardedFor = req.headers['x-forwarded-for'];

    let userIp = 'Unknown';

    if (forwardedFor) {
      userIp = String(forwardedFor)
        .split(',')[0]
        .trim();
    } else if (req.headers['x-real-ip']) {
      userIp = String(req.headers['x-real-ip']).trim();
    } else if (req.socket && req.socket.remoteAddress) {
      userIp = req.socket.remoteAddress;
    }

    // --------------------------------------------------
    // IP RATE LIMIT PROTECTION
    // --------------------------------------------------
    //
    // Maximum 5 submissions from the same IP
    // within a 60-minute window.
    //

    const rateLimitEndpoint =
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/check_ip_rate_limit`;

    const rateLimitResponse = await fetch(
      rateLimitEndpoint,
      {
        method: 'POST',
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
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

    const rateLimitResponseText =
      await rateLimitResponse.text();

    if (!rateLimitResponse.ok) {
      console.error(
        'Rate limit check error:',
        rateLimitResponse.status,
        rateLimitResponseText
      );

      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Unable to verify submission.'
        })
      );
    }

    let rateLimitAllowed = false;

    try {
      rateLimitAllowed =
        JSON.parse(rateLimitResponseText);
    } catch (error) {
      console.error(
        'Rate limit JSON error:',
        error
      );

      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Unable to verify submission.'
        })
      );
    }

    if (rateLimitAllowed !== true) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Retry-After',
        String(60 * 60)
      );

      return res.end(
        JSON.stringify({
          success: false,
          error:
            'Too many submissions from this network. Please try again later.'
        })
      );
    }

    // --------------------------------------------------
    // DUPLICATE SUBMISSION PROTECTION
    // --------------------------------------------------
    //
    // Prevent the same email from submitting another lead
    // within 30 minutes.
    //

    const cooldownMinutes = 30;

    const cutoffTime =
      new Date(
        Date.now() - cooldownMinutes * 60 * 1000
      ).toISOString();

    const duplicateCheckEndpoint =
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/calculator_leads` +
      `?contact_email=eq.${encodeURIComponent(email)}` +
      `&created_at=gte.${encodeURIComponent(cutoffTime)}` +
      `&select=id` +
      `&limit=1`;

    const duplicateResponse = await fetch(
      duplicateCheckEndpoint,
      {
        method: 'GET',
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`
        }
      }
    );

    const duplicateResponseText =
      await duplicateResponse.text();

    if (!duplicateResponse.ok) {
      console.error(
        'Duplicate check error:',
        duplicateResponse.status,
        duplicateResponseText
      );

      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Unable to verify submission.'
        })
      );
    }

    let recentLeads = [];

    try {
      recentLeads =
        duplicateResponseText
          ? JSON.parse(duplicateResponseText)
          : [];
    } catch (error) {
      console.error(
        'Duplicate check JSON error:',
        error
      );

      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          success: false,
          error: 'Unable to verify submission.'
        })
      );
    }

    if (Array.isArray(recentLeads) && recentLeads.length > 0) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Retry-After',
        String(cooldownMinutes * 60)
      );

      return res.end(
        JSON.stringify({
          success: false,
          error:
            'A submission from this email was already received recently. Please try again later.'
        })
      );
    }

    // --------------------------------------------------
    // LEAD PAYLOAD
    // --------------------------------------------------

    const leadPayload = {
      company_name: company || null,
      contact_email: email,
      user_ip: userIp,
      current_latency_ms: latency,
      target_latency_ms: targetLatency,
      monthly_requests: monthlyRequests,
      estimated_monthly_loss: estimatedLoss,
      status: 'new'
    };

    // --------------------------------------------------
    // 1. SAVE TO SUPABASE
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
          error: `Supabase Error (${dbResponse.status})`
        })
      );
    }

    // --------------------------------------------------
    // 2. SEND EMAIL VIA RESEND
    // --------------------------------------------------

    let emailWarning = null;

    if (resendApiKey && notifyEmail) {
      try {
        const escapeHtml = (value) =>
          String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        const safeCompany =
          escapeHtml(company || 'N/A');

        const safeEmail =
          escapeHtml(email);

        const safeIp =
          escapeHtml(userIp);

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
                company || email
              }`,
              html: `
                <h2>New Africa Latency Lead</h2>

                <p>
                  <strong>Company:</strong>
                  ${safeCompany}
                </p>

                <p>
                  <strong>Email:</strong>
                  ${safeEmail}
                </p>

                <p>
                  <strong>Current latency:</strong>
                  ${latency} ms
                </p>

                <p>
                  <strong>Target latency:</strong>
                  ${targetLatency} ms
                </p>

                <p>
                  <strong>Monthly requests:</strong>
                  ${monthlyRequests}
                </p>

                <p>
                  <strong>Estimated monthly loss:</strong>
                  ${estimatedLoss}
                </p>

                <p>
                  <strong>IP address:</strong>
                  ${safeIp}
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
          const emailErrorText =
            await emailResponse.text();

          emailWarning =
            `Email not sent (HTTP ${emailResponse.status})`;

          console.error(
            'Resend error:',
            emailErrorText
          );
        }
      } catch (emailError) {
        emailWarning =
          `Email not sent: ${emailError.message}`;

        console.error(
          'Resend exception:',
          emailError
        );
      }
    } else {
      emailWarning =
        'Email not sent: Resend configuration is missing.';
    }

    // --------------------------------------------------
    // SUCCESS
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
    console.error(
      'submit-lead unexpected error:',
      error
    );

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
