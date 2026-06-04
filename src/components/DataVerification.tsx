import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, ExtractedField, FinancialYearData } from '../types';
import { CheckCircle, ChevronRight } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface Props {
  files: File[];
  extractedData: ExtractedData;
  onApprove: (updatedData: ExtractedData) => void;
}

// Campi da mostrare per ogni bilancio con etichetta leggibile
const YEAR_FIELDS: { key: keyof FinancialYearData; label: string }[] = [
  { key: 'ricavi',               label: 'Ricavi' },
  { key: 'ebitda',               label: 'EBITDA' },
  { key: 'ebit',                 label: 'EBIT' },
  { key: 'utileNetto',           label: 'Utile Netto' },
  { key: 'interessiPassivi',     label: 'Interessi Passivi' },
  { key: 'totaleAttivo',         label: 'Totale Attivo' },
  { key: 'patrimonioNetto',      label: 'Patrimonio Netto' },
  { key: 'totaleDebiti',         label: 'Totale Debiti' },
  { key: 'debitiBancheBreve',    label: 'Debiti Banche Breve' },
  { key: 'debitiBancheML',       label: 'Debiti Banche M/L' },
  { key: 'disponibilitaLiquide', label: 'Disponibilità Liquide' },
  { key: 'creditiEntro12Mesi',   label: 'Crediti Entro 12 Mesi' },
  { key: 'rimanenze',            label: 'Rimanenze' },
  { key: 'attivoCircolante',     label: 'Attivo Circolante' },
  { key: 'passivitaCorrenti',    label: 'Passività Correnti' },
  { key: 'debitiTributari',      label: 'Debiti Tributari' },
  { key: 'debitiPrevidenziali',  label: 'Debiti Previdenziali' },
  { key: 'fondoRischiOneri',     label: 'Fondo Rischi e Oneri' },
];

// Colori highlight per i campi attivi
const HIGHLIGHT_COLORS = [
  'rgba(59,130,246,0.35)',  // blu – bilancio 1
  'rgba(16,185,129,0.35)', // verde – bilancio 2
  'rgba(245,158,11,0.35)', // ambra – bilancio 3
];

interface ActiveHighlight {
  page: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  color: string;
}

export const DataVerification: React.FC<Props> = ({ files, extractedData, onApprove }) => {
  const [data, setData] = useState<ExtractedData>(JSON.parse(JSON.stringify(extractedData)));
  // 0 = tab GSE, 1-3 = bilanci
  const [activeTab, setActiveTab] = useState(0);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);

  // File PDF attivo: per tab GSE non mostriamo PDF, per tab bilancio mostriamo il file corrispondente
  const pdfFileIndex = activeTab === 0 ? null : activeTab - 1;
  const pdfFile = pdfFileIndex !== null ? files[pdfFileIndex] : null;

  // Carica il PDF ogni volta che cambia il file attivo
  useEffect(() => {
    if (!pdfFile) {
      pdfDocRef.current = null;
      setTotalPages(1);
      setCurrentPage(1);
      return;
    }
    const load = async () => {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    };
    load();
  }, [pdfFile]);

  // Renderizza la pagina corrente + eventuale highlight
  const renderPage = useCallback(async (pageNum: number, highlight: ActiveHighlight | null) => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!pdf || !canvas || !overlay) return;

    const page = await pdf.getPage(pageNum);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    overlay.width = viewport.width;
    overlay.height = viewport.height;

    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;

    // Disegna highlight sull'overlay
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (highlight && highlight.page === pageNum) {
      const { x0, y0, x1, y1 } = highlight.bbox;
      // Le coordinate bbox del PDF sono in spazio PDF (origine in basso a sinistra)
      // Convertiamo con il viewport
      const [ax, ay] = viewport.convertToViewportPoint(x0, y1);
      const [bx, by] = viewport.convertToViewportPoint(x1, y0);
      const rx = Math.min(ax, bx);
      const ry = Math.min(ay, by);
      const rw = Math.abs(bx - ax);
      const rh = Math.abs(by - ay);

      ctx.fillStyle = highlight.color;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = highlight.color.replace('0.35', '0.9');
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }, []);

  useEffect(() => {
    renderPage(currentPage, activeHighlight);
  }, [currentPage, activeHighlight, renderPage, pdfFile]);

  // Quando l'utente mette il focus su un campo con bbox, salta alla pagina e mostra highlight
  const handleFieldFocus = (field: ExtractedField<any> | null, colorIndex: number) => {
    if (!field || !field.bbox || !field.page) {
      setActiveHighlight(null);
      return;
    }
    const highlight: ActiveHighlight = {
      page: field.page,
      bbox: field.bbox,
      color: HIGHLIGHT_COLORS[colorIndex] ?? HIGHLIGHT_COLORS[0],
    };
    setActiveHighlight(highlight);
    setCurrentPage(field.page);
  };

  // Aggiorna un campo di un anno
  const updateYearField = (yearIdx: number, key: keyof FinancialYearData, value: number) => {
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as ExtractedData;
      (next.yearsData[yearIdx][key] as ExtractedField<number>).value = value;
      return next;
    });
  };

  const tabLabels = [
    'Importo GSE',
    ...data.yearsData.map(y => `Bilancio ${y.year || (data.yearsData.indexOf(y) + 1)}`),
  ];

  const tabColors = [
    'border-purple-500 text-purple-700 bg-purple-50',
    'border-blue-500 text-blue-700 bg-blue-50',
    'border-emerald-500 text-emerald-700 bg-emerald-50',
    'border-amber-500 text-amber-700 bg-amber-50',
  ];

  const tabColorsInactive = [
    'text-slate-500 hover:text-purple-600 hover:bg-purple-50',
    'text-slate-500 hover:text-blue-600 hover:bg-blue-50',
    'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50',
    'text-slate-500 hover:text-amber-600 hover:bg-amber-50',
  ];

  return (
    <div className="flex h-[calc(100vh-80px)] gap-0 overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">

      {/* ═══════════════════════════════════════════════════
          COLONNA SINISTRA — Tab + Form
      ═══════════════════════════════════════════════════ */}
      <div className="w-2/5 flex flex-col border-r border-slate-200 overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {tabLabels.map((label, i) => (
            <button
              key={i}
              onClick={() => { setActiveTab(i); setActiveHighlight(null); }}
              className={`flex-1 py-3 px-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === i
                  ? tabColors[i]
                  : 'border-transparent ' + tabColorsInactive[i]
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Contenuto form — scrollabile */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── TAB 0: Importo GSE ── */}
          {activeTab === 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Inserisci l'importo residuo da restituire al GSE per l'assolvimento dell'obbligo
                extraprofitti derivante dalla vendita dell'energia elettrica
                (art. 15-bis D.L. 4/2022).
              </p>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Ammontare residuo GSE (€)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">€</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                  value={data.gseResidual?.value ?? ''}
                  onChange={e =>
                    setData(prev => ({
                      ...prev,
                      gseResidual: { ...prev.gseResidual, value: parseFloat(e.target.value) || 0 },
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
              {data.gseResidual?.rawText && (
                <p className="mt-2 text-xs text-slate-400 italic">Testo estratto: "{data.gseResidual.rawText}"</p>
              )}
            </div>
          )}

          {/* ── TAB 1-3: Bilanci ── */}
          {activeTab >= 1 && (() => {
            const yearIdx = activeTab - 1;
            const year = data.yearsData[yearIdx];
            const colorIdx = yearIdx;
            if (!year) return null;
            return (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 mb-1">
                  Verifica e correggi i dati estratti dal bilancio.
                  Clicca su un campo per evidenziare il testo nel documento a destra.
                </p>
                {/* Anno */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Anno di Esercizio</label>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={year.year ?? ''}
                    onChange={e => {
                      setData(prev => {
                        const next = JSON.parse(JSON.stringify(prev)) as ExtractedData;
                        next.yearsData[yearIdx].year = e.target.value;
                        return next;
                      });
                    }}
                  />
                </div>

                {/* Tutti i campi finanziari */}
                {YEAR_FIELDS.map(({ key, label }) => {
                  const field = year[key] as ExtractedField<number>;
                  const hasBbox = !!field?.bbox && !!field?.page;
                  return (
                    <div key={key as string}>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        {label}
                        {hasBbox && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-blue-500">
                            <ChevronRight className="w-2.5 h-2.5" /> p.{field.page}
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        step={0.01}
                        className={`w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2 ${
                          hasBbox
                            ? 'border-slate-200 focus:ring-blue-300 cursor-pointer'
                            : 'border-slate-200 focus:ring-slate-300'
                        }`}
                        value={field?.value ?? ''}
                        onFocus={() => handleFieldFocus(field, colorIdx)}
                        onChange={e => updateYearField(yearIdx, key, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                      {field?.rawText && (
                        <p className="mt-0.5 text-[10px] text-slate-400 italic truncate">«{field.rawText}»</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Bottone Conferma — sempre visibile in fondo */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => onApprove(data)}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl transition-colors shadow-sm"
          >
            <CheckCircle className="w-5 h-5" />
            Conferma dati e genera report
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          COLONNA DESTRA — Visualizzatore PDF
      ═══════════════════════════════════════════════════ */}
      <div className="w-3/5 flex flex-col bg-slate-100 overflow-hidden">

        {/* Header PDF con navigazione pagine */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
          <span className="text-xs font-medium text-slate-600 truncate max-w-xs">
            {pdfFile ? pdfFile.name : 'Seleziona un bilancio per visualizzare il documento'}
          </span>
          {pdfFile && (
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
              >‹ Prec</button>
              <span className="text-xs text-slate-500">pag. {currentPage} / {totalPages}</span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
              >Succ ›</button>
            </div>
          )}
        </div>

        {/* Area PDF */}
        <div ref={pdfScrollRef} className="flex-1 overflow-y-auto flex justify-center p-4">
          {!pdfFile ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <svg className="w-16 h-16 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium">Nessun documento selezionato</p>
              <p className="text-xs mt-1">Seleziona uno dei tab Bilancio per visualizzare il PDF</p>
            </div>
          ) : (
            <div className="relative shadow-2xl">
              {/* Canvas PDF base */}
              <canvas ref={canvasRef} className="block" />
              {/* Canvas overlay per gli highlight — sovrapposto esattamente */}
              <canvas
                ref={overlayRef}
                className="absolute inset-0 pointer-events-none"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
          )}
        </div>

        {/* Legenda highlight attivo */}
        {activeHighlight && (
          <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: activeHighlight.color.replace('0.35', '0.7') }}
            />
            <span className="text-xs text-slate-500">
              Testo evidenziato a pagina {activeHighlight.page}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
