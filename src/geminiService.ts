import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, NarrativeData } from './types';
import {
  GITHUB_MODEL_EXTRACT,
  GITHUB_MODEL_NARRATIVE,
  GITHUB_MODELS_ENDPOINT,
  EXTRACTION_PROMPT,
  NARRATIVE_PROMPT,
} from './constants';
import { calculateKpis } from './kpiCalculator';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Tipo inline compatibile con pdfjs-dist v4 (TextItem non e esportato come named type)
type PdfTextItem = { str: string; transform: number[] };

// ─── Chiave API da variabile d'ambiente Vite ────────────────────────────────
const getApiKey = (): string => {
  const key = import.meta.env.VITE_GITHUB_TOKEN as string;
  if (!key) throw new Error('Variabile VITE_GITHUB_TOKEN non configurata.');
  return key;
};

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
    // Filtra solo gli item con str e transform (TextItem vs TextMarkedContent)
    const textItems = content.items.filter(
      (item): item is PdfTextItem =>
        'str' in item && 'transform' in item
    );
    const pageText = extractStructuredText(textItems);
    fullText += `\n--- PAGINA ${pageNum} ---\n${pageText}\n`;
  }
  return fullText;
};

// ─── Chiamata centralizzata all'API OpenRouter ──────────────────────────────
const callOpenRouter = async (
  model: string,
  messages: object[],
  onProgress?: (msg: string) => void
): Promise<string> => {
  const apiKey = getApiKey();
  onProgress?.('Chiamata AI in corso...');

  const response = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'GSE Report Generator',
    },
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
    GITHUB_MODEL_EXTRACT,
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
    GITHUB_MODEL_NARRATIVE,
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
