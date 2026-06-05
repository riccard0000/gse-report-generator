/**
 * Cloudflare Worker — Proxy OpenRouter per GSE Report Generator
 *
 * ROTTE:
 *   POST /           — proxy chiamata OpenRouter (chat completions)
 *   GET  /config     — legge modelli + prompt custom da KV GSE_CONFIG
 *   POST /config     — salva modelli + prompt custom su KV GSE_CONFIG
 *   GET  /models     — lista modelli free da OpenRouter
 *
 *   POST /history            — crea o aggiorna un record nello storico (KV HISTORY)
 *                              body: { id?, step, extractedData?, confirmedData?, isDemoMode? }
 *                              step = 'extracted' | 'confirmed'
 *                              Se id è fornito → aggiorna record esistente (step confirmed)
 *                              Se id mancante  → crea nuovo record (step extracted)
 *   GET  /history            — lista metadata (ExtractionMeta[]) ordinata per timestamp desc
 *   GET  /history/:id        — record completo (ExtractionRecord)
 *   OPTIONS *        — preflight CORS
 *
 * KV NAMESPACE BINDINGS (wrangler.toml):
 *   GSE_CONFIG  → configurazione app (modelli, prompt)
 *   HISTORY     → storico estrazioni
 */

const ALLOWED_ORIGINS = [
  'https://riccard0000.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const OPENROUTER_URL        = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL  = 'https://openrouter.ai/api/v1/models';
const KV_CONFIG_KEY          = 'app_config';
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

/** Ricava ExtractionMeta da un ExtractionRecord */
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

    // ── GET /history — lista metadata ────────────────────────────────────
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

    // ── POST /history — crea o aggiorna record ───────────────────────────
    if (request.method === 'POST' && pathname === '/history') {
      if (!env.HISTORY) {
        return jsonResponse({ error: 'KV namespace HISTORY non configurato.' }, 500, corsHeaders);
      }
      let body;
      try { body = await request.json(); }
      catch { return jsonResponse({ error: 'Body JSON non valido.' }, 400, corsHeaders); }

      const { id: existingId, step, extractedData, confirmedData, isDemoMode } = body;

      if (!step || !['extracted', 'confirmed'].includes(step)) {
        return jsonResponse({ error: 'Campo step mancante o invalido (extracted | confirmed).' }, 400, corsHeaders);
      }

      try {
        let record;

        if (step === 'extracted') {
          // ── STEP 1: nuova estrazione AI grezzo ─────────────────────────
          if (!extractedData) {
            return jsonResponse({ error: 'Campo extractedData mancante per step=extracted.' }, 400, corsHeaders);
          }
          const timestamp = Date.now();
          const vatNumber = extractedData.vatNumber?.value ?? 'unknown';
          const id        = `history:${timestamp}:${vatNumber}`;
          record = { id, timestamp, step: 'extracted', isDemoMode: isDemoMode ?? false, extractedData, confirmedData: null };
          await env.HISTORY.put(id, JSON.stringify(record));
          await updateIndex(env.HISTORY, record);
          return jsonResponse({ ok: true, id }, 200, corsHeaders);

        } else {
          // ── STEP 2: dati confermati dall'utente ────────────────────────
          if (!confirmedData) {
            return jsonResponse({ error: 'Campo confirmedData mancante per step=confirmed.' }, 400, corsHeaders);
          }
          if (!existingId) {
            return jsonResponse({ error: 'Campo id mancante per step=confirmed.' }, 400, corsHeaders);
          }
          // Carica record esistente e aggiunge confirmedData
          const raw = await env.HISTORY.get(existingId);
          if (raw) {
            record = JSON.parse(raw);
          } else {
            // Record non trovato (es. TTL scaduto) — ricrea
            const timestamp = Date.now();
            const vatNumber = confirmedData.vatNumber?.value ?? 'unknown';
            record = { id: existingId, timestamp, step: 'extracted', isDemoMode: isDemoMode ?? false, extractedData: null, confirmedData: null };
          }
          record.step          = 'confirmed';
          record.confirmedData = confirmedData;
          await env.HISTORY.put(record.id, JSON.stringify(record));
          await updateIndex(env.HISTORY, record);
          return jsonResponse({ ok: true, id: record.id }, 200, corsHeaders);
        }
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /history/:id — record completo ────────────────────────────────
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

// ── Helper: aggiorna l'indice KV_HISTORY_INDEX ───────────────────────────────
async function updateIndex(kv, record) {
  let index = [];
  try {
    const rawIdx = await kv.get(KV_HISTORY_INDEX);
    if (rawIdx) index = JSON.parse(rawIdx);
  } catch { /**/ }

  const meta  = metaFromRecord(record);
  const idx   = index.findIndex(m => m.id === meta.id);
  if (idx >= 0) {
    index[idx] = meta;   // aggiorna voce esistente
  } else {
    index.push(meta);    // nuova voce
  }

  // Mantieni max 50 voci (rimuovi le più vecchie)
  if (index.length > 50) {
    index.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = index.splice(0, index.length - 50);
    await Promise.all(toDelete.map(m => kv.delete(m.id)));
  }

  await kv.put(KV_HISTORY_INDEX, JSON.stringify(index));
}
