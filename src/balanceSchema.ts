/**
 * balanceSchema.ts
 *
 * Dizionario configurabile delle etichette testuali ufficiali per ogni voce
 * di bilancio secondo la Tassonomia XBRL italiana PCI-2018-11-04
 * (obbligatoria per il deposito al Registro Imprese ex D.Lgs. 13/2015).
 *
 * Struttura:
 *   - `primary`  : stringa esatta come appare nel PDF generato dalla tassonomia
 *                  (primo tentativo di ricerca, massima precisione)
 *   - `variants` : etichette alternative usate da software diversi o bilanci
 *                  abbreviati/semplificati che non seguono alla lettera la
 *                  tassonomia standard
 *
 * Modifica questo file per adattare il dizionario a nuovi software gestionali
 * o a variazioni redazionali riscontrate nei documenti analizzati.
 *
 * NOTA: l'ordine di `variants` è rilevante — le stringhe più specifiche
 * (più parole) devono precedere quelle più generiche per evitare falsi positivi.
 */

export interface FieldSearchConfig {
  /** Etichetta primaria: stringa esatta attesa nel PDF XBRL standard */
  primary: string;
  /** Varianti accettate (altri software, bilanci abbreviati, ecc.) */
  variants: string[];
}

/**
 * Chiavi allineate a FinancialYearData (solo i campi RAW — i DerivedField
 * come `ebitda` non hanno una riga nel PDF e vanno esclusi).
 */
export type BalanceFieldKey =
  | 'ricavi'
  | 'ebit'
  | 'ammortamenti'
  | 'utileNetto'
  | 'interessiPassivi'
  | 'totaleAttivo'
  | 'patrimonioNetto'
  | 'totaleDebiti'
  | 'debitiBancheBreve'
  | 'debitiBancheML'
  | 'disponibilitaLiquide'
  | 'creditiEntro12Mesi'
  | 'rimanenze'
  | 'attivoCircolante'
  | 'passivitaCorrenti'
  | 'debitiTributari'
  | 'debitiPrevidenziali'
  | 'fondoRischiOneri';

/**
 * Mappa configurabile: chiave campo → configurazione di ricerca.
 *
 * Fonte label primarie: Tassonomia PCI-2018-11-04, sezione "label linkbase" IT.
 * https://www.registroimprese.it/deposito-bilanci
 */
export const BALANCE_SCHEMA: Record<BalanceFieldKey, FieldSearchConfig> = {

  // ── CONTO ECONOMICO ────────────────────────────────────────────────────────

  ricavi: {
    primary: 'Totale valore della produzione',
    variants: [
      'Totale ricavi e proventi',
      'Valore della produzione',
      'Ricavi delle vendite e delle prestazioni',
      'A) Valore della produzione',
      'A - Valore della produzione',
    ],
  },

  ebit: {
    primary: 'Differenza tra valore e costi della produzione (A-B)',
    variants: [
      'Differenza tra valore e costi della produzione',
      'A - B',
      'Risultato operativo',
      'EBIT',
    ],
  },

  ammortamenti: {
    primary: 'Totale ammortamenti e svalutazioni',
    variants: [
      'Ammortamenti e svalutazioni',
      'B) 10) Ammortamenti e svalutazioni',
      'Totale ammortamento delle immobilizzazioni',
      'Ammortamento delle immobilizzazioni immateriali e materiali',
    ],
  },

  utileNetto: {
    primary: 'Utile (perdita) dell\u2019esercizio',
    variants: [
      "Utile (perdita) dell'esercizio",
      'Utile di esercizio',
      'Perdita di esercizio',
      'Risultato netto',
      'IX - Utile (perdita) dell\u2019esercizio',
      "IX - Utile (perdita) dell'esercizio",
    ],
  },

  interessiPassivi: {
    primary: 'Interessi e altri oneri finanziari',
    variants: [
      'Totale interessi e altri oneri finanziari',
      'C) 17) Interessi e altri oneri finanziari',
      'Oneri finanziari',
      'Interessi passivi',
    ],
  },

  // ── STATO PATRIMONIALE — ATTIVO ───────────────────────────────────────────

  totaleAttivo: {
    primary: 'Totale attivo',
    variants: [
      'TOTALE ATTIVO',
      'Totale dell\u2019attivo',
      "Totale dell'attivo",
    ],
  },

  attivoCircolante: {
    primary: 'Totale attivo circolante (C)',
    variants: [
      'Totale attivo circolante',
      'C) Totale attivo circolante',
      'Attivo circolante — Totale',
      'Totale C)',
    ],
  },

  disponibilitaLiquide: {
    primary: 'Totale disponibilit\u00e0 liquide',
    variants: [
      'Disponibilit\u00e0 liquide',
      'IV - Disponibilit\u00e0 liquide',
      'IV) Disponibilit\u00e0 liquide',
      'Totale IV - Disponibilit\u00e0 liquide',
      'Cassa e disponibilit\u00e0 liquide',
    ],
  },

  creditiEntro12Mesi: {
    primary: 'Totale crediti',
    variants: [
      'Crediti esigibili entro l\u2019esercizio successivo',
      "Crediti esigibili entro l'esercizio successivo",
      'II - Crediti',
      'Totale II - Crediti',
      'Crediti verso clienti entro 12 mesi',
    ],
  },

  rimanenze: {
    primary: 'Totale rimanenze',
    variants: [
      'Rimanenze',
      'I - Rimanenze',
      'Totale I - Rimanenze',
      'I) Rimanenze',
    ],
  },

  // ── STATO PATRIMONIALE — PASSIVO ──────────────────────────────────────────

  patrimonioNetto: {
    primary: 'Totale patrimonio netto',
    variants: [
      'Patrimonio netto',
      'A) Totale patrimonio netto',
      'Totale A) Patrimonio netto',
      'Totale A - Patrimonio netto',
    ],
  },

  fondoRischiOneri: {
    primary: 'Totale fondi per rischi e oneri',
    variants: [
      'Fondi per rischi e oneri',
      'B) Fondi per rischi e oneri',
      'Totale B) Fondi per rischi e oneri',
      'B - Fondi per rischi e oneri',
    ],
  },

  totaleDebiti: {
    primary: 'Totale debiti',
    variants: [
      'D) Totale debiti',
      'Totale D) Debiti',
      'Totale D - Debiti',
      'TOTALE DEBITI',
    ],
  },

  passivitaCorrenti: {
    primary: 'Totale debiti esigibili entro l\u2019esercizio successivo',
    variants: [
      "Totale debiti esigibili entro l'esercizio successivo",
      'Debiti esigibili entro l\u2019esercizio successivo',
      "Debiti esigibili entro l'esercizio successivo",
      'Passivit\u00e0 correnti',
      'Totale passivit\u00e0 correnti',
    ],
  },

  debitiBancheBreve: {
    primary: 'Debiti verso banche esigibili entro l\u2019esercizio successivo',
    variants: [
      "Debiti verso banche esigibili entro l'esercizio successivo",
      'Debiti verso banche entro 12 mesi',
      'Debiti bancari a breve',
      'verso banche entro esercizio',
    ],
  },

  debitiBancheML: {
    primary: 'Debiti verso banche esigibili oltre l\u2019esercizio successivo',
    variants: [
      "Debiti verso banche esigibili oltre l'esercizio successivo",
      'Debiti verso banche oltre 12 mesi',
      'Debiti bancari a medio-lungo termine',
      'Mutui',
    ],
  },

  debitiTributari: {
    primary: 'Totale debiti tributari',
    variants: [
      'Debiti tributari',
      'Erario',
      '12) Debiti tributari',
      'Totale 12) Debiti tributari',
    ],
  },

  debitiPrevidenziali: {
    primary: 'Totale debiti verso istituti di previdenza e di sicurezza sociale',
    variants: [
      'Debiti verso istituti di previdenza e di sicurezza sociale',
      'Debiti previdenziali',
      'INPS',
      '13) Debiti verso istituti di previdenza',
    ],
  },
};

/**
 * Restituisce la lista ordinata di stringhe da cercare nel PDF per un campo.
 * Ordine: primary → variants (dal più specifico al più generico).
 *
 * Il viewer usa questa lista scorrendo dall'inizio:
 * appena trova una riga nel PDF che matcha una di queste stringhe E contiene
 * un valore numerico compatibile, si ferma.
 */
export function getSearchLabels(key: BalanceFieldKey): string[] {
  const config = BALANCE_SCHEMA[key];
  return [config.primary, ...config.variants];
}
