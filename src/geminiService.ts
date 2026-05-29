import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, NarrativeData } from './types';
import { GITHUB_MODEL_EXTRACT, GITHUB_MODEL_NARRATIVE, GITHUB_MODELS_ENDPOINT, EXTRACTION_PROMPT, NARRATIVE_PROMPT } from './constants';

// Configura worker PDF.js tramite CDN (evita problemi di bundling)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const getApiKey = (): string => {
  const key = import.meta.env.VITE_GITHUB_TOKEN;
  if (!key) {
    throw new Error(
      'VITE_GITHUB_TOKEN non configurata. ' +
      'Aggiungi il tuo GitHub Personal Access Token nelle impostazioni o nel file .env'
    );
  }
  return key;
};

/**
 * Estrae tutto il testo da un PDF usando PDF.js (lato browser, no server).
 */
const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(`[Pagina ${i}]\n${pageText}`);
  }

  return pages.join('\n\n');
};

/**
 * Chiama GitHub Models API (endpoint compatibile OpenAI).
 */
const callGitHubModels = async (
  model: string,
  messages: object[],
  apiKey: string
): Promise<string> => {
  const response = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) {
      throw new Error('Rate limit GitHub Models raggiunto. Attendi qualche minuto e riprova.');
    }
    throw new Error(`GitHub Models error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
};

export const extractDataFromPdfs = async (
  files: File[],
  onProgress?: (msg: string) => void
): Promise<ExtractedData> => {
  const apiKey = getApiKey();

  onProgress?.('Estrazione testo dai PDF...');

  // Estrai testo da ogni PDF con PDF.js
  const docTexts: string[] = [];
  for (const file of files) {
    onProgress?.(`Lettura: ${file.name}`);
    const text = await extractTextFromPdf(file);
    docTexts.push(`\n=== DOCUMENTO: ${file.name} ===\n${text}`);
  }

  const combinedText = docTexts.join('\n\n');

  onProgress?.('Analisi AI in corso (30-90 secondi per documenti grandi)...');

  const text = await callGitHubModels(
    GITHUB_MODEL_EXTRACT,
    [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\n${combinedText}` }],
    apiKey
  );

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedData;
  } catch (e) {
    console.error('Errore parsing JSON estrazione:', text);
    throw new Error('La risposta AI non \u00e8 un JSON valido. Riprova.');
  }
};

export const generateNarrative = async (
  data: ExtractedData,
  onProgress?: (msg: string) => void
): Promise<NarrativeData> => {
  const apiKey = getApiKey();

  onProgress?.('Generazione narrativa tecnica...');

  const prompt = NARRATIVE_PROMPT(JSON.stringify(data, null, 2));

  const text = await callGitHubModels(
    GITHUB_MODEL_NARRATIVE,
    [{ role: 'user', content: prompt }],
    apiKey
  );

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as NarrativeData;
  } catch (e) {
    console.error('Errore parsing narrativa:', text);
    throw new Error('Errore nella generazione della narrativa. Riprova.');
  }
};
