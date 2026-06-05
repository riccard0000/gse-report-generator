/**
 * ExtractedField — campo estratto da PDF tramite modello AI text-only.
 *
 * Le bounding box NON vengono richieste al modello AI:
 * vengono calcolate a runtime da DataVerification.tsx tramite pdfjs-dist,
 * usando rawLabel come chiave di ricerca primaria nel testo della pagina.
 *
 * Semantica dei campi:
 *   value    — valore dell'anno di riferimento del documento (colonna sinistra)
 *   page     — numero pagina 1-based dove si trova la voce
 *   rawText  — riga COMPLETA verbatim dal documento, con separatori \t
 *              es: "Totale valore della produzione\t818.547\t778.956"
 *   rawLabel — SOLO il testo dell'etichetta, verbatim, senza cifre né tab
 *              es: "Totale valore della produzione"
 *              Usato come chiave di ricerca primaria nel PDF viewer.
 *
 * REGOLA FONDAMENTALE:
 *   rawLabel e rawText devono essere stringhe VERBATIM presenti nel PDF.
 *   MAI inserire testo descrittivo/calcolato — il viewer li cercherebbe nel PDF
 *   e non trovandoli causerebbe ricerche fallite o match errati.
 *   Se un campo non ha riga diretta nel PDF → usare DerivedField, non ExtractedField.
 */
export interface ExtractedField<T = string | number> {
  value: T | null;
  page: number | null;
  rawText: string | null;
  /** Testo verbatim dell'etichetta (no numeri, no tab) — chiave di ricerca nel PDF viewer */
  rawLabel: string | null;
}

/**
 * DerivedField — campo calcolato deterministicamente da altri campi RAW.
 *
 * NON ha fonte diretta nel PDF: il viewer non deve tentare alcuna ricerca bbox.
 * Il valore viene ricalcolato da computeDerivedFields() ogni volta che
 * cambiano i campi RAW da cui dipende.
 *
 * Semantica dei campi:
 *   value   — valore calcolato (null se uno degli input è null)
 *   formula — stringa leggibile che descrive il calcolo effettuato,
 *             es: "EBIT 160.638 + Amm. 145.787 = 306.425"
 *             Usata solo per debug/UI — non è una chiave di ricerca.
 */
export interface DerivedField<T = number> {
  value: T | null;
  formula: string | null;
}

export interface FinancialYearData {
  year: string;
  sourceFileName: string | null;

  // ── CAMPI RAW — estratti dal PDF, hanno page/rawLabel/rawText ──────────────

  /** Totale valore della produzione (A) — CE */
  ricavi: ExtractedField<number>;
  /** Differenza tra valore e costi della produzione (A - B) — CE */
  ebit: ExtractedField<number>;
  /** Totale ammortamenti e svalutazioni — CE riga 10) */
  ammortamenti: ExtractedField<number>;
  /** 21) Utile (perdita) dell'esercizio — CE */
  utileNetto: ExtractedField<number>;
  /** Totale interessi e altri oneri finanziari — CE */
  interessiPassivi: ExtractedField<number>;
  /** Totale attivo — SP */
  totaleAttivo: ExtractedField<number>;
  /** Totale patrimonio netto — SP */
  patrimonioNetto: ExtractedField<number>;
  /** Totale debiti — SP */
  totaleDebiti: ExtractedField<number>;
  /** Debiti verso banche quota breve (entro 12m) — SP o nota integrativa */
  debitiBancheBreve: ExtractedField<number>;
  /** Debiti verso banche quota M/L (oltre 12m) — SP o nota integrativa */
  debitiBancheML: ExtractedField<number>;
  /** IV - Disponibilità liquide — SP */
  disponibilitaLiquide: ExtractedField<number>;
  /** Crediti esigibili entro l'esercizio successivo — SP */
  creditiEntro12Mesi: ExtractedField<number>;
  /** Rimanenze — SP (null se non presenti) */
  rimanenze: ExtractedField<number>;
  /** Totale attivo circolante (C) — SP */
  attivoCircolante: ExtractedField<number>;
  /** Passività correnti (debiti esigibili entro 12m) — SP */
  passivitaCorrenti: ExtractedField<number>;
  /** Debiti tributari — SP o nota integrativa */
  debitiTributari: ExtractedField<number>;
  /** Debiti previdenziali (INPS/INAIL) — SP o nota integrativa */
  debitiPrevidenziali: ExtractedField<number>;
  /** B) Fondi per rischi e oneri — SP */
  fondoRischiOneri: ExtractedField<number>;

  // ── CAMPI DERIVATI — calcolati da computeDerivedFields(), nessuna fonte PDF ─

  /**
   * EBITDA = EBIT + ammortamenti.
   * Non ha riga propria nel bilancio abbreviato italiano.
   * Calcolato deterministicamente — NON estratto dall'AI.
   */
  ebitda: DerivedField<number>;
}

export interface ChecklistItem {
  presente: boolean;
  dettaglio: string;
  /** Frase/paragrafo esatto trovato nel documento da cui deriva il giudizio */
  fonteTestuale: string | null;
  page: number | null;
  sourceFileName: string | null;
}

export interface ExtractedData {
  companyName: ExtractedField<string>;
  vatNumber: ExtractedField<string>;
  gseResidual: ExtractedField<number>;
  gseSourceFileName: string | null;
  yearsData: FinancialYearData[];
  checklist: {
    debitiGSE: ChecklistItem;
    accantonamenti: ChecklistItem;
    riduzioniRicavi: ChecklistItem;
    contenziosi: ChecklistItem;
  };
}

export interface NarrativeData {
  analisiRicavi: string;
  analisiLiquidita: string;
  accantonamenti: string;
  conclusione: string;
  esito: 'SOSTENIBILE' | 'CAUTELA' | 'RISCHIO ELEVATO';
  commentoCopertura: string;
}

export interface HighlightInfo {
  text: string;
  page: number;
  color: 'yellow' | 'blue';
  id: string;
}
