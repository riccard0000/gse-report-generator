/**
 * aiService.ts — ex geminiService.ts (rinominato: usa OpenRouter, non Gemini)
 * Orchestrazione chiamate AI: estrazione PDF + generazione narrativa.
 * I prompt vengono costruiti combinando la sezione contrattuale (constants.ts)
 * con la sezione custom dell'operatore (dal ModelConfigContext via callback).
 */
import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, NarrativeData } from './types';
import {
  OPENROUTER_MODEL_EXTRACT,
  OPENROUTER_MODEL_NARRATIVE,
  OPENROUTER_MODEL_FALLBACK,
  OPENROUTER_ENDPOINT,
  buildExtractionPrompt,
  buildNarrativePrompt,
} from './constants';
import { calculateKpis } from './kpiCalculator';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type PdfTextItem = { str: string; transform: number[] };

const isPdfTextItem = (item: unknown): item is PdfTextItem =>
  typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;

// ─── Limite caratteri per PDF inviato all'AI ─────────────────────────────────
// OpenInference restituisce 502 "could not decode header" quando il body HTTP
// supera ~100 KB. Il prompt contrattuale occupa ~8 KB; lasciamo ~80 KB al testo PDF.
const MAX_PDF_CHARS = 80_000;

// ─── Config modelli dal KV Worker ────────────────────────────────────────
interface ModelConfig {
  extract:   { primary: string; fallback: string };
  narrative: { primary: string; fallback: string };
}

let _cachedConfig: ModelConfig | null = null;

const getModelConfig = async (): Promise<ModelConfig> => {
  if (_cachedConfig) return _cachedConfig;
  const defaultConfig: ModelConfig = {
    extract:   { primary: OPENROUTER_MODEL_EXTRACT,   fallback: OPENROUTER_MODEL_FALLBACK },
    narrative: { primary: OPENROUTER_MODEL_NARRATIVE, fallback: OPENROUTER_MODEL_FALLBACK },
  };
  try {
    const base = OPENROUTER_ENDPOINT ?? '';
    if (!base) return defaultConfig;
    const res = await fetch(base.replace(/\/$/, '') + '/config');
    if (!res.ok) return defaultConfig;
    const data = await res.json() as { models?: ModelConfig };
    _cachedConfig = data.models ?? defaultConfig;
    return _cachedConfig;
  } catch {
    return defaultConfig;
  }
};

export const invalidateModelConfigCache = () => { _cachedConfig = null; };

// ─── Parsing strutturale PDF ──────────────────────────────────────────────
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

/**
 * Tronca il testo PDF a MAX_PDF_CHARS mantenendo le prime pagine intere.
 * Aggiunge un avviso in coda se troncato, così il modello sa che il documento
 * è parziale e non alucina valori mancanti.
 */
const truncatePdfText = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  // Tronca all'ultima riga completa per non spezzare una voce a metà
  const lastNewline = truncated.lastIndexOf('\n');
  const clean = lastNewline > maxChars * 0.8 ? truncated.slice(0, lastNewline) : truncated;
  return clean + '\n\n[DOCUMENTO TRONCATO — le pagine successive non sono state incluse per limiti di contesto]';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Estrae il contenuto testuale dalla risposta OpenRouter.
 * Gestisce il caso in cui il modello usa il campo `reasoning` invece di `content`
 * (comportamento osservato su openai/gpt-oss-120b:free e modelli con extended thinking).
 */
const extractContent = (data: {
  choices?: {
    message?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_details?: { text?: string }[];
    };
  }[];
}): string => {
  const msg = data.choices?.[0]?.message;
  if (!msg) return '';

  // Caso normale
  if (msg.content && msg.content.trim() !== '') return msg.content;

  // Fallback 1: campo `reasoning` diretto (alcuni provider free lo usano come output)
  if (msg.reasoning && msg.reasoning.trim() !== '') {
    // Il reasoning può contenere testo misto; proviamo a estrarre il blocco JSON
    const jsonMatch = msg.reasoning.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    return msg.reasoning;
  }

  // Fallback 2: reasoning_details[].text
  const rdText = msg.reasoning_details
    ?.map((d) => d.text ?? '')
    .join('')
    .trim();
  if (rdText) {
    const jsonMatch = rdText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    return rdText;
  }

  return '';
};

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
    body: JSON.stringify({ model, messages, temperature: 0.1, response_format: { type: 'json_object' } }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = errorData.error?.message ?? 'Errore nella richiesta';
    // 502 da OpenInference = payload troppo grande o upstream temporaneamente indisponibile
    // lo trattiamo come retryable così il cascade prova il modello fallback
    const status = response.status;
    const err = new Error(`Errore OpenRouter ${status}: ${msg}`);
    // Marca l'errore come retryable se 502/503/429
    if (status === 502 || status === 503 || status === 429) {
      (err as Error & { retryable: boolean }).retryable = true;
    }
    throw err;
  }
  const data = await response.json() as Parameters<typeof extractContent>[0];
  const content = extractContent(data);
  if (!content) {
    throw new Error('Risposta AI vuota: il modello non ha restituito contenuto utilizzabile.');
  }
  return content;
};

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
      const isRetryable =
        (lastErr as Error & { retryable?: boolean }).retryable === true ||
        lastErr.message.includes('429') ||
        lastErr.message.includes('503') ||
        lastErr.message.includes('502') ||
        lastErr.message.includes('overload');
      if (!isRetryable || attempt === maxAttempts) throw lastErr;
      const delay = baseDelayMs * attempt;
      onProgress?.(`⏳ Errore temporaneo — attendo ${delay / 1000}s (tentativo ${attempt}/${maxAttempts})...`);
      await sleep(delay);
    }
  }
  throw lastErr;
};

const callWithCascade = async (
  type: 'extract' | 'narrative',
  messages: object[],
  onProgress?: (msg: string) => void
): Promise<string> => {
  const cfg = await getModelConfig();
  const modelsToTry = type === 'extract'
    ? [cfg.extract.primary, cfg.extract.fallback].filter(Boolean)
    : [cfg.narrative.primary, cfg.narrative.fallback].filter(Boolean);

  let lastErr: Error = new Error('Tutti i modelli non disponibili');
  for (const m of modelsToTry) {
    try {
      return await withRetry(() => callModel(m, messages, onProgress), onProgress);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        (lastErr as Error & { retryable?: boolean }).retryable === true ||
        lastErr.message.includes('429') ||
        lastErr.message.includes('503') ||
        lastErr.message.includes('502') ||
        lastErr.message.includes('overload');
      if (isRetryable && m !== modelsToTry[modelsToTry.length - 1]) {
        onProgress?.(`⚡ ${m.split('/').pop()} non disponibile, passo a modello successivo...`);
        await sleep(1000);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
};

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

/**
 * Estrae i dati strutturati da tutti i PDF.
 * @param files  — file PDF caricati dall'utente
 * @param getPromptCustom — callback che restituisce la sezione custom del prompt (dal contesto React)
 * @param onProgress — callback per aggiornamenti UI
 */
export const extractDataFromPdfs = async (
  files: File[],
  getPromptCustom: () => string,
  onProgress?: (msg: string) => void
): Promise<ExtractedData> => {
  onProgress?.('Estrazione testo dai PDF...');
  const docTexts: { fileName: string; text: string }[] = [];
  for (const file of files) {
    onProgress?.(`Lettura: ${file.name}`);
    const rawText = await extractTextFromPdf(file);
    const text    = truncatePdfText(rawText, MAX_PDF_CHARS);
    if (rawText.length > MAX_PDF_CHARS) {
      onProgress?.(`⚠️ ${file.name}: testo troncato a ${MAX_PDF_CHARS.toLocaleString()} caratteri (originale: ${rawText.length.toLocaleString()})`);
    }
    docTexts.push({ fileName: file.name, text });
  }

  const parsedResults: ExtractedData[] = [];
  const errors: string[] = [];

  for (let i = 0; i < docTexts.length; i++) {
    const { fileName, text } = docTexts[i];
    onProgress?.(`Analisi AI [${i + 1}/${docTexts.length}]: ${fileName}...`);
    if (i > 0) await sleep(1500);
    try {
      const promptCustom = getPromptCustom();
      const fullPrompt   = buildExtractionPrompt(promptCustom, fileName);
      const raw = await callWithCascade(
        'extract',
        [
          { role: 'system', content: 'Sei un analista finanziario. Rispondi solo in JSON valido, senza markdown.' },
          { role: 'user',   content: `${fullPrompt}\n\n=== DOCUMENTO: ${fileName} ===\n${text}` },
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

  if (parsedResults.length === 0) throw new Error(`Nessuna estrazione riuscita.\n${errors.join('\n')}`);
  if (errors.length > 0) onProgress?.(`⚠️ ${errors.length} PDF parzialmente non estratti.`);
  onProgress?.('Merge dati estratti...');
  return mergeExtractedData(parsedResults);
};

/**
 * Genera la narrativa tecnica a partire dai dati estratti e verificati.
 * @param data — dati estratti (già validati dall'utente)
 * @param getPromptCustom — callback che restituisce la sezione custom del prompt narrativa
 * @param onProgress — callback per aggiornamenti UI
 */
export const generateNarrative = async (
  data: ExtractedData,
  getPromptCustom: () => string,
  onProgress?: (msg: string) => void
): Promise<NarrativeData> => {
  onProgress?.('Calcolo KPI deterministici...');
  const lastYear = data.yearsData[data.yearsData.length - 1];
  const kpis     = calculateKpis(lastYear, data.gseResidual?.value ?? null);

  onProgress?.('Generazione narrativa tecnica (seconda chiamata AI)...');
  const promptCustom = getPromptCustom();
  const fullPrompt   = buildNarrativePrompt(promptCustom, JSON.stringify(data, null, 2), JSON.stringify({ anno: lastYear.year, ...kpis }, null, 2));

  const text = await callWithCascade(
    'narrative',
    [
      { role: 'system', content: 'Sei un funzionario GSE esperto. Rispondi solo in JSON valido, senza markdown.' },
      { role: 'user',   content: fullPrompt },
    ],
    onProgress
  );

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed  = JSON.parse(cleaned) as NarrativeData;
    if (!['SOSTENIBILE', 'CAUTELA', 'RISCHIO ELEVATO'].includes(parsed.esito)) parsed.esito = 'CAUTELA';
    return parsed;
  } catch {
    throw new Error('Errore nella generazione della narrativa. Riprovare.');
  }
};
