/**
 * Costanti di configurazione per il GSE Report Generator
 */

// ─── Modelli OpenRouter (tutti :free) ─────────────────────────────────────
export const OPENROUTER_MODEL_EXTRACT   = 'nvidia/nemotron-3-super-120b-a12b:free';
export const OPENROUTER_MODEL_NARRATIVE = 'nvidia/nemotron-3-super-120b-a12b:free';
export const OPENROUTER_MODEL_FALLBACK  = 'google/gemma-4-31b-it:free';

// Endpoint del proxy Cloudflare Worker
export const OPENROUTER_ENDPOINT = import.meta.env.VITE_PROXY_URL as string;

// ─── PROMPT ESTRAZIONE ────────────────────────────────────────────────────
/**
 * Sezione CONTRATTUALE — non editabile, non inviata al KV.
 * Definisce ruolo, mappature voci di bilancio, struttura JSON di output.
 * Questa sezione garantisce l'integrità del parsing e NON deve essere
 * modificata dall'utente per non rompere il flusso di estrazione.
 */
export const EXTRACTION_PROMPT_CONTRACT = `Sei un esperto analista finanziario italiano specializzato in istruttorie per il GSE.
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

Per ciascun valore numerico includi sempre questi 4 campi:
- "value": numero intero (0 se assente, null se non trovato)
- "page": numero di pagina del PDF
- "rawText": la riga testuale COMPLETA del documento (etichetta + tutti i numeri presenti)
- "rawLabel": SOLO il testo dell'etichetta/voce, SENZA NESSUN NUMERO.
  Esempio: se la riga è "Totale valore della produzione   818.547   778.956",
  rawText = "Totale valore della produzione 818.547 778.956",
  rawLabel = "Totale valore della produzione".
  Per formule/calcoli (es. EBITDA stimato), rawLabel = nome della voce principale (es. "Differenza tra valore e costi della produzione").
  rawLabel NON deve mai contenere cifre, punti decimali o virgole numeriche.

Per il PDF GSE: l'importo residuo si trova dopo la frase "Importo residuo dovuto al GSE euro".

Per la CHECKLIST cerca in SP, CE e Nota Integrativa le parole chiave: "GSE", "Gestore Servizi Energetici",
"Extraprofitti", "D.L. 4/2022", "art. 15-bis", "fondo rischi", "accantonamento", "contenzioso", "ricorso", "TAR".

Per ogni voce della checklist:
- "presente": true se la voce e rilevata nel documento, false se assente
- "dettaglio": descrizione sintetica del riscontro (max 2 righe), in italiano formale
- "fonteTestuale": CITAZIONE LETTERALE della frase/riga del documento da cui deriva il giudizio.
  Se il termine e assente scrivi "Nessuna occorrenza trovata nel documento per [termine cercato]."
  NON inventare frasi. Copia esattamente il testo trovato, inclusi eventuali numeri e riferimenti di pagina.
- "page": numero di pagina dove e stata trovata la fonte (null se assente)
- "sourceFileName": nome del file PDF da cui e stato estratto

Struttura JSON richiesta (NON modificare i nomi delle chiavi):
{
  "companyName": { "value": "string", "page": 1, "rawText": "string", "rawLabel": "string" },
  "vatNumber": { "value": "string", "page": 1, "rawText": "string", "rawLabel": "string" },
  "gseResidual": { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
  "gseSourceFileName": "string",
  "yearsData": [
    {
      "year": "YYYY",
      "sourceFileName": "string",
      "ricavi":               { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "ebitda":               { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "ebit":                 { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "utileNetto":           { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "interessiPassivi":     { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "totaleAttivo":         { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "patrimonioNetto":      { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "totaleDebiti":         { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "debitiBancheBreve":    { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "debitiBancheML":       { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "disponibilitaLiquide": { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "creditiEntro12Mesi":   { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "rimanenze":            { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "attivoCircolante":     { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "passivitaCorrenti":    { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "debitiTributari":      { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "debitiPrevidenziali":  { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "fondoRischiOneri":     { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" }
    }
  ],
  "checklist": {
    "debitiGSE":       { "presente": false, "dettaglio": "string", "fonteTestuale": "string", "page": null, "sourceFileName": "string" },
    "accantonamenti":  { "presente": false, "dettaglio": "string", "fonteTestuale": "string", "page": null, "sourceFileName": "string" },
    "riduzioniRicavi": { "presente": false, "dettaglio": "string", "fonteTestuale": "string", "page": null, "sourceFileName": "string" },
    "contenziosi":     { "presente": false, "dettaglio": "string", "fonteTestuale": "string", "page": null, "sourceFileName": "string" }
  }
}`;

/**
 * Sezione CUSTOM di default per il prompt di estrazione.
 * Questa parte è editabile dall'utente dalle Impostazioni e salvata su KV.
 * Viene accodata al testo contrattuale prima di ogni chiamata AI.
 */
export const EXTRACTION_PROMPT_CUSTOM_DEFAULT = `Presta particolare attenzione a:
- Distinguere i dati dell'anno corrente da quelli dell'anno precedente (colonne a destra nei prospetti)
- Leggere le note integrative per voci non presenti nello schema abbreviato
- Riportare i valori in unità di euro (non in migliaia)`;

// ─── PROMPT NARRATIVA ─────────────────────────────────────────────────────
/**
 * Sezione CONTRATTUALE del prompt narrativa — non editabile.
 * Definisce ruolo, struttura output JSON, esito a 3 valori fissi.
 */
export const NARRATIVE_PROMPT_CONTRACT = (extractedDataJson: string, kpiJson: string) =>
  `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica della sostenibilita del debito da extraprofitti (art. 15-bis D.L. 4/2022).

Dati estratti dai bilanci (JSON):
${extractedDataJson}

KPI calcolati deterministicamente sull'ultimo anno disponibile:
${kpiJson}

Redigi una relazione tecnica professionale in italiano con le seguenti sezioni. Ogni sezione deve essere un paragrafo discorsivo di 4-6 righe, in terza persona, con stile formale da istruttoria GSE.

1. "analisiRicavi": Analizza il trend dei ricavi negli anni disponibili. Commenta l'andamento dell'utile netto e il confronto con l'importo residuo GSE. Evidenzia segnali positivi o negativi.
2. "analisiLiquidita": Commenta i ratios di liquidita (current, quick, cash ratio). Valuta la capacita di copertura del residuo GSE con le disponibilita immediate e il circolante.
3. "accantonamenti": Analizza cosa emerge dalla checklist GSE/extraprofitti (debiti iscritti, accantonamenti, riduzioni ricavi, contenziosi). Per ciascuna voce, fai riferimento alla fonteTestuale estratta. Valuta il rischio di passivita potenziali non rilevate.
4. "conclusione": Giudizio sintetico finale sulla sostenibilita dell'esborso, segnali di rischio prevalenti, raccomandazione operativa.
5. "esito": UNA SOLA delle tre stringhe esatte: "SOSTENIBILE" oppure "CAUTELA" oppure "RISCHIO ELEVATO"
6. "commentoCopertura": Una frase breve (max 2 righe) che commenta sinteticamente gli indici di copertura cassa/attivo/patrimonio rispetto al residuo GSE.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo fuori dal JSON.`;

/**
 * Sezione CUSTOM di default per il prompt narrativa.
 * Editabile dall'utente dalle Impostazioni e salvata su KV.
 */
export const NARRATIVE_PROMPT_CUSTOM_DEFAULT = `Utilizza un tono formale e prudente, tipico della pubblica amministrazione italiana.
Se i dati mostrano trend negativi evidenti, sottolineali con chiarezza nella conclusione.
Evita perifrasi: esprimi i giudizi in modo diretto e non ambiguo.`;

/**
 * Helper: assembla il prompt completo unendo sezione contrattuale + custom.
 * La sezione custom, se vuota, viene omessa.
 */
export const buildExtractionPrompt = (custom: string, fileName: string): string => {
  const customTrimmed = custom.trim();
  const base = EXTRACTION_PROMPT_CONTRACT
    + (customTrimmed ? `\n\nISTRUZIONI AGGIUNTIVE (configurate dall'operatore):\n${customTrimmed}` : '')
    + `\n\nNOTA: Stai analizzando UN SOLO documento (${fileName}).\nNell'array "yearsData" includi SOLO l'anno relativo a questo documento (un solo elemento).\nCompila comunque companyName, vatNumber, gseResidual e checklist.`;
  return base;
};

export const buildNarrativePrompt = (custom: string, extractedDataJson: string, kpiJson: string): string => {
  const customTrimmed = custom.trim();
  return NARRATIVE_PROMPT_CONTRACT(extractedDataJson, kpiJson)
    + (customTrimmed ? `\n\nISTRUZIONI AGGIUNTIVE (configurate dall'operatore):\n${customTrimmed}` : '');
};

// Alias mantenuti per retrocompatibilità (usati da geminiService esistente — saranno rimossi)
export const EXTRACTION_PROMPT = EXTRACTION_PROMPT_CONTRACT;
export const NARRATIVE_PROMPT  = (e: string, k: string) => NARRATIVE_PROMPT_CONTRACT(e, k);
