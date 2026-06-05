/**
 * kpiCalculator.ts
 * Calcolo DETERMINISTICO degli indici sintetici di bilancio.
 * Nessuna chiamata AI — formule cablate nel codice.
 * Logica: se il denominatore è 0 → "n.a.", se manca un dato → "n.d."
 */

import { DerivedField, FinancialYearData } from './types';

export interface KpiResult {
  currentRatio: string;
  quickRatio: string;
  cashRatio: string;
  autonomiaFinanziaria: string;
  debtEquity: string;
  leverage: string;
  pfnEbitda: string;
  interestCoverage: string;
  ros: string;
  // Copertura GSE
  cassaResiduo: string;
  attivoCircResiduo: string;
  patrimonioResiduo: string;
}

const v = (field: { value: number | null } | null | undefined): number | null => {
  if (!field) return null;
  return field.value;
};

const ratio = (
  num: number | null,
  den: number | null,
  decimals = 2
): string => {
  if (num === null || den === null) return 'n.d.';
  if (den === 0) return 'n.a.';
  return (num / den).toFixed(decimals);
};

// ─── Formattazione italiana (1.234.567) ──────────────────────────────────────
const fmtIT = (n: number): string =>
  n.toLocaleString('it-IT', { maximumFractionDigits: 0 });

/**
 * computeDerivedFields — calcola deterministicamente tutti i DerivedField
 * a partire dai campi RAW dell'anno.
 *
 * Va chiamato:
 *   1. Subito dopo il parsing della risposta AI in extractDataFromPdfs()
 *   2. In DataVerification ogni volta che l'utente modifica un campo RAW
 *      da cui dipende un campo derivato (ebit, ammortamenti)
 *
 * Muta l'oggetto year in-place.
 */
export const computeDerivedFields = (year: FinancialYearData): void => {
  const ebit = v(year.ebit);
  const amm  = v(year.ammortamenti);

  const ebitdaField: DerivedField<number> = {
    value:   ebit !== null && amm !== null ? ebit + amm : null,
    formula: ebit !== null && amm !== null
      ? `EBIT ${fmtIT(ebit)} + Amm. ${fmtIT(amm)} = ${fmtIT(ebit + amm)}`
      : null,
  };

  year.ebitda = ebitdaField;
};

export const calculateKpis = (
  year: FinancialYearData,
  gseResidual: number | null
): KpiResult => {
  const ac    = v(year.attivoCircolante);
  const rim   = v(year.rimanenze);
  const pc    = v(year.passivitaCorrenti);
  const liq   = v(year.disponibilitaLiquide);
  const pn    = v(year.patrimonioNetto);
  const ta    = v(year.totaleAttivo);
  const td    = v(year.totaleDebiti);
  const dbb   = v(year.debitiBancheBreve);
  const dbml  = v(year.debitiBancheML);
  // ebitda è DerivedField — stessa interfaccia { value } → v() funziona
  const ebitda = v(year.ebitda);
  const ebit   = v(year.ebit);
  const ip     = v(year.interessiPassivi);
  const ric    = v(year.ricavi);

  // PFN = Deb.Breve + Deb.M/L - Disp.Liquide
  const pfn =
    dbb !== null && dbml !== null && liq !== null ? dbb + dbml - liq : null;

  return {
    currentRatio:         ratio(ac, pc),
    quickRatio:
      ac !== null && rim !== null && pc !== null
        ? ratio(ac - rim, pc)
        : 'n.d.',
    cashRatio:            ratio(liq, pc),
    autonomiaFinanziaria: ratio(pn, ta),
    debtEquity:           ratio(td, pn),
    leverage:             ratio(ta, pn),
    pfnEbitda:            ratio(pfn, ebitda),
    interestCoverage:     ratio(ebit, ip),
    ros:                  ratio(ebit, ric),
    // Copertura GSE
    cassaResiduo:         ratio(liq, gseResidual),
    attivoCircResiduo:    ratio(ac,  gseResidual),
    patrimonioResiduo:    ratio(pn,  gseResidual),
  };
};
