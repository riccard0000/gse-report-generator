/**
 * ExtractedField — campo estratto da PDF tramite modello AI text-only.
 */
export interface ExtractedField<T = string | number> {
  value: T | null;
  page: number | null;
  rawText: string | null;
  rawLabel: string | null;
}

export interface DerivedField<T = number> {
  value: T | null;
  formula: string | null;
}

export interface FinancialYearData {
  year: string;
  sourceFileName: string | null;
  ricavi: ExtractedField<number>;
  ebit: ExtractedField<number>;
  ammortamenti: ExtractedField<number>;
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
  ebitda: DerivedField<number>;
}

export interface ChecklistItem {
  presente: boolean;
  dettaglio: string;
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

/**
 * ExtractionMeta — metadata leggero usato nell'indice storico.
 *
 * step:
 *   'extracted' — solo dati AI grezzi
 *   'confirmed' — dati verificati dall'utente
 *   'reported'  — narrativa generata e documento prodotto
 */
export interface ExtractionMeta {
  id: string;
  timestamp: number;
  step: 'extracted' | 'confirmed' | 'reported';
  companyName: string;
  vatNumber: string;
  years: string[];
  isDemoMode: boolean;
  /** true se il DOCX è già stato scaricato almeno una volta */
  docxDownloaded?: boolean;
}

/**
 * ExtractionRecord — record completo salvato su KV.
 *
 * Ciclo di vita:
 *   extracted  → extractedData presente, confirmedData null, narrativeData null
 *   confirmed  → confirmedData presente, narrativeData null
 *   reported   → narrativeData presente, docxDownloaded tracciato
 *
 * Navigazione dallo storico:
 *   reported   → apre ReportViewer direttamente (zero click)
 *   confirmed  → apre DataVerification in sola lettura + pulsante "Genera narrativa"
 *   extracted  → apre DataVerification editabile
 */
export interface ExtractionRecord {
  id: string;
  timestamp: number;
  step: 'extracted' | 'confirmed' | 'reported';
  isDemoMode: boolean;
  extractedData:  ExtractedData | null;
  confirmedData:  ExtractedData | null;
  narrativeData:  NarrativeData | null;
  docxDownloaded: boolean;
  fileKeys?:      string[];
}
