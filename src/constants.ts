/**
 * Costanti di configurazione per il GSE Report Generator
 */

// ─── Modelli OpenRouter (tutti :free) ─────────────────────────────────────
export const OPENROUTER_MODEL_EXTRACT   = 'nvidia/nemotron-3-super-120b-a12b:free';
export const OPENROUTER_MODEL_NARRATIVE = 'nvidia/nemotron-3-super-120b-a12b:free';
export const OPENROUTER_MODEL_FALLBACK  = 'google/gemma-4-31b-it:free';

// Endpoint del proxy Azure Function
//
// ARCHITETTURA: Browser SPA → Static Web App /api/proxy/* → Azure Functions → OpenRouter/Blob
//
// Valori attesi per VITE_API_BASE_URL:
//   Sviluppo locale:   http://localhost:7071/api/proxy
//   Azure (produzione): /api/proxy   ← percorso relativo, Static Web App instrada /api → Function App
//
// APIM-ready: il prefisso /api/proxy è il contratto stabile verso il client.
// Se in futuro si aggiunge Azure API Management, APIM espone /gse/proxy e instrada
// verso la Function senza che il front-end debba cambiare nulla.
export const OPENROUTER_ENDPOINT = import.meta.env.VITE_API_BASE_URL as string;

// ─── PROMPT ESTRAZIONE ────────────────────────────────────────────────────
/**
 * Sezione CONTRATTUALE — non editabile, non inviata al KV.
 * Definisce ruolo, mappature voci di bilancio, struttura JSON di output.
 */
export const EXTRACTION_PROMPT_CONTRACT = `Sei un esperto analista finanziario italiano specializzato in istruttorie per il GSE.
Analizza i documenti PDF allegati (bilanci aziendali e documenti GSE) ed estrai i dati richiesti.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Mappe voci di bilancio (schema italiano CE/SP):
- "ricavi" = Totale Valore della produzione (voce A del CE)
- "ebit" = Differenza tra valore e costi della produzione (A - B)
- "ammortamenti" = Totale ammortamenti e svalutazioni (voce 10 del CE)
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
- "debitiTributari" = debiti tributari verso l'Erario (vedi regola MULTI-RIGA sotto)
- "debitiPrevidenziali" = debiti previdenziali verso INPS/INAIL (vedi regola MULTI-RIGA sotto)
- "fondoRischiOneri" = B) Fondi per rischi e oneri SP

NOTA: ebitda NON deve essere estratto — viene calcolato automaticamente dal sistema come ebit + ammortamenti.
      Non includere ebitda nell'output JSON.

REGOLA PRIORITÀ SP → NOTA per debitiTributari e debitiPrevidenziali:
  1. PRIMA cerca nello Stato Patrimoniale (SP) una riga aggregata con etichette come:
     "12) Debiti tributari", "Debiti tributari", "13) Debiti previdenziali e sociali", "Debiti previdenziali".
     Se la trovi: usa quel singolo valore, imposta page = pagina SP, rawLabel = etichetta esatta,
     rawText = riga completa verbatim. FINE — non andare nella nota.
  2. SOLO SE lo SP non ha una riga aggregata separata per questi debiti
     (caso bilancio abbreviato dove compaiono solo nel totale D), vai alla nota integrativa
     e applica la REGOLA MULTI-RIGA descritta sotto.

REGOLA MULTI-RIGA (nota integrativa — solo se non trovato in SP):
  Questa regola si applica a debitiTributari e debitiPrevidenziali quando il dettaglio
  è esposto solo nella nota integrativa come tabella con più voci (es. sezione "Debiti").

  STRUTTURA COLONNE della tabella debiti in nota integrativa:
  La tabella ha SEMPRE questo formato a 4-5 colonne:
  [Descrizione] | [Consist.INIZIALE anno precedente] | [Consist.FINALE anno corrente] | [Variaz.assoluta] | [Variaz.%]

  Esempio riga: "Erario c/IRES\t\t7.574\t\t19.900\t\t12.326\t\t162,78%"
  In questo esempio: Consist.iniziale = 7.574 (anno precedente), Consist.finale = 19.900 (ANNO CORRENTE).
  Devi prendere 19.900, NON 7.574.

  REGOLA CRITICA — quale colonna sommare:
  Devi sommare SEMPRE e SOLO la colonna CONSIST.FINALE (= seconda colonna numerica = anno corrente).
  La colonna CONSIST.INIZIALE (= prima colonna numerica) contiene i valori dell'anno precedente: NON usarla.
  Un trattino "-" in qualsiasi colonna significa zero: trattalo come 0.
  Se una riga ha solo un numero (Consist.iniziale = Consist.finale = stesso valore), usa quel valore.

  Per "debitiTributari":
  - Individua TUTTE le righe che iniziano con "Erario" nella sezione debiti della nota.
  - Somma i valori della colonna CONSIST.FINALE (anno corrente) di tutte le righe.
  - "value" = somma totale calcolata
  - "page" = pagina della nota integrativa dove si trovano le righe
  - "rawLabel" = "Erario"
  - "rawText" = concatenazione di TUTTE le righe Erario trovate, separate da \n, verbatim con tab.

  Per "debitiPrevidenziali":
  - Individua TUTTE le righe che iniziano con "INPS" o "INAIL" nella sezione debiti.
  - Stessa logica: somma CONSIST.FINALE (anno corrente), ignora CONSIST.INIZIALE.
  - "rawLabel" = "INPS"

Per ciascun valore numerico includi SEMPRE questi 4 campi:
- "value": numero intero corrispondente all'anno di riferimento di QUESTO documento.
  REGOLA CRITICA: nei prospetti a doppia colonna (anno corrente | anno precedente),
  estrai SEMPRE il valore della colonna di SINISTRA (anno corrente del documento).
  Distinzione fondamentale:
    • "value": null  → voce NON PRESENTE nel documento (non si riesce a trovare la voce)
    • "value": 0     → voce PRESENTE nel documento e il suo importo è esplicitamente zero o trattino
  Non usare 0 per indicare assenza: se la voce non è trovata, usa null.
- "page": numero di pagina del PDF (OBBLIGATORIO — non lasciare null se il valore è stato trovato).
- "rawText": copia LETTERALE della riga completa del documento, esattamente come appare
  nel testo fornito, inclusi separatori \t e TUTTI i numeri sulla riga
  (sia anno corrente che anno precedente se entrambi presenti).
  Per campi MULTI-RIGA: concatenazione di tutte le righe separate da \n (vedi sopra).
  NON normalizzare spazi, NON rimuovere tabulazioni, NON parafrasare.
  Esempio riga singola: "Totale valore della produzione\t818.547\t778.956"
- "rawLabel": copia LETTERALE del solo testo dell'etichetta/voce, esattamente come
  appare nel documento. Preserva maiuscole, minuscole, caratteri accentati italiani
  (à, è, é, ì, ò, ù), apostrofi e parentesi alfabetiche.
  REGOLA: nessuna cifra, nessun separatore numerico (. , -), nessun tab.
  Per campi MULTI-RIGA: usa il prefisso comune ("Erario", "INPS").
  Esempi CORRETTI:
    riga "Totale valore della produzione   818.547   778.956" → rawLabel = "Totale valore della produzione"
    riga "Fondi per rischi e oneri   12.000   9.500"         → rawLabel = "Fondi per rischi e oneri"
    riga "IV - Disponibilità liquide    5.320"               → rawLabel = "Disponibilità liquide"
    riga "C17) Interessi e oneri fin.   (3.200)"             → rawLabel = "Interessi e oneri finanziari"
    riga "esigibili entro l'esercizio successivo  629.885"  → rawLabel = "esigibili entro l'esercizio successivo"
  Esempi ERRATI (non fare mai):
    rawLabel = "Totale Valore Della Produzione"  ← maiuscole alterate
    rawLabel = "Disponibilita liquide"           ← accento rimosso
    rawLabel = "818.547"                         ← solo numeri
    rawLabel = "A - B"                           ← trattino numerico

REGOLA SPECIALE gseResidual:
  Il campo "gseResidual" riguarda ESCLUSIVAMENTE il documento GSE allegato (se presente).
  - Se è presente un documento GSE con la frase "Importo residuo dovuto al GSE euro", usa il valore che la segue.
  - Se il documento GSE NON è presente oppure la frase non è trovata:
    → "value": null  (NON usare 0 — l'assenza del dato è diversa dal residuo zero)
  - "value": 0 si usa SOLO se il documento GSE è presente e indica esplicitamente importo zero.

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
  "gseResidual": { "value": null, "page": null, "rawText": "string", "rawLabel": "Importo residuo dovuto al GSE euro" },
  "gseSourceFileName": "string",
  "yearsData": [
    {
      "year": "YYYY",
      "sourceFileName": "string",
      "ricavi":               { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "ammortamenti":         { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "ebit":                 { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "utileNetto":           { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "interessiPassivi":     { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "totaleAttivo":         { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "patrimonioNetto":      { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "totaleDebiti":         { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "debitiBancheBreve":    { "value": null, "page": null, "rawText": "string", "rawLabel": "string" },
      "debitiBancheML":       { "value": null, "page": null, "rawText": "string", "rawLabel": "string" },
      "disponibilitaLiquide": { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "creditiEntro12Mesi":   { "value": 0, "page": 1, "rawText": "string", "rawLabel": "string" },
      "rimanenze":            { "value": null, "page": null, "rawText": "string", "rawLabel": "string" },
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
 * Editabile dall'utente dalle Impostazioni e salvata su KV.
 */
export const EXTRACTION_PROMPT_CUSTOM_DEFAULT = `Presta particolare attenzione a:
- Distinguere i dati dell'anno corrente da quelli dell'anno precedente (colonne a destra nei prospetti)
- Leggere le note integrative per voci non presenti nello schema abbreviato
- Riportare i valori in unità di euro (non in migliaia)`;

// ─── PROMPT NARRATIVA ─────────────────────────────────────────────────────
export const NARRATIVE_PROMPT_CONTRACT = (extractedDataJson: string, kpiJson: string) =>
  `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica della sostenibilita del debito da extraprofitti (art. 15-bis D.L. 4/2022).

Dati estratti dai bilanci (JSON):
${extractedDataJson}

KPI calcolati deterministicamente dal sistema sull'ULTIMO ANNO disponibile in yearsData (anno con valore "year" piu alto):
${kpiJson}

REGOLE FONDAMENTALI PER LA REDAZIONE:

1. ANNO DI RIFERIMENTO PER I KPI:
   I KPI nel JSON sopra si riferiscono ESCLUSIVAMENTE all'ultimo anno disponibile (anno piu recente in yearsData).
   Tutti i ratio (current ratio, quick ratio, cash ratio, ecc.) vanno commentati riferendosi a quell'anno.
   NON attribuire i KPI ad anni precedenti. Se yearsData contiene 2022, 2023, 2024, i KPI sono del 2024.

2. GESTIONE gseResidual:
   - Se gseResidual.value e null: il documento GSE non e stato allegato o l'importo non e stato trovato.
     In questo caso NON commentare alcun "residuo GSE" nei paragrafi analisiLiquidita e commentoCopertura.
     Scrivi invece che l'importo residuo GSE non e disponibile nei documenti analizzati.
   - Se gseResidual.value e un numero (anche 0): usa quel valore nei confronti.
   - NON inventare un importo residuo GSE se il campo e null.

3. GESTIONE quick ratio con rimanenze null:
   Se rimanenze.value e null nell'ultimo anno, il quick ratio non e calcolabile in modo preciso.
   In questo caso commenta: il quick ratio non e determinabile con precisione per assenza della voce
   rimanenze nel bilancio; l'analisi della liquidita si basa su current ratio e cash ratio.
   Non scrivere "quick ratio non disponibile" senza spiegare il motivo.

4. TREND RICAVI - usa TUTTI gli anni presenti in yearsData in ordine cronologico.
   Cita i valori numerici con l'anno corrispondente. Non omettere anni disponibili.

Redigi una relazione tecnica professionale in italiano con le seguenti sezioni.
Ogni sezione deve essere un paragrafo discorsivo di 4-6 righe, in terza persona, con stile formale da istruttoria GSE.

1. "analisiRicavi": Analizza il trend dei ricavi per tutti gli anni disponibili (cita anno e valore per ciascuno).
   Commenta l'andamento dell'utile netto. Se gseResidual.value non e null, confronta l'utile con il residuo GSE.
   Evidenzia segnali positivi o negativi.

2. "analisiLiquidita": Commenta current ratio, quick ratio e cash ratio riferiti all'ULTIMO ANNO (cita l'anno).
   Se gseResidual.value non e null, valuta la capacita di copertura del residuo GSE con le disponibilita
   immediate e il circolante. Se gseResidual.value e null, ometti il confronto col residuo e segnala l'assenza
   del dato GSE.

3. "accantonamenti": Analizza cosa emerge dalla checklist GSE/extraprofitti (debiti iscritti, accantonamenti,
   riduzioni ricavi, contenziosi). Per ciascuna voce presente (presente: true), cita la fonteTestuale estratta.
   Per le voci assenti, indica sinteticamente l'assenza. Valuta il rischio di passivita potenziali non rilevate.

4. "conclusione": Giudizio sintetico finale sulla sostenibilita dell'esborso, segnali di rischio prevalenti,
   raccomandazione operativa. Se gseResidual e null, basa il giudizio su liquidita e checklist.

5. "esito": UNA SOLA delle tre stringhe esatte: "SOSTENIBILE" oppure "CAUTELA" oppure "RISCHIO ELEVATO"
   Criteri orientativi (non vincolanti, usa il giudizio complessivo):
   - SOSTENIBILE: liquidita adeguata (current ratio >= 1,2), nessuna passivita occulta, residuo GSE coperto
   - CAUTELA: liquidita borderline (0,8 <= current ratio < 1,2) oppure voci checklist presenti ma gestibili
   - RISCHIO ELEVATO: liquidita critica (current ratio < 0,8) oppure passivita occulte significative

6. "commentoCopertura": Una frase breve (max 2 righe) sui ratio di copertura cassa/attivo/patrimonio.
   Se gseResidual.value e null: commenta solo la solidita patrimoniale e di cassa in termini assoluti,
   senza riferirsi al residuo GSE.
   Se gseResidual.value e un numero: commenta la copertura rispetto a quel valore.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo fuori dal JSON.
Struttura attesa:
{
  "analisiRicavi": "...",
  "analisiLiquidita": "...",
  "accantonamenti": "...",
  "conclusione": "...",
  "esito": "SOSTENIBILE" | "CAUTELA" | "RISCHIO ELEVATO",
  "commentoCopertura": "..."
}`;

export const NARRATIVE_PROMPT_CUSTOM_DEFAULT = `Utilizza un tono formale e prudente, tipico della pubblica amministrazione italiana.
Se i dati mostrano trend negativi evidenti, sottolineali con chiarezza nella conclusione.
Evita perifrasi: esprimi i giudizi in modo diretto e non ambiguo.`;

/**
 * Assembla il prompt di estrazione: sezione contrattuale + custom + fileName.
 */
export const buildExtractionPrompt = (custom: string, fileName: string): string => {
  const customTrimmed = custom.trim();
  return EXTRACTION_PROMPT_CONTRACT
    + (customTrimmed ? `\n\nISTRUZIONI AGGIUNTIVE (configurate dall'operatore):\n${customTrimmed}` : '')
    + `\n\nNOTA: Stai analizzando UN SOLO documento (${fileName}).\nNell'array "yearsData" includi SOLO l'anno relativo a questo documento (un solo elemento).\nCompila comunque companyName, vatNumber, gseResidual e checklist.`;
};

/**
 * Assembla il prompt narrativa: sezione contrattuale + custom.
 */
export const buildNarrativePrompt = (custom: string, extractedDataJson: string, kpiJson: string): string => {
  const customTrimmed = custom.trim();
  return NARRATIVE_PROMPT_CONTRACT(extractedDataJson, kpiJson)
    + (customTrimmed ? `\n\nISTRUZIONI AGGIUNTIVE (configurate dall'operatore):\n${customTrimmed}` : '');
};
