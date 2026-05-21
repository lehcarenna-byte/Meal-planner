export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set' }), { status: 500, headers });
  }

  // Parse body safely — edge runtimes can be finicky about req.json()
  let body;
  try {
    const text = await req.text();
    body = JSON.parse(text);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to parse request body', detail: err.message }), { status: 400, headers });
  }

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach Anthropic API', detail: err.message }), { status: 502, headers });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to parse Anthropic response', detail: err.message }), { status: 502, headers });
  }

  return new Response(JSON.stringify(data), { status: response.status, headers });
}
