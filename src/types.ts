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
 */
export interface ExtractedField<T = string | number> {
  value: T | null;
  page: number | null;
  rawText: string | null;
  /** Testo verbatim dell'etichetta (no numeri, no tab) — chiave di ricerca nel PDF viewer */
  rawLabel: string | null;
}

export interface FinancialYearData {
  year: string;
  sourceFileName: string | null;
  ricavi: ExtractedField<number>;
  ebitda: ExtractedField<number>;
  ebit: ExtractedField<number>;
  utileNetto: ExtractedField<number>;
  interessiPassivi: ExtractedField<number>;
  totaleAttivo: ExtractedField<number>;
  patrimonioNetto: ExtractedField<number>;
  totaleDebiti: ExtractedField<number>;
  debitiBancheBreve: ExtractedField<number>;
  debitiBancheML: ExtractedField<number>;
  disponibilitaLiquide: ExtractedField<number>;
  creditiEntro12Mesi: ExtractedField<number>;
  rimanenze: ExtractedField<number>;
  attivoCircolante: ExtractedField<number>;
  passivitaCorrenti: ExtractedField<number>;
  debitiTributari: ExtractedField<number>;
  debitiPrevidenziali: ExtractedField<number>;
  fondoRischiOneri: ExtractedField<number>;
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
