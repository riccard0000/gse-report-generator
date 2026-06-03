/**
 * Costanti di configurazione per il GSE Report Generator
 *
 * ARCHITETTURA:
 * Il frontend NON conosce la chiave API.
 * Tutte le chiamate AI passano attraverso un Cloudflare Worker proxy
 * che aggiunge l'header Authorization server-side.
 *
 * Deploy del Worker: vedere /worker/README.md
 */

// Modello usato per l'estrazione dati strutturati dai PDF
export const GITHUB_MODEL_EXTRACT = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

// Modello usato per la generazione della narrativa tecnica
export const GITHUB_MODEL_NARRATIVE = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

/**
 * Endpoint del proxy Cloudflare Worker.
 * In sviluppo locale punta al proxy locale (wrangler dev).
 * In produzione (GitHub Pages) punta al Worker deployato.
 *
 * Sostituisci con l'URL del tuo Worker dopo il deploy:
 * es. https://gse-proxy.TUONOME.workers.dev
 */
export const PROXY_ENDPOINT = import.meta.env.VITE_PROXY_URL ?? 'https://gse-proxy.workers.dev';

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
export const NARRATIVE_PROMPT = (extractedData: string) =>
  `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica della sostenibilità del debito da extraprofitti (art. 15-bis D.L. 4/2022).

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
