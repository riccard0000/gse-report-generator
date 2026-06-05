/**
 * extractionStorage.ts
 * Wrapper per le chiamate al Worker Cloudflare.
 *
 * Flusso in 2 step:
 *   Step 1 — dopo l'estrazione AI:
 *     saveExtractionStep1(extractedData, isDemoMode)
 *     → POST /history  { step: 'extracted', extractedData, isDemoMode }
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
 */

import { ExtractedData, ExtractionMeta, ExtractionRecord } from '../types';

const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined)
  ?? 'https://gse-report-worker.riccardocoppola00.workers.dev';

// ── Step 1: salva estrazione AI grezza ───────────────────────────────────────
export async function saveExtractionStep1(
  extractedData: ExtractedData,
  isDemoMode: boolean,
): Promise<string | null> {
  try {
    const res = await fetch(`${WORKER_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'extracted', extractedData, isDemoMode }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { ok: boolean; id?: string };
    return json.id ?? null;
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
