import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, NarrativeData } from './types';
import { 
  GITHUB_MODEL_EXTRACT, 
  GITHUB_MODEL_NARRATIVE, 
  GITHUB_MODELS_ENDPOINT, 
  EXTRACTION_PROMPT, 
  NARRATIVE_PROMPT 
} from './constants';

// Configura worker PDF.js tramite CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const getApiKey = (): string => {
  const key = import.meta.env.VITE_GITHUB_TOKEN;
  if (!key) {
    throw new Error('API Key non configurata nel file .env o nei Secrets di GitHub.');
  }
  return key;
};

/**
 * Funzione centralizzata per le chiamate API verso OpenRouter
 */
const callOpenRouter = async (model: string, messages: object[]): Promise<string> => {
  const apiKey = getApiKey();
  
  // L'URL corretto viene formato unendo l'endpoint base con il path /chat/completions
  const response = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin, // Necessario per OpenRouter
      'X-Title': 'GSE Report Generator'      // Necessario per OpenRouter
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.1,
      response_format: { type: 'json_object' }, // Forza l'output JSON
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Errore OpenRouter ${response.status}: ${errorData.error?.message || 'Errore nella richiesta'}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
};

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
  const text = await callOpenRouter(GITHUB_MODEL_EXTRACT, [
    { role: 'system', content: "Sei un analista finanziario. Rispondi solo in JSON." },
    { role: 'user', content: `${EXTRACTION_PROMPT}\n\n${docTexts.join('\n\n')}` }
  ]);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedData;
  } catch (e) {
    throw new Error('La risposta dell\'AI non è un JSON valido.');
  }
};

export const generateNarrative = async (
  data: ExtractedData,
  onProgress?: (msg: string) => void
): Promise<NarrativeData> => {
  onProgress?.('Generazione narrativa tecnica...');
  
  const text = await callOpenRouter(GITHUB_MODEL_NARRATIVE, [
    { role: 'user', content: NARRATIVE_PROMPT(JSON.stringify(data, null, 2)) }
  ]);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as NarrativeData;
  } catch (e) {
    throw new Error('Errore nella generazione della narrativa.');
  }
};