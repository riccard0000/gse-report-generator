/**
 * MOCK DATA — GEOSOL SOCIETA AGRICOLA A R.L.
 * Dati reali estratti dai bilanci 2022, 2023, 2024 depositati al Registro Imprese.
 * Usati per la modalita DEMO: bypassano le chiamate OpenRouter.
 *
 * BBOX: coordinate reali estratte con pdfminer dai PDF originali XBRL.
 * Sistema di riferimento: origine in basso a sinistra (standard PDF/pdf.js).
 * Ogni bbox corrisponde ESATTAMENTE alla riga di testo nel documento.
 */

import { ExtractedData, NarrativeData } from './types';

// Nomi file come caricati dall'utente
export const MOCK_FILE_NAMES = [
  'OUT_LASTBIL_IC01637000892-2022-GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892-2023-GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892-2024-GEOSOL.pdf',
];

// Nomi fisici dei file nel repo (con spazi, URL-encoded)
const PDF_FILENAMES = [
  'OUT_LASTBIL_IC01637000892%202022%20GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892%202023%20GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892%202024%20GEOSOL.pdf',
];

/**
 * Restituisce gli URL corretti per il deploy corrente.
 * import.meta.env.BASE_URL = "/gse-report-generator/" in prod, "/" in dev.
 * I PDF sono nella root del repo -> Vite li copia in dist/ -> serviti sotto BASE_URL.
 */
export function getMockPdfUrls(): string[] {
  const base = import.meta.env.BASE_URL; // termina sempre con "/"
  return PDF_FILENAMES.map((f) => `${base}${f}`);
}

export const MOCK_EXTRACTED_DATA: ExtractedData = {
  companyName: {
    value: "GEOSOL SOCIETA' AGRICOLA A R.L.",
    page: 3,
    rawText: "GEOSOL SOCIETA' AGRICOLA A R.L.",
    bbox: { x0: 406, y0: 815, x1: 568, y1: 824 },
  },
  vatNumber: {
    value: "01637000892",
    page: 3,
    rawText: "Codice fiscale: 1.637000892e+09",
    bbox: { x0: 452, y0: 805, x1: 568, y1: 814 },
  },
  gseResidual: {
    value: 0,
    page: 1,
    rawText: "",
    bbox: null,
  },
  gseSourceFileName: "",

  yearsData: [
    // BILANCIO 2022
    {
      year: "2022",
      sourceFileName: MOCK_FILE_NAMES[0],
      ricavi:               { value: 818547,  page: 4,  rawText: "Totale valore della produzione 818.547 778.956",                    bbox: { x0: 91.3, y0: 590.9, x1: 511.5, y1: 598.7 } },
      ebitda:               { value: 306424,  page: 4,  rawText: "EBITDA stimato: EBIT 160.638 + ammortamenti 145.786",               bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      ebit:                 { value: 160638,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 160.638",   bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      utileNetto:           { value: 115097,  page: 4,  rawText: "21) Utile (perdita) dell'esercizio 115.097 153.103",                bbox: { x0: 84.8, y0: 230.7, x1: 511.5, y1: 238.4 } },
      interessiPassivi:     { value: 36,      page: 4,  rawText: "Totale interessi e altri oneri finanziari 36 139",                  bbox: { x0: 97.7, y0: 304.0, x1: 511.5, y1: 311.8 } },
      totaleAttivo:         { value: 3525717, page: 3,  rawText: "Totale attivo 3.525.717 3.604.643",                                 bbox: { x0: 91.3, y0: 505.4, x1: 511.5, y1: 513.2 } },
      patrimonioNetto:      { value: 1361443, page: 3,  rawText: "Totale patrimonio netto 1.361.443 1.246.347",                       bbox: { x0: 97.7, y0: 407.5, x1: 511.5, y1: 415.3 } },
      totaleDebiti:         { value: 2079084, page: 3,  rawText: "Totale debiti 2.079.084 2.343.807",                                 bbox: { x0: 97.7, y0: 334.4, x1: 511.5, y1: 342.2 } },
      debitiBancheBreve:    { value: 370237,  page: 11, rawText: "MUTUO BAPR 1.870.237 quota breve 370.237",                          bbox: null },
      debitiBancheML:       { value: 0,       page: 11, rawText: "MUTUO BAPR quota M/L non indicata separatamente",                   bbox: null },
      disponibilitaLiquide: { value: 254282,  page: 3,  rawText: "IV - Disponibilita liquide 254.282 259.343",                        bbox: { x0: 97.7, y0: 529.8, x1: 511.5, y1: 537.5 } },
      creditiEntro12Mesi:   { value: 194873,  page: 3,  rawText: "esigibili entro l'esercizio successivo 194.873 130.027",           bbox: { x0: 104.2, y0: 565.7, x1: 511.5, y1: 573.5 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                           bbox: null },
      attivoCircolante:     { value: 449155,  page: 3,  rawText: "Totale attivo circolante (C) 449.155 389.360",                      bbox: { x0: 97.7, y0: 517.6, x1: 511.5, y1: 525.3 } },
      passivitaCorrenti:    { value: 864978,  page: 3,  rawText: "esigibili entro l'esercizio successivo 864.978 347.257",           bbox: { x0: 97.7, y0: 358.7, x1: 511.5, y1: 366.4 } },
      debitiTributari:      { value: 56797,   page: 11, rawText: "Erario c/IRES + IRAP + ritenute 56.797",                           bbox: null },
      debitiPrevidenziali:  { value: 1139,    page: 11, rawText: "INPS dipendenti 980 + INAIL 159",                                  bbox: null },
      fondoRischiOneri:     { value: 47757,   page: 3,  rawText: "B) Fondi per rischi e oneri 47.757",                                bbox: { x0: 91.3, y0: 395.3, x1: 511.5, y1: 403.1 } },
    },

    // BILANCIO 2023
    {
      year: "2023",
      sourceFileName: MOCK_FILE_NAMES[1],
      ricavi:               { value: 948319,  page: 4,  rawText: "Totale valore della produzione 948.319 818.547",                    bbox: { x0: 91.3, y0: 590.9, x1: 511.5, y1: 598.7 } },
      ebitda:               { value: 369413,  page: 4,  rawText: "EBITDA stimato: EBIT 219.797 + ammortamenti 149.616",               bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      ebit:                 { value: 219797,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 219.797",   bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      utileNetto:           { value: 179250,  page: 4,  rawText: "21) Utile (perdita) dell'esercizio 179.250 115.097",                bbox: { x0: 84.8, y0: 169.5, x1: 511.5, y1: 177.3 } },
      interessiPassivi:     { value: 94,      page: 4,  rawText: "Totale interessi e altri oneri finanziari 94 36",                   bbox: { x0: 97.7, y0: 242.9, x1: 511.5, y1: 250.6 } },
      totaleAttivo:         { value: 3320008, page: 3,  rawText: "Totale attivo 3.320.008 3.525.717",                                 bbox: { x0: 91.3, y0: 517.5, x1: 511.5, y1: 525.2 } },
      patrimonioNetto:      { value: 2129423, page: 3,  rawText: "Totale patrimonio netto 2.129.423 1.361.443",                       bbox: { x0: 97.7, y0: 407.5, x1: 511.5, y1: 415.3 } },
      totaleDebiti:         { value: 1125299, page: 3,  rawText: "Totale debiti 1.125.299 2.079.084",                                 bbox: { x0: 97.7, y0: 334.4, x1: 511.5, y1: 342.2 } },
      debitiBancheBreve:    { value: 0,       page: 12, rawText: "MUTUO BAPR estinto nel 2023",                                      bbox: null },
      debitiBancheML:       { value: 0,       page: 12, rawText: "MUTUO BAPR estinto nel 2023",                                      bbox: null },
      disponibilitaLiquide: { value: 53216,   page: 3,  rawText: "IV - Disponibilita liquide 53.216 254.282",                         bbox: { x0: 97.7, y0: 542.0, x1: 511.5, y1: 549.8 } },
      creditiEntro12Mesi:   { value: 134545,  page: 3,  rawText: "esigibili entro l'esercizio successivo 134.545 194.873",           bbox: { x0: 104.2, y0: 565.7, x1: 511.5, y1: 573.5 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                           bbox: null },
      attivoCircolante:     { value: 187761,  page: 3,  rawText: "Totale attivo circolante (C) 187.761 449.155",                      bbox: { x0: 97.7, y0: 529.8, x1: 511.5, y1: 537.5 } },
      passivitaCorrenti:    { value: 733962,  page: 3,  rawText: "esigibili entro l'esercizio successivo 733.962 864.978",           bbox: { x0: 97.7, y0: 358.7, x1: 511.5, y1: 366.4 } },
      debitiTributari:      { value: 25068,   page: 12, rawText: "Erario c/IRES 19.900 + ritenute 2.912 + 1.265 + 491",             bbox: null },
      debitiPrevidenziali:  { value: 1965,    page: 12, rawText: "INPS dipendenti 1.809 + INAIL 156",                                bbox: null },
      fondoRischiOneri:     { value: 47757,   page: 3,  rawText: "B) Fondi per rischi e oneri 47.757 47.757",                         bbox: { x0: 91.3, y0: 395.3, x1: 511.5, y1: 403.1 } },
    },

    // BILANCIO 2024
    {
      year: "2024",
      sourceFileName: MOCK_FILE_NAMES[2],
      ricavi:               { value: 1137074, page: 4,  rawText: "Totale valore della produzione 1.137.074 948.319",                  bbox: { x0: 91.3, y0: 590.9, x1: 511.5, y1: 598.7 } },
      ebitda:               { value: 373899,  page: 4,  rawText: "EBITDA stimato: EBIT 199.791 + ammortamenti 174.108",               bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      ebit:                 { value: 199791,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 199.791",   bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      utileNetto:           { value: 151964,  page: 4,  rawText: "21) Utile (perdita) dell'esercizio 151.964 179.250",                bbox: { x0: 84.8, y0: 169.5, x1: 511.5, y1: 177.3 } },
      interessiPassivi:     { value: 956,     page: 4,  rawText: "Totale interessi e altri oneri finanziari 956 94",                  bbox: { x0: 97.7, y0: 242.9, x1: 511.5, y1: 250.6 } },
      totaleAttivo:         { value: 3587108, page: 3,  rawText: "Totale attivo 3.587.108 3.320.008",                                 bbox: { x0: 91.3, y0: 517.5, x1: 511.5, y1: 525.2 } },
      patrimonioNetto:      { value: 2281387, page: 3,  rawText: "Totale patrimonio netto 2.281.387 2.129.423",                       bbox: { x0: 97.7, y0: 407.5, x1: 511.5, y1: 415.3 } },
      totaleDebiti:         { value: 1286028, page: 3,  rawText: "Totale debiti 1.286.028 1.125.299",                                 bbox: { x0: 97.7, y0: 334.4, x1: 511.5, y1: 342.2 } },
      debitiBancheBreve:    { value: 140000,  page: 13, rawText: "MUTUO BCC N.22659 / N.22701 quota breve 140.000",                   bbox: null },
      debitiBancheML:       { value: 457832,  page: 13, rawText: "MUTUO BCC N.22659 350.000 + N.22701 247.832 quota M/L",            bbox: null },
      disponibilitaLiquide: { value: 224292,  page: 3,  rawText: "IV - Disponibilita liquide 224.292 53.216",                         bbox: { x0: 97.7, y0: 542.0, x1: 511.5, y1: 549.8 } },
      creditiEntro12Mesi:   { value: 293145,  page: 3,  rawText: "esigibili entro l'esercizio successivo 293.145 134.545",           bbox: { x0: 104.2, y0: 565.7, x1: 511.5, y1: 573.5 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                           bbox: null },
      attivoCircolante:     { value: 517437,  page: 3,  rawText: "Totale attivo circolante (C) 517.437 187.761",                      bbox: { x0: 97.7, y0: 529.8, x1: 511.5, y1: 537.5 } },
      passivitaCorrenti:    { value: 629885,  page: 3,  rawText: "esigibili entro l'esercizio successivo 629.885 733.962",           bbox: { x0: 97.7, y0: 358.7, x1: 511.5, y1: 366.4 } },
      debitiTributari:      { value: 47157,   page: 13, rawText: "Erario c/IRES + IRAP + ritenute (stima da dettaglio note 2024)",   bbox: null },
      debitiPrevidenziali:  { value: 2100,    page: 13, rawText: "INPS dipendenti + INAIL (stima)",                                  bbox: null },
      fondoRischiOneri:     { value: 0,       page: 3,  rawText: "B) Fondi per rischi e oneri - 47.757 (azzerato nel 2024)",         bbox: { x0: 91.3, y0: 395.3, x1: 511.5, y1: 403.1 } },
    },
  ],

  checklist: {
    debitiGSE:       { presente: false, dettaglio: "Nessun debito verso GSE iscritto nello stato patrimoniale negli esercizi 2022-2024.", page: 0, sourceFileName: "" },
    accantonamenti:  { presente: false, dettaglio: "Nessun accantonamento a fondo rischi collegato a extraprofitti o art. 15-bis D.L. 4/2022 rilevato nella nota integrativa.", page: 0, sourceFileName: "" },
    riduzioniRicavi: { presente: false, dettaglio: "Nessuna riduzione di ricavi per effetto della normativa sugli extraprofitti rilevata nel conto economico.", page: 0, sourceFileName: "" },
    contenziosi:     { presente: false, dettaglio: "Nessun contenzioso o ricorso al TAR contro GSE menzionato nella nota integrativa.", page: 0, sourceFileName: "" },
  },
};

/**
 * Narrativa mock pre-calcolata per la modalita DEMO.
 * Basata sui dati reali GEOSOL 2022-2024 e sui KPI 2024 calcolati deterministicamente.
 * KPI 2024: current ratio 0.82, quick 0.82, cash 0.36, autonomia 0.64,
 *           D/E 0.56, leverage 1.57, PFN/EBITDA 0.99, interest coverage 209, ROS 0.18
 */
export const MOCK_NARRATIVE_DATA: NarrativeData = {
  esito: 'SOSTENIBILE',

  analisiRicavi:
    "La societa Geosol Societa Agricola a r.l. evidenzia un trend di crescita dei ricavi nettamente positivo nel triennio 2022-2024: il valore della produzione passa da Euro 818.547 nel 2022 a Euro 948.319 nel 2023 (+15,9%) fino a Euro 1.137.074 nel 2024 (+19,9%), con un incremento complessivo del 38,9% nel periodo. L'utile netto si mantiene su livelli significativi (Euro 115.097 nel 2022, Euro 179.250 nel 2023, Euro 151.964 nel 2024), confermando una capacita reddituale consolidata. In assenza di un importo residuo GSE comunicato nel documento allegato, non e possibile effettuare il confronto diretto utile/residuo; tuttavia, la solidita reddituale della societa rappresenta un elemento fortemente positivo ai fini della valutazione della sostenibilita.",

  analisiLiquidita:
    "Con riferimento all'esercizio 2024, il current ratio risulta pari a 0,82, valore inferiore alla soglia di parita (1,00), indicativo di una tensione nel breve termine tra attivo circolante (Euro 517.437) e passivita correnti (Euro 629.885). Il quick ratio coincide con il current ratio (0,82) in quanto la societa non presenta rimanenze. Il cash ratio si attesta a 0,36, segnalando che le sole disponibilita liquide (Euro 224.292) non sono sufficienti a coprire integralmente le passivita a breve. Tuttavia, il patrimonio netto robusto (Euro 2.281.387, pari al 63,6% del totale attivo) e l'assenza di posizione finanziaria netta significativa (PFN/EBITDA 0,99) mitigano il rischio di liquidita. In assenza di un residuo GSE quantificato, gli indici di copertura non sono calcolabili ma la struttura patrimoniale risulta solida.",

  accantonamenti:
    "L'analisi della checklist GSE/extraprofitti non ha evidenziato, nel triennio 2022-2024, alcun elemento di rischio specifico riconducibile alla normativa sugli extraprofitti energetici (art. 15-bis D.L. 4/2022). Non risultano iscritti debiti verso il GSE nello stato patrimoniale, ne accantonamenti a fondo rischi collegati alla normativa citata, ne riduzioni di ricavi per effetto della norma, ne contenziosi o ricorsi al TAR. Il fondo rischi e oneri, presente negli esercizi 2022 e 2023 per Euro 47.757, e stato azzerato nel 2024, senza che la nota integrativa menzioni correlazioni con il GSE. L'assenza di passivita potenziali specifiche costituisce un elemento favorevole nella valutazione complessiva.",

  conclusione:
    "In sintesi, Geosol Societa Agricola a r.l. presenta un profilo economico-finanziario complessivamente solido: crescita dei ricavi costante, utile netto positivo nel triennio, patrimonio netto in progressivo rafforzamento (da Euro 1.361.443 nel 2022 a Euro 2.281.387 nel 2024) e assenza di debiti o accantonamenti verso il GSE. La lieve tensione di liquidita a breve termine (current ratio 0,82) non appare strutturale, tenuto conto della solidita patrimoniale e della capacita di generare flussi reddituali. Si raccomanda, in fase istruttoria, di acquisire il documento GSE con l'importo residuo aggiornato per completare il calcolo degli indici di copertura specifica. Sulla base dei dati disponibili, l'esito della valutazione e SOSTENIBILE.",

  commentoCopertura:
    "Il residuo GSE non risulta valorizzato nel documento allegato: gli indici di copertura (cassa, attivo circolante e patrimonio netto su residuo) non sono calcolabili. Si raccomanda di allegare il PDF GSE aggiornato con l'importo residuo per completare l'analisi.",
};
