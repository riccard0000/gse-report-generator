import { GoogleGenAI, Part } from '@google/genai';
import { ExtractedData, NarrativeData } from './types';
import { GEMINI_MODEL, EXTRACTION_PROMPT, NARRATIVE_PROMPT } from './constants';

const getApiKey = (): string => {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    throw new Error('VITE_GEMINI_API_KEY non configurata. Aggiungi la variabile d\'ambiente.');
  }
  return key;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
  });
};

export const extractDataFromPdfs = async (
  files: File[],
  onProgress?: (msg: string) => void
): Promise<ExtractedData> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  onProgress?.('Preparazione dei documenti PDF...');

  const parts: Part[] = [{ text: EXTRACTION_PROMPT }];

  for (const file of files) {
    onProgress?.(`Caricamento: ${file.name}`);
    const base64 = await fileToBase64(file);
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: base64,
      },
    });
    parts.push({ text: `\n[File: ${file.name}]\n` });
  }

  onProgress?.('Analisi AI in corso (può richiedere 30-60 secondi)...');

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text ?? '';
  
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedData;
  } catch (e) {
    console.error('Errore parsing JSON:', text);
    throw new Error('La risposta AI non è un JSON valido. Riprova.');
  }
};

export const generateNarrative = async (
  data: ExtractedData,
  onProgress?: (msg: string) => void
): Promise<NarrativeData> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  onProgress?.('Generazione narrativa e analisi KPI...');

  const dataStr = JSON.stringify(data, null, 2);
  const prompt = NARRATIVE_PROMPT(dataStr);

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text ?? '';

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as NarrativeData;
  } catch (e) {
    console.error('Errore parsing narrativa JSON:', text);
    throw new Error('Errore nella generazione della narrativa. Riprova.');
  }
};