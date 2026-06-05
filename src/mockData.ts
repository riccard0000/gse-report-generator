/**
 * MOCK DATA — GEOSOL SOCIETA AGRICOLA A R.L.
 * Dati reali estratti dai bilanci 2022, 2023, 2024 depositati al Registro Imprese.
 * Usati per la modalita DEMO: bypassano le chiamate OpenRouter.
 *
 * CONVENZIONE VALORI:
 * - value: number  = dato trovato e valorizzato (0 = trovato ed è zero)
 * - value: null    = dato non disponibile / non indicato separatamente nel documento
 * - rawLabel       = testo verbatim dell'etichetta nel PDF (chiave ricerca PDF viewer)
 * - rawText        = riga completa verbatim inclusi separatori \t e tutti i numeri
 *
 * CONVENZIONE PAGINE:
 * - page: number   = indice fisico della pagina PDF (1-based)
 *                    La copertina occupa sempre la pagina fisica 1, quindi:
 *                    pagina fisica = numero logico stampato nel documento + 1
 *                    SP  → fisica 3  (logica 2)
 *                    CE  → fisica 4  (logica 3)
 *                    Note debiti → 2022:11 | 2023:12 | 2024:13
 *
 * AGGIORNAMENTO 05/06/2026 — correzioni applicate:
 *   [2022] ebitda: 306424→306425 (ammortamenti 145.787 non 145.786)
 *   [2023] ebitda: 369413→365583 (ammortamenti 145.786 non 149.616 — era stima errata)
 *   [2023] debitiTributari: 25068→24568 (somma verificata da testo nota)
 *   [2024] debitiBancheBreve: 140000→null (quota breve/ML non indicata separatamente nel PDF)
 *   [2024] debitiBancheML: 457832→null  (idem — solo totale 597.832 disponibile)
 *   [2024] debitiTributari: 47157→12611 (era stima; ora dato reale dalla nota integrativa)
 *   [2024] debitiPrevidenziali: 2100→2287 (era stima; ora INPS 2.108 + INAIL 179)
 */

import { ExtractedData, NarrativeData } from './types';

// Nomi reali dei file nel repo (con spazi, come depositati)
export const MOCK_FILE_NAMES = [
  'OUT_LASTBIL_IC01637000892 2022 GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892 2023 GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892 2024 GEOSOL.pdf',
];

// Stessi nomi URL-encoded per le chiamate fetch/GitHub Pages
const PDF_FILENAMES = [
  'OUT_LASTBIL_IC01637000892%202022%20GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892%202023%20GEOSOL.pdf',
  'OUT_LASTBIL_IC01637000892%202024%20GEOSOL.pdf',
];

export function getMockPdfUrls(): string[] {
  // import.meta.env.BASE_URL è '/gse-report-generator/' in produzione, '/' in locale.
  const rawBase = import.meta.env.BASE_URL ?? '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return PDF_FILENAMES.map((f) => `${base}${f}`);
}

export const MOCK_EXTRACTED_DATA: ExtractedData = {
  companyName: {
    value: "GEOSOL SOCIETA' AGRICOLA A R.L.",
    page: 3,
    rawText: "GEOSOL SOCIETA' AGRICOLA A R.L.",
    rawLabel: "GEOSOL SOCIETA' AGRICOLA A R.L.",
  },
  vatNumber: {
    value: "01637000892",
    page: 3,
    rawText: "Codice fiscale: 1.637000892e+09",
    rawLabel: "Codice fiscale",
  },
  gseResidual: {
    value: 0,
    page: 1,
    rawText: "",
    rawLabel: null,
  },
  gseSourceFileName: "",

  yearsData: [
    // ── BILANCIO 2022 ──────────────────────────────────────────────────────────
    {
      year: "2022",
      sourceFileName: MOCK_FILE_NAMES[0],
      ricavi:               { value: 818547,  page: 4,    rawLabel: "Totale valore della produzione",                          rawText: "Totale valore della produzione\t818.547\t778.956" },
      ebitda:               { value: 306425,  page: 4,    rawLabel: "Differenza tra valore e costi della produzione",          rawText: "EBITDA: EBIT 160.638 + ammortamenti esercizio 145.787" },
      ebit:                 { value: 160638,  page: 4,    rawLabel: "Differenza tra valore e costi della produzione",          rawText: "Differenza tra valore e costi della produzione (A - B)\t160.638" },
      utileNetto:           { value: 115097,  page: 4,    rawLabel: "Utile (perdita) dell'esercizio",                          rawText: "21) Utile (perdita) dell'esercizio\t115.097\t153.103" },
      interessiPassivi:     { value: 36,      page: 4,    rawLabel: "Totale interessi e altri oneri finanziari",               rawText: "Totale interessi e altri oneri finanziari\t36\t139" },
      totaleAttivo:         { value: 3525717, page: 3,    rawLabel: "Totale attivo",                                           rawText: "Totale attivo\t3.525.717\t3.604.643" },
      patrimonioNetto:      { value: 1361443, page: 3,    rawLabel: "Totale patrimonio netto",                                 rawText: "Totale patrimonio netto\t1.361.443\t1.246.347" },
      totaleDebiti:         { value: 2079084, page: 3,    rawLabel: "Totale debiti",                                           rawText: "Totale debiti\t2.079.084\t2.343.807" },
      // Quota breve: il mutuo BAPR risulta interamente classificato come corrente nello SP 2022
      // (SP: debitiEntro12Mesi=864.978; quota mutuo in scadenza=370.237)
      debitiBancheBreve:    { value: 370237,  page: 11,   rawLabel: "MUTUO BAPR",                                              rawText: "MUTUO BAPR 1.870.237 370.237 1.500.000- 81-" },
      // Quota M/L: non indicata separatamente nella nota; il residuo oltre 12m nello SP
      // comprende anche altri debiti. Non attribuibile ai soli mutui.
      debitiBancheML:       { value: null,    page: 11,   rawLabel: "MUTUO BAPR quota M/L",                                    rawText: "Quota M/L non scorporata nella nota integrativa 2022" },
      disponibilitaLiquide: { value: 254282,  page: 3,    rawLabel: "Disponibilità liquide",                                   rawText: "IV - Disponibilità liquide\t254.282\t259.343" },
      creditiEntro12Mesi:   { value: 194873,  page: 3,    rawLabel: "esigibili entro l'esercizio successivo",                  rawText: "esigibili entro l'esercizio successivo\t194.873\t130.027" },
      rimanenze:            { value: null,    page: null, rawLabel: null,                                                      rawText: "Rimanenze non presenti" },
      attivoCircolante:     { value: 449155,  page: 3,    rawLabel: "Totale attivo circolante",                                rawText: "Totale attivo circolante (C)\t449.155\t389.360" },
      passivitaCorrenti:    { value: 864978,  page: 3,    rawLabel: "esigibili entro l'esercizio successivo",                  rawText: "esigibili entro l'esercizio successivo\t864.978\t347.257" },
      // debitiTributari: somma consistenze finali da nota integrativa fisica p.11
      // riten.lav.dip 1.246 + riten.lav.aut 12.653 + imp.sost.TFR 622 + acconti IRES 31.561 + acconti IRAP 10.715
      debitiTributari:      { value: 56797,   page: 11,   rawLabel: "Erario",                                                  rawText: "Erario: rit.dip 1.246 + rit.aut 12.653 + sost.TFR 622 + acc.IRES 31.561 + acc.IRAP 10.715 = 56.797" },
      debitiPrevidenziali:  { value: 1139,    page: 11,   rawLabel: "INPS dipendenti",                                         rawText: "INPS dipendenti 980 + INAIL dipendenti/collaboratori 159 = 1.139" },
      fondoRischiOneri:     { value: 47757,   page: 3,    rawLabel: "Fondi per rischi e oneri",                                rawText: "B) Fondi per rischi e oneri\t47.757" },
    },

    // ── BILANCIO 2023 ──────────────────────────────────────────────────────────
    {
      year: "2023",
      sourceFileName: MOCK_FILE_NAMES[1],
      ricavi:               { value: 948319,  page: 4,    rawLabel: "Totale valore della produzione",                          rawText: "Totale valore della produzione\t948.319\t818.547" },
      // EBITDA corretto: ammortamenti esercizio 2023 = 145.786 (immateriali 754 + materiali 145.032)
      // Non 149.616 come nella versione precedente (era stima errata non verificata sul PDF)
      ebitda:               { value: 365583,  page: 4,    rawLabel: "Differenza tra valore e costi della produzione",          rawText: "EBITDA: EBIT 219.797 + ammortamenti esercizio 145.786" },
      ebit:                 { value: 219797,  page: 4,    rawLabel: "Differenza tra valore e costi della produzione",          rawText: "Differenza tra valore e costi della produzione (A - B)\t219.797" },
      utileNetto:           { value: 179250,  page: 4,    rawLabel: "Utile (perdita) dell'esercizio",                          rawText: "21) Utile (perdita) dell'esercizio\t179.250\t115.097" },
      interessiPassivi:     { value: 94,      page: 4,    rawLabel: "Totale interessi e altri oneri finanziari",               rawText: "Totale interessi e altri oneri finanziari\t94\t36" },
      totaleAttivo:         { value: 3320008, page: 3,    rawLabel: "Totale attivo",                                           rawText: "Totale attivo\t3.320.008\t3.525.717" },
      patrimonioNetto:      { value: 2129423, page: 3,    rawLabel: "Totale patrimonio netto",                                 rawText: "Totale patrimonio netto\t2.129.423\t1.361.443" },
      totaleDebiti:         { value: 1125299, page: 3,    rawLabel: "Totale debiti",                                           rawText: "Totale debiti\t1.125.299\t2.079.084" },
      // MUTUO BAPR estinto nel 2023: saldo finale = 0, variazione -370.237 (-100%)
      debitiBancheBreve:    { value: 0,       page: 12,   rawLabel: "MUTUO BAPR",                                              rawText: "MUTUO BAPR 370.237 - -370.237 -100,00%" },
      debitiBancheML:       { value: 0,       page: 12,   rawLabel: "MUTUO BAPR",                                              rawText: "MUTUO BAPR estinto nel 2023 — nessun mutuo attivo a fine esercizio" },
      disponibilitaLiquide: { value: 53216,   page: 3,    rawLabel: "Disponibilità liquide",                                   rawText: "IV - Disponibilità liquide\t53.216\t254.282" },
      creditiEntro12Mesi:   { value: 134545,  page: 3,    rawLabel: "esigibili entro l'esercizio successivo",                  rawText: "esigibili entro l'esercizio successivo\t134.545\t194.873" },
      rimanenze:            { value: null,    page: null, rawLabel: null,                                                      rawText: "Rimanenze non presenti" },
      attivoCircolante:     { value: 187761,  page: 3,    rawLabel: "Totale attivo circolante",                                rawText: "Totale attivo circolante (C)\t187.761\t449.155" },
      passivitaCorrenti:    { value: 733962,  page: 3,    rawLabel: "esigibili entro l'esercizio successivo",                  rawText: "esigibili entro l'esercizio successivo\t733.962\t864.978" },
      // debitiTributari: somma consistenze finali da nota integrativa fisica p.12
      // rit.lav.dip 1.265 + rit.lav.aut 2.912 + imp.sost.TFR 491 + IRES 19.900 = 24.568
      debitiTributari:      { value: 24568,   page: 12,   rawLabel: "Erario",                                                  rawText: "Erario: rit.dip 1.265 + rit.aut 2.912 + sost.TFR 491 + c/IRES 19.900 = 24.568" },
      debitiPrevidenziali:  { value: 1965,    page: 12,   rawLabel: "INPS dipendenti",                                         rawText: "INPS dipendenti 1.809 + INAIL dipendenti/collaboratori 156 = 1.965" },
      fondoRischiOneri:     { value: 47757,   page: 3,    rawLabel: "Fondi per rischi e oneri",                                rawText: "B) Fondi per rischi e oneri\t47.757\t47.757" },
    },

    // ── BILANCIO 2024 ──────────────────────────────────────────────────────────
    {
      year: "2024",
      sourceFileName: MOCK_FILE_NAMES[2],
      ricavi:               { value: 1137074, page: 4,    rawLabel: "Totale valore della produzione",                          rawText: "Totale valore della produzione\t1.137.074\t948.319" },
      ebitda:               { value: 373899,  page: 4,    rawLabel: "Differenza tra valore e costi della produzione",          rawText: "EBITDA: EBIT 199.791 + ammortamenti esercizio 174.108" },
      ebit:                 { value: 199791,  page: 4,    rawLabel: "Differenza tra valore e costi della produzione",          rawText: "Differenza tra valore e costi della produzione (A - B)\t199.791" },
      utileNetto:           { value: 151964,  page: 4,    rawLabel: "Utile (perdita) dell'esercizio",                          rawText: "21) Utile (perdita) dell'esercizio\t151.964\t179.250" },
      interessiPassivi:     { value: 956,     page: 4,    rawLabel: "Totale interessi e altri oneri finanziari",               rawText: "Totale interessi e altri oneri finanziari\t956\t94" },
      totaleAttivo:         { value: 3587108, page: 3,    rawLabel: "Totale attivo",                                           rawText: "Totale attivo\t3.587.108\t3.320.008" },
      patrimonioNetto:      { value: 2281387, page: 3,    rawLabel: "Totale patrimonio netto",                                 rawText: "Totale patrimonio netto\t2.281.387\t2.129.423" },
      totaleDebiti:         { value: 1286028, page: 3,    rawLabel: "Totale debiti",                                           rawText: "Totale debiti\t1.286.028\t1.125.299" },
      // Due nuovi mutui BCC sottoscritti nel 2024 (entrambi con consistenza iniziale = 0).
      // La nota integrativa riporta solo il totale per ciascun mutuo, senza piano di rimborso
      // che permetta di scorporare la quota corrente (entro 12m) da quella M/L.
      // SP 2024: debitiEntro12Mesi=629.885 | debitiOltre12Mesi=656.143
      // Il totale mutui (597.832) è incluso nei debiti totali ma la ripartizione breve/ML
      // non è desumibile dal solo bilancio abbreviato.
      debitiBancheBreve:    { value: null,    page: 13,   rawLabel: "MUTUO BCC",                                               rawText: "Quota breve non scorporata — MUTUO BCC N.22659 350.000 + N.22701 247.832 = tot. 597.832" },
      debitiBancheML:       { value: null,    page: 13,   rawLabel: "MUTUO BCC",                                               rawText: "Quota M/L non scorporata — totale mutui BCC 597.832 (piano rimborso non allegato)" },
      disponibilitaLiquide: { value: 224292,  page: 3,    rawLabel: "Disponibilità liquide",                                   rawText: "IV - Disponibilità liquide\t224.292\t53.216" },
      creditiEntro12Mesi:   { value: 293145,  page: 3,    rawLabel: "esigibili entro l'esercizio successivo",                  rawText: "esigibili entro l'esercizio successivo\t293.145\t134.545" },
      rimanenze:            { value: null,    page: null, rawLabel: null,                                                      rawText: "Rimanenze non presenti" },
      attivoCircolante:     { value: 517437,  page: 3,    rawLabel: "Totale attivo circolante",                                rawText: "Totale attivo circolante (C)\t517.437\t187.761" },
      passivitaCorrenti:    { value: 629885,  page: 3,    rawLabel: "esigibili entro l'esercizio successivo",                  rawText: "esigibili entro l'esercizio successivo\t629.885\t733.962" },
      // debitiTributari: somma consistenze finali da nota integrativa fisica p.13
      // rit.lav.dip 1.096 + rit.lav.aut 3.433 + imp.sost.TFR 508 + c/IRES 7.574 = 12.611
      debitiTributari:      { value: 12611,   page: 13,   rawLabel: "Erario",                                                  rawText: "Erario: rit.dip 1.096 + rit.aut 3.433 + sost.TFR 508 + c/IRES 7.574 = 12.611" },
      // debitiPrevidenziali: INPS 2.108 + INAIL 179 = 2.287 (dato reale da nota integrativa)
      debitiPrevidenziali:  { value: 2287,    page: 13,   rawLabel: "INPS dipendenti",                                         rawText: "INPS dipendenti 2.108 + INAIL dipendenti/collaboratori 179 = 2.287" },
      // fondo azzerato nel 2024: SP riporta '-' come valore corrente e '47.757' come precedente
      fondoRischiOneri:     { value: 0,       page: 3,    rawLabel: "Fondi per rischi e oneri",                                rawText: "B) Fondi per rischi e oneri\t-\t47.757" },
    },
  ],

  checklist: {
    debitiGSE:       { presente: false, dettaglio: "Nessun debito verso GSE iscritto nello stato patrimoniale negli esercizi 2022-2024.", fonteTestuale: "Nessuna occorrenza trovata nel documento per debiti GSE.", page: 0, sourceFileName: "" },
    accantonamenti:  { presente: false, dettaglio: "Nessun accantonamento a fondo rischi collegato a extraprofitti o art. 15-bis D.L. 4/2022 rilevato nella nota integrativa.", fonteTestuale: "Nessuna occorrenza trovata nel documento per accantonamenti extraprofitti.", page: 0, sourceFileName: "" },
    riduzioniRicavi: { presente: false, dettaglio: "Nessuna riduzione di ricavi per effetto della normativa sugli extraprofitti rilevata nel conto economico.", fonteTestuale: "Nessuna occorrenza trovata nel documento per riduzioni ricavi extraprofitti.", page: 0, sourceFileName: "" },
    contenziosi:     { presente: false, dettaglio: "Nessun contenzioso o ricorso al TAR contro GSE menzionato nella nota integrativa.", fonteTestuale: "Nessuna occorrenza trovata nel documento per contenziosi GSE o ricorsi TAR.", page: 0, sourceFileName: "" },
  },
};

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
