export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Get lead data
    const { type, table, record } = req.body || {};
    const lead = record || req.body;

    // Validate lead data
    if (!lead || !lead.contact_email) {
      return res.status(400).json({
        success: false,
        error: 'No lead data provided'
      });
    }

    // Get Resend API key securely from Vercel
    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured');

      return res.status(500).json({
        success: false,
        error: 'Server misconfigured: RESEND_API_KEY not set in Vercel environment variables.'
      });
    }

    // Send notification email through Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        from: 'Brilliant Unicorn <charlie@brilliantunicorn.com>',
        to: ['charlie@brilliantunicorn.com'],

        subject: `🚀 New Lead: ${lead.company_name || lead.contact_email}`,

        html: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px;">

            <h2 style="margin-bottom: 20px;">
              New Calculator Lead Captured
            </h2>

            <table style="width: 100%; border-collapse: collapse;">

              <tr>
                <td style="padding: 10px 0; font-weight: bold;">
                  Company
                </td>
                <td style="padding: 10px 0;">
                  ${lead.company_name || 'N/A'}
                </td>
              </tr>

              <tr>
                <td style="padding: 10px 0; font-weight: bold;">
                  Contact Email
                </td>
                <td style="padding: 10px 0;">
                  ${lead.contact_email}
                </td>
              </tr>

              <tr>
                <td style="padding: 10px 0; font-weight: bold;">
                  Current Latency
                </td>
                <td style="padding: 10px 0;">
                  ${lead.current_latency_ms || 0} ms
                </td>
              </tr>

              <tr>
                <td style="padding: 10px 0; font-weight: bold;">
                  Target Latency
                </td>
                <td style="padding: 10px 0;">
                  ${lead.target_latency_ms || 0} ms
                </td>
              </tr>

              <tr>
                <td style="padding: 10px 0; font-weight: bold;">
                  Monthly Requests
                </td>
                <td style="padding: 10px 0;">
                  ${lead.monthly_requests || 0}
                </td>
              </tr>

              <tr>
                <td style="padding: 10px 0; font-weight: bold;">
                  Estimated Monthly Loss
                </td>
                <td style="padding: 10px 0;">
                  $${lead.estimated_monthly_loss || 0}
                </td>
              </tr>

              <tr>
                <td style="padding: 10px 0; font-weight: bold;">
                  IP Address
                </td>
                <td style="padding: 10px 0;">
                  ${lead.user_ip || 'N/A'}
                </td>
              </tr>

            </table>

            <p style="margin-top: 30px; font-size: 13px;">
              This lead was submitted through the Africa Latency calculator.
            </p>

          </div>
        `
      })
    });

    const responseData = await resendResponse.json();

    // Handle Resend API errors
    if (!resendResponse.ok) {
      console.error('Resend API Error Details:', responseData);

      return res.status(resendResponse.status).json({
        success: false,
        error: responseData
      });
    }

    // Success
    return res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Server Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
