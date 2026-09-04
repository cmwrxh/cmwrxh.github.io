export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    // Supabase webhook payload structure
    const payload = req.body;
    const record = payload.record || payload; // handles direct row or wrapped event

    const {
      company_name,
      contact_email,
      current_latency_ms,
      target_latency_ms,
      monthly_requests,
      estimated_monthly_loss,
      user_ip
    } = record;

    const resendApiKey = "re_atKfZyFd_M7dR1YPcpBzPMjKkkL3xGYZo";
    const recipientEmail = "Charlie@brilliantunicorn.com";

    if (!contact_email) {
      throw new Error('Contact email is missing from the record payload');
    }

    // Construct email content
    const emailHtml = `
      <h2>New Latency Calculator Lead!</h2>
      <p><strong>Company:</strong> ${company_name || 'N/A'}</p>
      <p><strong>Contact Email:</strong> ${contact_email}</p>
      <p><strong>Current Latency:</strong> ${current_latency_ms} ms</p>
      <p><strong>Target Latency:</strong> ${target_latency_ms} ms</p>
      <p><strong>Monthly Requests:</strong> ${Number(monthly_requests).toLocaleString()}</p>
      <p><strong>Est. Monthly Loss:</strong> $${Number(estimated_monthly_loss).toLocaleString()}</p>
      <p><strong>User IP:</strong> ${user_ip || 'Unknown'}</p>
    `;

    // Send via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Africa Latency Alerts <onboarding@resend.dev>',
        to: [recipientEmail],
        subject: `New Lead: ${company_name || contact_email} - $${Number(estimated_monthly_loss).toLocaleString()} loss`,
        html: emailHtml
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Resend API Error: ${JSON.stringify(data)}`);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, message: 'Alert email sent successfully' }));

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: err.message }));
  }
}
