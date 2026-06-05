/**
 * extractionStorage.ts
 * Wrapper per le chiamate al Worker: salva/legge le estrazioni AI su Cloudflare KV.
 */

import { ExtractedData } from '../types';
import { ExtractionMeta } from '../types';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://gse-report-worker.riccardocoppola00.workers.dev';

/**
 * Salva un'estrazione su KV.
 * Fire-and-forget: non blocca il flusso principale. Ritorna l'id salvato o null in caso di errore.
 */
export async function saveExtraction(
  extractedData: ExtractedData,
  isDemoMode: boolean,
): Promise<string | null> {
  try {
    const res = await fetch(`${WORKER_URL}/extractions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractedData, isDemoMode }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { ok: boolean; id?: string };
    return json.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Recupera la lista dei metadata di tutte le estrazioni salvate.
 */
export async function listExtractions(): Promise<ExtractionMeta[]> {
  try {
    const res = await fetch(`${WORKER_URL}/extractions`);
    if (!res.ok) return [];
    return (await res.json()) as ExtractionMeta[];
  } catch {
    return [];
  }
}

/**
 * Recupera il payload completo di una singola estrazione per id.
 */
export async function getExtraction(id: string): Promise<ExtractedData | null> {
  try {
    const res = await fetch(`${WORKER_URL}/extractions/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as ExtractedData;
  } catch {
    return null;
  }
}
