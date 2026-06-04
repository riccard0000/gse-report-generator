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

const fmtKpi = (v: string): string => v;

const esitoColor = (esito: string): string => {
  if (esito === 'SOSTENIBILE') return '#1a7f37';
  if (esito === 'RISCHIO ELEVATO') return '#b91c1c';
  return '#b45309';
};

const buildHtml = (data: ExtractedData, narrative: NarrativeData): string => {
  const company = data.companyName?.value ?? 'N.D.';
  const piva = data.vatNumber?.value ?? 'N.D.';
  const residuo = data.gseResidual?.value ?? null;
  const years = data.yearsData;
  const lastYear = years[years.length - 1];
  const kpis = calculateKpis(lastYear, residuo);
  const annoKpi = lastYear?.year ?? 'N.D.';

  const escHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const checklist = data.checklist;

  const checkRow = (label: string, item: { presente: boolean; dettaglio: string }) =>
    `<tr><td>${label}</td><td>${item.presente ? 'Presente' : 'Assente'}</td><td>${escHtml(item.dettaglio || '—')}</td></tr>`;

  const bilRow = (label: string, key: keyof typeof lastYear) => {
    const cells = years
      .map((y) => {
        const f = y[key] as { value: number | null } | null;
        return `<td>${fmt(f?.value ?? null)}</td>`;
      })
      .join('');
    return `<tr><td>${label}</td>${cells}</tr>`;
  };

  const yearHeaders = years
    .map((y) => `<th style="width:${Math.floor(60 / years.length)}%">${y.year} (&euro;)</th>`)
    .join('');

  const esitoStr = narrative.esito ?? 'CAUTELA';

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<title>Report GSE &ndash; ${escHtml(String(company))}</title>
<!--[if mso]>
<style>
table { width:100% !important; }
td, th { word-break:normal !important; overflow-wrap:break-word !important; }
</style>
<![endif]-->
<style>
body { font-family:Calibri,Arial,sans-serif; font-size:11pt; color:#1d2733; margin:1.5cm 1.5cm; line-height:1.5; }
h1 { font-size:16pt; font-weight:bold; color:#123b67; margin-top:0; margin-bottom:4px; }
h2 { font-size:12pt; font-weight:bold; color:#123b67; margin-top:16px; margin-bottom:4px; border-bottom:1px solid #123b67; padding-bottom:2px; }
h3 { font-size:11pt; font-weight:bold; color:#1d2733; margin-top:10px; margin-bottom:3px; }
p { font-size:11pt; margin:0 0 7px 0; }
.muted { font-size:9.5pt; color:#5c6b7a; }
table { border-collapse:collapse; width:100%; table-layout:fixed; margin:6px 0 14px 0; font-size:10pt; font-family:Calibri,Arial,sans-serif; }
th { font-weight:bold; font-size:10pt; padding:6px 8px; border:1px solid #888; text-align:left; vertical-align:top; background-color:#dce6f1; color:#1d2733; }
td { padding:5px 8px; border:1px solid #aaa; vertical-align:top; font-size:10pt; word-wrap:break-word; overflow-wrap:break-word; }
.footer { margin-top:20px; border-top:1px solid #aaa; padding-top:6px; font-size:9pt; color:#888; }
</style>
</head>
<body>

<p class="muted">Istruttoria economico-finanziaria GSE &middot; Extraprofitti &middot; art. 15-bis D.L. 4/2022</p>
<h1>Report di sostenibilit&agrave; del recupero credito residuo GSE</h1>
<p class="muted">Valutazione della capacit&agrave; dell&apos;azienda di assorbire l&apos;esborso richiesto, con analisi dei bilanci, degli indici patrimoniali e degli elementi informativi collegati a GSE ed extraprofitti.</p>

<p>
  <strong>Societ&agrave;:</strong> ${escHtml(String(company))} &nbsp;
  <strong>P. IVA:</strong> ${escHtml(String(piva))} &nbsp;
  <strong>Anno KPI:</strong> ${annoKpi} &nbsp;
  <strong>Residuo GSE:</strong> &euro; ${fmt(residuo)} &nbsp;
  <strong>Esito:</strong> <span style="font-weight:bold;color:${esitoColor(esitoStr)}">${esitoStr}</span>
</p>

<h2>1. Nota sintetica di esito</h2>
<h3>Analisi Ricavi e Utile</h3>
<p>${escHtml(narrative.analisiRicavi ?? '')}</p>
<h3>Analisi della liquidit&agrave;</h3>
<p>${escHtml(narrative.analisiLiquidita ?? '')}</p>
<h3>Accantonamenti e rilievi extraprofitti</h3>
<p>${escHtml(narrative.accantonamenti ?? '')}</p>
<h3>Conclusione</h3>
<p>${escHtml(narrative.conclusione ?? '')}</p>

<h2>2. Sintesi bilanci &ndash; Ultimi ${years.length} anni</h2>
<table width="100%">
<thead><tr>
<th style="width:40%">Voce di bilancio</th>
${yearHeaders}
</tr></thead>
<tbody>
${bilRow('Ricavi', 'ricavi')}
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
</tbody>
</table>

<h2>3. KPI &ndash; Anno ${annoKpi}</h2>
<table width="100%">
<thead><tr>
<th style="width:28%">Indice</th>
<th style="width:52%">Formula</th>
<th style="width:20%">Valore</th>
</tr></thead>
<tbody>
<tr><td>Current ratio</td><td>Attivo circ. / Pass. correnti</td><td>${fmtKpi(kpis.currentRatio)}</td></tr>
<tr><td>Quick ratio</td><td>(Attivo circ. &minus; Rimanenze) / Pass. correnti</td><td>${fmtKpi(kpis.quickRatio)}</td></tr>
<tr><td>Cash ratio</td><td>Disp. liquide / Pass. correnti</td><td>${fmtKpi(kpis.cashRatio)}</td></tr>
<tr><td>Autonomia finanziaria</td><td>Patrimonio netto / Totale Attivo</td><td>${fmtKpi(kpis.autonomiaFinanziaria)}</td></tr>
<tr><td>Debt / Equity</td><td>Totale Debiti / Patrimonio netto</td><td>${fmtKpi(kpis.debtEquity)}</td></tr>
<tr><td>Leverage</td><td>Totale Attivo / Patrimonio netto</td><td>${fmtKpi(kpis.leverage)}</td></tr>
<tr><td>PFN / EBITDA</td><td>(Deb. Breve + Deb. M/L &minus; Disp. liq.) / EBITDA</td><td>${fmtKpi(kpis.pfnEbitda)}</td></tr>
<tr><td>Interest coverage</td><td>EBIT / Interessi passivi</td><td>${fmtKpi(kpis.interestCoverage)}</td></tr>
<tr><td>ROS</td><td>EBIT / Ricavi</td><td>${fmtKpi(kpis.ros)}</td></tr>
</tbody>
</table>

<h2>4. Residuo GSE e copertura</h2>
<p>
  <strong>Importo residuo GSE:</strong> &euro; ${fmt(residuo)} &nbsp;
  <strong>Societ&agrave;:</strong> ${escHtml(String(company))} &nbsp;
  <strong>P. IVA:</strong> ${escHtml(String(piva))} &nbsp;
  <strong>Fonte:</strong> PDF allegato
</p>
<table width="100%">
<thead><tr>
<th style="width:40%">Indice di copertura</th>
<th style="width:36%">Calcolo</th>
<th style="width:24%">Valore</th>
</tr></thead>
<tbody>
<tr><td>Cassa / Residuo GSE</td><td>${fmt(lastYear?.disponibilitaLiquide?.value ?? null)} / ${fmt(residuo)}</td><td>${fmtKpi(kpis.cassaResiduo)}</td></tr>
<tr><td>Attivo circ. / Residuo GSE</td><td>${fmt(lastYear?.attivoCircolante?.value ?? null)} / ${fmt(residuo)}</td><td>${fmtKpi(kpis.attivoCircResiduo)}</td></tr>
<tr><td>Patrimonio netto / Residuo GSE</td><td>${fmt(lastYear?.patrimonioNetto?.value ?? null)} / ${fmt(residuo)}</td><td>${fmtKpi(kpis.patrimonioResiduo)}</td></tr>
</tbody>
</table>
<p>${escHtml(narrative.commentoCopertura ?? '')}</p>

<h3>Checklist GSE ed extraprofitti</h3>
<table width="100%">
<thead><tr>
<th style="width:38%">Voce verificata</th>
<th style="width:14%">Esito</th>
<th style="width:48%">Dettaglio riscontrato</th>
</tr></thead>
<tbody>
${checkRow('Debiti iscritti verso GSE', checklist.debitiGSE)}
${checkRow('Accantonamenti Fondo Rischi extraprofitti', checklist.accantonamenti)}
${checkRow('Riduzioni ricavi per effetto della norma', checklist.riduzioniRicavi)}
${checkRow('Contenziosi / ricorsi al TAR contro GSE', checklist.contenziosi)}
</tbody>
</table>

<div class="footer">
Nota: report generato automaticamente dai documenti allegati. I KPI sono calcolati con formule deterministiche. La narrativa &egrave; generata da AI. Aprire con Word e salvare come .docx per la versione editabile.
</div>

</body>
</html>`;
};

export const ReportViewer: React.FC<Props> = ({ extractedData, narrativeData }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlContent = buildHtml(extractedData, narrativeData);

  const handleDownloadHtml = () => {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const company = String(extractedData.companyName?.value ?? 'report').replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `GSE_Report_${company}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download come .doc (Word apre HTML .doc nativamente)
  const handleDownloadDocx = () => {
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const company = String(extractedData.companyName?.value ?? 'report').replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `GSE_Report_${company}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-slate-800">Report GSE generato</span>
          <span
            className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor:
                narrativeData.esito === 'SOSTENIBILE'
                  ? '#dcfce7'
                  : narrativeData.esito === 'RISCHIO ELEVATO'
                  ? '#fee2e2'
                  : '#fef3c7',
              color: esitoColor(narrativeData.esito),
            }}
          >
            {narrativeData.esito}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadDocx}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Scarica .doc (Word)
          </button>
          <button
            onClick={handleDownloadHtml}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            .html
          </button>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          className="w-full"
          style={{ height: '80vh', border: 'none' }}
          title="Report GSE Preview"
        />
      </div>
    </div>
  );
};
