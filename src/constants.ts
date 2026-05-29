// Prompt strings for AI steps

export const GITHUB_MODEL_EXTRACT = 'meta/Llama-4-Maverick-17B-128E-Instruct-FP8';
export const GITHUB_MODEL_NARRATIVE = 'DeepSeek-V3-0324';
export const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference';

/**
 * Prompt used for the first AI call: extract structured data from the uploaded PDFs.
 * The prompt must force the model to return **pure JSON** without any markdown or backticks.
 */
export const EXTRACTION_PROMPT = `Sei un esperto analista finanziario italiano specializzato in istruttorie per il GSE (Gestore dei Servizi Energetici).
Analizza i documenti PDF allegati (bilanci aziendali e documento GSE) ed estrai i dati richiesti.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.

Struttura JSON richiesta:
{
  "companyName": { "value": "string", "page": number, "rawText": "string", "bbox": { "x0": number, "y0": number, "x1": number, "y1": number } },
  "vatNumber":   { "value": "string", "page": number, "rawText": "string", "bbox": null },
  "gseResidual": { "value": number, "page": number, "rawText": "string", "bbox": null },
  "yearsData": [
    {
      "year": "YYYY",
      "sourceFileName": "string",
      "ricavi":   { "value": number, "page": number, "rawText": "string", "bbox": null },
      "ebitda":   { "value": number, "page": number, "rawText": "string", "bbox": null },
      "ebit":     { "value": number, "page": number, "rawText": "string", "bbox": null },
      "utileNetto": { "value": number, "page": number, "rawText": "string", "bbox": null }
    }
  ],
  "checklist": {
    "debitiGSE": { "presente": boolean, "dettaglio": "string", "page": number, "bbox": null },
    "accantonamenti": { "presente": boolean, "dettaglio": "string", "page": number, "bbox": null },
    "riduzioniRicavi": { "presente": boolean, "dettaglio": "string", "page": number, "bbox": null },
    "contenziosi": { "presente": boolean, "dettaglio": "string", "page": number, "bbox": null }
  }
}
`;

/**
 * Prompt used for the second AI call: generate the narrative report based on the JSON extracted in step 1.
 */
export const NARRATIVE_PROMPT = (extractedData: string) => `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica della sostenibilita del debito da extraprofitti (art. 15-bis D.L. 4/2022).

Dati estratti dai bilanci (forniti come JSON):
${extractedData}

Redigi una relazione tecnica professionale in italiano con le seguenti sezioni:
1. "analisiRicavi": Analisi dell'andamento dei ricavi e della redditività (2-3 paragrafi)
2. "analisiLiquidita": Analisi della posizione finanziaria e liquidità (2-3 paragrafi)
3. "accantonamenti": Verifica degli accantonamenti e passività potenziali (1-2 paragrafi)
4. "conclusione": Conclusione tecnica sulla sostenibilità del debito GSE (1 paragrafo)
5. "esito": Stringa breve: "SOSTENIBILE" o "NON SOSTENIBILE" o "SOSTENIBILE CON RISERVA"

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backticks.
`;

// Legacy aliases per retrocompatibilità con altri file
export const PROMPT_1_ESTRAZIONE = EXTRACTION_PROMPT;
export const PROMPT_2_NARRATIVA = NARRATIVE_PROMPT;
