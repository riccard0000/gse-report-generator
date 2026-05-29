import React, { useState } from 'react';
import { ExtractedData, NarrativeData, FinancialYearData } from '../types';
import { CheckCircle, XCircle, AlertCircle, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  extractedData: ExtractedData;
  narrativeData: NarrativeData;
  sourceFiles: File[];
}

const fmt = (v: number | null) =>
  v == null ? 'N/D' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

const pct = (a: number | null, b: number | null) => {
  if (!a || !b || b === 0) return null;
  return ((a / b) * 100).toFixed(1) + '%';
};

const trend = (curr: number | null, prev: number | null) => {
  if (!curr || !prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const TrendIcon: React.FC<{ value: number | null; inverse?: boolean }> = ({ value, inverse }) => {
  if (value == null) return <Minus className="w-4 h-4 text-slate-400" />;
  const positive = inverse ? value < 0 : value > 0;
  return positive
    ? <TrendingUp className="w-4 h-4 text-green-600" />
    : <TrendingDown className="w-4 h-4 text-red-500" />;
};

const EsitoTag: React.FC<{ esito: string }> = ({ esito }) => {
  const map: Record<string, string> = {
    'SOSTENIBILE': 'bg-green-100 text-green-800 border-green-300',
    'NON SOSTENIBILE': 'bg-red-100 text-red-800 border-red-300',
    'SOSTENIBILE CON RISERVA': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  };
  return (
    <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold border ${map[esito] ?? 'bg-slate-100 text-slate-800 border-slate-300'}`}>
      {esito === 'SOSTENIBILE' && <CheckCircle className="w-4 h-4 mr-1.5" />}
      {esito === 'NON SOSTENIBILE' && <XCircle className="w-4 h-4 mr-1.5" />}
      {esito === 'SOSTENIBILE CON RISERVA' && <AlertCircle className="w-4 h-4 mr-1.5" />}
      {esito}
    </span>
  );
};

export const ReportViewer: React.FC<Props> = ({ extractedData, narrativeData }) => {
  const years = extractedData.yearsData.sort((a, b) => a.year.localeCompare(b.year));
  const latest = years[years.length - 1];
  const prev = years[years.length - 2];

  const handleExport = () => {
    const content = [
      '# ISTRUTTORIA ECONOMICO-FINANZIARIA GSE',
      `## Extraprofitti · art. 15-bis D.L. 4/2022`,
      '',
      `**Azienda:** ${extractedData.companyName.value ?? 'N/D'}`,
      `**P.IVA:** ${extractedData.vatNumber.value ?? 'N/D'}`,
      `**Importo residuo GSE:** ${fmt(extractedData.gseResidual.value)}`,
      `**Esito:** ${narrativeData.esito}`,
      '',
      '## ANALISI RICAVI E REDDITIVITÀ',
      narrativeData.analisiRicavi,
      '',
      '## ANALISI LIQUIDITÀ E POSIZIONE FINANZIARIA',
      narrativeData.analisiLiquidita,
      '',
      '## ACCANTONAMENTI E PASSIVITÀ POTENZIALI',
      narrativeData.accantonamenti,
      '',
      '## CONCLUSIONE',
      narrativeData.conclusione,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `istruttoria_gse_${extractedData.vatNumber.value ?? 'export'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header report */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{extractedData.companyName.value ?? 'Azienda'}</h2>
            <p className="text-slate-500">P.IVA: {extractedData.vatNumber.value ?? 'N/D'}</p>
            <p className="mt-2 text-slate-700">Debito residuo GSE: <span className="font-bold text-blue-700">{fmt(extractedData.gseResidual.value)}</span></p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3">
            <EsitoTag esito={narrativeData.esito} />
            <button
              onClick={handleExport}
              className="flex items-center space-x-2 text-sm border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Esporta .md</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-x-auto">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Dati di Bilancio</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 pr-4 font-medium text-slate-600 w-48">Voce</th>
              {years.map(y => <th key={y.year} className="text-right py-2 px-3 font-medium text-slate-600">{y.year}</th>)}
              {prev && <th className="text-right py-2 px-3 font-medium text-slate-600">Δ</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {([
              ['Ricavi', 'ricavi'],
              ['EBITDA', 'ebitda'],
              ['EBIT', 'ebit'],
              ['Utile Netto', 'utileNetto'],
              ['Patrimonio Netto', 'patrimonioNetto'],
              ['Totale Attivo', 'totaleAttivo'],
              ['Totale Debiti', 'totaleDebiti'],
              ['Disponibilità Liquide', 'disponibilitaLiquide'],
            ] as [string, keyof FinancialYearData][]).map(([label, key]) => (
              <tr key={key} className="hover:bg-slate-50">
                <td className="py-2 pr-4 text-slate-700 font-medium">{label}</td>
                {years.map(y => (
                  <td key={y.year} className="text-right py-2 px-3 text-slate-800 tabular-nums">
                    {fmt((y[key] as any)?.value ?? null)}
                  </td>
                ))}
                {prev && (
                  <td className="text-right py-2 px-3">
                    <div className="flex items-center justify-end space-x-1">
                      <TrendIcon value={trend((latest[key] as any)?.value, (prev[key] as any)?.value)} inverse={key === 'totaleDebiti'} />
                      <span className="text-xs text-slate-500">
                        {trend((latest[key] as any)?.value, (prev[key] as any)?.value)?.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* KPI Indici */}
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Margine EBITDA', value: pct(latest.ebitda?.value, latest.ricavi?.value) },
            { label: 'ROE', value: pct(latest.utileNetto?.value, latest.patrimonioNetto?.value) },
            { label: 'Current Ratio', value: latest.attivoCircolante?.value && latest.passivitaCorrenti?.value ? (latest.attivoCircolante.value / latest.passivitaCorrenti.value).toFixed(2) : 'N/D' },
            { label: 'Debt/Equity', value: latest.totaleDebiti?.value && latest.patrimonioNetto?.value ? (latest.totaleDebiti.value / latest.patrimonioNetto.value).toFixed(2) : 'N/D' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-800">{kpi.value ?? 'N/D'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Narrativa */}
      <div className="grid md:grid-cols-2 gap-6">
        {[
          { title: 'Analisi Ricavi e Redditività', text: narrativeData.analisiRicavi },
          { title: 'Liquidità e Posizione Finanziaria', text: narrativeData.analisiLiquidita },
          { title: 'Accantonamenti e Passività', text: narrativeData.accantonamenti },
          { title: 'Conclusione Tecnica', text: narrativeData.conclusione },
        ].map(section => (
          <div key={section.title} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-3">{section.title}</h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{section.text}</p>
          </div>
        ))}
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Checklist Documentale</h3>
        <div className="space-y-3">
          {Object.entries(extractedData.checklist).map(([key, item]) => {
            const labels: Record<string, string> = {
              debitiGSE: 'Debiti verso GSE iscritti in bilancio',
              accantonamenti: 'Accantonamenti specifici per extraprofitti',
              riduzioniRicavi: 'Riduzioni di ricavi correlate',
              contenziosi: 'Contenziosi in corso con GSE',
            };
            return (
              <div key={key} className="flex items-start space-x-3 p-3 rounded-lg bg-slate-50">
                {item.presente
                  ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  : <XCircle className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="text-sm font-medium text-slate-800">{labels[key] ?? key}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.dettaglio}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};