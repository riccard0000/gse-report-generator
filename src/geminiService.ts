import { ExtractedData, NarrativeData } from './types';
import { OPENROUTER_MODEL_EXTRACT, OPENROUTER_MODEL_NARRATIVE, EXTRACTION_PROMPT, NARRATIVE_PROMPT } from './constants';

const getApiKey = (): string => {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'VITE_OPENROUTER_API_KEY non configurata. ' +
      'Aggiungi la variabile d\'ambiente oppure inserisci la chiave nelle impostazioni.'
    );
  }
  return key;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });

/**
 * Chiama OpenRouter con l'API OpenAI-compatibile.
 * Usa meta-llama/llama-4-maverick:free per l'estrazione (supporta PDF/vision, 1M ctx)
 * e deepseek/deepseek-chat-v3-0324:free per la narrativa (testo puro, veloce).
 */
const callOpenRouter = async (
  model: string,
  messages: object[],
  apiKey: string
): Promise<string> => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://riccard0000.github.io/gse-report-generator/',
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
    const errText = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
};

export const extractDataFromPdfs = async (
  files: File[],
  onProgress?: (msg: string) => void
): Promise<ExtractedData> => {
  const apiKey = getApiKey();

  onProgress?.('Preparazione dei documenti PDF...');

  // Costruiamo il messaggio multimodale con i PDF come base64
  const contentParts: object[] = [
    { type: 'text', text: EXTRACTION_PROMPT },
  ];

  for (const file of files) {
    onProgress?.(`Caricamento: ${file.name}`);
    const base64 = await fileToBase64(file);
    contentParts.push({
      type: 'text',
      text: `\n--- Documento: ${file.name} ---`,
    });
    // OpenRouter/Llama4 supporta PDF inline come image_url con mime type
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:application/pdf;base64,${base64}`,
      },
    });
  }

  onProgress?.('Analisi AI in corso (30-90 secondi per documenti grandi)...');

  const text = await callOpenRouter(
    OPENROUTER_MODEL_EXTRACT,
    [{ role: 'user', content: contentParts }],
    apiKey
  );

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedData;
  } catch (e) {
    console.error('Errore parsing JSON estrazione:', text);
    throw new Error('La risposta AI non è un JSON valido. Riprova o scegli un modello diverso.');
  }
};

export const generateNarrative = async (
  data: ExtractedData,
  onProgress?: (msg: string) => void
): Promise<NarrativeData> => {
  const apiKey = getApiKey();

  onProgress?.('Generazione narrativa tecnica...');

  const prompt = NARRATIVE_PROMPT(JSON.stringify(data, null, 2));

  const text = await callOpenRouter(
    OPENROUTER_MODEL_NARRATIVE,
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
