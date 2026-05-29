export const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';

export const EXTRACTION_PROMPT = `Sei un esperto analista finanziario italiano specializzato in istruttorie per il GSE (Gestore dei Servizi Energetici).
Analizza i PDF allegati (bilanci aziendali e documenti GSE) ed estrai i dati richiesti in formato JSON.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.

Struttura JSON richiesta:
{
  "companyName": { "value": "string", "page": number, "rawText": "string" },
  "vatNumber": { "value": "string", "page": number, "rawText": "string" },
  "gseResidual": { "value": number, "page": number, "rawText": "string" },
  "gseSourceFileName": "string o null",
  "yearsData": [
    {
      "year": "YYYY",
      "sourceFileName": "string o null",
      "ricavi": { "value": number, "page": number, "rawText": "string" },
      "ebitda": { "value": number, "page": number, "rawText": "string" },
      "ebit": { "value": number, "page": number, "rawText": "string" },
      "utileNetto": { "value": number, "page": number, "rawText": "string" },
      "interessiPassivi": { "value": number, "page": number, "rawText": "string" },
      "totaleAttivo": { "value": number, "page": number, "rawText": "string" },
      "patrimonioNetto": { "value": number, "page": number, "rawText": "string" },
      "totaleDebiti": { "value": number, "page": number, "rawText": "string" },
      "debitiBancheBreve": { "value": number, "page": number, "rawText": "string" },
      "debitiBancheML": { "value": number, "page": number, "rawText": "string" },
      "disponibilitaLiquide": { "value": number, "page": number, "rawText": "string" },
      "creditiEntro12Mesi": { "value": number, "page": number, "rawText": "string" },
      "rimanenze": { "value": number, "page": number, "rawText": "string" },
      "attivoCircolante": { "value": number, "page": number, "rawText": "string" },
      "passivitaCorrenti": { "value": number, "page": number, "rawText": "string" },
      "debitiTributari": { "value": number, "page": number, "rawText": "string" },
      "debitiPrevidenziali": { "value": number, "page": number, "rawText": "string" },
      "fondoRischiOneri": { "value": number, "page": number, "rawText": "string" }
    }
  ],
  "checklist": {
    "debitiGSE": { "presente": boolean, "dettaglio": "string", "page": number|null, "sourceFileName": "string|null" },
    "accantonamenti": { "presente": boolean, "dettaglio": "string", "page": number|null, "sourceFileName": "string|null" },
    "riduzioniRicavi": { "presente": boolean, "dettaglio": "string", "page": number|null, "sourceFileName": "string|null" },
    "contenziosi": { "presente": boolean, "dettaglio": "string", "page": number|null, "sourceFileName": "string|null" }
  }
}

Note importanti:
- Tutti i valori monetari devono essere in euro (numero intero, senza simboli)
- Se un valore non è trovato, usa null
- Identifica automaticamente quale file è il documento GSE e quali sono i bilanci
- Per yearsData, crea un oggetto per ogni anno di bilancio trovato
- La pagina si riferisce alla pagina del PDF dove hai trovato il dato
`;

export const NARRATIVE_PROMPT = (extractedData: string) => `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica della sostenibilità del debito da extraprofitti (art. 15-bis D.L. 4/2022).

Dati estratti dai bilanci:
${extractedData}

Redigi una relazione tecnica professionale in italiano con le seguenti sezioni:
1. "analisiRicavi": Analisi dell'andamento dei ricavi e della redditività (2-3 paragrafi)
2. "analisiLiquidita": Analisi della posizione finanziaria e liquidità (2-3 paragrafi)  
3. "accantonamenti": Verifica degli accantonamenti e passività potenziali (1-2 paragrafi)
4. "conclusione": Conclusione tecnica sulla sostenibilità del debito GSE (1 paragrafo)
5. "esito": Stringa breve: "SOSTENIBILE" o "NON SOSTENIBILE" o "SOSTENIBILE CON RISERVA"

Rispondi SOLO con un oggetto JSON valido:
{
  "analisiRicavi": "testo...",
  "analisiLiquidita": "testo...",
  "accantonamenti": "testo...",
  "conclusione": "testo...",
  "esito": "SOSTENIBILE"
}
`;