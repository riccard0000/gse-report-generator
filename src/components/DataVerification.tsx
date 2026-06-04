import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, ExtractedField, FinancialYearData } from '../types';
import { CheckCircle, ChevronRight, FileSearch } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Tipo locale per gli item testuali di pdfjs-dist (non esportato dal pacchetto)
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function formatIT(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const negative = value < 0;
  const abs      = Math.abs(value);
  const intPart  = Math.floor(abs);
  const decPart  = abs - intPart;
  const intStr   = String(intPart);
  let formatted  = '';
  for (let i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 === 0) formatted += '.';
    formatted += intStr[i];
  }
  if (decPart > 0.0001) {
    const dec = decPart.toFixed(2).slice(1);
    formatted += dec.replace('.', ',');
  }
  return (negative ? '-' : '') + formatted;
}

function parseIT(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  if (trimmed.includes('.') && trimmed.includes(',')) {
    return parseFloat(trimmed.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (trimmed.includes(',') && !trimmed.includes('.')) {
    return parseFloat(trimmed.replace(',', '.')) || 0;
  }
  if (trimmed.includes('.')) {
    const parts    = trimmed.split('.');
    const lastPart = parts[parts.length - 1];
    if (parts.length > 2 || lastPart.length === 3) {
      return parseFloat(trimmed.replace(/\./g, '')) || 0;
    }
    return parseFloat(trimmed) || 0;
  }
  return parseFloat(trimmed) || 0;
}

function cleanRawText(raw: string, maxLen = 60): string {
  let s = raw
    .replace(/([^\s])(-?\d)/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen) + '\u2026';
  return s;
}

/**
 * Cerca rawText nel contenuto testuale della pagina e restituisce il bbox del match.
 */
async function findBboxByText(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  rawText: string,
): Promise<{ x0: number; y0: number; x1: number; y1: number } | null> {
  try {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const queryWords = rawText
      .toLowerCase()
      .replace(/[^a-z0-9\u00e0\u00e8\u00e9\u00ec\u00f2\u00f9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 4);
    if (queryWords.length === 0) return null;

    const items = content.items as PdfTextItem[];
    let bestItem: PdfTextItem | null = null;
    for (const item of items) {
      const txt = item.str.toLowerCase();
      const matchCount = queryWords.filter(w => txt.includes(w)).length;
      if (matchCount >= Math.min(2, queryWords.length)) {
        bestItem = item;
        break;
      }
    }
    if (!bestItem) {
      bestItem = items.find(it => it.str.toLowerCase().includes(queryWords[0])) ?? null;
    }
    if (!bestItem) return null;

    const tf = bestItem.transform;
    const x0 = tf[4];
    const y0 = tf[5];
    const x1 = x0 + bestItem.width;
    const y1 = y0 + bestItem.height;
    return { x0, y0, x1, y1 };
  } catch {
    return null;
  }
}

interface NumericInputProps {
  value: number | undefined | null;
  onChange: (n: number) => void;
  onFocus?: () => void;
  className?: string;
  placeholder?: string;
}

const NumericInput: React.FC<NumericInputProps> = ({
  value, onChange, onFocus, className, placeholder,
}) => {
  const [displayValue, setDisplayValue] = useState(formatIT(value ?? 0));
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) setDisplayValue(formatIT(value ?? 0));
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isEditing.current = true;
    e.target.select();
    onFocus?.();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.,-]/g, '');
    setDisplayValue(raw);
  };

  const handleBlur = () => {
    isEditing.current = false;
    const parsed = parseIT(displayValue);
    onChange(parsed);
    setDisplayValue(formatIT(parsed));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={displayValue}
      placeholder={placeholder}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

interface Props {
  files: File[];
  extractedData: ExtractedData;
  onApprove: (updatedData: ExtractedData) => void;
}

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
  { key: 'disponibilitaLiquide', label: 'Disponibilit\u00e0 Liquide' },
  { key: 'creditiEntro12Mesi',   label: 'Crediti Entro 12 Mesi' },
  { key: 'rimanenze',            label: 'Rimanenze' },
  { key: 'attivoCircolante',     label: 'Attivo Circolante' },
  { key: 'passivitaCorrenti',    label: 'Passivit\u00e0 Correnti' },
  { key: 'debitiTributari',      label: 'Debiti Tributari' },
  { key: 'debitiPrevidenziali',  label: 'Debiti Previdenziali' },
  { key: 'fondoRischiOneri',     label: 'Fondo Rischi e Oneri' },
];

const CHECKLIST_LABELS: { key: 'debitiGSE' | 'accantonamenti' | 'riduzioniRicavi' | 'contenziosi'; label: string }[] = [
  { key: 'debitiGSE',       label: 'Debiti iscritti verso GSE nello SP' },
  { key: 'accantonamenti',  label: 'Accantonamenti Fondo Rischi extraprofitti' },
  { key: 'riduzioniRicavi', label: 'Riduzioni ricavi per effetto della norma' },
  { key: 'contenziosi',     label: 'Contenziosi / ricorsi al TAR contro GSE' },
];

const HIGHLIGHT_COLORS = [
  'rgba(59,130,246,0.35)',
  'rgba(16,185,129,0.35)',
  'rgba(245,158,11,0.35)',
];

interface ActiveHighlight {
  page: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  color: string;
}

interface PdfViewerProps {
  file: File;
  highlight: ActiveHighlight | null;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ file, highlight }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef  = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const cancelRef  = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    pdfDocRef.current = null;
    setCurrentPage(1);
    setTotalPages(1);
    const load = async () => {
      const arrayBuffer = await file.arrayBuffer();
      if (cancelRef.current) return;
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (cancelRef.current) return;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    };
    load();
    return () => { cancelRef.current = true; };
  }, [file]);

  const renderPage = useCallback(async (pageNum: number, hl: ActiveHighlight | null) => {
    const pdf    = pdfDocRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!pdf || !canvas || !overlay) return;
    const page     = await pdf.getPage(pageNum);
    const scale    = 1.5;
    const viewport = page.getViewport({ scale });
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    overlay.width  = viewport.width;
    overlay.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (hl && hl.page === pageNum) {
      const { x0, y0, x1, y1 } = hl.bbox;
      const [ax, ay] = viewport.convertToViewportPoint(x0, y1);
      const [bx, by] = viewport.convertToViewportPoint(x1, y0);
      const rx = Math.min(ax, bx);
      const ry = Math.min(ay, by);
      const rw = Math.abs(bx - ax);
      const rh = Math.abs(by - ay);
      ctx.fillStyle   = hl.color;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = hl.color.replace('0.35', '0.9');
      ctx.lineWidth   = 2;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }, []);

  useEffect(() => {
    if (highlight?.page && highlight.page !== currentPage) setCurrentPage(highlight.page);
  }, [highlight]);

  useEffect(() => {
    if (pdfDocRef.current) renderPage(currentPage, highlight);
  }, [currentPage, highlight, renderPage]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pdfDocRef.current) { renderPage(currentPage, highlight); clearInterval(interval); }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
        <span className="text-xs font-medium text-slate-600 truncate max-w-xs">{file.name}</span>
        <div className="flex items-center gap-2">
          <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >&#8249; Prec</button>
          <span className="text-xs text-slate-500">pag. {currentPage} / {totalPages}</span>
          <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >Succ &#8250;</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto flex justify-center p-4">
        <div className="relative shadow-2xl">
          <canvas ref={canvasRef} className="block" />
          <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ mixBlendMode: 'multiply' }} />
        </div>
      </div>
      {highlight && (
        <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: highlight.color.replace('0.35', '0.7') }} />
          <span className="text-xs text-slate-500">Testo evidenziato a pagina {highlight.page}</span>
        </div>
      )}
    </>
  );
};

export const DataVerification: React.FC<Props> = ({ files, extractedData, onApprove }) => {
  const [data, setData]               = useState<ExtractedData>(JSON.parse(JSON.stringify(extractedData)));
  const [activeTab, setActiveTab]     = useState(0);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null);

  const pdfFileIndex = activeTab === 0 ? null : activeTab - 1;
  const pdfFile      = pdfFileIndex !== null ? files[pdfFileIndex] ?? null : null;

  const pdfDocCacheRef = useRef<Map<number, pdfjsLib.PDFDocumentProxy>>(new Map());

  const getPdfDoc = useCallback(async (fileIdx: number, file: File): Promise<pdfjsLib.PDFDocumentProxy> => {
    if (pdfDocCacheRef.current.has(fileIdx)) {
      return pdfDocCacheRef.current.get(fileIdx)!;
    }
    const ab  = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: ab }).promise;
    pdfDocCacheRef.current.set(fileIdx, doc);
    return doc;
  }, []);

  const handleFieldFocus = useCallback(async (
    field: ExtractedField<any> | null,
    colorIndex: number,
    fileIdx: number,
  ) => {
    const color = HIGHLIGHT_COLORS[colorIndex] ?? HIGHLIGHT_COLORS[0];

    if (field?.bbox && field?.page) {
      setActiveHighlight({ page: field.page, bbox: field.bbox, color });
      return;
    }

    if (field?.page && field?.rawText && files[fileIdx]) {
      setActiveHighlight(null);
      try {
        const doc  = await getPdfDoc(fileIdx, files[fileIdx]);
        const bbox = await findBboxByText(doc, field.page, field.rawText);
        if (bbox) {
          setActiveHighlight({ page: field.page, bbox, color });
        } else {
          setActiveHighlight({ page: field.page, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, color });
        }
      } catch {
        setActiveHighlight(null);
      }
      return;
    }

    setActiveHighlight(null);
  }, [files, getPdfDoc]);

  const updateYearField = (yearIdx: number, key: keyof FinancialYearData, value: number) => {
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as ExtractedData;
      (next.yearsData[yearIdx][key] as ExtractedField<number>).value = value;
      return next;
    });
  };

  const tabLabels = ['Importo GSE', ...data.yearsData.map(y => `Bilancio ${y.year || (data.yearsData.indexOf(y) + 1)}`)];
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

  const checklist = data.checklist;

  return (
    <div className="flex h-[calc(100vh-80px)] gap-0 overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">

      {/* COLONNA SINISTRA */}
      <div className="w-2/5 flex flex-col border-r border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          {tabLabels.map((label, i) => (
            <button key={i} onClick={() => { setActiveTab(i); setActiveHighlight(null); }}
              className={`flex-1 py-3 px-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === i ? tabColors[i] : 'border-transparent ' + tabColorsInactive[i]}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {activeTab === 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Inserisci l'importo residuo da restituire al GSE per l'assolvimento dell'obbligo
                extraprofitti derivante dalla vendita dell'energia elettrica (art. 15-bis D.L. 4/2022).
              </p>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Ammontare residuo GSE (&euro;)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">&euro;</span>
                <NumericInput
                  value={data.gseResidual?.value}
                  className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                  onChange={n => setData(prev => ({ ...prev, gseResidual: { ...prev.gseResidual, value: n } }))}
                  placeholder="0"
                />
              </div>
              {data.gseResidual?.rawText && (
                <p className="mt-2 text-xs text-slate-400 italic">Testo estratto: "{data.gseResidual.rawText}"</p>
              )}
            </div>
          )}

          {activeTab >= 1 && (() => {
            const yearIdx = activeTab - 1;
            const year    = data.yearsData[yearIdx];
            if (!year) return null;
            return (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 mb-1">
                  Verifica e correggi i dati estratti dal bilancio.
                  Clicca su un campo per evidenziare il testo nel documento a destra.
                </p>

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

                {YEAR_FIELDS.map(({ key, label }) => {
                  const field      = year[key] as ExtractedField<number>;
                  const hasBbox    = !!field?.bbox && !!field?.page;
                  const hasPage    = !!field?.page;
                  const badgeColor = hasBbox ? 'text-blue-500' : 'text-slate-400';
                  return (
                    <div key={key as string}>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        {label}
                        {hasPage && (
                          <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${badgeColor}`}>
                            <ChevronRight className="w-2.5 h-2.5" /> p.{field.page}
                          </span>
                        )}
                      </label>
                      <NumericInput
                        value={field?.value}
                        className={`w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2 ${
                          hasPage ? 'border-slate-200 focus:ring-blue-300 cursor-pointer' : 'border-slate-200 focus:ring-slate-300'
                        }`}
                        onFocus={() => handleFieldFocus(field, yearIdx, yearIdx)}
                        onChange={n => updateYearField(yearIdx, key, n)}
                        placeholder="0"
                      />
                      {field?.rawText && (
                        <p className="mt-0.5 text-[10px] text-slate-400 italic">
                          &laquo;{cleanRawText(field.rawText)}&raquo;
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="mt-6 pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <FileSearch className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Checklist GSE / Extraprofitti</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                    Voci ricercate nel documento dal modello AI. La fonte testuale riporta la citazione letterale trovata nel PDF.
                  </p>
                  <div className="space-y-3">
                    {CHECKLIST_LABELS.map(({ key, label }) => {
                      const item       = checklist[key];
                      const isPres     = item?.presente;
                      const badgeBg    = isPres ? 'bg-red-50 border-red-200'   : 'bg-emerald-50 border-emerald-200';
                      const badgeText  = isPres ? 'text-red-700'               : 'text-emerald-700';
                      const badgeLabel = isPres ? '\u26a0 Presente'            : '\u2713 Assente';
                      return (
                        <div key={key} className={`rounded-lg border p-3 ${badgeBg}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-600 leading-tight">{label}</span>
                            <span className={`text-[10px] font-bold whitespace-nowrap ${badgeText}`}>{badgeLabel}</span>
                          </div>
                          {item?.dettaglio && (
                            <p className="text-[10px] text-slate-500 mb-1.5 leading-relaxed">{item.dettaglio}</p>
                          )}
                          {item?.fonteTestuale && (
                            <div className="mt-1.5 bg-white/70 border border-slate-200 rounded px-2 py-1.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <FileSearch className="w-2.5 h-2.5 text-slate-400" />
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                                  Fonte{item.page ? ` \u2014 pag. ${item.page}` : ''}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-600 italic leading-relaxed">
                                &ldquo;{item.fonteTestuale}&rdquo;
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            );
          })()}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button onClick={() => onApprove(data)}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl transition-colors shadow-sm">
            <CheckCircle className="w-5 h-5" />
            Conferma dati e genera report
          </button>
        </div>
      </div>

      {/* COLONNA DESTRA — PDF Viewer */}
      <div className="w-3/5 flex flex-col bg-slate-100 overflow-hidden">
        {!pdfFile ? (
          <>
            <div className="px-4 py-2 bg-white border-b border-slate-200">
              <span className="text-xs font-medium text-slate-400">Seleziona un bilancio per visualizzare il documento</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <svg className="w-16 h-16 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium">Nessun documento selezionato</p>
              <p className="text-xs mt-1">Seleziona uno dei tab Bilancio per visualizzare il PDF</p>
            </div>
          </>
        ) : (
          <PdfViewer key={pdfFileIndex} file={pdfFile} highlight={activeHighlight} />
        )}
      </div>
    </div>
  );
};
