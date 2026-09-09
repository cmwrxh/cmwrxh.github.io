export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const domain = String(body.domain || '').trim();

    if (!name || !email || !domain) {
      return res.status(400).json({ error: 'Name, email, and domain are required.' });
    }

    if (name.length > 120 || email.length > 254 || domain.length > 253) {
      return res.status(400).json({ error: 'One or more fields are too long.' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const notifyEmail = process.env.NOTIFY_EMAIL;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'AfricaLatency.dev <charlie@africalatency.dev>';

    if (!resendApiKey || !notifyEmail) {
      console.error('SiteSpeed lead notification is not configured.', {
        hasResendApiKey: Boolean(resendApiKey),
        hasNotifyEmail: Boolean(notifyEmail)
      });
      return res.status(503).json({ error: 'The request service is temporarily unavailable. Please try again later.' });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [notifyEmail],
        reply_to: email,
        subject: `Website Speed Check request — ${domain}`,
        text: [
          'New Website Speed Check request',
          '',
          `Name: ${name}`,
          `Email: ${email}`,
          `Domain: ${domain}`,
          '',
          'Offer: Starter Website Speed Check ($29–49)'
        ].join('\n')
      })
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      console.error('SiteSpeed lead notification failed.', {
        status: resendResponse.status,
        body: errorBody.slice(0, 1000)
      });
      return res.status(502).json({ error: 'We could not submit your request right now. Please try again.' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('SiteSpeed lead submission failed.', error);
    return res.status(500).json({ error: 'Unable to submit your request right now.' });
  }
}
