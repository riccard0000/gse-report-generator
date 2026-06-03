/**
 * Cloudflare Worker — Proxy OpenRouter per GSE Report Generator
 *
 * DEPLOY:
 * 1. Installa Wrangler: npm install -g wrangler
 * 2. Login: wrangler login
 * 3. Aggiungi il secret: wrangler secret put OPENROUTER_API_KEY
 *    (incolla la tua chiave OpenRouter quando richiesto)
 * 4. Deploy: wrangler deploy
 * 5. Copia l'URL del Worker (es. https://gse-proxy.tuonome.workers.dev)
 * 6. Aggiungilo come VITE_PROXY_URL nei secret di GitHub Actions
 *    e come variabile in .env locale
 *
 * SICUREZZA:
 * - La chiave OpenRouter è un Secret cifrato nel Worker, MAI nel codice
 * - Solo l'origine autorizzata (ALLOWED_ORIGIN) può chiamare questo proxy
 * - In sviluppo localhost è sempre permesso
 */

const ALLOWED_ORIGINS = [
  'https://riccard0000.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Restituisce gli header CORS appropriati per l'origine richiedente.
 * Rifiuta le origini non autorizzate.
 */
function getCorsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const corsHeaders = getCorsHeaders(origin);

    // Rifiuta origini non autorizzate
    if (!corsHeaders) {
      return new Response('Forbidden', { status: 403 });
    }

    // Gestione preflight CORS (richiesta OPTIONS del browser)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    // Verifica che la chiave API sia configurata
    if (!env.OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: { message: 'Chiave API non configurata nel Worker.' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: { message: 'Body JSON non valido.' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inoltro la richiesta a OpenRouter aggiungendo la chiave API server-side
    const upstreamResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://riccard0000.github.io',
        'X-Title': 'GSE Report Generator',
      },
      body: JSON.stringify(body),
    });

    const responseData = await upstreamResponse.text();

    return new Response(responseData, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  },
};
