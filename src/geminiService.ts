import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData } from './types';
import { GITHUB_MODEL_EXTRACT, GITHUB_MODELS_ENDPOINT, EXTRACTION_PROMPT } from './constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Estrae il testo mantenendo la struttura tabellare tramite coordinate X/Y
 */
const extractStructuredText = (items: any[]): string => {
  const rows: { [key: number]: any[] } = {};

  items.forEach(item => {
    // La coordinata Y indica la riga, la X la colonna
    // Usiamo Math.round per raggruppare elementi sulla stessa riga
    const y = Math.round(item.transform[5]); 
    if (!rows[y]) rows[y] = [];
    rows[y].push(item);
  });

  // Ordiniamo le righe dall'alto verso il basso e gli elementi per X
  return Object.keys(rows)
    .sort((a, b) => Number(b) - Number(a)) 
    .map(y => {
      return rows[y]
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map(i => i.str.trim())
        .join('\t'); // TAB come separatore di colonna
    })
    .join('\n');
};

const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = extractStructuredText(content.items);
    fullText += `\n--- PAGINA ${i} ---\n${pageText}\n`;
  }
  return fullText;
};

// Il resto della logica rimane uguale, usa callOpenRouter già creato
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

const convertPageToBlob = async (page: any): Promise<string> => {
  const scale = 1.5; // Ottimo compromesso tra leggibilità e peso
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport }).promise;

  // Comprimiamo l'immagine in JPEG
  return canvas.toDataURL('image/jpeg', 0.7); 
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