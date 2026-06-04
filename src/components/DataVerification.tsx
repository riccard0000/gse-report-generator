import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedData, ExtractedField, FinancialYearData } from '../types';
import { CheckCircle, ChevronRight, FileSearch } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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

// ---------------------------------------------------------------------------
// Tipo discriminato — unica fonte di verità per highlight E badge UI
// ---------------------------------------------------------------------------
interface BBox { x0: number; y0: number; x1: number; y1: number; }

type MatchResult =
  | { kind: 'single';    bboxes: BBox[] }  // label + eventuale bbox numerico
  | { kind: 'formula';   bboxes: BBox[] }  // formula calcolata: no badge Σ
  | { kind: 'multi-sum'; bboxes: BBox[] }; // somma di righe: badge Σ N voci

// ---------------------------------------------------------------------------
// Determina se un rawText con "+" rappresenta una formula calcolata
// (ogni segmento contiene almeno una cifra numerica) oppure una somma
// di righe del bilancio (i segmenti sono nomi puri senza cifre).
// ---------------------------------------------------------------------------
function isCalculatedFormula(segments: string[]): boolean {
  const withDigits = segments.filter(s => /\d/.test(s)).length;
  return withDigits >= Math.ceil(segments.length / 2);
}

// ---------------------------------------------------------------------------
// Cerca UN singolo segmento di testo nel PDF e ritorna il suo bbox + item
// ---------------------------------------------------------------------------
async function findSingleBboxWithItem(
  items: PdfTextItem[],
  segment: string,
): Promise<{ bbox: BBox; item: PdfTextItem } | null> {
  const seg = segment.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!seg) return null;

  let found: PdfTextItem | null = null;

  // Strategia 1: match esatto
  found = items.find(it => it.str.toLowerCase().replace(/\s+/g, ' ').trim() === seg) ?? null;

  // Strategia 2: keyword match
  if (!found) {
    const keywords = seg
      .replace(/[^a-z\u00e0\u00e8\u00e9\u00ec\u00f2\u00f9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .slice(0, 5);

    if (keywords.length > 0) {
      const threshold = Math.max(1, Math.ceil(keywords.length / 2));
      let bestCount = 0;
      for (const item of items) {
        const txt   = item.str.toLowerCase();
        const count = keywords.filter(w => txt.includes(w)).length;
        if (count >= threshold && count > bestCount) {
          found     = item;
          bestCount = count;
        }
      }
      // Strategia 3: fallback prima keyword
      if (!found) {
        found = items.find(it => it.str.toLowerCase().includes(keywords[0])) ?? null;
      }
    }
  }

  if (!found) return null;
  const tf = found.transform;
  return {
    bbox: { x0: tf[4], y0: tf[5], x1: tf[4] + found.width, y1: tf[5] + found.height },
    item: found,
  };
}

// Wrapper che restituisce solo il bbox (compatibilità con il resto del codice)
async function findSingleBbox(
  items: PdfTextItem[],
  segment: string,
): Promise<BBox | null> {
  const r = await findSingleBboxWithItem(items, segment);
  return r ? r.bbox : null;
}

// ---------------------------------------------------------------------------
// Cerca il token numerico più vicino a destra dell'etichetta trovata,
// sulla stessa riga (tolleranza y ±5pt).
// Nei bilanci XBRL le celle numeriche sono item separati sulla stessa riga.
// Restituisce il bbox del numero se trovato, null altrimenti.
// ---------------------------------------------------------------------------
function findNumericNeighbor(
  items: PdfTextItem[],
  labelItem: PdfTextItem,
  fieldValue: number | null | undefined,
): BBox | null {
  const labelTf = labelItem.transform;
  const labelY  = labelTf[5];          // y0 del label
  const labelX1 = labelTf[4] + labelItem.width; // bordo destro del label
  const Y_TOL   = 5;                   // tolleranza riga (pt)

  // Token numerici sulla stessa riga, a destra del label
  const sameRow = items.filter(it => {
    const tf = it.transform;
    const iy = tf[5];
    const ix = tf[4];
    return Math.abs(iy - labelY) <= Y_TOL && ix > labelX1;
  });

  if (sameRow.length === 0) return null;

  // Filtra i token che sembrano numeri (contengono solo cifre, punti, virgole, trattini)
  const numericTokens = sameRow.filter(it =>
    /^-?[\d.,]+[-]?$/.test(it.str.trim())
  );

  const candidates = numericTokens.length > 0 ? numericTokens : sameRow;

  // Se abbiamo il valore numerico del campo, cerchiamo il token che lo contiene
  if (fieldValue !== null && fieldValue !== undefined) {
    const absVal  = Math.abs(fieldValue);
    // Rappresentazioni attese: "56.797" "56797" "56,797"
    const reprs   = [
      String(Math.round(absVal)),
      absVal.toFixed(0),
    ];
    const byValue = candidates.find(it => {
      const s = it.str.replace(/[.,\s-]/g, '');
      return reprs.some(r => s === r.replace(/[.,\s-]/g, ''));
    });
    if (byValue) {
      const tf = byValue.transform;
      return { x0: tf[4], y0: tf[5], x1: tf[4] + byValue.width, y1: tf[5] + byValue.height };
    }
  }

  // Fallback: token numerico più vicino a destra
  const closest = candidates.reduce((a, b) =>
    a.transform[4] < b.transform[4] ? a : b
  );
  const tf = closest.transform;
  return { x0: tf[4], y0: tf[5], x1: tf[4] + closest.width, y1: tf[5] + closest.height };
}

// ---------------------------------------------------------------------------
// Cerca nel PDF e restituisce un MatchResult tipizzato.
// Per ogni etichetta trovata aggiunge anche il bbox del valore numerico
// sulla stessa riga, così l'utente vede esattamente quale numero è stato usato.
// ---------------------------------------------------------------------------
async function findBboxByText(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  rawText: string,
  fieldValue?: number | null,
): Promise<MatchResult | null> {
  try {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items   = content.items as PdfTextItem[];

    const segments = rawText
      .split(/\s*\+\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Helper: bbox etichetta + bbox numero affiancato
    async function bboxPair(
      seg: string,
      numVal?: number | null,
    ): Promise<BBox[]> {
      const r = await findSingleBboxWithItem(items, seg);
      if (!r) return [];
      const numBbox = findNumericNeighbor(items, r.item, numVal ?? null);
      return numBbox ? [r.bbox, numBbox] : [r.bbox];
    }

    // Nessun "+": ricerca singola
    if (segments.length <= 1) {
      const bboxes = await bboxPair(rawText, fieldValue);
      if (bboxes.length === 0) return null;
      return { kind: 'single', bboxes };
    }

    if (isCalculatedFormula(segments)) {
      // Formula calcolata: evidenzia solo il primo segmento (nome voce senza cifre)
      const firstSeg = segments[0];
      const nameOnly = firstSeg.replace(/[\d.,]+/g, '').replace(/\s+/g, ' ').trim();
      const bboxes   = await bboxPair(nameOnly.length >= 3 ? nameOnly : firstSeg, fieldValue);
      if (bboxes.length === 0) return null;
      return { kind: 'formula', bboxes };
    }

    // Somma di righe: per ogni segmento (nome puro) cerca label + numero
    // I bbox vengono interleaved: [label0, num0, label1, num1, ...]
    // così i colori si alternano correttamente per voce
    const results: BBox[] = [];
    for (const seg of segments) {
      const r = await findSingleBboxWithItem(items, seg);
      if (!r) continue;
      const isDupLabel = results.some(b =>
        Math.abs(b.y0 - r.bbox.y0) < 2 && Math.abs(b.x0 - r.bbox.x0) < 2
      );
      if (isDupLabel) continue;
      // Aggiungi label bbox
      results.push(r.bbox);
      // Aggiungi numero sulla stessa riga (senza fieldValue: la somma non corrisponde a un singolo numero)
      const numBbox = findNumericNeighbor(items, r.item, null);
      if (numBbox) results.push(numBbox);
    }

    if (results.length === 0) return null;
    return { kind: 'multi-sum', bboxes: results };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NumericInput
// ---------------------------------------------------------------------------
interface NumericInputProps {
  value: number | undefined | null;
  onChange: (n: number | null) => void;
  onFocus?: () => void;
  className?: string;
  isUnavailable?: boolean;
}

const NumericInput: React.FC<NumericInputProps> = ({
  value, onChange, onFocus, className, isUnavailable,
}) => {
  const [displayValue, setDisplayValue] = useState(
    isUnavailable ? '' : formatIT(value ?? 0)
  );
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) {
      setDisplayValue(isUnavailable ? '' : formatIT(value ?? 0));
    }
  }, [value, isUnavailable]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isEditing.current = true;
    e.target.select();
    onFocus?.();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value.replace(/[^0-9.,-]/g, ''));
  };

  const handleBlur = () => {
    isEditing.current = false;
    if (displayValue.trim() === '') {
      onChange(null);
      setDisplayValue('');
    } else {
      const parsed = parseIT(displayValue);
      onChange(parsed);
      setDisplayValue(formatIT(parsed));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={displayValue}
      placeholder={isUnavailable ? 'n.d.' : '0'}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

// ---------------------------------------------------------------------------
// Colori per highlight
// Per multi-sum: ogni COPPIA (label+numero) usa lo stesso colore.
// Per single/formula: un solo colore (indice 0).
// ---------------------------------------------------------------------------
const MULTI_HIGHLIGHT_COLORS = [
  { fill: 'rgba(59,130,246,0.28)',  stroke: 'rgba(59,130,246,0.85)'  },
  { fill: 'rgba(16,185,129,0.28)',  stroke: 'rgba(16,185,129,0.85)'  },
  { fill: 'rgba(245,158,11,0.28)',  stroke: 'rgba(245,158,11,0.85)'  },
  { fill: 'rgba(239,68,68,0.28)',   stroke: 'rgba(239,68,68,0.85)'   },
  { fill: 'rgba(168,85,247,0.28)',  stroke: 'rgba(168,85,247,0.85)'  },
];

// Per multi-sum i bbox arrivano a coppie [label0, num0, label1, num1, ...]
// colorIndex(i) = Math.floor(i / 2) assegna lo stesso colore a label e numero
function bboxColorIndex(idx: number, isMultiSum: boolean): number {
  return isMultiSum ? Math.floor(idx / 2) : 0;
}

interface ActiveHighlight {
  page: number;
  bboxes: BBox[];
  color: string;
  isMultiSum: boolean;
}

const EMPTY_BBOX: BBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
function isBboxEmpty(b: BBox) { return b.x0 === 0 && b.y0 === 0 && b.x1 === 0 && b.y1 === 0; }

// ---------------------------------------------------------------------------
// PdfViewer
// ---------------------------------------------------------------------------
interface PdfViewerProps {
  file: File;
  highlight: ActiveHighlight | null;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ file, highlight }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const pdfDocRef      = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const currentPageRef = useRef(1);
  const highlightRef   = useRef<ActiveHighlight | null>(null);
  const renderSeqRef   = useRef(0);

  useEffect(() => { highlightRef.current = highlight; }, [highlight]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  const doRender = useCallback(async (seq: number) => {
    const pdf    = pdfDocRef.current;
    const canvas = canvasRef.current;
    const page   = currentPageRef.current;
    const hl     = highlightRef.current;
    if (!pdf || !canvas) return;

    const pdfPage  = await pdf.getPage(page);
    if (seq !== renderSeqRef.current) return;

    const viewport = pdfPage.getViewport({ scale: 1.5 });
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;

    const ctx = canvas.getContext('2d')!;
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    if (seq !== renderSeqRef.current) return;

    if (hl && hl.page === page && hl.bboxes.length > 0) {
      hl.bboxes.forEach((bbox, idx) => {
        if (isBboxEmpty(bbox)) return;
        const colorIdx = bboxColorIndex(idx, hl.isMultiSum);
        const colors   = MULTI_HIGHLIGHT_COLORS[colorIdx % MULTI_HIGHLIGHT_COLORS.length];
        const [ax, ay] = viewport.convertToViewportPoint(bbox.x0, bbox.y1);
        const [bx, by] = viewport.convertToViewportPoint(bbox.x1, bbox.y0);
        const rx = Math.min(ax, bx);
        const ry = Math.min(ay, by);
        const rw = Math.abs(bx - ax);
        const rh = Math.abs(by - ay);
        ctx.save();
        ctx.fillStyle   = colors.fill;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth   = 2;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
      });
    }
  }, []);

  const requestRender = useCallback(() => {
    const seq = ++renderSeqRef.current;
    doRender(seq);
  }, [doRender]);

  const goToPage = useCallback((page: number) => {
    currentPageRef.current = page;
    setCurrentPage(page);
    requestRender();
  }, [requestRender]);

  useEffect(() => {
    pdfDocRef.current = null;
    currentPageRef.current = 1;
    setCurrentPage(1);
    setTotalPages(1);
    let cancelled = false;
    (async () => {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      if (cancelled) return;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      currentPageRef.current = 1;
      setCurrentPage(1);
      requestRender();
    })();
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    highlightRef.current = highlight;
    if (highlight?.page && highlight.page !== currentPageRef.current) {
      currentPageRef.current = highlight.page;
      setCurrentPage(highlight.page);
    }
    requestRender();
  }, [highlight]);

  const visibleBboxes = highlight?.bboxes.filter(b => !isBboxEmpty(b)) ?? [];

  // Per la legenda in fondo al viewer mostriamo solo le coppie (ogni 2 bbox = 1 voce)
  const legendItems = highlight?.isMultiSum
    ? visibleBboxes.filter((_, i) => i % 2 === 0)   // solo i label bbox (indici pari)
    : visibleBboxes.slice(0, 1);                     // single/formula: 1 sola voce

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
        <span className="text-xs font-medium text-slate-600 truncate max-w-xs">{file.name}</span>
        <div className="flex items-center gap-2">
          <button disabled={currentPage <= 1} onClick={() => goToPage(Math.max(1, currentPage - 1))}
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >&#8249; Prec</button>
          <span className="text-xs text-slate-500">pag. {currentPage} / {totalPages}</span>
          <button disabled={currentPage >= totalPages} onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >Succ &#8250;</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto flex justify-center p-4">
        <div className="relative shadow-2xl">
          <canvas ref={canvasRef} className="block" />
        </div>
      </div>
      {legendItems.length > 0 && (
        <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-3 flex-wrap">
          {legendItems.map((_, legendIdx) => (
            <span key={legendIdx} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: MULTI_HIGHLIGHT_COLORS[
                  bboxColorIndex(legendIdx * 2, highlight!.isMultiSum) % MULTI_HIGHLIGHT_COLORS.length
                ].stroke }}
              />
              <span className="text-xs text-slate-500">
                {highlight!.isMultiSum ? `Voce ${legendIdx + 1}` : 'Evidenziato'}
                {' '}&middot; pag. {highlight!.page}
              </span>
            </span>
          ))}
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
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

export const DataVerification: React.FC<Props> = ({ files, extractedData, onApprove }) => {
  const [data, setData]                       = useState<ExtractedData>(JSON.parse(JSON.stringify(extractedData)));
  const [activeTab, setActiveTab]             = useState(0);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null);

  const pdfFileIndex = activeTab === 0 ? null : activeTab - 1;
  const pdfFile      = pdfFileIndex !== null ? files[pdfFileIndex] ?? null : null;

  const pdfDocCacheRef = useRef<Map<number, pdfjsLib.PDFDocumentProxy>>(new Map());

  const getPdfDoc = useCallback(async (fileIdx: number, file: File): Promise<pdfjsLib.PDFDocumentProxy> => {
    if (pdfDocCacheRef.current.has(fileIdx)) return pdfDocCacheRef.current.get(fileIdx)!;
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
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
      setActiveHighlight({ page: field.page, bboxes: [field.bbox], color, isMultiSum: false });
      return;
    }

    if (field?.page && field.value === null) {
      setActiveHighlight({ page: field.page, bboxes: [EMPTY_BBOX], color, isMultiSum: false });
      return;
    }

    if (field?.page && field?.rawText && files[fileIdx]) {
      setActiveHighlight({ page: field.page, bboxes: [EMPTY_BBOX], color, isMultiSum: false });
      try {
        const doc    = await getPdfDoc(fileIdx, files[fileIdx]);
        // Passa il valore numerico del campo per il match preciso del numero
        const result = await findBboxByText(doc, field.page, field.rawText, field.value as number | null);
        if (!result) return;
        const isMultiSum = result.kind === 'multi-sum';
        setActiveHighlight({
          page:      field.page,
          bboxes:    result.bboxes,
          color,
          isMultiSum,
        });
      } catch {
        // lascia navigate-only
      }
      return;
    }

    setActiveHighlight(null);
  }, [files, getPdfDoc]);

  function matchKindFromRawText(rawText: string | null | undefined): MatchResult['kind'] {
    if (!rawText) return 'single';
    const segments = rawText
      .split(/\s*\+\s*/)
      .map(s => s.trim())
      .filter(Boolean);
    if (segments.length <= 1) return 'single';
    return isCalculatedFormula(segments) ? 'formula' : 'multi-sum';
  }

  const updateYearField = (yearIdx: number, key: keyof FinancialYearData, value: number | null) => {
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
                  const field     = year[key] as ExtractedField<number>;
                  const isUnavail = field?.value === null && !!field?.rawText;
                  const hasBbox   = !!field?.bbox && !!field?.page;
                  const hasPage   = !!field?.page;
                  const badgeColor = hasBbox ? 'text-blue-500' : hasPage ? 'text-slate-400' : '';

                  const kind      = matchKindFromRawText(field?.rawText);
                  const showSigma = kind === 'multi-sum';
                  const numSegs   = field?.rawText
                    ? field.rawText.split(/\s*\+\s*/).filter(Boolean).length
                    : 0;

                  return (
                    <div key={key as string}>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        {label}
                        {hasPage && (
                          <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${badgeColor}`}>
                            <ChevronRight className="w-2.5 h-2.5" /> p.{field.page}
                          </span>
                        )}
                        {showSigma && (
                          <span className="ml-1 text-[9px] font-semibold text-indigo-500 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5">
                            \u03a3 {numSegs} voci
                          </span>
                        )}
                        {!showSigma && kind === 'formula' && (
                          <span className="ml-1 text-[9px] font-semibold text-teal-600 bg-teal-50 border border-teal-200 rounded px-1 py-0.5">
                            f(x)
                          </span>
                        )}
                        {isUnavail && (
                          <span className="ml-1 text-[9px] font-semibold text-amber-500 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
                            non disponibile
                          </span>
                        )}
                      </label>
                      <NumericInput
                        value={field?.value}
                        isUnavailable={isUnavail}
                        className={`w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2 ${
                          isUnavail
                            ? 'border-amber-200 bg-amber-50 text-amber-600 focus:ring-amber-300 cursor-pointer italic'
                            : hasPage
                            ? 'border-slate-200 focus:ring-blue-300 cursor-pointer'
                            : 'border-slate-200 focus:ring-slate-300'
                        }`}
                        onFocus={() => handleFieldFocus(field, yearIdx, yearIdx)}
                        onChange={n => updateYearField(yearIdx, key, n)}
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
