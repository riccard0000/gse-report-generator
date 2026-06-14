/**
 * extractionStorage.ts
 * Wrapper per le chiamate alla Azure Function proxy.
 *
 * Flusso in 3 step:
 *   Step 1 — dopo l'estrazione AI:
 *     saveExtractionStep1(extractedData, isDemoMode, files)
 *     → upload PDF su KV (PUT /files/<key>)
 *     → POST /history  { step: 'extracted', extractedData, isDemoMode, fileKeys }
 *     → ritorna l'id del record creato
 *
 *   Step 2 — dopo la conferma dati dall'utente:
 *     saveExtractionStep2(id, confirmedData, isDemoMode)
 *     → POST /history  { id, step: 'confirmed', confirmedData, isDemoMode }
 *
 *   Step 3 — dopo la generazione narrativa + download DOCX:
 *     saveExtractionStep3(id, narrativeData)   → step: 'reported'
 *     markDocxDownloaded(id)                   → docxDownloaded: true
 *     resetDocxDownloaded(id)                  → docxDownloaded: false (dopo rigenera confermato)
 *
 * Lettura:
 *   listHistory()          → GET /history
 *   getHistoryRecord(id)   → GET /history/:id
 *   downloadPdf(key)       → GET /files/:key
 */

import { ExtractedData, ExtractionMeta, ExtractionRecord, NarrativeData } from '../types';
import { OPENROUTER_ENDPOINT } from '../constants';

export const WORKER_URL = OPENROUTER_ENDPOINT?.replace(/\/$/, '') ?? '';

// ── Upload singolo PDF su KV ──────────────────────────────────────────────────
export async function uploadPdf(historyId: string, file: File): Promise<string | null> {
  const safeId = historyId.replace(/[^a-zA-Z0-9_:-]/g, '_');
  const key    = `files/${safeId}/${encodeURIComponent(file.name)}`;
  try {
    const res = await fetch(`${WORKER_URL}/files/${key}`, {
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

// ── Download PDF da KV come File ──────────────────────────────────────────────
export async function downloadPdf(key: string, fileName: string): Promise<File | null> {
  try {
    const res = await fetch(`${WORKER_URL}/files/${key}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], fileName, { type: 'application/pdf' });
  } catch {
    return null;
  }
}

// ── Step 1: salva estrazione AI grezza + upload PDF ───────────────────────────
export async function saveExtractionStep1(
  extractedData: ExtractedData,
  isDemoMode: boolean,
  files?: File[],
): Promise<string | null> {
  try {
    const res = await fetch(`${WORKER_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'extracted', extractedData, isDemoMode }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { ok: boolean; id?: string };
    const id   = json.id ?? null;
    if (!id) return null;

    // Upload PDF in parallelo (fire-and-forget)
    if (files && files.length > 0 && !isDemoMode) {
      Promise.all(files.map(f => uploadPdf(id, f))).then(async keys => {
        const fileKeys = keys.filter((k): k is string => k !== null);
        if (fileKeys.length === 0) return;
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

// ── Step 2: salva dati confermati dall'utente ─────────────────────────────────
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

// ── Step 3: salva narrativa generata → step diventa 'reported' ───────────────
export async function saveExtractionStep3(
  id: string,
  narrativeData: NarrativeData,
  isDemoMode: boolean,
): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, step: 'reported', narrativeData, isDemoMode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Marca il DOCX come scaricato ──────────────────────────────────────────────
export async function markDocxDownloaded(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, step: 'docx_downloaded' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Resetta il flag docxDownloaded dopo una rigenerazione confermata ──────────
export async function resetDocxDownloaded(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, step: 'docx_reset' }),
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

// ── Record completo ───────────────────────────────────────────────────────────
export async function getHistoryRecord(id: string): Promise<ExtractionRecord | null> {
  try {
    const res = await fetch(`${WORKER_URL}/history/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as ExtractionRecord;
  } catch {
    return null;
  }
}
