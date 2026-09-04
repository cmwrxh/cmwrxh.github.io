export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, table, record } = req.body || {};
    const lead = record || req.body;

    if (!lead || !lead.contact_email) {
      return res.status(400).json({ error: 'No lead data provided' });
    }

    // Call Resend API directly via native fetch (no npm packages required)
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer re_atKfZyFd_M7dR1YPcpBzPMjKkkL3xGYZo',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Acme <onboarding@resend.dev>',
        to: ['Charlie@brilliantunicorn.com'],
        subject: `🚀 New Lead: ${lead.company_name || lead.contact_email}`,
        html: `
          <h2>New Calculator Lead Captured</h2>
          <p><strong>Company:</strong> ${lead.company_name || 'N/A'}</p>
          <p><strong>Email:</strong> ${lead.contact_email}</p>
          <p><strong>Current Latency:</strong> ${lead.current_latency_ms || 0} ms</p>
          <p><strong>Target Latency:</strong> ${lead.target_latency_ms || 0} ms</p>
          <p><strong>Monthly Requests:</strong> ${lead.monthly_requests || 0}</p>
          <p><strong>Estimated Monthly Loss:</strong> $${lead.estimated_monthly_loss || 0}</p>
          <p><strong>IP:</strong> ${lead.user_ip || 'N/A'}</p>
        `
      })
    });

    const responseData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API Error:', responseData);
      return res.status(500).json({ success: false, error: responseData });
    }

    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error('Server Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
