/**
 * Costanti di configurazione per il GSE Report Generator
 */

// ─── Modelli OpenRouter (tutti :free) ─────────────────────────────────────
// Estrazione KPI: Nemotron Super 120B — 1M context, eccellente su tabelle IT
export const OPENROUTER_MODEL_EXTRACT = 'nvidia/nemotron-3-super-120b-a12b:free';

// Narrativa tecnica: Nemotron Super 120B — stesso modello, ottimo per testo italiano
export const OPENROUTER_MODEL_NARRATIVE = 'nvidia/nemotron-3-super-120b-a12b:free';

// Fallback automatico se il modello primario è sovraccarico o non disponibile
export const OPENROUTER_MODEL_FALLBACK = 'google/gemma-4-31b-it:free';

// Endpoint OpenRouter — la chiave API è gestita SOLO dal Cloudflare Worker
// Il frontend chiama VITE_PROXY_URL, mai OpenRouter direttamente
export const OPENROUTER_ENDPOINT = import.meta.env.VITE_PROXY_URL as string;

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

Struttura JSON richiesta:
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
    "debitiGSE": {
      "presente": false,
      "dettaglio": "string",
      "fonteTestuale": "string",
      "page": null,
      "sourceFileName": "string"
    },
    "accantonamenti": {
      "presente": false,
      "dettaglio": "string",
      "fonteTestuale": "string",
      "page": null,
      "sourceFileName": "string"
    },
    "riduzioniRicavi": {
      "presente": false,
      "dettaglio": "string",
      "fonteTestuale": "string",
      "page": null,
      "sourceFileName": "string"
    },
    "contenziosi": {
      "presente": false,
      "dettaglio": "string",
      "fonteTestuale": "string",
      "page": null,
      "sourceFileName": "string"
    }
  }
}
`;

/**
 * Prompt per la generazione della narrativa tecnica.
 * Riceve i dati estratti JSON + i KPI già calcolati deterministicamente.
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
3. "accantonamenti": Analizza cosa emerge dalla checklist GSE/extraprofitti (debiti iscritti, accantonamenti, riduzioni ricavi, contenziosi). Per ciascuna voce, fai riferimento alla fonteTestuale estratta. Valuta il rischio di passivita potenziali non rilevate.
4. "conclusione": Giudizio sintetico finale sulla sostenibilita dell'esborso, segnali di rischio prevalenti, raccomandazione operativa.
5. "esito": UNA SOLA delle tre stringhe esatte: "SOSTENIBILE" oppure "CAUTELA" oppure "RISCHIO ELEVATO"
6. "commentoCopertura": Una frase breve (max 2 righe) che commenta sinteticamente gli indici di copertura cassa/attivo/patrimonio rispetto al residuo GSE.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo fuori dal JSON.
`;
