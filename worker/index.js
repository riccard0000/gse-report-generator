/**
 * Cloudflare Worker — Proxy OpenRouter per GSE Report Generator
 *
 * ROTTE:
 *   POST /           — proxy chiamata OpenRouter (chat completions)
 *   GET  /config     — legge modelli + prompt custom da KV
 *   POST /config     — salva modelli + prompt custom su KV
 *   GET  /models     — lista modelli free da OpenRouter
 *   GET  /extractions       — lista storico estrazioni (metadata)
 *   POST /extractions       — salva nuova estrazione
 *   GET  /extractions/:id   — restituisce estrazione completa per id
 *   OPTIONS *        — preflight CORS
 *
 * KV NAMESPACE: GSE_CONFIG (binding "GSE_CONFIG" in wrangler.toml)
 * KEY config:       "app_config"
 * KEY estrazioni:   "extraction:{timestamp}:{vatNumber}"  (valore = JSON completo)
 * KEY indice:       "extractions_index"  (valore = JSON array di ExtractionMeta)
 */

const ALLOWED_ORIGINS = [
  'https://riccard0000.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const OPENROUTER_URL        = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL  = 'https://openrouter.ai/api/v1/models';
const KV_CONFIG_KEY          = 'app_config';
const KV_EXTRACTIONS_INDEX   = 'extractions_index';

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

    // ── GET /config ──────────────────────────────────────────────────────
    if (request.method === 'GET' && pathname === '/config') {
      try {
        const raw    = env.GSE_CONFIG ? await env.GSE_CONFIG.get(KV_CONFIG_KEY) : null;
        const stored = raw ? JSON.parse(raw) : {};
        return jsonResponse(stored, 200, corsHeaders);
      } catch {
        return jsonResponse({}, 200, corsHeaders);
      }
    }

    // ── POST /config ─────────────────────────────────────────────────────
    if (request.method === 'POST' && pathname === '/config') {
      if (!env.GSE_CONFIG) {
        return jsonResponse({ error: 'KV namespace GSE_CONFIG non configurato.' }, 500, corsHeaders);
      }
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: 'Body JSON non valido.' }, 400, corsHeaders); }

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

    // ── GET /models ───────────────────────────────────────────────────────
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

    // ── GET /extractions — lista metadata ────────────────────────────────
    if (request.method === 'GET' && pathname === '/extractions') {
      if (!env.GSE_CONFIG) return jsonResponse([], 200, corsHeaders);
      try {
        const raw   = await env.GSE_CONFIG.get(KV_EXTRACTIONS_INDEX);
        const index = raw ? JSON.parse(raw) : [];
        // Ordine cronologico inverso (più recente prima)
        index.sort((a, b) => b.timestamp - a.timestamp);
        return jsonResponse(index, 200, corsHeaders);
      } catch {
        return jsonResponse([], 200, corsHeaders);
      }
    }

    // ── POST /extractions — salva estrazione ─────────────────────────────
    if (request.method === 'POST' && pathname === '/extractions') {
      if (!env.GSE_CONFIG) {
        return jsonResponse({ error: 'KV namespace GSE_CONFIG non configurato.' }, 500, corsHeaders);
      }
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: 'Body JSON non valido.' }, 400, corsHeaders); }

      const { extractedData, isDemoMode } = body;
      if (!extractedData) {
        return jsonResponse({ error: 'Campo extractedData mancante.' }, 400, corsHeaders);
      }

      const timestamp = Date.now();
      const vatNumber = extractedData.vatNumber?.value ?? 'unknown';
      const id        = `extraction:${timestamp}:${vatNumber}`;

      // Metadata per l'indice
      const meta = {
        id,
        timestamp,
        companyName:  extractedData.companyName?.value  ?? '',
        vatNumber:    vatNumber,
        years:        (extractedData.yearsData ?? []).map(y => y.year),
        isDemoMode:   isDemoMode ?? false,
      };

      try {
        // Salva il payload completo
        await env.GSE_CONFIG.put(id, JSON.stringify(extractedData));

        // Aggiorna l'indice
        let index = [];
        try {
          const rawIdx = await env.GSE_CONFIG.get(KV_EXTRACTIONS_INDEX);
          if (rawIdx) index = JSON.parse(rawIdx);
        } catch { /**/ }
        index.push(meta);
        // Mantieni max 50 voci
        if (index.length > 50) {
          index.sort((a, b) => a.timestamp - b.timestamp);
          const toDelete = index.splice(0, index.length - 50);
          await Promise.all(toDelete.map(m => env.GSE_CONFIG.delete(m.id)));
        }
        await env.GSE_CONFIG.put(KV_EXTRACTIONS_INDEX, JSON.stringify(index));

        return jsonResponse({ ok: true, id }, 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /extractions/:id — estrazione completa ────────────────────────
    const extractionMatch = pathname.match(/^\/extractions\/(.+)$/);
    if (request.method === 'GET' && extractionMatch) {
      const id = decodeURIComponent(extractionMatch[1]);
      if (!env.GSE_CONFIG) return jsonResponse({ error: 'KV non configurato.' }, 500, corsHeaders);
      try {
        const raw = await env.GSE_CONFIG.get(id);
        if (!raw) return jsonResponse({ error: 'Estrazione non trovata.' }, 404, corsHeaders);
        return jsonResponse(JSON.parse(raw), 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
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
