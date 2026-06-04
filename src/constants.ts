/**
 * Costanti di configurazione per il GSE Report Generator
 */

// Modello usato per l'estrazione dati strutturati dai PDF
export const GITHUB_MODEL_EXTRACT = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

// Modello usato per la generazione della narrativa tecnica
export const GITHUB_MODEL_NARRATIVE = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

// Endpoint OpenRouter (la chiave è in VITE_GITHUB_TOKEN iniettata da GitHub Actions)
export const GITHUB_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1';

/**
 * Prompt per l'estrazione dati dai PDF.
 * Forza il modello a restituire solo JSON puro.
 */
export const EXTRACTION_PROMPT = `Sei un esperto analista finanziario italiano specializzato in istruttorie per il GSE.
Analizza i documenti PDF allegati (bilanci aziendali e documenti GSE) ed estrai i dati richiesti.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Mappe voci di bilancio (schema italiano CE/SP):
- "ricavi" = Totale Valore della produzione (voce A del CE)
- "ebit" = Differenza tra valore e costi della produzione (A - B)
- "ebitda" = ebit + ammortamenti + svalutazioni + accantonamenti (dalla nota integrativa)
- "utileNetto" = voce 21 del CE
- "interessiPassivi" = Totale interessi e altri oneri finanziari (C17)
- "totaleAttivo" = Totale attivo SP
- "patrimonioNetto" = Totale patrimonio netto SP (sezione A)
- "totaleDebiti" = Totale debiti SP (sezione D)
- "debitiBancheBreve" = debiti verso banche esigibili entro 12 mesi (nota integrativa debiti)
- "debitiBancheML" = debiti verso banche esigibili oltre 12 mesi (nota integrativa debiti)
- "disponibilitaLiquide" = IV - Disponibilita liquide (attivo circolante)
- "creditiEntro12Mesi" = II - Crediti esigibili entro l'esercizio successivo
- "rimanenze" = I - Rimanenze (attivo circolante)
- "attivoCircolante" = Totale attivo circolante (C) SP
- "passivitaCorrenti" = Totale debiti esigibili entro l'esercizio (SP)
- "debitiTributari" = debiti tributari SP o nota integrativa
- "debitiPrevidenziali" = debiti previdenziali/INPS/INAIL SP o nota integrativa
- "fondoRischiOneri" = B) Fondi per rischi e oneri SP

Per ciascun valore numerico includi sempre:
- "value": numero intero (0 se assente, null se non trovato)
- "page": numero di pagina del PDF
- "rawText": la riga testuale esatta del documento da cui e stato estratto

Per la CHECKLIST cerca in SP, CE e Nota Integrativa: "GSE", "Gestore Servizi Energetici", "Extraprofitti", "D.L. 4/2022", "art. 15-bis".
Per il PDF GSE: l'importo residuo si trova dopo la frase "Importo residuo dovuto al GSE euro".

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
 * Riceve i dati estratti JSON + i KPI gia calcolati deterministicamente.
 * Risponde SOLO con JSON contenente i 4 paragrafi + esito + commentoCopertura.
 */
export const NARRATIVE_PROMPT = (extractedDataJson: string, kpiJson: string) =>
  `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica della sostenibilita del debito da extraprofitti (art. 15-bis D.L. 4/2022).

Dati estratti dai bilanci (JSON):
${extractedDataJson}

KPI calcolati deterministicamente sull'ultimo anno disponibile:
${kpiJson}

Redigi una relazione tecnica professionale in italiano con le seguenti sezioni. Ogni sezione deve essere un paragrafo discorsivo di 4-6 righe, in terza persona, con stile formale da istruttoria GSE.

1. "analisiRicavi": Analizza il trend dei ricavi negli anni disponibili. Commenta l'andamento dell'utile netto e il confronto con l'importo residuo GSE. Evidenzia segnali positivi o negativi.
2. "analisiLiquidita": Commenta i ratios di liquidita (current, quick, cash ratio). Valuta la capacita di copertura del residuo GSE con le disponibilita immediate e il circolante.
3. "accantonamenti": Analizza cosa emerge dalla checklist GSE/extraprofitti (debiti iscritti, accantonamenti, riduzioni ricavi, contenziosi). Valuta il rischio di passivita potenziali non rilevate.
4. "conclusione": Giudizio sintetico finale sulla sostenibilita dell'esborso, segnali di rischio prevalenti, raccomandazione operativa.
5. "esito": UNA SOLA delle tre stringhe esatte: "SOSTENIBILE" oppure "CAUTELA" oppure "RISCHIO ELEVATO"
6. "commentoCopertura": Una frase breve (max 2 righe) che commenta sinteticamente gli indici di copertura cassa/attivo/patrimonio rispetto al residuo GSE.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo fuori dal JSON.
`;
