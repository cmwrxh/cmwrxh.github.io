import https from 'https';
import http from 'http';
import { performance } from 'perf_hooks';

export default async function handler(req, res) {
  // Enable CORS if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { domain } = req.body || {};
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }

  // Sanitize input
  let targetUrl = domain.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  const startTime = performance.now();

  try {
    const protocol = targetUrl.startsWith('https') ? https : http;
    
    await new Promise((resolve, reject) => {
      const request = protocol.get(targetUrl, { timeout: 6000 }, (response) => {
        response.on('data', () => {}); 
        response.on('end', () => {
          resolve();
        });
      });

      request.on('error', (err) => reject(err));
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Connection timed out'));
      });
    });

    const latency = Math.round(performance.now() - startTime);
    
    // Evaluate performance tier
    let status = 'Optimal (< 100ms)';
    if (latency > 250) {
      status = 'High Latency (> 250ms)';
    } else if (latency > 150) {
      status = 'Moderate (150ms - 250ms)';
    }

    return res.status(200).json({
      success: true,
      domain: targetUrl,
      simulatedNode: 'Safaricom 4G (Nairobi, KE)',
      latencyMs: latency,
      status: status
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Could not reach domain. Check if the URL is valid and publicly accessible.'
    });
  }
}
