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
    fullText += `\n--- PAGINA ${pageNum} ---\n${extractStructuredText(textItems)}\n`;
  }
  return fullText;
};

// ─── Sleep helper ──────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// ─── Retry con backoff esponenziale su 429/503 ──────────────────────────
// Tentativi: 1º immediato, 2º dopo 2s, 3º dopo 4s
const withRetry = async (
  fn: () => Promise<string>,
  onProgress?: (msg: string) => void,
  maxAttempts = 3,
  baseDelayMs = 2000
): Promise<string> => {
  let lastErr: Error = new Error('Unknown error');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const is429 = lastErr.message.includes('429') || lastErr.message.includes('503') || lastErr.message.includes('overload');
      if (!is429 || attempt === maxAttempts) throw lastErr;
      const delay = baseDelayMs * attempt; // 2s, 4s, 6s
      onProgress?.(`⏳ Rate limit — attendo ${delay / 1000}s (tentativo ${attempt}/${maxAttempts})...`);
      await sleep(delay);
    }
  }
  throw lastErr;
};

// ─── Cascade completa: Gemma → Nemotron → GPT-oss ────────────────────────
// Ogni modello viene tentato con retry prima di passare al successivo.
const CASCADE_MODELS = [
  OPENROUTER_MODEL_EXTRACT,   // google/gemma-4-31b-it:free
  OPENROUTER_MODEL_NARRATIVE, // nvidia/nemotron-3-super-120b-a12b:free
  OPENROUTER_MODEL_FALLBACK,  // openai/gpt-oss-120b:free
];

const callOpenRouter = async (
  model: string,
  messages: object[],
  onProgress?: (msg: string) => void
): Promise<string> => {
  // Per la chiamata narrativa usiamo direttamente il modello specificato con retry
  const modelsToTry = model === OPENROUTER_MODEL_EXTRACT
    ? CASCADE_MODELS
    : [model, OPENROUTER_MODEL_FALLBACK];

  let lastErr: Error = new Error('Tutti i modelli non disponibili');

  for (const m of modelsToTry) {
    try {
      return await withRetry(
        () => callModel(m, messages, onProgress),
        onProgress
      );
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        lastErr.message.includes('429') ||
        lastErr.message.includes('503') ||
        lastErr.message.includes('overload');

      if (isRetryable && m !== modelsToTry[modelsToTry.length - 1]) {
        onProgress?.(`⚡ ${m.split('/').pop()} esaurito, passo a modello successivo...`);
        // Pausa 1s tra switch di modello per non colpire subito il nuovo
        await sleep(1000);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
};

// ─── Prompt per singolo PDF ───────────────────────────────────────────────
const SINGLE_PDF_PROMPT = (fileName: string) =>
  `${EXTRACTION_PROMPT}

NOTA: Stai analizzando UN SOLO documento (${fileName}).
Nell'array "yearsData" includi SOLO l'anno relativo a questo documento (un solo elemento).
Compila comunque companyName, vatNumber, gseResidual e checklist.`;

// ─── Merge di più ExtractedData parziali in un unico oggetto ──────────────
const mergeExtractedData = (results: ExtractedData[]): ExtractedData => {
  const base = results[0];

  const allYears = results
    .flatMap((r) => r.yearsData ?? [])
    .filter((y) => y && y.year)
    .sort((a, b) => Number(b.year) - Number(a.year));

  const seenYears = new Set<string>();
  const yearsData = allYears.filter((y) => {
    if (seenYears.has(y.year)) return false;
    seenYears.add(y.year);
    return true;
  });

  const mergeChecklistField = (key: keyof ExtractedData['checklist']) => {
    const found = results.find((r) => r.checklist?.[key]?.presente === true);
    return found?.checklist?.[key] ?? base.checklist?.[key];
  };

  return {
    ...base,
    yearsData,
    checklist: {
      debitiGSE:       mergeChecklistField('debitiGSE'),
      accantonamenti:  mergeChecklistField('accantonamenti'),
      riduzioniRicavi: mergeChecklistField('riduzioniRicavi'),
      contenziosi:     mergeChecklistField('contenziosi'),
    },
  };
};

// ─── Export: Estrazione dati dai PDF (sequenziale + retry) ──────────────
export const extractDataFromPdfs = async (
  files: File[],
  onProgress?: (msg: string) => void
): Promise<ExtractedData> => {
  onProgress?.('Estrazione testo dai PDF...');

  // 1. Estrai testo da ogni PDF
  const docTexts: { fileName: string; text: string }[] = [];
  for (const file of files) {
    onProgress?.(`Lettura: ${file.name}`);
    const text = await extractTextFromPdf(file);
    docTexts.push({ fileName: file.name, text });
  }

  // 2. Chiamate AI sequenziali (1 alla volta per rispettare rate limit :free)
  const parsedResults: ExtractedData[] = [];
  const errors: string[] = [];

  for (let i = 0; i < docTexts.length; i++) {
    const { fileName, text } = docTexts[i];
    onProgress?.(`Analisi AI [${i + 1}/${docTexts.length}]: ${fileName}...`);

    // Pausa di 1.5s tra una chiamata e l'altra (rate limit :free ≈ 1 req/s)
    if (i > 0) await sleep(1500);

    try {
      const raw = await callOpenRouter(
        OPENROUTER_MODEL_EXTRACT,
        [
          {
            role: 'system',
            content: 'Sei un analista finanziario. Rispondi solo in JSON valido, senza markdown.',
          },
          {
            role: 'user',
            content: `${SINGLE_PDF_PROMPT(fileName)}\n\n=== DOCUMENTO: ${fileName} ===\n${text}`,
          },
        ],
        (msg) => onProgress?.(`  [PDF ${i + 1}] ${msg}`)
      );

      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResults.push(JSON.parse(cleaned) as ExtractedData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`PDF ${i + 1} (${fileName}): ${msg}`);
      onProgress?.(`⚠️ PDF ${i + 1} non estratto: ${msg}`);
    }
  }

  if (parsedResults.length === 0) {
    throw new Error(`Nessuna estrazione riuscita.\n${errors.join('\n')}`);
  }

  if (errors.length > 0) {
    onProgress?.(`⚠️ ${errors.length} PDF parzialmente non estratti.`);
  }

  onProgress?.('Merge dati estratti...');
  return mergeExtractedData(parsedResults);
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
