import { checkRedFlags } from '../../src/data/redflags.js';
import { DEFAULT_MODEL, toGeminiHistory, callGemini } from '../../src/advisor-core.js';

const MODEL = process.env.GEMINI_MODEL || DEFAULT_MODEL;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

function corsHeaders(origin) {
  const allow = !ALLOWED.length || ALLOWED.includes(origin) ? origin || '*' : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
  if (ALLOWED.length && origin && !ALLOWED.includes(origin)) return json({ error: 'Origin not allowed' }, 403, origin);
  if (!process.env.GEMINI_API_KEY) return json({ error: 'Server is missing GEMINI_API_KEY' }, 500, origin);

  let messages;
  try {
    ({ messages } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin);
  }
  if (!Array.isArray(messages) || !messages.length) return json({ error: 'messages required' }, 400, origin);

  const history = toGeminiHistory(messages);

  // Server-side red-flag check: emergencies never reach the model.
  const flags = checkRedFlags(history[history.length - 1].parts[0].text);
  if (flags.length) return json({ urgent: true, flags }, 200, origin);

  try {
    return json({ text: await callGemini(history, process.env.GEMINI_API_KEY, MODEL) }, 200, origin);
  } catch (err) {
    return json({ error: err.message }, 502, origin);
  }
};

export const config = { path: '/api/advisor' };
