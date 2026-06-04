import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, NarrativeData } from './types';
import {
  OPENROUTER_MODEL_EXTRACT,
  OPENROUTER_MODEL_NARRATIVE,
  OPENROUTER_MODEL_FALLBACK,
  OPENROUTER_ENDPOINT,
  EXTRACTION_PROMPT,
  NARRATIVE_PROMPT,
} from './constants';
import { calculateKpis } from './kpiCalculator';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type PdfTextItem = { str: string; transform: number[] };

const isPdfTextItem = (item: unknown): item is PdfTextItem =>
  typeof item === 'object' &&
  item !== null &&
  'str' in item &&
  'transform' in item;

// ─── Parsing strutturale del PDF (mantiene struttura tabellare via coord X/Y) ─
const extractStructuredText = (items: PdfTextItem[]): string => {
  const rows: Record<number, PdfTextItem[]> = {};

  items.forEach((item) => {
    const y = Math.round(item.transform[5]);
    if (!rows[y]) rows[y] = [];
    rows[y].push(item);
  });

  return Object.keys(rows)
    .sort((a, b) => Number(b) - Number(a))
    .map((y) =>
      rows[Number(y)]
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str.trim())
        .join('\t')
    )
    .join('\n');
};

// ─── Estrazione testo da un singolo PDF ────────────────────────────────────
const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const textItems = (content.items as unknown[]).filter(isPdfTextItem);
    const pageText = extractStructuredText(textItems);
    fullText += `\n--- PAGINA ${pageNum} ---\n${pageText}\n`;
  }
  return fullText;
};

// ─── Chiamata singola al proxy Cloudflare Worker ───────────────────────────
const callModel = async (
  model: string,
  messages: object[],
  onProgress?: (msg: string) => void
): Promise<string> => {
  const proxyUrl = OPENROUTER_ENDPOINT;
  if (!proxyUrl) {
    throw new Error(
      'VITE_PROXY_URL non configurata. ' +
      'In locale: copia .env.example in .env e imposta VITE_PROXY_URL=http://localhost:8787. ' +
      'In produzione: aggiungi VITE_PROXY_URL nei secret di GitHub Actions.'
    );
  }

  onProgress?.(`Chiamata AI (${model.split('/').pop()})...`);

  const response = await fetch(proxyUrl, {
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
    const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(
      `Errore OpenRouter ${response.status}: ${
        errorData.error?.message ?? 'Errore nella richiesta'
      }`
    );
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
};

// ─── Chiamata con fallback automatico ─────────────────────────────────────
// Se il modello primario restituisce 429/503 (rate limit / overload)
// riprova automaticamente con OPENROUTER_MODEL_FALLBACK.
const callOpenRouter = async (
  model: string,
  messages: object[],
  onProgress?: (msg: string) => void
): Promise<string> => {
  try {
    return await callModel(model, messages, onProgress);
  } catch (err) {
    const isRetryable =
      err instanceof Error &&
      (err.message.includes('429') || err.message.includes('503') || err.message.includes('overload'));

    if (isRetryable && model !== OPENROUTER_MODEL_FALLBACK) {
      onProgress?.(`Modello primario non disponibile, uso fallback (${OPENROUTER_MODEL_FALLBACK.split('/').pop()})...`);
      return await callModel(OPENROUTER_MODEL_FALLBACK, messages, onProgress);
    }
    throw err;
  }
};

// ─── Export: Estrazione dati dai PDF ──────────────────────────────────────
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

  onProgress?.('Analisi AI — estrazione dati strutturati...');
  const text = await callOpenRouter(
    OPENROUTER_MODEL_EXTRACT,
    [
      { role: 'system', content: 'Sei un analista finanziario. Rispondi solo in JSON valido, senza markdown.' },
      { role: 'user', content: `${EXTRACTION_PROMPT}\n\n${docTexts.join('\n\n')}` },
    ],
    onProgress
  );

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedData;
  } catch {
    throw new Error("La risposta dell'AI non e un JSON valido. Riprovare.");
  }
};

// ─── Export: Generazione narrativa tecnica (con KPI deterministici) ─────────
export const generateNarrative = async (
  data: ExtractedData,
  onProgress?: (msg: string) => void
): Promise<NarrativeData> => {
  onProgress?.('Calcolo KPI deterministici...');

  const lastYear = data.yearsData[data.yearsData.length - 1];
  const kpis = calculateKpis(lastYear, data.gseResidual?.value ?? null);

  onProgress?.('Generazione narrativa tecnica (seconda chiamata AI)...');

  const text = await callOpenRouter(
    OPENROUTER_MODEL_NARRATIVE,
    [
      {
        role: 'system',
        content: 'Sei un funzionario GSE esperto. Rispondi solo in JSON valido, senza markdown.',
      },
      {
        role: 'user',
        content: NARRATIVE_PROMPT(
          JSON.stringify(data, null, 2),
          JSON.stringify({ anno: lastYear.year, ...kpis }, null, 2)
        ),
      },
    ],
    onProgress
  );

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as NarrativeData;
    if (!['SOSTENIBILE', 'CAUTELA', 'RISCHIO ELEVATO'].includes(parsed.esito)) {
      parsed.esito = 'CAUTELA';
    }
    return parsed;
  } catch {
    throw new Error('Errore nella generazione della narrativa. Riprovare.');
  }
};
