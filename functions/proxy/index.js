/**
 * Azure Function — Proxy OpenAI/OpenRouter per GSE Report Generator
 * Migrato da Cloudflare Worker
 *
 * ROTTE:
 *   POST /            — proxy chiamata AI (chat completions)
 *   GET  /config      — legge modelli       (Table Storage)
 *   POST /config      — salva modelli
 *   GET  /prompts     — legge prompt custom  (Table Storage)
 *   POST /prompts     — salva prompt custom
 *   GET  /models      — lista modelli da OpenRouter
 *   POST /history     — crea/aggiorna record storico
 *   GET  /history     — lista metadata
 *   GET  /history/:id — record completo
 *   PUT  /files/:key  — upload PDF su Blob Storage
 *   GET  /files/:key  — download PDF da Blob Storage
 *   DELETE /files/:key — elimina PDF
 *   OPTIONS *         — preflight CORS
 */

'use strict';

const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');
const { BlobServiceClient } = require('@azure/storage-blob');

// ── Configurazione ────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'https://kind-mud-0ff9d7203.7.azurestaticapps.net',
  'http://localhost:5173',
  'http://localhost:4173',
];

const OPENROUTER_URL        = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const TABLE_NAME     = process.env.AZURE_STORAGE_TABLE_NAME     || 'GseConfig';
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'gse-pdf-files';
const CONN_STRING    = process.env.AZURE_STORAGE_CONNECTION_STRING;

const PDF_TTL_DAYS = 90;

const ROW_MODELS_KEY    = 'gse_model_config';
const ROW_PROMPTS_KEY   = 'gse_prompt';
const ROW_HISTORY_INDEX = 'history_index';
const PARTITION_KEY     = 'gse';

const DEFAULT_MODELS = {
  models: {
    extract:   { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'google/gemma-4-31b-it:free' },
    narrative: { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'google/gemma-4-31b-it:free' },
  },
};

const DEFAULT_PROMPTS = {
  extraction: `Presta particolare attenzione a:\n- Distinguere i dati dell'anno corrente da quelli dell'anno precedente\n- Leggere le note integrative per voci non presenti nello schema abbreviato\n- Riportare i valori in unità di euro (non in migliaia)`,
  narrative:  `Utilizza un tono formale e prudente, tipico della pubblica amministrazione italiana.\nSe i dati mostrano trend negativi evidenti, sottolineali con chiarezza nella conclusione.\nEvita perifrasi: esprimi i giudizi in modo diretto e non ambiguo.`,
};

// ── Client Azure ───────────────────────────────────────────────────────────────
function getTableClient() {
  return TableClient.fromConnectionString(CONN_STRING, TABLE_NAME);
}

function getBlobContainerClient() {
  const blobService = BlobServiceClient.fromConnectionString(CONN_STRING);
  return blobService.getContainerClient(CONTAINER_NAME);
}

// ── Helper KV via Table Storage ────────────────────────────────────────────────
async function kvGet(rowKey) {
  try {
    const client = getTableClient();
    const entity = await client.getEntity(PARTITION_KEY, rowKey);
    return entity.value || null;
  } catch (e) {
    if (e.statusCode === 404) return null;
    throw e;
  }
}

async function kvPut(rowKey, value) {
  const client = getTableClient();
  await client.upsertEntity({
    partitionKey: PARTITION_KEY,
    rowKey,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }, 'Replace');
}

async function kvDelete(rowKey) {
  try {
    const client = getTableClient();
    await client.deleteEntity(PARTITION_KEY, rowKey);
  } catch (e) {
    if (e.statusCode !== 404) throw e;
  }
}

// ── Helper CORS ────────────────────────────────────────────────────────────────
function getCorsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin':  origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    };
  }
  return null;
}

function jsonResponse(context, data, status, corsHeaders) {
  context.res = {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function metaFromRecord(record) {
  const ed = record.confirmedData ?? record.extractedData ?? null;
  return {
    id:             record.id,
    timestamp:      record.timestamp,
    step:           record.step,
    companyName:    ed?.companyName?.value ?? '',
    vatNumber:      ed?.vatNumber?.value   ?? '',
    years:          (ed?.yearsData ?? []).map(y => y.year),
    isDemoMode:     record.isDemoMode     ?? false,
    fileKeys:       record.fileKeys       ?? [],
    docxDownloaded: record.docxDownloaded ?? false,
  };
}

async function parseBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
    return null;
  } catch { return null; }
}

async function updateIndex(record) {
  let index = [];
  try {
    const raw = await kvGet(ROW_HISTORY_INDEX);
    if (raw) index = JSON.parse(raw);
  } catch { /**/ }
  const meta = metaFromRecord(record);
  const idx  = index.findIndex(m => m.id === meta.id);
  if (idx >= 0) index[idx] = meta; else index.push(meta);
  if (index.length > 50) {
    index.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = index.splice(0, index.length - 50);
    await Promise.all(toDelete.map(m => kvDelete(m.id)));
  }
  await kvPut(ROW_HISTORY_INDEX, JSON.stringify(index));
}

// ── Entry point Azure Function ─────────────────────────────────────────────────
module.exports = async function (context, req) {
  const origin      = req.headers['origin'] || req.headers['Origin'] || '';
  const corsHeaders = getCorsHeaders(origin);

  if (!corsHeaders) {
    context.res = { status: 403, body: 'Forbidden' };
    return;
  }

  if (req.method === 'OPTIONS') {
    context.res = { status: 204, headers: corsHeaders, body: '' };
    return;
  }

  // Normalizza pathname (Azure passa il path in req.params.restOfPath)
  const restOfPath = req.params?.restOfPath || '';
  const pathname   = ('/' + restOfPath).replace(/\/+$/, '') || '/';
  const method     = req.method.toUpperCase();

  // ── PUT /files/:key ───────────────────────────────────────────────────────
  if (method === 'PUT' && pathname.startsWith('/files/')) {
    const key = decodeURIComponent(pathname.slice(7));
    if (!key) { jsonResponse(context, { error: 'Key mancante.' }, 400, corsHeaders); return; }
    try {
      const buffer = req.body;
      if (!Buffer.isBuffer(buffer) && !ArrayBuffer.isView(buffer)) {
        jsonResponse(context, { error: 'Body non è un buffer binario.' }, 400, corsHeaders); return;
      }
      const size = buffer.length || buffer.byteLength;
      if (size > 24 * 1024 * 1024) {
        jsonResponse(context, { error: 'File troppo grande (max 24 MB).' }, 413, corsHeaders); return;
      }
      const container  = getBlobContainerClient();
      const blobClient = container.getBlockBlobClient(key);
      const expiresOn  = new Date();
      expiresOn.setDate(expiresOn.getDate() + PDF_TTL_DAYS);
      await blobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
        tags: { expiresOn: expiresOn.toISOString() },
      });
      jsonResponse(context, { ok: true, key }, 200, corsHeaders);
    } catch (e) {
      jsonResponse(context, { error: String(e) }, 500, corsHeaders);
    }
    return;
  }

  // ── HEAD /files/:key ───────────────────────────────────────────────────────
  // Il browser manda HEAD per check esistenza file (es. diagnostica PDF demo).
  // Rispondiamo solo con metadata, senza body (più veloce, senza download).
  if (method === 'HEAD' && pathname.startsWith('/files/')) {
    const key = decodeURIComponent(pathname.slice(7));
    try {
      const container  = getBlobContainerClient();
      const blobClient = container.getBlockBlobClient(key);
      const props      = await blobClient.getProperties();
      const filename   = decodeURIComponent(key.split('/').pop() || 'documento.pdf');
      context.res = {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type':        props.contentType || 'application/pdf',
          'Content-Length':      String(props.contentLength),
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control':       'private, max-age=3600',
        },
        body: '',
      };
    } catch (e) {
      if (e.statusCode === 404) {
        context.res = { status: 404, headers: corsHeaders, body: '' };
      } else {
        jsonResponse(context, { error: String(e) }, 500, corsHeaders);
      }
    }
    return;
  }

  // ── GET /files/:key ───────────────────────────────────────────────────────
  if (method === 'GET' && pathname.startsWith('/files/')) {
    const key = decodeURIComponent(pathname.slice(7));
    try {
      const container  = getBlobContainerClient();
      const blobClient = container.getBlockBlobClient(key);
      const download   = await blobClient.download();
      const chunks     = [];
      for await (const chunk of download.readableStreamBody) chunks.push(chunk);
      const buffer   = Buffer.concat(chunks);
      const filename = decodeURIComponent(key.split('/').pop() || 'documento.pdf');
      context.res = {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type':        'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control':       'private, max-age=3600',
        },
        body: buffer,
        isRaw: true,
      };
    } catch (e) {
      if (e.statusCode === 404) {
        context.res = { status: 404, headers: corsHeaders, body: 'Not found' };
      } else {
        jsonResponse(context, { error: String(e) }, 500, corsHeaders);
      }
    }
    return;
  }

  // ── DELETE /files/:key ────────────────────────────────────────────────────
  if (method === 'DELETE' && pathname.startsWith('/files/')) {
    const key = decodeURIComponent(pathname.slice(7));
    try {
      const container  = getBlobContainerClient();
      const blobClient = container.getBlockBlobClient(key);
      await blobClient.deleteIfExists();
      jsonResponse(context, { ok: true }, 200, corsHeaders);
    } catch (e) {
      jsonResponse(context, { error: String(e) }, 500, corsHeaders);
    }
    return;
  }

  // ── GET /config ───────────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/config') {
    try {
      const raw = await kvGet(ROW_MODELS_KEY);
      if (raw) { jsonResponse(context, JSON.parse(raw), 200, corsHeaders); return; }
      await kvPut(ROW_MODELS_KEY, JSON.stringify(DEFAULT_MODELS));
      jsonResponse(context, DEFAULT_MODELS, 200, corsHeaders);
    } catch {
      jsonResponse(context, DEFAULT_MODELS, 200, corsHeaders);
    }
    return;
  }

  // ── POST /config ──────────────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/config') {
    const body = await parseBody(req);
    if (body === null) { jsonResponse(context, { error: 'Body JSON non valido o vuoto.' }, 400, corsHeaders); return; }
    let existing = { ...DEFAULT_MODELS };
    try { const r = await kvGet(ROW_MODELS_KEY); if (r) existing = JSON.parse(r); } catch { /**/ }
    const merged = { ...existing, ...(body.models ? { models: body.models } : {}) };
    try {
      await kvPut(ROW_MODELS_KEY, JSON.stringify(merged));
      jsonResponse(context, { ok: true }, 200, corsHeaders);
    } catch (e) {
      jsonResponse(context, { error: String(e) }, 500, corsHeaders);
    }
    return;
  }

  // ── GET /prompts ──────────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/prompts') {
    try {
      const raw = await kvGet(ROW_PROMPTS_KEY);
      if (raw) { jsonResponse(context, JSON.parse(raw), 200, corsHeaders); return; }
      await kvPut(ROW_PROMPTS_KEY, JSON.stringify(DEFAULT_PROMPTS));
      jsonResponse(context, DEFAULT_PROMPTS, 200, corsHeaders);
    } catch {
      jsonResponse(context, DEFAULT_PROMPTS, 200, corsHeaders);
    }
    return;
  }

  // ── POST /prompts ─────────────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/prompts') {
    const body = await parseBody(req);
    if (body === null) { jsonResponse(context, { error: 'Body JSON non valido o vuoto.' }, 400, corsHeaders); return; }
    let existing = { ...DEFAULT_PROMPTS };
    try { const r = await kvGet(ROW_PROMPTS_KEY); if (r) existing = JSON.parse(r); } catch { /**/ }
    const merged = {
      extraction: body.extraction !== undefined ? String(body.extraction) : existing.extraction,
      narrative:  body.narrative  !== undefined ? String(body.narrative)  : existing.narrative,
    };
    try {
      await kvPut(ROW_PROMPTS_KEY, JSON.stringify(merged));
      jsonResponse(context, { ok: true }, 200, corsHeaders);
    } catch (e) {
      jsonResponse(context, { error: String(e) }, 500, corsHeaders);
    }
    return;
  }

  // ── GET /models ───────────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/models') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) { jsonResponse(context, { error: 'Chiave API non configurata.' }, 500, corsHeaders); return; }
    try {
      const res  = await fetch(OPENROUTER_MODELS_URL, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const data = await res.json();
      jsonResponse(context, data, res.status, corsHeaders);
    } catch (e) {
      jsonResponse(context, { error: String(e) }, 502, corsHeaders);
    }
    return;
  }

  // ── GET /history ──────────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/history') {
    try {
      const raw   = await kvGet(ROW_HISTORY_INDEX);
      const index = raw ? JSON.parse(raw) : [];
      index.sort((a, b) => b.timestamp - a.timestamp);
      jsonResponse(context, index, 200, corsHeaders);
    } catch {
      jsonResponse(context, [], 200, corsHeaders);
    }
    return;
  }

  // ── POST /history ─────────────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/history') {
    const body = await parseBody(req);
    if (body === null) { jsonResponse(context, { error: 'Body JSON non valido o vuoto.' }, 400, corsHeaders); return; }

    const { id: existingId, step, extractedData, confirmedData, narrativeData, isDemoMode, fileKeys } = body;
    const validSteps = ['extracted', 'confirmed', 'reported', 'docx_downloaded', 'docx_reset'];
    if (!step || !validSteps.includes(step)) {
      jsonResponse(context, { error: `Campo step invalido (usa ${validSteps.join('|')}).` }, 400, corsHeaders); return;
    }

    try {
      if (step === 'extracted') {
        if (!extractedData) { jsonResponse(context, { error: 'extractedData mancante.' }, 400, corsHeaders); return; }
        const timestamp = Date.now();
        const vatNumber = extractedData.vatNumber?.value ?? 'unknown';
        const id        = `history:${timestamp}:${vatNumber}`;
        const record    = {
          id, timestamp, step: 'extracted',
          isDemoMode:     isDemoMode ?? false,
          extractedData,
          confirmedData:  null,
          narrativeData:  null,
          docxDownloaded: false,
          fileKeys:       fileKeys ?? [],
        };
        await kvPut(id, JSON.stringify(record));
        await updateIndex(record);
        jsonResponse(context, { ok: true, id }, 200, corsHeaders);
        return;
      }

      if (!existingId) { jsonResponse(context, { error: 'id mancante per step != extracted.' }, 400, corsHeaders); return; }
      let rec;
      const raw = await kvGet(existingId);
      if (raw) {
        rec = JSON.parse(raw);
      } else {
        rec = {
          id: existingId, timestamp: Date.now(), step: 'extracted',
          isDemoMode: isDemoMode ?? false,
          extractedData: null, confirmedData: null,
          narrativeData: null, docxDownloaded: false, fileKeys: [],
        };
      }

      if (step === 'confirmed') {
        if (!confirmedData) { jsonResponse(context, { error: 'confirmedData mancante.' }, 400, corsHeaders); return; }
        rec.step          = 'confirmed';
        rec.confirmedData = confirmedData;
        if (fileKeys && fileKeys.length > 0) rec.fileKeys = fileKeys;
      } else if (step === 'reported') {
        if (!narrativeData) { jsonResponse(context, { error: 'narrativeData mancante.' }, 400, corsHeaders); return; }
        rec.step          = 'reported';
        rec.narrativeData = narrativeData;
      } else if (step === 'docx_downloaded') {
        rec.docxDownloaded = true;
      } else if (step === 'docx_reset') {
        rec.docxDownloaded = false;
      }

      await kvPut(rec.id, JSON.stringify(rec));
      await updateIndex(rec);
      jsonResponse(context, { ok: true, id: rec.id }, 200, corsHeaders);

    } catch (e) {
      jsonResponse(context, { error: String(e) }, 500, corsHeaders);
    }
    return;
  }

  // ── GET /history/:id ──────────────────────────────────────────────────────
  const historyMatch = pathname.match(/^\/history\/(.+)$/);
  if (method === 'GET' && historyMatch) {
    const id = decodeURIComponent(historyMatch[1]);
    try {
      const raw = await kvGet(id);
      if (!raw) { jsonResponse(context, { error: 'Record non trovato.' }, 404, corsHeaders); return; }
      jsonResponse(context, JSON.parse(raw), 200, corsHeaders);
    } catch (e) {
      jsonResponse(context, { error: String(e) }, 500, corsHeaders);
    }
    return;
  }

  // ── POST / — proxy AI ─────────────────────────────────────────────────────
  if (method === 'POST' && (pathname === '/' || pathname === '')) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) { jsonResponse(context, { error: { message: 'Chiave API non configurata.' } }, 500, corsHeaders); return; }
    const body = await parseBody(req);
    if (body === null) { jsonResponse(context, { error: { message: 'Body JSON non valido o vuoto.' } }, 400, corsHeaders); return; }
    try {
      const upstream = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  ALLOWED_ORIGINS[0],
          'X-Title':       'GSE Report Generator',
        },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      context.res = {
        status: upstream.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: text,
      };
    } catch (e) {
      jsonResponse(context, { error: String(e) }, 502, corsHeaders);
    }
    return;
  }

  context.res = { status: 404, headers: corsHeaders, body: 'Not Found' };
};
