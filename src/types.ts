/**
 * Struttura base per un campo estratto da PDF
 */
export interface FieldValue {
  value: string | number | null;
  page: number | null;
  rawText: string | null;
  rawLabel?: string | null;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

/**
 * Versione tipizzata di FieldValue per campi specifici (es. solo numeri)
 * rawText  = riga completa restituita dall'AI (può contenere più numeri)
 * rawLabel = solo la parte testuale dell'etichetta, senza cifre (usata per l'highlight)
 */
export interface ExtractedField<T = string | number> {
  value: T | null;
  page: number | null;
  rawText: string | null;
  /** Solo il testo dell'etichetta, senza numeri — usato per localizzare la riga nel PDF */
  rawLabel?: string | null;
  bbox?: { x0: number; y0: number; x1: number; y1: number } | null;
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
