/**
 * Cloudflare Worker — Proxy OpenRouter per GSE Report Generator
 *
 * ROTTE:
 *   POST /           — proxy chiamata OpenRouter (chat completions)
 *   GET  /config     — legge modelli da KV GSE_CONFIG
 *   POST /config     — salva modelli su KV GSE_CONFIG
 *   GET  /prompts    — legge prompt custom da KV GSE_PROMPT
 *   POST /prompts    — salva prompt custom su KV GSE_PROMPT
 *   GET  /models     — lista modelli free da OpenRouter
 *   POST /history            — crea o aggiorna record storico su KV HISTORY
 *   GET  /history            — lista metadata ExtractionMeta[]
 *   GET  /history/:id        — record completo ExtractionRecord
 *   OPTIONS *        — preflight CORS
 *
 * KV NAMESPACE BINDINGS (wrangler.toml):
 *   GSE_CONFIG  → configurazione modelli AI
 *   GSE_PROMPT  → prompt custom estrazione e narrativa
 *   HISTORY     → storico estrazioni (2 step)
 */

const ALLOWED_ORIGINS = [
  'https://riccard0000.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const OPENROUTER_URL        = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL  = 'https://openrouter.ai/api/v1/models';
const KV_CONFIG_KEY          = 'app_config';
const KV_PROMPTS_KEY         = 'prompts';
const KV_HISTORY_INDEX       = 'history_index';

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

function metaFromRecord(record) {
  const ed = record.extractedData ?? record.confirmedData ?? null;
  return {
    id:          record.id,
    timestamp:   record.timestamp,
    step:        record.step,
    companyName: ed?.companyName?.value  ?? '',
    vatNumber:   ed?.vatNumber?.value    ?? '',
    years:       (ed?.yearsData ?? []).map(y => y.year),
    isDemoMode:  record.isDemoMode ?? false,
  };
}

export default {
  async fetch(request, env) {
    const origin      = request.headers.get('Origin') ?? '';
    const corsHeaders = getCorsHeaders(origin);

    if (!corsHeaders) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const url      = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // ── GET /config — legge modelli da GSE_CONFIG ─────────────────────────────
    if (request.method === 'GET' && pathname === '/config') {
      try {
        const raw = env.GSE_CONFIG ? await env.GSE_CONFIG.get(KV_CONFIG_KEY) : null;
        return jsonResponse(raw ? JSON.parse(raw) : {}, 200, corsHeaders);
      } catch {
        return jsonResponse({}, 200, corsHeaders);
      }
    }

    // ── POST /config — salva modelli su GSE_CONFIG ──────────────────────────
    if (request.method === 'POST' && pathname === '/config') {
      if (!env.GSE_CONFIG) return jsonResponse({ error: 'KV GSE_CONFIG non configurato.' }, 500, corsHeaders);
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: 'Body JSON non valido.' }, 400, corsHeaders); }

      let existing = {};
      try { const r = await env.GSE_CONFIG.get(KV_CONFIG_KEY); if (r) existing = JSON.parse(r); } catch { /**/ }

      const merged = { ...existing, ...(body.models ? { models: body.models } : {}) };
      try {
        await env.GSE_CONFIG.put(KV_CONFIG_KEY, JSON.stringify(merged));
        return jsonResponse({ ok: true }, 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /prompts — legge prompt custom da GSE_PROMPT ───────────────────────
    if (request.method === 'GET' && pathname === '/prompts') {
      try {
        const raw = env.GSE_PROMPT ? await env.GSE_PROMPT.get(KV_PROMPTS_KEY) : null;
        return jsonResponse(raw ? JSON.parse(raw) : {}, 200, corsHeaders);
      } catch {
        return jsonResponse({}, 200, corsHeaders);
      }
    }

    // ── POST /prompts — salva prompt custom su GSE_PROMPT ────────────────────
    if (request.method === 'POST' && pathname === '/prompts') {
      if (!env.GSE_PROMPT) return jsonResponse({ error: 'KV GSE_PROMPT non configurato.' }, 500, corsHeaders);
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: 'Body JSON non valido.' }, 400, corsHeaders); }

      let existing = {};
      try { const r = await env.GSE_PROMPT.get(KV_PROMPTS_KEY); if (r) existing = JSON.parse(r); } catch { /**/ }

      const merged = {
        ...existing,
        ...(body.extraction !== undefined ? { extraction: body.extraction } : {}),
        ...(body.narrative  !== undefined ? { narrative:  body.narrative  } : {}),
      };
      try {
        await env.GSE_PROMPT.put(KV_PROMPTS_KEY, JSON.stringify(merged));
        return jsonResponse({ ok: true }, 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /models ───────────────────────────────────────────────────────
    if (request.method === 'GET' && pathname === '/models') {
      if (!env.OPENROUTER_API_KEY) return jsonResponse({ error: 'Chiave API non configurata.' }, 500, corsHeaders);
      try {
        const res  = await fetch(OPENROUTER_MODELS_URL, { headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` } });
        const data = await res.json();
        return jsonResponse(data, res.status, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, corsHeaders);
      }
    }

    // ── GET /history ───────────────────────────────────────────────────────
    if (request.method === 'GET' && pathname === '/history') {
      if (!env.HISTORY) return jsonResponse([], 200, corsHeaders);
      try {
        const raw   = await env.HISTORY.get(KV_HISTORY_INDEX);
        const index = raw ? JSON.parse(raw) : [];
        index.sort((a, b) => b.timestamp - a.timestamp);
        return jsonResponse(index, 200, corsHeaders);
      } catch {
        return jsonResponse([], 200, corsHeaders);
      }
    }

    // ── POST /history ───────────────────────────────────────────────────────
    if (request.method === 'POST' && pathname === '/history') {
      if (!env.HISTORY) return jsonResponse({ error: 'KV HISTORY non configurato.' }, 500, corsHeaders);
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: 'Body JSON non valido.' }, 400, corsHeaders); }

      const { id: existingId, step, extractedData, confirmedData, isDemoMode } = body;
      if (!step || !['extracted', 'confirmed'].includes(step)) {
        return jsonResponse({ error: 'Campo step invalido.' }, 400, corsHeaders);
      }

      try {
        let record;
        if (step === 'extracted') {
          if (!extractedData) return jsonResponse({ error: 'extractedData mancante.' }, 400, corsHeaders);
          const timestamp = Date.now();
          const vatNumber = extractedData.vatNumber?.value ?? 'unknown';
          const id        = `history:${timestamp}:${vatNumber}`;
          record = { id, timestamp, step: 'extracted', isDemoMode: isDemoMode ?? false, extractedData, confirmedData: null };
          await env.HISTORY.put(id, JSON.stringify(record));
          await updateIndex(env.HISTORY, record);
          return jsonResponse({ ok: true, id }, 200, corsHeaders);
        } else {
          if (!confirmedData) return jsonResponse({ error: 'confirmedData mancante.' }, 400, corsHeaders);
          if (!existingId)    return jsonResponse({ error: 'id mancante per step=confirmed.' }, 400, corsHeaders);
          let rec;
          const raw = await env.HISTORY.get(existingId);
          if (raw) {
            rec = JSON.parse(raw);
          } else {
            const timestamp = Date.now();
            rec = { id: existingId, timestamp, step: 'extracted', isDemoMode: isDemoMode ?? false, extractedData: null, confirmedData: null };
          }
          rec.step          = 'confirmed';
          rec.confirmedData = confirmedData;
          await env.HISTORY.put(rec.id, JSON.stringify(rec));
          await updateIndex(env.HISTORY, rec);
          return jsonResponse({ ok: true, id: rec.id }, 200, corsHeaders);
        }
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /history/:id ─────────────────────────────────────────────────────
    const historyMatch = pathname.match(/^\/history\/(.+)$/);
    if (request.method === 'GET' && historyMatch) {
      const id = decodeURIComponent(historyMatch[1]);
      if (!env.HISTORY) return jsonResponse({ error: 'KV HISTORY non configurato.' }, 500, corsHeaders);
      try {
        const raw = await env.HISTORY.get(id);
        if (!raw) return jsonResponse({ error: 'Record non trovato.' }, 404, corsHeaders);
        return jsonResponse(JSON.parse(raw), 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── POST / — proxy OpenRouter ─────────────────────────────────────────────
    if (request.method === 'POST' && (pathname === '/' || pathname === '')) {
      if (!env.OPENROUTER_API_KEY) return jsonResponse({ error: { message: 'Chiave API non configurata.' } }, 500, corsHeaders);
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
      return new Response(text, { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};

async function updateIndex(kv, record) {
  let index = [];
  try { const r = await kv.get(KV_HISTORY_INDEX); if (r) index = JSON.parse(r); } catch { /**/ }
  const meta = metaFromRecord(record);
  const idx  = index.findIndex(m => m.id === meta.id);
  if (idx >= 0) index[idx] = meta; else index.push(meta);
  if (index.length > 50) {
    index.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = index.splice(0, index.length - 50);
    await Promise.all(toDelete.map(m => kv.delete(m.id)));
  }
  await kv.put(KV_HISTORY_INDEX, JSON.stringify(index));
}
