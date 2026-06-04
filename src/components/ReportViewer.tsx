import React, { useRef } from 'react';
import { ExtractedData, NarrativeData } from '../types';
import { calculateKpis } from '../kpiCalculator';
import { Download, FileText } from 'lucide-react';

interface Props {
  extractedData: ExtractedData;
  narrativeData: NarrativeData;
  sourceFiles: File[];
}

const fmt = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return 'n.d.';
  return v.toLocaleString('it-IT');
};

const esitoColor = (esito: string): string => {
  if (esito === 'SOSTENIBILE') return '#1a7f37';
  if (esito === 'RISCHIO ELEVATO') return '#b91c1c';
  return '#92400e';
};

const esitoBg = (esito: string): string => {
  if (esito === 'SOSTENIBILE') return '#dcfce7';
  if (esito === 'RISCHIO ELEVATO') return '#fee2e2';
  return '#fef3c7';
};

const esitoBorder = (esito: string): string => {
  if (esito === 'SOSTENIBILE') return '#86efac';
  if (esito === 'RISCHIO ELEVATO') return '#fca5a5';
  return '#fcd34d';
};

const kpiStyle = (key: string, val: string): string => {
  const n = parseFloat(val.replace(',', '.'));
  if (isNaN(n)) return '';
  const good = '#166534', warn = '#92400e', bad = '#991b1b';
  switch (key) {
    case 'currentRatio': return n >= 1.2 ? good : n >= 0.8 ? warn : bad;
    case 'quickRatio':   return n >= 1.0 ? good : n >= 0.6 ? warn : bad;
    case 'cashRatio':    return n >= 0.3 ? good : n >= 0.1 ? warn : bad;
    case 'autonomiaFinanziaria': return n >= 0.4 ? good : n >= 0.2 ? warn : bad;
    case 'debtEquity':   return n <= 1.5 ? good : n <= 3.0 ? warn : bad;
    case 'leverage':     return n <= 2.5 ? good : n <= 4.0 ? warn : bad;
    case 'pfnEbitda':    return n <= 3.0 ? good : n <= 5.0 ? warn : bad;
    case 'interestCoverage': return n >= 5 ? good : n >= 2 ? warn : bad;
    case 'ros':          return n >= 0.05 ? good : n >= 0.01 ? warn : bad;
    default: return '';
  }
};

const buildHtml = (data: ExtractedData, narrative: NarrativeData): string => {
  const company  = String(data.companyName?.value ?? 'N.D.');
  const piva     = String(data.vatNumber?.value ?? 'N.D.');
  const residuo  = data.gseResidual?.value ?? null;
  const years    = data.yearsData;
  const lastYear = years[years.length - 1];
  const kpis     = calculateKpis(lastYear, residuo);
  const annoKpi  = lastYear?.year ?? 'N.D.';
  const esitoStr = narrative.esito ?? 'CAUTELA';
  const generatedDate = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const checklist = data.checklist;

  const checkRow = (label: string, item: { presente: boolean; dettaglio: string }) => {
    const icon      = item.presente ? '&#9888;' : '&#10003;';
    const iconColor = item.presente ? '#b91c1c' : '#166534';
    const bg        = item.presente ? '#fff5f5' : '#f0fdf4';
    return `<tr style="background-color:${bg}">
      <td>${label}</td>
      <td style="font-weight:bold;color:${iconColor};text-align:center">${icon}&nbsp;${item.presente ? 'Presente' : 'Assente'}</td>
      <td style="font-size:9.5pt;color:#374151">${esc(item.dettaglio || '&mdash;')}</td>
    </tr>`;
  };

  const sectionKeys: Record<string, boolean> = {
    ricavi: true, totaleAttivo: true, patrimonioNetto: true, attivoCircolante: true,
  };
  let bilIdx = 0;
  const bilRow = (label: string, key: keyof typeof lastYear) => {
    bilIdx++;
    const isSection = sectionKeys[key as string];
    const zebra = bilIdx % 2 === 0 ? '#f8fafc' : '#ffffff';
    const bg    = isSection ? '#eef4fb' : zebra;
    const fw    = isSection ? 'font-weight:bold;' : '';
    const cells = years.map((y) => {
      const f = y[key] as { value: number | null } | null;
      return `<td style="text-align:right;${fw}">${fmt(f?.value ?? null)}</td>`;
    }).join('');
    return `<tr style="background-color:${bg}"><td style="${fw}">${label}</td>${cells}</tr>`;
  };

  const yearWidth   = Math.floor(55 / years.length);
  const yearHeaders = years.map((y) =>
    `<th style="width:${yearWidth}%;text-align:right">${y.year} (&euro;)</th>`
  ).join('');

  const kpiRows: [string, string, string, string][] = [
    ['currentRatio',         'Current ratio',         'Attivo circ. / Pass. correnti',                         kpis.currentRatio],
    ['quickRatio',           'Quick ratio',            '(Attivo circ. &minus; Rimanenze) / Pass. correnti',     kpis.quickRatio],
    ['cashRatio',            'Cash ratio',             'Disp. liquide / Pass. correnti',                        kpis.cashRatio],
    ['autonomiaFinanziaria', 'Autonomia finanziaria',  'Patrimonio netto / Totale Attivo',                      kpis.autonomiaFinanziaria],
    ['debtEquity',           'Debt / Equity',          'Totale Debiti / Patrimonio netto',                      kpis.debtEquity],
    ['leverage',             'Leverage',               'Totale Attivo / Patrimonio netto',                      kpis.leverage],
    ['pfnEbitda',            'PFN / EBITDA',           '(Deb. Breve + Deb. M/L &minus; Disp. liq.) / EBITDA',  kpis.pfnEbitda],
    ['interestCoverage',     'Interest coverage',      'EBIT / Interessi passivi',                              kpis.interestCoverage],
    ['ros',                  'ROS',                    'EBIT / Ricavi',                                         kpis.ros],
  ];

  const kpiTableRows = kpiRows.map(([key, label, formula, val], i) => {
    const color    = kpiStyle(key, val);
    const bg       = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const valStyle = color ? `font-weight:bold;color:${color}` : '';
    return `<tr style="background-color:${bg}">
      <td style="font-weight:bold">${label}</td>
      <td style="font-size:9.5pt;color:#6b7280">${formula}</td>
      <td style="text-align:right;${valStyle}">${val}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<title>Report GSE &ndash; ${esc(company)}</title>
<!--[if mso]><style>table{width:100%!important;border-collapse:collapse}td,th{word-break:normal!important}</style><![endif]-->
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin:0; padding:0; width:100%; }
body {
  font-family: Calibri, Arial, sans-serif;
  font-size: 11pt;
  color: #1d2733;
  line-height: 1.55;
  background-color: #ffffff;
}
.doc-header {
  background-color: #0f3460;
  padding: 24px 32px 20px;
  width: 100%;
}
.doc-header-label {
  font-size: 8.5pt;
  color: #93c5fd;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  margin-bottom: 7px;
}
.doc-header h1 {
  font-size: 16pt;
  font-weight: bold;
  color: #ffffff;
  margin: 0 0 6px 0;
}
.doc-header-sub { font-size: 9pt; color: #bfdbfe; margin: 0; }
.meta-bar {
  background-color: #1e3a5f;
  padding: 10px 32px;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.meta-cell {
  font-size: 9pt;
  color: #e2e8f0;
  padding: 3px 20px 3px 0;
  white-space: nowrap;
}
.meta-cell strong { color: #ffffff; }
.esito-badge {
  display: inline-block;
  font-size: 9.5pt;
  font-weight: bold;
  padding: 3px 12px;
  border: 2px solid ${esitoBorder(esitoStr)};
  background-color: ${esitoBg(esitoStr)};
  color: ${esitoColor(esitoStr)};
  border-radius: 3px;
}
.content { padding: 20px 32px 8px; }

/* Interruzione di pagina prima di ogni h2, tranne il primo */
h2 {
  font-size: 11pt;
  font-weight: bold;
  color: #0f3460;
  margin: 20px 0 8px 0;
  padding: 5px 10px;
  background-color: #eef4fb;
  border-left: 4px solid #0f3460;
  /* interruzione di pagina — applicata a tutti */
  break-before: page;
  page-break-before: always;
}
/* Il primo capitolo non ha interruzione */
h2.no-break {
  break-before: auto;
  page-break-before: auto;
}

h3 { font-size: 10pt; font-weight: bold; color: #1e3a5f; margin: 12px 0 3px 0; }
p   { font-size: 10.5pt; margin: 0 0 6px 0; color: #374151; }
.muted { font-size: 9pt; color: #6b7280; }
table {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
  margin: 5px 0 14px 0;
  font-size: 10pt;
}
th {
  font-weight: bold;
  font-size: 10pt;
  padding: 7px 10px;
  border: 1px solid #1e3a5f;
  text-align: left;
  vertical-align: middle;
  background-color: #0f3460;
  color: #ffffff;
}
td {
  padding: 5px 10px;
  border: 1px solid #cbd5e1;
  vertical-align: top;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.narrative-box {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #3b82f6;
  padding: 10px 14px;
  margin-bottom: 8px;
}
.narrative-box h3 { margin: 0 0 4px 0; color: #1e40af; font-size: 10pt; }
.narrative-box p  { margin: 0; font-size: 10pt; color: #374151; }
.conclusione-box {
  background-color: ${esitoBg(esitoStr)};
  border: 1px solid ${esitoBorder(esitoStr)};
  border-left: 4px solid ${esitoColor(esitoStr)};
  padding: 10px 14px;
  margin-bottom: 8px;
}
.conclusione-box h3 { margin: 0 0 4px 0; color: ${esitoColor(esitoStr)}; font-size: 10pt; }
.conclusione-box p  { margin: 0; font-size: 10pt; color: #1d2733; }
.copertura-note {
  background-color: #fffbeb;
  border: 1px solid #fcd34d;
  border-left: 4px solid #d97706;
  padding: 8px 12px;
  font-size: 9.5pt;
  color: #78350f;
  margin-bottom: 12px;
}
.footer {
  border-top: 1px solid #e2e8f0;
  margin: 16px 32px 0;
  padding: 8px 0 20px;
  font-size: 8pt;
  color: #9ca3af;
}

/* In stampa/PDF: assicura che il break venga rispettato */
@media print {
  h2 { break-before: page; page-break-before: always; }
  h2.no-break { break-before: auto; page-break-before: auto; }
  .doc-header, .meta-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
<div class="doc-header">
  <div class="doc-header-label">Istruttoria economico-finanziaria &middot; Extraprofitti &middot; art. 15-bis D.L. 4/2022</div>
  <h1>Report di sostenibilit&agrave; del recupero credito residuo GSE</h1>
  <p class="doc-header-sub">Valutazione della capacit&agrave; dell&apos;azienda di assorbire l&apos;esborso richiesto &mdash; analisi bilanci, KPI patrimoniali ed elementi GSE/extraprofitti</p>
</div>
<div class="meta-bar">
  <div class="meta-cell"><strong>Societ&agrave;:</strong>&nbsp;${esc(company)}</div>
  <div class="meta-cell"><strong>P.&nbsp;IVA:</strong>&nbsp;${esc(piva)}</div>
  <div class="meta-cell"><strong>Anno KPI:</strong>&nbsp;${annoKpi}</div>
  <div class="meta-cell"><strong>Residuo GSE:</strong>&nbsp;&euro;&nbsp;${fmt(residuo)}</div>
  <div class="meta-cell"><strong>Esito:</strong>&nbsp;<span class="esito-badge">${esitoStr}</span></div>
  <div class="meta-cell" style="margin-left:auto;color:#94a3b8;font-size:8pt">Generato il ${generatedDate}</div>
</div>
<div class="content">

<!-- classe no-break sul primo h2: non vuoi saltare pagina subito dopo l'header -->
<h2 class="no-break">1 &mdash; Nota sintetica di esito</h2>
<div class="narrative-box">
  <h3>&#128200; Analisi Ricavi e Utile</h3>
  <p>${esc(narrative.analisiRicavi ?? '')}</p>
</div>
<div class="narrative-box">
  <h3>&#128178; Analisi della liquidit&agrave;</h3>
  <p>${esc(narrative.analisiLiquidita ?? '')}</p>
</div>
<div class="narrative-box">
  <h3>&#128203; Accantonamenti e rilievi extraprofitti</h3>
  <p>${esc(narrative.accantonamenti ?? '')}</p>
</div>
<div class="conclusione-box">
  <h3>&#9654; Conclusione &mdash; Esito: ${esitoStr}</h3>
  <p>${esc(narrative.conclusione ?? '')}</p>
</div>

<!-- Dal capitolo 2 in poi: break-before:page attivo -->
<h2>2 &mdash; Sintesi bilanci &ndash; Ultimi ${years.length} esercizi</h2>
<table><thead><tr>
  <th style="width:45%">Voce di bilancio</th>${yearHeaders}
</tr></thead><tbody>
${bilRow('Ricavi (valore produzione)', 'ricavi')}
${bilRow('EBITDA', 'ebitda')}
${bilRow('EBIT', 'ebit')}
${bilRow('Utile netto', 'utileNetto')}
${bilRow('Interessi passivi', 'interessiPassivi')}
${bilRow('Totale Attivo', 'totaleAttivo')}
${bilRow('Patrimonio netto', 'patrimonioNetto')}
${bilRow('Totale Debiti', 'totaleDebiti')}
${bilRow('Debiti banche Breve', 'debitiBancheBreve')}
${bilRow('Debiti banche M/L', 'debitiBancheML')}
${bilRow('Disponibilit&agrave; liquide', 'disponibilitaLiquide')}
${bilRow('Crediti entro 12 mesi', 'creditiEntro12Mesi')}
${bilRow('Rimanenze', 'rimanenze')}
${bilRow('Attivo circolante', 'attivoCircolante')}
${bilRow('Passivit&agrave; correnti', 'passivitaCorrenti')}
${bilRow('Debiti tributari', 'debitiTributari')}
${bilRow('Debiti previdenziali', 'debitiPrevidenziali')}
${bilRow('Fondo rischi e oneri', 'fondoRischiOneri')}
</tbody></table>

<h2>3 &mdash; KPI sintetici &ndash; Anno ${annoKpi}</h2>
<p class="muted">Calcolati con formule deterministiche.&nbsp;
  <span style="color:#166534;font-weight:bold">&#9632; positivo</span>&nbsp;
  <span style="color:#92400e;font-weight:bold">&#9632; attenzione</span>&nbsp;
  <span style="color:#991b1b;font-weight:bold">&#9632; critico</span>
</p>
<table><thead><tr>
  <th style="width:26%">Indice</th>
  <th style="width:52%">Formula</th>
  <th style="width:22%;text-align:right">Valore</th>
</tr></thead><tbody>${kpiTableRows}</tbody></table>

<h2>4 &mdash; Residuo GSE e indici di copertura</h2>
<p><strong>Importo residuo GSE:</strong>&nbsp;&euro;&nbsp;${fmt(residuo)}&emsp;<strong>P.&nbsp;IVA:</strong>&nbsp;${esc(piva)}&emsp;<strong>Fonte:</strong>&nbsp;PDF allegato</p>
<table><thead><tr>
  <th style="width:36%">Indice di copertura</th>
  <th style="width:38%">Calcolo</th>
  <th style="width:26%;text-align:right">Valore</th>
</tr></thead><tbody>
<tr style="background-color:#ffffff">
  <td style="font-weight:bold">Cassa / Residuo GSE</td>
  <td style="color:#6b7280;font-size:9.5pt">${fmt(lastYear?.disponibilitaLiquide?.value ?? null)} / ${fmt(residuo)}</td>
  <td style="text-align:right;font-weight:bold">${kpis.cassaResiduo}</td>
</tr>
<tr style="background-color:#f8fafc">
  <td style="font-weight:bold">Attivo circ. / Residuo GSE</td>
  <td style="color:#6b7280;font-size:9.5pt">${fmt(lastYear?.attivoCircolante?.value ?? null)} / ${fmt(residuo)}</td>
  <td style="text-align:right;font-weight:bold">${kpis.attivoCircResiduo}</td>
</tr>
<tr style="background-color:#ffffff">
  <td style="font-weight:bold">Patrimonio netto / Residuo GSE</td>
  <td style="color:#6b7280;font-size:9.5pt">${fmt(lastYear?.patrimonioNetto?.value ?? null)} / ${fmt(residuo)}</td>
  <td style="text-align:right;font-weight:bold">${kpis.patrimonioResiduo}</td>
</tr>
</tbody></table>
<div class="copertura-note">${esc(narrative.commentoCopertura ?? '')}</div>

<h2>5 &mdash; Checklist GSE ed extraprofitti</h2>
<table><thead><tr>
  <th style="width:40%">Voce verificata</th>
  <th style="width:16%">Esito</th>
  <th style="width:44%">Dettaglio riscontrato</th>
</tr></thead><tbody>
${checkRow('Debiti iscritti verso GSE nello SP', checklist.debitiGSE)}
${checkRow('Accantonamenti Fondo Rischi extraprofitti', checklist.accantonamenti)}
${checkRow('Riduzioni ricavi per effetto della norma', checklist.riduzioniRicavi)}
${checkRow('Contenziosi / ricorsi al TAR contro GSE', checklist.contenziosi)}
</tbody></table>

</div>
<div class="footer">
  Report generato automaticamente &mdash; KPI calcolati con formule deterministiche &mdash; Narrativa generata da AI &mdash;
  Aprire con Microsoft Word e salvare come .docx per la versione editabile. &mdash; ${generatedDate}
</div>
</body>
</html>`;
};

export const ReportViewer: React.FC<Props> = ({ extractedData, narrativeData }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlContent = buildHtml(extractedData, narrativeData);
  const company = String(extractedData.companyName?.value ?? 'report').replace(/[^a-zA-Z0-9]/g, '_');

  const handleDownloadDocx = () => {
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `GSE_Report_${company}.doc`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `GSE_Report_${company}.html`; a.click();
    URL.revokeObjectURL(url);
  };

  const esitoStr   = narrativeData.esito ?? 'CAUTELA';
  const badgeBg    = esitoStr === 'SOSTENIBILE' ? '#dcfce7' : esitoStr === 'RISCHIO ELEVATO' ? '#fee2e2' : '#fef3c7';
  const badgeColor = esitoColor(esitoStr);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-sm leading-tight">
              Report GSE &mdash; {String(extractedData.companyName?.value ?? 'N.D.')}
            </div>
            <div className="text-xs text-slate-400">P.IVA {String(extractedData.vatNumber?.value ?? 'N.D.')}</div>
          </div>
          <span
            className="ml-1 text-xs font-bold px-2.5 py-1 rounded-full border"
            style={{ backgroundColor: badgeBg, color: badgeColor, borderColor: badgeColor }}
          >
            {esitoStr}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadDocx}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Scarica .doc (Word)
          </button>
          <button
            onClick={handleDownloadHtml}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 text-sm rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            .html
          </button>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="border border-slate-200 overflow-hidden shadow-sm">
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          className="w-full block"
          style={{ height: '82vh', border: 'none', display: 'block' }}
          title="Report GSE Preview"
        />
      </div>
    </div>
  );
};
