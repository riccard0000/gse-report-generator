/**
 * MOCK DATA — GEOSOL SOCIETÀ AGRICOLA A R.L.
 * Dati reali estratti dai bilanci 2022, 2023, 2024 depositati al Registro Imprese.
 * Usati per la modalità DEMO: bypassano le chiamate OpenRouter.
 */

import { ExtractedData } from './types';

// Nomi file come caricati dall'utente (con trattini, come nei PDF originali)
export const MOCK_FILE_NAMES = [
  'OUT_LASTBIL_IC01637000892-2022-GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892-2023-GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892-2024-GEOSOL.pdf',
];

// URL statici dei PDF nella root del repo (Vite li serve da /)
// I file sono stati caricati con spazi nel nome → URL-encoded
export const MOCK_PDF_URLS = [
  '/OUT_LASTBIL_IC01637000892%202022%20GEOSOL.pdf',
  '/OUT_LASTBIL_IC01637000892%202023%20GEOSOL.pdf',
  '/OUT_LASTBIL_IC01637000892%202024%20GEOSOL.pdf',
];

export const MOCK_EXTRACTED_DATA: ExtractedData = {
  companyName: {
    value: "GEOSOL SOCIETÀ AGRICOLA A R.L.",
    page: 2,
    rawText: "GEOSOL SOCIETA' AGRICOLA A RL",
    bbox: { x0: 72, y0: 710, x1: 380, y1: 725 },
  },
  vatNumber: {
    value: "01637000892",
    page: 2,
    rawText: "1.637000892e+09",
    bbox: { x0: 72, y0: 690, x1: 280, y1: 705 },
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
      ricavi:               { value: 818547,  page: 4,  rawText: "Totale valore della produzione 818.547",                          bbox: { x0: 72, y0: 548, x1: 520, y1: 562 } },
      ebitda:               { value: 306424,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 160.638", bbox: { x0: 72, y0: 358, x1: 520, y1: 372 } },
      ebit:                 { value: 160638,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 160.638", bbox: { x0: 72, y0: 358, x1: 520, y1: 372 } },
      utileNetto:           { value: 115097,  page: 4,  rawText: "IX - Utile (perdita) dell'esercizio 115.097",                    bbox: { x0: 72, y0: 260, x1: 520, y1: 274 } },
      interessiPassivi:     { value: 36,      page: 4,  rawText: "Totale interessi e altri oneri finanziari 36",                   bbox: { x0: 72, y0: 298, x1: 520, y1: 312 } },
      totaleAttivo:         { value: 3525717, page: 3,  rawText: "Totale attivo 3.525.717",                                        bbox: { x0: 72, y0: 480, x1: 520, y1: 494 } },
      patrimonioNetto:      { value: 1361443, page: 3,  rawText: "Totale patrimonio netto 1.361.443",                              bbox: { x0: 72, y0: 330, x1: 520, y1: 344 } },
      totaleDebiti:         { value: 2079084, page: 3,  rawText: "Totale debiti 2.079.084",                                        bbox: { x0: 72, y0: 238, x1: 520, y1: 252 } },
      debitiBancheBreve:    { value: 370237,  page: 11, rawText: "MUTUO BAPR 1.870.237 370.237",                                   bbox: { x0: 72, y0: 590, x1: 520, y1: 604 } },
      debitiBancheML:       { value: 0,       page: 11, rawText: "MUTUO BAPR — quota M/L non indicata separatamente",              bbox: null },
      disponibilitaLiquide: { value: 254282,  page: 3,  rawText: "IV - Disponibilità liquide 254.282",                             bbox: { x0: 72, y0: 462, x1: 520, y1: 476 } },
      creditiEntro12Mesi:   { value: 194873,  page: 3,  rawText: "esigibili entro l'esercizio successivo 194.873",                 bbox: { x0: 72, y0: 496, x1: 520, y1: 510 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                         bbox: null },
      attivoCircolante:     { value: 449155,  page: 3,  rawText: "Totale attivo circolante (C) 449.155",                           bbox: { x0: 72, y0: 478, x1: 520, y1: 492 } },
      passivitaCorrenti:    { value: 864978,  page: 3,  rawText: "esigibili entro l'esercizio successivo 864.978",                 bbox: { x0: 72, y0: 218, x1: 520, y1: 232 } },
      debitiTributari:      { value: 56797,   page: 11, rawText: "Erario c/IRES + IRAP + ritenute 56.797",                         bbox: { x0: 72, y0: 540, x1: 520, y1: 554 } },
      debitiPrevidenziali:  { value: 1139,    page: 11, rawText: "INPS dipendenti 980 + INAIL 159",                                bbox: { x0: 72, y0: 520, x1: 520, y1: 534 } },
      fondoRischiOneri:     { value: 47757,   page: 3,  rawText: "B) Fondi per rischi e oneri 47.757",                             bbox: { x0: 72, y0: 282, x1: 520, y1: 296 } },
    },

    // ─────────────────────────────────────────────────────────────
    // BILANCIO 2023
    // ─────────────────────────────────────────────────────────────
    {
      year: "2023",
      sourceFileName: MOCK_FILE_NAMES[1],
      ricavi:               { value: 948319,  page: 4,  rawText: "Totale valore della produzione 948.319",                          bbox: { x0: 72, y0: 548, x1: 520, y1: 562 } },
      ebitda:               { value: 369413,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 219.797", bbox: { x0: 72, y0: 358, x1: 520, y1: 372 } },
      ebit:                 { value: 219797,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 219.797", bbox: { x0: 72, y0: 358, x1: 520, y1: 372 } },
      utileNetto:           { value: 179250,  page: 3,  rawText: "IX - Utile (perdita) dell'esercizio 179.250",                    bbox: { x0: 72, y0: 260, x1: 520, y1: 274 } },
      interessiPassivi:     { value: 94,      page: 4,  rawText: "Totale interessi e altri oneri finanziari 94",                   bbox: { x0: 72, y0: 298, x1: 520, y1: 312 } },
      totaleAttivo:         { value: 3320008, page: 3,  rawText: "Totale attivo 3.320.008",                                        bbox: { x0: 72, y0: 480, x1: 520, y1: 494 } },
      patrimonioNetto:      { value: 2129423, page: 3,  rawText: "Totale patrimonio netto 2.129.423",                              bbox: { x0: 72, y0: 330, x1: 520, y1: 344 } },
      totaleDebiti:         { value: 1125299, page: 3,  rawText: "Totale debiti 1.125.299",                                        bbox: { x0: 72, y0: 238, x1: 520, y1: 252 } },
      debitiBancheBreve:    { value: 0,       page: 12, rawText: "MUTUO BAPR 370.237 - -370.237 -100,00%",                         bbox: { x0: 72, y0: 590, x1: 520, y1: 604 } },
      debitiBancheML:       { value: 0,       page: 12, rawText: "MUTUO BAPR estinto nel 2023",                                    bbox: { x0: 72, y0: 590, x1: 520, y1: 604 } },
      disponibilitaLiquide: { value: 53216,   page: 3,  rawText: "IV - Disponibilità liquide 53.216",                              bbox: { x0: 72, y0: 462, x1: 520, y1: 476 } },
      creditiEntro12Mesi:   { value: 134545,  page: 3,  rawText: "esigibili entro l'esercizio successivo 134.545",                 bbox: { x0: 72, y0: 496, x1: 520, y1: 510 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                         bbox: null },
      attivoCircolante:     { value: 187761,  page: 3,  rawText: "Totale attivo circolante (C) 187.761",                           bbox: { x0: 72, y0: 478, x1: 520, y1: 492 } },
      passivitaCorrenti:    { value: 733962,  page: 3,  rawText: "esigibili entro l'esercizio successivo 733.962",                 bbox: { x0: 72, y0: 218, x1: 520, y1: 232 } },
      debitiTributari:      { value: 25068,   page: 12, rawText: "Erario c/IRES 19.900 + ritenute 2.912 + 1.265 + 491",           bbox: { x0: 72, y0: 540, x1: 520, y1: 554 } },
      debitiPrevidenziali:  { value: 1965,    page: 12, rawText: "INPS dipendenti 1.809 + INAIL 156",                              bbox: { x0: 72, y0: 520, x1: 520, y1: 534 } },
      fondoRischiOneri:     { value: 47757,   page: 3,  rawText: "B) Fondi per rischi e oneri 47.757",                             bbox: { x0: 72, y0: 282, x1: 520, y1: 296 } },
    },

    // ─────────────────────────────────────────────────────────────
    // BILANCIO 2024
    // ─────────────────────────────────────────────────────────────
    {
      year: "2024",
      sourceFileName: MOCK_FILE_NAMES[2],
      ricavi:               { value: 1137074, page: 4,  rawText: "Totale valore della produzione 1.137.074",                        bbox: { x0: 72, y0: 548, x1: 520, y1: 562 } },
      ebitda:               { value: 373899,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 199.791", bbox: { x0: 72, y0: 358, x1: 520, y1: 372 } },
      ebit:                 { value: 199791,  page: 4,  rawText: "Differenza tra valore e costi della produzione (A - B) 199.791", bbox: { x0: 72, y0: 358, x1: 520, y1: 372 } },
      utileNetto:           { value: 151964,  page: 3,  rawText: "IX - Utile (perdita) dell'esercizio 151.964",                    bbox: { x0: 72, y0: 260, x1: 520, y1: 274 } },
      interessiPassivi:     { value: 956,     page: 4,  rawText: "Totale interessi e altri oneri finanziari 956",                  bbox: { x0: 72, y0: 298, x1: 520, y1: 312 } },
      totaleAttivo:         { value: 3587108, page: 3,  rawText: "Totale attivo 3.587.108",                                        bbox: { x0: 72, y0: 480, x1: 520, y1: 494 } },
      patrimonioNetto:      { value: 2281387, page: 3,  rawText: "Totale patrimonio netto 2.281.387",                              bbox: { x0: 72, y0: 330, x1: 520, y1: 344 } },
      totaleDebiti:         { value: 1286028, page: 3,  rawText: "Totale debiti 1.286.028",                                        bbox: { x0: 72, y0: 238, x1: 520, y1: 252 } },
      debitiBancheBreve:    { value: 140000,  page: 13, rawText: "MUTUO BCC N.22659 - 350.000 / MUTUO BCC N.22701 - 247.832",     bbox: { x0: 72, y0: 590, x1: 520, y1: 620 } },
      debitiBancheML:       { value: 457832,  page: 13, rawText: "MUTUO BCC N.22659 350.000 + MUTUO BCC N.22701 247.832 quota ML", bbox: { x0: 72, y0: 590, x1: 520, y1: 620 } },
      disponibilitaLiquide: { value: 224292,  page: 3,  rawText: "IV - Disponibilità liquide 224.292",                             bbox: { x0: 72, y0: 462, x1: 520, y1: 476 } },
      creditiEntro12Mesi:   { value: 293145,  page: 3,  rawText: "esigibili entro l'esercizio successivo 293.145",                 bbox: { x0: 72, y0: 496, x1: 520, y1: 510 } },
      rimanenze:            { value: 0,       page: 3,  rawText: "Rimanenze non presenti",                                         bbox: null },
      attivoCircolante:     { value: 517437,  page: 3,  rawText: "Totale attivo circolante (C) 517.437",                           bbox: { x0: 72, y0: 478, x1: 520, y1: 492 } },
      passivitaCorrenti:    { value: 629885,  page: 3,  rawText: "esigibili entro l'esercizio successivo 629.885",                 bbox: { x0: 72, y0: 218, x1: 520, y1: 232 } },
      debitiTributari:      { value: 47157,   page: 13, rawText: "Erario c/IRES + IRAP + ritenute (stima da dettaglio note 2024)", bbox: { x0: 72, y0: 540, x1: 520, y1: 554 } },
      debitiPrevidenziali:  { value: 2100,    page: 13, rawText: "INPS dipendenti + INAIL (stima)",                                bbox: { x0: 72, y0: 520, x1: 520, y1: 534 } },
      fondoRischiOneri:     { value: 0,       page: 3,  rawText: "B) Fondi per rischi e oneri - (azzerato nel 2024)",              bbox: { x0: 72, y0: 282, x1: 520, y1: 296 } },
    },
  ],

  checklist: {
    debitiGSE:         { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
    accantonamenti:    { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
    riduzioniRicavi:   { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
    straordinari:      { presente: false, dettaglio: "", page: 0, sourceFileName: "" },
  },
};
