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

// ─── Prompt per singolo PDF (restituisce yearsData con 1 anno + dati anagrafici) ─
const SINGLE_PDF_PROMPT = (fileName: string) =>
  `${EXTRACTION_PROMPT}

NOTA: Stai analizzando UN SOLO documento (${fileName}).
Nell'array "yearsData" includi SOLO l'anno relativo a questo documento (un solo elemento).
Compila comunque companyName, vatNumber, gseResidual e checklist.`;

// ─── Merge di più ExtractedData parziali in un unico oggetto ──────────────
const mergeExtractedData = (results: ExtractedData[]): ExtractedData => {
  // Prendi dati anagrafici dal primo risultato valido
  const base = results[0];

  // Aggrega yearsData da tutti i risultati, ordina per anno desc
  const allYears = results
    .flatMap((r) => r.yearsData ?? [])
    .filter((y) => y && y.year)
    .sort((a, b) => Number(b.year) - Number(a.year));

  // Deduplica per anno (tieni il primo occorrenza, più affidabile)
  const seenYears = new Set<string>();
  const yearsData = allYears.filter((y) => {
    if (seenYears.has(y.year)) return false;
    seenYears.add(y.year);
    return true;
  });

  // Merge checklist: una voce è "presente" se almeno un risultato la rileva
  const mergeChecklistField = (key: keyof ExtractedData['checklist']) => {
    const found = results.find((r) => r.checklist?.[key]?.presente === true);
    return found?.checklist?.[key] ?? base.checklist?.[key];
  };

  return {
    ...base,
    yearsData,
    checklist: {
      debitiGSE:      mergeChecklistField('debitiGSE'),
      accantonamenti: mergeChecklistField('accantonamenti'),
      riduzioniRicavi: mergeChecklistField('riduzioniRicavi'),
      contenziosi:    mergeChecklistField('contenziosi'),
    },
  };
};

// ─── Export: Estrazione dati dai PDF (3 chiamate parallele) ───────────────
export const extractDataFromPdfs = async (
  files: File[],
  onProgress?: (msg: string) => void
): Promise<ExtractedData> => {
  onProgress?.('Estrazione testo dai PDF...');

  // 1. Estrai testo da ogni PDF in sequenza (pesante sul browser, meglio non parallelizzare)
  const docTexts: { fileName: string; text: string }[] = [];
  for (const file of files) {
    onProgress?.(`Lettura: ${file.name}`);
    const text = await extractTextFromPdf(file);
    docTexts.push({ fileName: file.name, text });
  }

  onProgress?.(`Analisi AI — ${docTexts.length} chiamate parallele in corso...`);

  // 2. Lancia una chiamata AI per ogni PDF in parallelo
  const settled = await Promise.allSettled(
    docTexts.map(({ fileName, text }, idx) =>
      callOpenRouter(
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
        (msg) => onProgress?.(`[PDF ${idx + 1}/${docTexts.length}] ${msg}`)
      )
    )
  );

  // 3. Raccogli i risultati riusciti, logga gli errori
  const parsedResults: ExtractedData[] = [];
  const errors: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      try {
        const cleaned = s.value.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsedResults.push(JSON.parse(cleaned) as ExtractedData);
      } catch {
        errors.push(`PDF ${i + 1} (${docTexts[i].fileName}): risposta AI non è JSON valido`);
      }
    } else {
      errors.push(`PDF ${i + 1} (${docTexts[i].fileName}): ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
    }
  }

  if (parsedResults.length === 0) {
    throw new Error(
      `Nessuna estrazione riuscita.\n${errors.join('\n')}`
    );
  }

  if (errors.length > 0) {
    onProgress?.(`⚠️ Attenzione: ${errors.length} PDF non estratti — ${errors.join('; ')}`);
  }

  // 4. Merge dei risultati parziali
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
