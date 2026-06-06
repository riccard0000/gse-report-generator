/**
 * extractionStorage.ts
 * Wrapper per le chiamate al Worker Cloudflare.
 *
 * Flusso in 2 step:
 *   Step 1 — dopo l'estrazione AI:
 *     saveExtractionStep1(extractedData, isDemoMode, files)
 *     → upload PDF su R2 (PUT /files/<key>)
 *     → POST /history  { step: 'extracted', extractedData, isDemoMode, fileKeys }
 *     → ritorna l'id del record creato (da conservare in stato React)
 *
 *   Step 2 — dopo la conferma dati dall'utente:
 *     saveExtractionStep2(id, confirmedData, isDemoMode)
 *     → POST /history  { id, step: 'confirmed', confirmedData, isDemoMode }
 *     → aggiorna il record esistente aggiungendo confirmedData
 *
 * Lettura:
 *   listHistory()          → GET /history          → ExtractionMeta[]
 *   getHistoryRecord(id)   → GET /history/:id       → ExtractionRecord
 *   downloadPdf(key)       → GET /files/:key        → File PDF
 */

import { ExtractedData, ExtractionMeta, ExtractionRecord } from '../types';

export const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined)
  ?? 'https://gse-report-worker.riccardocoppola00.workers.dev';

// ── Upload singolo PDF su R2 ─────────────────────────────────────────────────
export async function uploadPdf(
  historyId: string,
  file: File,
): Promise<string | null> {
  // Chiave R2: "files/<historyId_sanitizzato>/<filename>"
  const safeId  = historyId.replace(/[^a-zA-Z0-9_:-]/g, '_');
  const key     = `files/${safeId}/${encodeURIComponent(file.name)}`;
  try {
    const res = await fetch(`${WORKER_URL}/files/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
    if (!res.ok) return null;
    return key;
  } catch {
    return null;
  }
}

// ── Download PDF da R2 come File ─────────────────────────────────────────────
export async function downloadPdf(
  key: string,
  fileName: string,
): Promise<File | null> {
  try {
    const res = await fetch(`${WORKER_URL}/files/${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], fileName, { type: 'application/pdf' });
  } catch {
    return null;
  }
}

// ── Step 1: salva estrazione AI grezza + upload PDF ──────────────────────────
export async function saveExtractionStep1(
  extractedData: ExtractedData,
  isDemoMode: boolean,
  files?: File[],
): Promise<string | null> {
  try {
    // 1a. Crea il record KV per ottenere l'id
    const res = await fetch(`${WORKER_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'extracted', extractedData, isDemoMode }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { ok: boolean; id?: string };
    const id   = json.id ?? null;
    if (!id) return null;

    // 1b. Upload PDF in parallelo (fire-and-forget per non bloccare la UI)
    if (files && files.length > 0 && !isDemoMode) {
      Promise.all(files.map(f => uploadPdf(id, f))).then(async keys => {
        const fileKeys = keys.filter((k): k is string => k !== null);
        if (fileKeys.length === 0) return;
        // Aggiorna il record con le chiavi R2
        await fetch(`${WORKER_URL}/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, step: 'confirmed', confirmedData: extractedData, isDemoMode, fileKeys }),
        });
      }).catch(() => { /* fallback silenzioso */ });
    }

    return id;
  } catch {
    return null;
  }
}

// ── Step 2: aggiunge dati confermati al record esistente ─────────────────────
export async function saveExtractionStep2(
  id: string,
  confirmedData: ExtractedData,
  isDemoMode: boolean,
): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, step: 'confirmed', confirmedData, isDemoMode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Lista metadata storico ────────────────────────────────────────────────────
export async function listHistory(): Promise<ExtractionMeta[]> {
  try {
    const res = await fetch(`${WORKER_URL}/history`);
    if (!res.ok) return [];
    return (await res.json()) as ExtractionMeta[];
  } catch {
    return [];
  }
}

// ── Record completo (extractedData + confirmedData) ───────────────────────────
export async function getHistoryRecord(id: string): Promise<ExtractionRecord | null> {
  try {
    const res = await fetch(`${WORKER_URL}/history/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as ExtractionRecord;
  } catch {
    return null;
  }
}
