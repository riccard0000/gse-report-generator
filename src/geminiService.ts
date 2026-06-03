/**
 * geminiService.ts
 *
 * Logica di estrazione PDF e chiamate AI.
 * NON contiene né legge chiavi API — tutta l'autenticazione
 * è delegata al Cloudflare Worker proxy (vedere /worker/).
 */
import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, NarrativeData } from './types';
import {
  GITHUB_MODEL_EXTRACT,
  GITHUB_MODEL_NARRATIVE,
  PROXY_ENDPOINT,
  EXTRACTION_PROMPT,
  NARRATIVE_PROMPT,
} from './constants';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ─── Parsing strutturale del PDF (mantiene struttura tabellare) ────────────
const extractStructuredText = (items: any[]): string => {
  const rows: Record<number, { str: string; transform: number[] }[]> = {};

  items.forEach((item) => {
    const y = Math.round(item.transform[5] as number);
    if (!rows[y]) rows[y] = [];
    rows[y].push(item);
  });

  return Object.keys(rows)
    .sort((a: string, b: string) => Number(b) - Number(a))
    .map((y: string) =>
      rows[Number(y)]
        .sort((a, b) => (a.transform[4] as number) - (b.transform[4] as number))
        .map((i) => (i.str as string).trim())
        .join('\t')
    )
    .join('\n');
};

// ─── Estrazione testo da un singolo file PDF ───────────────────────────────
const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = extractStructuredText(content.items);
    fullText += `\n--- PAGINA ${pageNum} ---\n${pageText}\n`;
  }
  return fullText;
};

// ─── Chiamata al proxy Cloudflare Worker (nessuna chiave nel browser) ───────
const callProxy = async (
  model: string,
  messages: object[]
): Promise<string> => {
  const response = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as any;
    throw new Error(
      `Errore proxy ${response.status}: ${
        errorData?.error?.message ?? 'Errore nella richiesta'
      }`
    );
  }

  const data = await response.json() as any;
  return data?.choices?.[0]?.message?.content ?? '';
};

// ─── Export: Estrazione dati strutturati dai PDF ──────────────────────────
export const extractDataFromPdfs = async (
  files: File[],
  onProgress?: (msg: string) => void
): Promise<ExtractedData> => {
  onProgress?.('Estrazione testo dai PDF...');

  const docTexts: string[] = [];
  for (const file of files) {
    onProgress?.(`Lettura: ${file.name}`);
    const text = await extractTextFromPdf(file);
    docTexts.push(`\n=== DOCUMENTO: ${file.name} ===\n${text}`);
  }

  onProgress?.('Analisi AI in corso...');
  const text = await callProxy(GITHUB_MODEL_EXTRACT, [
    { role: 'system', content: 'Sei un analista finanziario. Rispondi solo in JSON.' },
    { role: 'user', content: `${EXTRACTION_PROMPT}\n\n${docTexts.join('\n\n')}` },
  ]);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedData;
  } catch {
    throw new Error("La risposta dell'AI non è un JSON valido. Riprova.");
  }
};

// ─── Export: Generazione narrativa tecnica ────────────────────────────────
export const generateNarrative = async (
  data: ExtractedData,
  onProgress?: (msg: string) => void
): Promise<NarrativeData> => {
  onProgress?.('Generazione narrativa tecnica...');

  const text = await callProxy(GITHUB_MODEL_NARRATIVE, [
    { role: 'user', content: NARRATIVE_PROMPT(JSON.stringify(data, null, 2)) },
  ]);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as NarrativeData;
  } catch {
    throw new Error('Errore nella generazione della narrativa. Riprova.');
  }
};
