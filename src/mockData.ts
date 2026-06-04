/**
 * MOCK DATA — GEOSOL SOCIETÀ AGRICOLA A R.L.
 * Dati reali estratti dai bilanci 2022, 2023, 2024 depositati al Registro Imprese.
 * Usati per la modalità DEMO: bypassano le chiamate OpenRouter.
 *
 * BBOX: coordinate reali estratte con pdfminer dai PDF originali XBRL.
 * Sistema di riferimento: origine in basso a sinistra (standard PDF/pdf.js).
 * Ogni bbox corrisponde ESATTAMENTE alla riga di testo nel documento.
 */

import { ExtractedData } from './types';

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
 * I PDF sono nella root del repo → Vite li copia in dist/ → serviti sotto BASE_URL.
 */
export function getMockPdfUrls(): string[] {
  const base = import.meta.env.BASE_URL; // termina sempre con "/"
  return PDF_FILENAMES.map((f) => `${base}${f}`);
}

export const MOCK_EXTRACTED_DATA: ExtractedData = {
  companyName: {
    value: "GEOSOL SOCIETÀ AGRICOLA A R.L.",
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
    // ─────────────────────────────────────────────────────────────
    // BILANCIO 2022
    // ─────────────────────────────────────────────────────────────
    {
      year: "2022",
      sourceFileName: MOCK_FILE_NAMES[0],
      ricavi:               { value: 818547,  page: 4,  rawText: "Totale valore della produzione818.547778.956",                              bbox: { x0: 91.3, y0: 590.9, x1: 511.5, y1: 598.7 } },
      ebitda:               { value: 306424,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B)160.638215.726",      bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      ebit:                 { value: 160638,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B)160.638215.726",      bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      utileNetto:           { value: 115097,  page: 4,  rawText: "21) Utile (perdita) dell'esercizio115.097153.103",                          bbox: { x0: 84.8, y0: 230.7, x1: 511.5, y1: 238.4 } },
      interessiPassivi:     { value: 36,      page: 4,  rawText: "Totale interessi e altri oneri finanziari36139",                            bbox: { x0: 97.7, y0: 304.0, x1: 511.5, y1: 311.8 } },
      totaleAttivo:         { value: 3525717, page: 3,  rawText: "Totale attivo3.525.7173.604.643",                                           bbox: { x0: 91.3, y0: 505.4, x1: 511.5, y1: 513.2 } },
      patrimonioNetto:      { value: 1361443, page: 3,  rawText: "Totale patrimonio netto1.361.4431.246.347",                                 bbox: { x0: 97.7, y0: 407.5, x1: 511.5, y1: 415.3 } },
      totaleDebiti:         { value: 2079084, page: 3,  rawText: "Totale debiti2.079.0842.343.807",                                           bbox: { x0: 97.7, y0: 334.4, x1: 511.5, y1: 342.2 } },
      debitiBancheBreve:    { value: 370237,  page: 11, rawText: "MUTUO BAPR 1.870.237 370.237",                                              bbox: null },
      debitiBancheML:       { value: 0,       page: 11, rawText: "MUTUO BAPR — quota M/L non indicata separatamente",                         bbox: null },
      disponibilitaLiquide: { value: 254282,  page: 3,  rawText: "IV - Disponibilità liquide254.282259.343",                                  bbox: { x0: 97.7, y0: 529.8, x1: 511.5, y1: 537.5 } },
      creditiEntro12Mesi:   { value: 194873,  page: 3,  rawText: "esigibili entro l'esercizio successivo194.873130.027",                      bbox: { x0: 104.2, y0: 565.7, x1: 511.5, y1: 573.5 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                                    bbox: null },
      attivoCircolante:     { value: 449155,  page: 3,  rawText: "Totale attivo circolante (C)449.155389.360",                                bbox: { x0: 97.7, y0: 517.6, x1: 511.5, y1: 525.3 } },
      passivitaCorrenti:    { value: 864978,  page: 3,  rawText: "esigibili entro l'esercizio successivo864.978347.257",                      bbox: { x0: 97.7, y0: 358.7, x1: 511.5, y1: 366.4 } },
      debitiTributari:      { value: 56797,   page: 11, rawText: "Erario c/IRES + IRAP + ritenute 56.797",                                    bbox: null },
      debitiPrevidenziali:  { value: 1139,    page: 11, rawText: "INPS dipendenti 980 + INAIL 159",                                           bbox: null },
      fondoRischiOneri:     { value: 47757,   page: 3,  rawText: "B) Fondi per rischi e oneri47.757-",                                        bbox: { x0: 91.3, y0: 395.3, x1: 511.5, y1: 403.1 } },
    },

    // ─────────────────────────────────────────────────────────────
    // BILANCIO 2023
    // ─────────────────────────────────────────────────────────────
    {
      year: "2023",
      sourceFileName: MOCK_FILE_NAMES[1],
      ricavi:               { value: 948319,  page: 4,  rawText: "Totale valore della produzione948.319818.547",                              bbox: { x0: 91.3, y0: 590.9, x1: 511.5, y1: 598.7 } },
      ebitda:               { value: 369413,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B)219.797160.638",      bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      ebit:                 { value: 219797,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B)219.797160.638",      bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      utileNetto:           { value: 179250,  page: 4,  rawText: "21) Utile (perdita) dell'esercizio179.250115.097",                          bbox: { x0: 84.8, y0: 169.5, x1: 511.5, y1: 177.3 } },
      interessiPassivi:     { value: 94,      page: 4,  rawText: "Totale interessi e altri oneri finanziari9436",                             bbox: { x0: 97.7, y0: 242.9, x1: 511.5, y1: 250.6 } },
      totaleAttivo:         { value: 3320008, page: 3,  rawText: "Totale attivo3.320.0083.525.717",                                           bbox: { x0: 91.3, y0: 517.5, x1: 511.5, y1: 525.2 } },
      patrimonioNetto:      { value: 2129423, page: 3,  rawText: "Totale patrimonio netto2.129.4231.361.443",                                 bbox: { x0: 97.7, y0: 407.5, x1: 511.5, y1: 415.3 } },
      totaleDebiti:         { value: 1125299, page: 3,  rawText: "Totale debiti1.125.2992.079.084",                                           bbox: { x0: 97.7, y0: 334.4, x1: 511.5, y1: 342.2 } },
      debitiBancheBreve:    { value: 0,       page: 12, rawText: "MUTUO BAPR estinto nel 2023",                                               bbox: null },
      debitiBancheML:       { value: 0,       page: 12, rawText: "MUTUO BAPR estinto nel 2023",                                               bbox: null },
      disponibilitaLiquide: { value: 53216,   page: 3,  rawText: "IV - Disponibilità liquide53.216254.282",                                   bbox: { x0: 97.7, y0: 542.0, x1: 511.5, y1: 549.8 } },
      creditiEntro12Mesi:   { value: 134545,  page: 3,  rawText: "esigibili entro l'esercizio successivo134.545194.873",                      bbox: { x0: 104.2, y0: 565.7, x1: 511.5, y1: 573.5 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                                    bbox: null },
      attivoCircolante:     { value: 187761,  page: 3,  rawText: "Totale attivo circolante (C)187.761449.155",                                bbox: { x0: 97.7, y0: 529.8, x1: 511.5, y1: 537.5 } },
      passivitaCorrenti:    { value: 733962,  page: 3,  rawText: "esigibili entro l'esercizio successivo733.962864.978",                      bbox: { x0: 97.7, y0: 358.7, x1: 511.5, y1: 366.4 } },
      debitiTributari:      { value: 25068,   page: 12, rawText: "Erario c/IRES 19.900 + ritenute 2.912 + 1.265 + 491",                      bbox: null },
      debitiPrevidenziali:  { value: 1965,    page: 12, rawText: "INPS dipendenti 1.809 + INAIL 156",                                         bbox: null },
      fondoRischiOneri:     { value: 47757,   page: 3,  rawText: "B) Fondi per rischi e oneri47.75747.757",                                   bbox: { x0: 91.3, y0: 395.3, x1: 511.5, y1: 403.1 } },
    },

    // ─────────────────────────────────────────────────────────────
    // BILANCIO 2024
    // ─────────────────────────────────────────────────────────────
    {
      year: "2024",
      sourceFileName: MOCK_FILE_NAMES[2],
      ricavi:               { value: 1137074, page: 4,  rawText: "Totale valore della produzione1.137.074948.319",                            bbox: { x0: 91.3, y0: 590.9, x1: 511.5, y1: 598.7 } },
      ebitda:               { value: 373899,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B)199.791219.797",      bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      ebit:                 { value: 199791,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B)199.791219.797",      bbox: { x0: 84.8, y0: 352.9, x1: 511.5, y1: 360.7 } },
      utileNetto:           { value: 151964,  page: 4,  rawText: "21) Utile (perdita) dell'esercizio151.964179.250",                          bbox: { x0: 84.8, y0: 169.5, x1: 511.5, y1: 177.3 } },
      interessiPassivi:     { value: 956,     page: 4,  rawText: "Totale interessi e altri oneri finanziari95694",                            bbox: { x0: 97.7, y0: 242.9, x1: 511.5, y1: 250.6 } },
      totaleAttivo:         { value: 3587108, page: 3,  rawText: "Totale attivo3.587.1083.320.008",                                           bbox: { x0: 91.3, y0: 517.5, x1: 511.5, y1: 525.2 } },
      patrimonioNetto:      { value: 2281387, page: 3,  rawText: "Totale patrimonio netto2.281.3872.129.423",                                 bbox: { x0: 97.7, y0: 407.5, x1: 511.5, y1: 415.3 } },
      totaleDebiti:         { value: 1286028, page: 3,  rawText: "Totale debiti1.286.0281.125.299",                                           bbox: { x0: 97.7, y0: 334.4, x1: 511.5, y1: 342.2 } },
      debitiBancheBreve:    { value: 140000,  page: 13, rawText: "MUTUO BCC N.22659 - 350.000 / MUTUO BCC N.22701 - 247.832",                bbox: null },
      debitiBancheML:       { value: 457832,  page: 13, rawText: "MUTUO BCC N.22659 350.000 + MUTUO BCC N.22701 247.832 quota ML",           bbox: null },
      disponibilitaLiquide: { value: 224292,  page: 3,  rawText: "IV - Disponibilità liquide224.29253.216",                                   bbox: { x0: 97.7, y0: 542.0, x1: 511.5, y1: 549.8 } },
      creditiEntro12Mesi:   { value: 293145,  page: 3,  rawText: "esigibili entro l'esercizio successivo293.145134.545",                      bbox: { x0: 104.2, y0: 565.7, x1: 511.5, y1: 573.5 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                                    bbox: null },
      attivoCircolante:     { value: 517437,  page: 3,  rawText: "Totale attivo circolante (C)517.437187.761",                                bbox: { x0: 97.7, y0: 529.8, x1: 511.5, y1: 537.5 } },
      passivitaCorrenti:    { value: 629885,  page: 3,  rawText: "esigibili entro l'esercizio successivo629.885733.962",                      bbox: { x0: 97.7, y0: 358.7, x1: 511.5, y1: 366.4 } },
      debitiTributari:      { value: 47157,   page: 13, rawText: "Erario c/IRES + IRAP + ritenute (stima da dettaglio note 2024)",            bbox: null },
      debitiPrevidenziali:  { value: 2100,    page: 13, rawText: "INPS dipendenti + INAIL (stima)",                                           bbox: null },
      fondoRischiOneri:     { value: 0,       page: 3,  rawText: "B) Fondi per rischi e oneri-47.757",                                        bbox: { x0: 91.3, y0: 395.3, x1: 511.5, y1: 403.1 } },
    },
  ],

  checklist: {
    debitiGSE:         { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
    accantonamenti:    { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
    riduzioniRicavi:   { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
    contenziosi:       { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
  },
};
