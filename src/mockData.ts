/**
 * MOCK DATA — GEOSOL SOCIETA AGRICOLA A R.L.
 * Dati reali estratti dai bilanci 2022, 2023, 2024 depositati al Registro Imprese.
 * Usati per la modalita DEMO: bypassano le chiamate OpenRouter.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONVENZIONI OBBLIGATORIE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ExtractedField (campi RAW — estratti dal PDF):
 *   value    — numero trovato nel documento (0 = trovato ed è zero, null = assente)
 *   page     — indice fisico PDF 1-based (copertina = 1, SP = 3, CE = 4)
 *              pagina fisica = numero logico stampato + 1
 *   rawLabel — testo VERBATIM dell'etichetta nel PDF, senza numeri né tab.
 *              DEVE corrispondere ESATTAMENTE a una stringa presente nel PDF.
 *              MAI testo descrittivo/inventato → il viewer lo cercherebbe nel PDF.
 *              Se il campo non ha riga diretta nel PDF → usare DerivedField.
 *              Per campi multi-riga (debitiTributari, debitiPrevidenziali):
 *              rawLabel = prefisso comune a TUTTE le righe ('Erario', 'INPS').
 *              Il viewer evidenzierà TUTTE le occorrenze e mostrerà la somma.
 *   rawText  — riga COMPLETA verbatim con tab e tutti i numeri.
 *              Per campi multi-riga: tutte le righe concatenate con '\n'.
 *              DEVE essere copiata letter-for-letter dal testo grezzo del PDF.
 *              MAI testo descrittivo/calcolato — stessa regola di rawLabel.
 *              null se il campo non è presente come riga nel PDF.
 *
 * DerivedField (campi DERIVATI — calcolati da computeDerivedFields):
 *   value   — calcolato da computeDerivedFields(); il valore qui è solo
 *             il valore iniziale per il mock — verrà sovrascritto.
 *   formula — stringa leggibile del calcolo, solo per debug/UI.
 *   ⚠️  Nessun page, rawLabel, rawText: il viewer non deve cercare nulla.
 *
 * Pagine fisiche:
 *   Copertina → 1 | SP → 3 | CE → 4
 *   Note debiti → 2022: p.11 | 2023: p.12 | 2024: p.13
 *
 * rawLabel per passivitaCorrenti e creditiEntro12Mesi:
 *   Nel PDF GEOSOL le righe di dettaglio SP compaiono troncate senza il prefisso
 *   "Totale debiti" / "Crediti" — il viewer usa rawLabel per cercare nel testo
 *   estratto, quindi rawLabel DEVE coincidere con ciò che appare nel PDF:
 *   "esigibili entro l'esercizio successivo" (senza alcun prefisso).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ExtractedData, NarrativeData } from './types';
import { computeDerivedFields } from './kpiCalculator';

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
    // ── BILANCIO 2022 ────────────────────────────────────────────────────────
    {
      year: "2022",
      sourceFileName: MOCK_FILE_NAMES[0],

      // ── CE — pagina fisica 4 ──────────────────────────────────────────────
      ricavi: {
        value: 818547,
        page: 4,
        rawLabel: "Totale valore della produzione",
        rawText:  "Totale valore della produzione\t818.547\t778.956",
      },
      ebit: {
        value: 160638,
        page: 4,
        rawLabel: "Differenza tra valore e costi della produzione (A - B)",
        rawText:  "Differenza tra valore e costi della produzione (A - B)\t160.638\t215.726",
      },
      ammortamenti: {
        // FIX: value allineato al rawText (145.786, non 145.787)
        value: 145786,
        page: 4,
        rawLabel: "Totale ammortamenti e svalutazioni",
        rawText:  "Totale ammortamenti e svalutazioni\t145.786\t130.769",
      },
      utileNetto: {
        value: 115097,
        page: 4,
        rawLabel: "21) Utile (perdita) dell'esercizio",
        rawText:  "21) Utile (perdita) dell'esercizio\t115.097\t153.103",
      },
      interessiPassivi: {
        value: 36,
        page: 4,
        rawLabel: "Totale interessi e altri oneri finanziari",
        rawText:  "Totale interessi e altri oneri finanziari\t36\t139",
      },

      // ── SP — pagina fisica 3 ──────────────────────────────────────────────
      totaleAttivo: {
        value: 3525717,
        page: 3,
        rawLabel: "Totale attivo",
        rawText:  "Totale attivo\t3.525.717\t3.604.643",
      },
      patrimonioNetto: {
        value: 1361443,
        page: 3,
        rawLabel: "Totale patrimonio netto",
        rawText:  "Totale patrimonio netto\t1.361.443\t1.246.347",
      },
      totaleDebiti: {
        value: 2079084,
        page: 3,
        rawLabel: "Totale debiti",
        rawText:  "Totale debiti\t2.079.084\t2.343.807",
      },
      attivoCircolante: {
        value: 449155,
        page: 3,
        rawLabel: "Totale attivo circolante (C)",
        rawText:  "Totale attivo circolante (C)\t449.155\t389.360",
      },
      // FIX: rawLabel allineato al testo verbatim della riga nel PDF (troncata senza prefisso)
      passivitaCorrenti: {
        value: 864978,
        page: 3,
        rawLabel: "esigibili entro l'esercizio successivo",
        rawText:  "esigibili entro l'esercizio successivo\t864.978\t347.257",
      },
      disponibilitaLiquide: {
        value: 254282,
        page: 3,
        rawLabel: "IV - Disponibilità liquide",
        rawText:  "IV - Disponibilità liquide\t254.282\t259.343",
      },
      // FIX: rawLabel allineato al testo verbatim della riga nel PDF (troncata senza prefisso)
      creditiEntro12Mesi: {
        value: 194873,
        page: 3,
        rawLabel: "esigibili entro l'esercizio successivo",
        rawText:  "esigibili entro l'esercizio successivo\t194.873\t130.027",
      },
      rimanenze: {
        value: null,
        page: null,
        rawLabel: null,
        rawText:  null,
      },
      fondoRischiOneri: {
        value: 47757,
        page: 3,
        rawLabel: "Fondi per rischi e oneri",
        rawText:  "B) Fondi per rischi e oneri\t47.757",
      },

      // ── Note integrative — pagina fisica 11 ──────────────────────────────
      debitiBancheBreve: {
        value: 370237,
        page: 11,
        rawLabel: "MUTUO BAPR",
        rawText:  "MUTUO BAPR\t1.870.237\t370.237\t1.500.000",
      },
      debitiBancheML: {
        value: null,
        page: null,
        rawLabel: null,
        rawText:  null,
      },
      debitiTributari: {
        value: 56797,
        page: 11,
        rawLabel: "Erario",
        rawText:  "Erario c/riten.su redd.lav.dipend.e assi\nErario c/rit.redd.lav.aut.,agenti,rappr.\nErario c/imposte sostitutive su TFR\nErario imposta sostitutiva su TFR\nErario c/IRES\t7.747\t-\t7.747-\t100-\nErario c/acconti IRES\t33.323\t31.561\t1.762-\t6-\nErario c/acconti IRAP\t-\t10.715\t10.715\t100\nErario c/IRAP\t5.737\t-\t5.737-\t-",
      },
      debitiPrevidenziali: {
        value: 1139,
        page: 11,
        rawLabel: "INPS",
        rawText:  "INPS dipendenti\t14.490\t980\t13.510-\t94-\nINAIL dipendenti/collaboratori\t167\t159\t8-\t1-",
      },

      ebitda: { value: null, formula: null },
    },

    // ── BILANCIO 2023 ────────────────────────────────────────────────────────
    {
      year: "2023",
      sourceFileName: MOCK_FILE_NAMES[1],

      ricavi: {
        value: 948319,
        page: 4,
        rawLabel: "Totale valore della produzione",
        rawText:  "Totale valore della produzione\t948.319\t818.547",
      },
      ebit: {
        value: 219797,
        page: 4,
        rawLabel: "Differenza tra valore e costi della produzione (A - B)",
        rawText:  "Differenza tra valore e costi della produzione (A - B)\t219.797\t160.638",
      },
      ammortamenti: {
        value: 145786,
        page: 4,
        rawLabel: "Totale ammortamenti e svalutazioni",
        rawText:  "Totale ammortamenti e svalutazioni\t145.786\t145.786",
      },
      utileNetto: {
        value: 179250,
        page: 4,
        rawLabel: "21) Utile (perdita) dell'esercizio",
        rawText:  "21) Utile (perdita) dell'esercizio\t179.250\t115.097",
      },
      interessiPassivi: {
        value: 94,
        page: 4,
        rawLabel: "Totale interessi e altri oneri finanziari",
        rawText:  "Totale interessi e altri oneri finanziari\t94\t36",
      },

      totaleAttivo: {
        value: 3320008,
        page: 3,
        rawLabel: "Totale attivo",
        rawText:  "Totale attivo\t3.320.008\t3.525.717",
      },
      patrimonioNetto: {
        value: 2129423,
        page: 3,
        rawLabel: "Totale patrimonio netto",
        rawText:  "Totale patrimonio netto\t2.129.423\t1.361.443",
      },
      totaleDebiti: {
        value: 1125299,
        page: 3,
        rawLabel: "Totale debiti",
        rawText:  "Totale debiti\t1.125.299\t2.079.084",
      },
      attivoCircolante: {
        value: 187761,
        page: 3,
        rawLabel: "Totale attivo circolante (C)",
        rawText:  "Totale attivo circolante (C)\t187.761\t449.155",
      },
      // FIX: rawLabel allineato al testo verbatim della riga nel PDF
      passivitaCorrenti: {
        value: 733962,
        page: 3,
        rawLabel: "esigibili entro l'esercizio successivo",
        rawText:  "esigibili entro l'esercizio successivo\t733.962\t864.978",
      },
      disponibilitaLiquide: {
        value: 53216,
        page: 3,
        rawLabel: "IV - Disponibilità liquide",
        rawText:  "IV - Disponibilità liquide\t53.216\t254.282",
      },
      // FIX: rawLabel allineato al testo verbatim della riga nel PDF
      creditiEntro12Mesi: {
        value: 134545,
        page: 3,
        rawLabel: "esigibili entro l'esercizio successivo",
        rawText:  "esigibili entro l'esercizio successivo\t134.545\t194.873",
      },
      rimanenze: {
        value: null,
        page: null,
        rawLabel: null,
        rawText:  null,
      },
      fondoRischiOneri: {
        value: 47757,
        page: 3,
        rawLabel: "Fondi per rischi e oneri",
        rawText:  "B) Fondi per rischi e oneri\t47.757\t47.757",
      },

      debitiBancheBreve: {
        value: 0,
        page: 12,
        rawLabel: "MUTUO BAPR",
        rawText:  "MUTUO BAPR\t370.237\t-\t-370.237",
      },
      debitiBancheML: {
        value: 0,
        page: null,
        rawLabel: null,
        rawText:  null,
      },
      debitiTributari: {
        value: 24568,
        page: 12,
        rawLabel: "Erario",
        rawText:  "Erario c/riten.su redd.lav.dipend.e\nErario c/rit.redd.lav.aut.,agenti,\nErario c/imposte sostitutive su TFR\t131\t-\t-131\t-100,00%\nErario imposta sostitutiva su TFR\t491\t491\t-\t-\nErario c/acconti IRES\t31.561\t-\t-31.561\t-100,00%\nErario c/acconti IRAP\t10.715\t-10.715\t-100,00%\nErario c/IRES\t-\t19.900\t19.900\t100,00%",
      },
      debitiPrevidenziali: {
        value: 1965,
        page: 12,
        rawLabel: "INPS",
        rawText:  "INPS dipendenti\t980\t1809\t829\t45,83%\nINAIL dipendenti/collaboratori\t159\t156\t-3\t-1,89%",
      },

      ebitda: { value: null, formula: null },
    },

    // ── BILANCIO 2024 ────────────────────────────────────────────────────────
    {
      year: "2024",
      sourceFileName: MOCK_FILE_NAMES[2],

      ricavi: {
        value: 1137074,
        page: 4,
        rawLabel: "Totale valore della produzione",
        rawText:  "Totale valore della produzione\t1.137.074\t948.319",
      },
      ebit: {
        value: 199791,
        page: 4,
        rawLabel: "Differenza tra valore e costi della produzione (A - B)",
        rawText:  "Differenza tra valore e costi della produzione (A - B)\t199.791\t219.797",
      },
      ammortamenti: {
        value: 174108,
        page: 4,
        rawLabel: "Totale ammortamenti e svalutazioni",
        rawText:  "Totale ammortamenti e svalutazioni\t174.108\t145.786",
      },
      utileNetto: {
        value: 151964,
        page: 4,
        rawLabel: "21) Utile (perdita) dell'esercizio",
        rawText:  "21) Utile (perdita) dell'esercizio\t151.964\t179.250",
      },
      interessiPassivi: {
        value: 956,
        page: 4,
        rawLabel: "Totale interessi e altri oneri finanziari",
        rawText:  "Totale interessi e altri oneri finanziari\t956\t94",
      },

      totaleAttivo: {
        value: 3587108,
        page: 3,
        rawLabel: "Totale attivo",
        rawText:  "Totale attivo\t3.587.108\t3.320.008",
      },
      patrimonioNetto: {
        value: 2281387,
        page: 3,
        rawLabel: "Totale patrimonio netto",
        rawText:  "Totale patrimonio netto\t2.281.387\t2.129.423",
      },
      totaleDebiti: {
        value: 1286028,
        page: 3,
        rawLabel: "Totale debiti",
        rawText:  "Totale debiti\t1.286.028\t1.125.299",
      },
      attivoCircolante: {
        value: 517437,
        page: 3,
        rawLabel: "Totale attivo circolante (C)",
        rawText:  "Totale attivo circolante (C)\t517.437\t187.761",
      },
      // FIX: rawLabel allineato al testo verbatim della riga nel PDF
      passivitaCorrenti: {
        value: 629885,
        page: 3,
        rawLabel: "esigibili entro l'esercizio successivo",
        rawText:  "esigibili entro l'esercizio successivo\t629.885\t733.962",
      },
      disponibilitaLiquide: {
        value: 224292,
        page: 3,
        rawLabel: "IV - Disponibilità liquide",
        rawText:  "IV - Disponibilità liquide\t224.292\t53.216",
      },
      // FIX: rawLabel allineato al testo verbatim della riga nel PDF
      creditiEntro12Mesi: {
        value: 293145,
        page: 3,
        rawLabel: "esigibili entro l'esercizio successivo",
        rawText:  "esigibili entro l'esercizio successivo\t293.145\t134.545",
      },
      rimanenze: {
        value: null,
        page: null,
        rawLabel: null,
        rawText:  null,
      },
      fondoRischiOneri: {
        value: 0,
        page: 3,
        rawLabel: "Fondi per rischi e oneri",
        rawText:  "B) Fondi per rischi e oneri\t-\t47.757",
      },

      debitiBancheBreve: {
        value: null,
        page: null,
        rawLabel: null,
        rawText:  null,
      },
      debitiBancheML: {
        value: null,
        page: null,
        rawLabel: null,
        rawText:  null,
      },
      debitiTributari: {
        value: 12611,
        page: 13,
        rawLabel: "Erario",
        rawText:  "Erario c/riten.su redd.lav.dipend.e assi\t1.265\t1.096\t-169\t-15,42%\nErario c/rit.redd.lav.aut.,agenti,rappr.\t2.912\t3.433\t521\t15,18%\nErario imposta sostitutiva su TFR\t491\t508\t17\t3,46%\nErario c/IRES\t19.900\t7.574\t-12.326\t-61,94%",
      },
      debitiPrevidenziali: {
        value: 2287,
        page: 13,
        rawLabel: "INPS",
        rawText:  "INPS dipendenti\t1.809\t2.108\t299\t14,18%\nINAIL dipendenti/collaboratori\t156\t179\t23\t12,85%",
      },

      ebitda: { value: null, formula: null },
    },
  ],

  checklist: {
    debitiGSE:       { presente: false, dettaglio: "Nessun debito verso GSE iscritto nello stato patrimoniale negli esercizi 2022-2024.", fonteTestuale: null, page: null, sourceFileName: null },
    accantonamenti:  { presente: false, dettaglio: "Nessun accantonamento a fondo rischi collegato a extraprofitti o art. 15-bis D.L. 4/2022 rilevato nella nota integrativa.", fonteTestuale: null, page: null, sourceFileName: null },
    riduzioniRicavi: { presente: false, dettaglio: "Nessuna riduzione di ricavi per effetto della normativa sugli extraprofitti rilevata nel conto economico.", fonteTestuale: null, page: null, sourceFileName: null },
    contenziosi:     { presente: false, dettaglio: "Nessun contenzioso o ricorso al TAR contro GSE menzionato nella nota integrativa.", fonteTestuale: null, page: null, sourceFileName: null },
  },
};

// Calcola tutti i DerivedField al caricamento del modulo
MOCK_EXTRACTED_DATA.yearsData.forEach(computeDerivedFields);

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
