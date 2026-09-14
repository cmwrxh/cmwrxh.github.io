export default function handler(req) {
  const country = (req.headers.get('x-vercel-ip-country') || '').trim().toUpperCase();

  return new Response(JSON.stringify({ country: country || null }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
