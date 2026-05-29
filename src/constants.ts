/**
 * Costanti di configurazione per il GSE Report Generator
 */

// Utilizziamo Gemini 2.0 Flash su OpenRouter: 
// 1. Offre una finestra di contesto enorme (per leggere bilanci complessi senza errori 413)
// 2. È estremamente veloce e ottimizzato per l'estrazione dati
export const GITHUB_MODEL_EXTRACT = 'google/gemini-2.0-flash-exp:free';
export const GITHUB_MODEL_NARRATIVE = 'google/gemini-2.0-flash-exp:free';

// Utilizziamo l'endpoint universale di OpenRouter
export const GITHUB_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1';

/**
 * Prompt per l'estrazione dati dai PDF.
 * Forza il modello a restituire solo JSON puro.
 */
export const EXTRACTION_PROMPT = `Sei un esperto analista finanziario italiano specializzato in istruttorie per il GSE.
Analizza i documenti PDF allegati (bilanci aziendali e documenti GSE) ed estrai i dati richiesti.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Struttura JSON richiesta:
{
  "companyName": { "value": "string", "page": 1, "rawText": "string" },
  "vatNumber": { "value": "string", "page": 1, "rawText": "string" },
  "gseResidual": { "value": 0, "page": 1, "rawText": "string" },
  "gseSourceFileName": "string",
  "yearsData": [
    {
      "year": "YYYY",
      "sourceFileName": "string",
      "ricavi": { "value": 0, "page": 1, "rawText": "string" },
      "ebitda": { "value": 0, "page": 1, "rawText": "string" },
      "ebit": { "value": 0, "page": 1, "rawText": "string" },
      "utileNetto": { "value": 0, "page": 1, "rawText": "string" },
      "interessiPassivi": { "value": 0, "page": 1, "rawText": "string" },
      "totaleAttivo": { "value": 0, "page": 1, "rawText": "string" },
      "patrimonioNetto": { "value": 0, "page": 1, "rawText": "string" },
      "totaleDebiti": { "value": 0, "page": 1, "rawText": "string" },
      "debitiBancheBreve": { "value": 0, "page": 1, "rawText": "string" },
      "debitiBancheML": { "value": 0, "page": 1, "rawText": "string" },
      "disponibilitaLiquide": { "value": 0, "page": 1, "rawText": "string" },
      "creditiEntro12Mesi": { "value": 0, "page": 1, "rawText": "string" },
      "rimanenze": { "value": 0, "page": 1, "rawText": "string" },
      "attivoCircolante": { "value": 0, "page": 1, "rawText": "string" },
      "passivitaCorrenti": { "value": 0, "page": 1, "rawText": "string" },
      "debitiTributari": { "value": 0, "page": 1, "rawText": "string" },
      "debitiPrevidenziali": { "value": 0, "page": 1, "rawText": "string" },
      "fondoRischiOneri": { "value": 0, "page": 1, "rawText": "string" }
    }
  ],
  "checklist": {
    "debitiGSE": { "presente": false, "dettaglio": "string", "page": 1, "sourceFileName": "string" },
    "accantonamenti": { "presente": false, "dettaglio": "string", "page": 1, "sourceFileName": "string" },
    "riduzioniRicavi": { "presente": false, "dettaglio": "string", "page": 1, "sourceFileName": "string" },
    "contenziosi": { "presente": false, "dettaglio": "string", "page": 1, "sourceFileName": "string" }
  }
}
`;

/**
 * Prompt per la generazione della narrativa tecnica.
 */
export const NARRATIVE_PROMPT = (extractedData: string) => `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica della sostenibilità del debito da extraprofitti (art. 15-bis D.L. 4/2022).

Dati estratti dai bilanci (JSON):
${extractedData}

Redigi una relazione tecnica professionale in italiano con le seguenti sezioni:
1. "analisiRicavi": Analisi dell'andamento dei ricavi e della redditività.
2. "analisiLiquidita": Analisi della posizione finanziaria e liquidità.
3. "accantonamenti": Verifica degli accantonamenti e passività potenziali.
4. "conclusione": Conclusione tecnica sulla sostenibilità del debito GSE.
5. "esito": "SOSTENIBILE" o "NON SOSTENIBILE" o "SOSTENIBILE CON RISERVA"

Rispondi SOLO con un oggetto JSON valido (formato chiave-valore).
`;