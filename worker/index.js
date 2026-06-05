/**
 * Cloudflare Worker — Proxy OpenRouter per GSE Report Generator
 *
 * ROTTE:
 *   POST /           — proxy chiamata OpenRouter (chat completions)
 *   GET  /config     — legge modelli + prompt custom da KV
 *   POST /config     — salva modelli + prompt custom su KV
 *   GET  /models     — lista modelli free da OpenRouter
 *   OPTIONS *        — preflight CORS
 *
 * KV NAMESPACE: GSE_CONFIG (binding "GSE_CONFIG" in wrangler.toml)
 * KEY usata: "app_config"
 * Struttura JSON salvata:
 *   {
 *     models:  { extract: {primary, fallback}, narrative: {primary, fallback} },
 *     prompts: { extraction: string, narrative: string }
 *   }
 */

const ALLOWED_ORIGINS = [
  'https://riccard0000.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const OPENROUTER_URL       = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const KV_CONFIG_KEY        = 'app_config';

function getCorsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }
  return null;
}

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin      = request.headers.get('Origin') ?? '';
    const corsHeaders = getCorsHeaders(origin);

    if (!corsHeaders) return new Response('Forbidden', { status: 403 });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url      = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // ── GET /config — legge configurazione da KV ─────────────────────────
    if (request.method === 'GET' && pathname === '/config') {
      try {
        const raw = env.GSE_CONFIG ? await env.GSE_CONFIG.get(KV_CONFIG_KEY) : null;
        const stored = raw ? JSON.parse(raw) : {};
        return jsonResponse(stored, 200, corsHeaders);
      } catch {
        return jsonResponse({}, 200, corsHeaders);
      }
    }

    // ── POST /config — salva configurazione su KV ────────────────────────
    if (request.method === 'POST' && pathname === '/config') {
      if (!env.GSE_CONFIG) {
        return jsonResponse({ error: 'KV namespace GSE_CONFIG non configurato.' }, 500, corsHeaders);
      }
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: 'Body JSON non valido.' }, 400, corsHeaders); }

      // Legge configurazione esistente e fa merge per non sovrascrivere campi omessi
      let existing = {};
      try {
        const raw = await env.GSE_CONFIG.get(KV_CONFIG_KEY);
        if (raw) existing = JSON.parse(raw);
      } catch { /**/ }

      const merged = {
        ...existing,
        ...(body.models  ? { models:  body.models  } : {}),
        ...(body.prompts ? { prompts: body.prompts } : {}),
      };

      try {
        await env.GSE_CONFIG.put(KV_CONFIG_KEY, JSON.stringify(merged));
        return jsonResponse({ ok: true }, 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /models — proxy lista modelli OpenRouter ──────────────────────
    if (request.method === 'GET' && pathname === '/models') {
      if (!env.OPENROUTER_API_KEY) {
        return jsonResponse({ error: 'Chiave API non configurata.' }, 500, corsHeaders);
      }
      try {
        const res  = await fetch(OPENROUTER_MODELS_URL, {
          headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` },
        });
        const data = await res.json();
        return jsonResponse(data, res.status, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, corsHeaders);
      }
    }

    // ── POST / — proxy chat completions OpenRouter ───────────────────────
    if (request.method === 'POST' && (pathname === '/' || pathname === '')) {
      if (!env.OPENROUTER_API_KEY) {
        return jsonResponse({ error: { message: 'Chiave API non configurata nel Worker.' } }, 500, corsHeaders);
      }
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: { message: 'Body JSON non valido.' } }, 400, corsHeaders); }

      const upstream = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  'https://riccard0000.github.io',
          'X-Title':       'GSE Report Generator',
        },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      return new Response(text, {
        status:  upstream.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
