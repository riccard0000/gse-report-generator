/**
 * Cloudflare Worker — Proxy OpenRouter per GSE Report Generator
 *
 * ROTTE:
 *   POST /            — proxy chiamata OpenRouter (chat completions)
 *   GET  /config      — legge modelli       (KV key: gse_model_config) — auto-init se vuoto
 *   POST /config      — salva modelli       (KV key: gse_model_config)
 *   GET  /prompts     — legge prompt custom  (KV key: gse_prompt) — auto-init se vuoto
 *   POST /prompts     — salva prompt custom  (KV key: gse_prompt)
 *   GET  /models      — lista modelli da OpenRouter
 *   POST /history     — crea/aggiorna record storico
 *   GET  /history     — lista metadata ExtractionMeta[]
 *   GET  /history/:id — record completo ExtractionRecord
 *   OPTIONS *         — preflight CORS
 *
 * KV NAMESPACE BINDING: GSE_CONFIG (unico namespace)
 *   gse_model_config  → modelli AI primary/fallback
 *   gse_prompt        → prompt custom estrazione + narrativa
 *   history_index     → array metadati storico
 *   history:<ts>:<cf> → record completo singola estrazione
 */

const ALLOWED_ORIGINS = [
  'https://riccard0000.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const OPENROUTER_URL         = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL  = 'https://openrouter.ai/api/v1/models';

// Chiavi KV
const KV_MODELS_KEY    = 'gse_model_config';
const KV_PROMPTS_KEY   = 'gse_prompt';
const KV_HISTORY_INDEX = 'history_index';

// ── Valori di default ────────────────────────────────────────────────────────
const DEFAULT_MODELS = {
  models: {
    extract:   { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'google/gemma-4-31b-it:free' },
    narrative: { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'google/gemma-4-31b-it:free' },
  },
};

const DEFAULT_PROMPTS = {
  extraction: `Presta particolare attenzione a:\n- Distinguere i dati dell'anno corrente da quelli dell'anno precedente (colonne a destra nei prospetti)\n- Leggere le note integrative per voci non presenti nello schema abbreviato\n- Riportare i valori in unità di euro (non in migliaia)`,
  narrative: `Utilizza un tono formale e prudente, tipico della pubblica amministrazione italiana.\nSe i dati mostrano trend negativi evidenti, sottolineali con chiarezza nella conclusione.\nEvita perifrasi: esprimi i giudizi in modo diretto e non ambiguo.`,
};

// ───────────────────────────────────────────────────────────────────

function getCorsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin':  origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
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
    companyName: ed?.companyName?.value ?? '',
    vatNumber:   ed?.vatNumber?.value   ?? '',
    years:       (ed?.yearsData ?? []).map(y => y.year),
    isDemoMode:  record.isDemoMode ?? false,
  };
}

/** Legge e parsa il body JSON; restituisce null se vuoto o malformato */
async function parseBody(request) {
  const text = await request.text();
  if (!text || text.trim() === '') return null;
  try { return JSON.parse(text); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const origin      = request.headers.get('Origin') ?? '';
    const corsHeaders = getCorsHeaders(origin);
    const kv          = env.GSE_CONFIG;

    if (!corsHeaders) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const url      = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // ── GET /config ── legge modelli, auto-init se vuoto ───────────────────────
    if (request.method === 'GET' && pathname === '/config') {
      try {
        const raw = kv ? await kv.get(KV_MODELS_KEY) : null;
        if (raw) return jsonResponse(JSON.parse(raw), 200, corsHeaders);
        if (kv) await kv.put(KV_MODELS_KEY, JSON.stringify(DEFAULT_MODELS));
        return jsonResponse(DEFAULT_MODELS, 200, corsHeaders);
      } catch {
        return jsonResponse(DEFAULT_MODELS, 200, corsHeaders);
      }
    }

    // ── POST /config ── salva modelli ────────────────────────────────────────
    if (request.method === 'POST' && pathname === '/config') {
      if (!kv) return jsonResponse({ error: 'KV GSE_CONFIG non configurato.' }, 500, corsHeaders);
      const body = await parseBody(request);
      if (body === null) return jsonResponse({ error: 'Body JSON non valido o vuoto.' }, 400, corsHeaders);

      let existing = { ...DEFAULT_MODELS };
      try { const r = await kv.get(KV_MODELS_KEY); if (r) existing = JSON.parse(r); } catch { /**/ }
      const merged = { ...existing, ...(body.models ? { models: body.models } : {}) };
      try {
        await kv.put(KV_MODELS_KEY, JSON.stringify(merged));
        return jsonResponse({ ok: true }, 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /prompts ── legge prompt, auto-init se vuoto ─────────────────────
    if (request.method === 'GET' && pathname === '/prompts') {
      try {
        const raw = kv ? await kv.get(KV_PROMPTS_KEY) : null;
        if (raw) return jsonResponse(JSON.parse(raw), 200, corsHeaders);
        if (kv) await kv.put(KV_PROMPTS_KEY, JSON.stringify(DEFAULT_PROMPTS));
        return jsonResponse(DEFAULT_PROMPTS, 200, corsHeaders);
      } catch {
        return jsonResponse(DEFAULT_PROMPTS, 200, corsHeaders);
      }
    }

    // ── POST /prompts ── salva prompt ─────────────────────────────────────────
    if (request.method === 'POST' && pathname === '/prompts') {
      if (!kv) return jsonResponse({ error: 'KV GSE_CONFIG non configurato.' }, 500, corsHeaders);
      const body = await parseBody(request);
      if (body === null) return jsonResponse({ error: 'Body JSON non valido o vuoto.' }, 400, corsHeaders);

      let existing = { ...DEFAULT_PROMPTS };
      try { const r = await kv.get(KV_PROMPTS_KEY); if (r) existing = JSON.parse(r); } catch { /**/ }
      const merged = {
        extraction: body.extraction !== undefined ? String(body.extraction) : existing.extraction,
        narrative:  body.narrative  !== undefined ? String(body.narrative)  : existing.narrative,
      };
      try {
        await kv.put(KV_PROMPTS_KEY, JSON.stringify(merged));
        return jsonResponse({ ok: true }, 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /models ──────────────────────────────────────────────────────────
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

    // ── GET /history ── lista metadata ───────────────────────────────────────
    if (request.method === 'GET' && pathname === '/history') {
      if (!kv) return jsonResponse([], 200, corsHeaders);
      try {
        const raw   = await kv.get(KV_HISTORY_INDEX);
        const index = raw ? JSON.parse(raw) : [];
        index.sort((a, b) => b.timestamp - a.timestamp);
        return jsonResponse(index, 200, corsHeaders);
      } catch {
        return jsonResponse([], 200, corsHeaders);
      }
    }

    // ── POST /history ── crea (extracted) o aggiorna (confirmed) ─────────────
    if (request.method === 'POST' && pathname === '/history') {
      if (!kv) return jsonResponse({ error: 'KV GSE_CONFIG non configurato.' }, 500, corsHeaders);
      const body = await parseBody(request);
      if (body === null) return jsonResponse({ error: 'Body JSON non valido o vuoto.' }, 400, corsHeaders);

      const { id: existingId, step, extractedData, confirmedData, isDemoMode } = body;
      if (!step || !['extracted', 'confirmed'].includes(step)) {
        return jsonResponse({ error: 'Campo step invalido (usa extracted|confirmed).' }, 400, corsHeaders);
      }

      try {
        if (step === 'extracted') {
          if (!extractedData) return jsonResponse({ error: 'extractedData mancante.' }, 400, corsHeaders);
          const timestamp = Date.now();
          const vatNumber = extractedData.vatNumber?.value ?? 'unknown';
          const id        = `history:${timestamp}:${vatNumber}`;
          const record    = { id, timestamp, step: 'extracted', isDemoMode: isDemoMode ?? false, extractedData, confirmedData: null };
          await kv.put(id, JSON.stringify(record));
          await updateIndex(kv, record);
          return jsonResponse({ ok: true, id }, 200, corsHeaders);
        } else {
          if (!confirmedData) return jsonResponse({ error: 'confirmedData mancante.' }, 400, corsHeaders);
          if (!existingId)    return jsonResponse({ error: 'id mancante per step=confirmed.' }, 400, corsHeaders);
          let rec;
          const raw = await kv.get(existingId);
          if (raw) {
            rec = JSON.parse(raw);
          } else {
            rec = { id: existingId, timestamp: Date.now(), step: 'extracted', isDemoMode: isDemoMode ?? false, extractedData: null, confirmedData: null };
          }
          rec.step          = 'confirmed';
          rec.confirmedData = confirmedData;
          await kv.put(rec.id, JSON.stringify(rec));
          await updateIndex(kv, rec);
          return jsonResponse({ ok: true, id: rec.id }, 200, corsHeaders);
        }
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── GET /history/:id ── record completo ─────────────────────────────────
    const historyMatch = pathname.match(/^\/history\/(.+)$/);
    if (request.method === 'GET' && historyMatch) {
      const id = decodeURIComponent(historyMatch[1]);
      if (!kv) return jsonResponse({ error: 'KV GSE_CONFIG non configurato.' }, 500, corsHeaders);
      try {
        const raw = await kv.get(id);
        if (!raw) return jsonResponse({ error: 'Record non trovato.' }, 404, corsHeaders);
        return jsonResponse(JSON.parse(raw), 200, corsHeaders);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 500, corsHeaders);
      }
    }

    // ── POST / ── proxy OpenRouter ───────────────────────────────────────────
    if (request.method === 'POST' && (pathname === '/' || pathname === '')) {
      if (!env.OPENROUTER_API_KEY) return jsonResponse({ error: { message: 'Chiave API non configurata.' } }, 500, corsHeaders);
      const body = await parseBody(request);
      if (body === null) return jsonResponse({ error: { message: 'Body JSON non valido o vuoto.' } }, 400, corsHeaders);
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

// ── Helper: aggiorna history_index ────────────────────────────────────────────
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
