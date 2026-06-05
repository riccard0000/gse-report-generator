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
// Estrae il primo numero presente in una stringa di segmento.
// Es. "Debiti banche breve 500.000" → 500000
// Es. "Totale attivo" → null (nessun numero)
// ---------------------------------------------------------------------------
function extractSegmentValue(seg: string): number | null {
  const match = seg.match(/-?[\d]+(?:[.,][\d]+)*/);
  if (!match) return null;
  const parsed = parseIT(match[0]);
  return isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------
interface BBox { x0: number; y0: number; x1: number; y1: number; }

type MatchResult =
  | { kind: 'single';    bboxes: BBox[];  segmentNames: string[] }
  | { kind: 'formula';   bboxes: BBox[];  segmentNames: string[] }
  | { kind: 'multi-sum'; bboxes: BBox[];  segmentNames: string[] };

function isCalculatedFormula(segments: string[]): boolean {
  const withDigits = segments.filter(s => /\d/.test(s)).length;
  return withDigits >= Math.ceil(segments.length / 2);
}

function segmentDisplayName(seg: string): string {
  return seg.replace(/[\d.,]+/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Cerca il token numerico sulla stessa riga di labelItem il cui valore è
// più vicino a fieldValue. Restituisce bbox + distanza.
// ---------------------------------------------------------------------------
function findNumericNeighborForItem(
  items: PdfTextItem[],
  labelItem: PdfTextItem,
  fieldValue: number | null | undefined,
): { numBbox: BBox | null; numericDistance: number } {
  const labelTf = labelItem.transform;
  const labelY  = labelTf[5];
  const labelX1 = labelTf[4] + labelItem.width;
  const Y_TOL   = 5;

  const sameRow = items.filter(it => {
    const tf = it.transform;
    return Math.abs(tf[5] - labelY) <= Y_TOL && tf[4] > labelX1;
  });
  if (sameRow.length === 0) return { numBbox: null, numericDistance: Infinity };

  const numericTokens = sameRow.filter(it => /^-?[\d.,]+[-]?$/.test(it.str.trim()));
  const pool          = numericTokens.length > 0 ? numericTokens : sameRow;

  if (fieldValue !== null && fieldValue !== undefined) {
    const absVal = Math.abs(fieldValue);

    // 1. Match esatto sui digit strip
    const reprs = [String(Math.round(absVal)), absVal.toFixed(0)];
    const exact = pool.find(it => {
      const s = it.str.replace(/[.,\s-]/g, '');
      return reprs.some(r => s === r.replace(/[.,\s-]/g, ''));
    });
    if (exact) {
      const tf = exact.transform;
      return {
        numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + exact.width, y1: tf[5] + exact.height },
        numericDistance: 0,
      };
    }

    // 2. Token numerico più vicino per valore
    let bestDist = Infinity;
    let bestItem: PdfTextItem | null = null;
    for (const it of numericTokens) {
      const parsed = parseIT(it.str);
      if (!isNaN(parsed)) {
        const dist = Math.abs(parsed - absVal);
        if (dist < bestDist) { bestDist = dist; bestItem = it; }
      }
    }
    if (bestItem) {
      const tf = bestItem.transform;
      return {
        numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + bestItem.width, y1: tf[5] + bestItem.height },
        numericDistance: bestDist,
      };
    }
  }

  // Fallback: token più a destra
  const closest = pool.reduce((a, b) => a.transform[4] < b.transform[4] ? a : b);
  const tf = closest.transform;
  return {
    numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + closest.width, y1: tf[5] + closest.height },
    numericDistance: Infinity,
  };
}

// ---------------------------------------------------------------------------
// Cerca tutti i token che matchano il segmento testuale.
// Se fieldValue è disponibile, discrimina tra duplicati scegliendo quello
// la cui riga contiene il numero più vicino al valore atteso.
// ---------------------------------------------------------------------------
async function findSingleBboxWithItem(
  items: PdfTextItem[],
  segment: string,
  fieldValue?: number | null,
): Promise<{ bbox: BBox; item: PdfTextItem } | null> {
  const seg = segment.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!seg) return null;

  const exactMatches = items.filter(it =>
    it.str.toLowerCase().replace(/\s+/g, ' ').trim() === seg
  );
  let candidates: PdfTextItem[] = exactMatches;

  if (candidates.length === 0) {
    const keywords = seg
      .replace(/[^a-z\u00e0\u00e8\u00e9\u00ec\u00f2\u00f9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .slice(0, 5);

    if (keywords.length > 0) {
      const threshold = Math.max(1, Math.ceil(keywords.length / 2));
      const kwMatches: PdfTextItem[] = [];
      for (const item of items) {
        const txt   = item.str.toLowerCase();
        const count = keywords.filter(w => txt.includes(w)).length;
        if (count >= threshold) kwMatches.push(item);
      }
      candidates = kwMatches;
      if (candidates.length === 0) {
        candidates = items.filter(it => it.str.toLowerCase().includes(keywords[0]));
      }
    }
  }

  if (candidates.length === 0) return null;

  if (candidates.length === 1) {
    const found = candidates[0];
    const tf = found.transform;
    return { bbox: { x0: tf[4], y0: tf[5], x1: tf[4] + found.width, y1: tf[5] + found.height }, item: found };
  }

  // Più candidati: scegli quello con valore numerico più vicino a fieldValue
  if (fieldValue !== null && fieldValue !== undefined) {
    let bestDist = Infinity;
    let bestItem = candidates[0];
    for (const c of candidates) {
      const { numericDistance } = findNumericNeighborForItem(items, c, fieldValue);
      if (numericDistance < bestDist) { bestDist = numericDistance; bestItem = c; }
    }
    const tf = bestItem.transform;
    return { bbox: { x0: tf[4], y0: tf[5], x1: tf[4] + bestItem.width, y1: tf[5] + bestItem.height }, item: bestItem };
  }

  const found = candidates[0];
  const tf = found.transform;
  return { bbox: { x0: tf[4], y0: tf[5], x1: tf[4] + found.width, y1: tf[5] + found.height }, item: found };
}

// ---------------------------------------------------------------------------
// Core: dato un rawText (e il fieldValue atteso), restituisce MatchResult.
//
// single/formula → sempre 2 bbox: [etichetta(blu), valore(verde)]
//
// multi-sum → per ogni segmento: [etichetta(blu), valore-parziale(verde)]
//   Il valore parziale viene estratto dal testo del segmento stesso
//   (es. "Debiti banche breve 500.000" → cerca 500000 sulla riga),
//   NON dal fieldValue totale — che sarebbe la somma di tutti i segmenti.
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

    const rawSegments = rawText
      .split(/\s*\+\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // ── CASO SINGLE ──────────────────────────────────────────────────────────
    if (rawSegments.length <= 1) {
      const r = await findSingleBboxWithItem(items, rawText, fieldValue);
      if (!r) return null;
      const { numBbox } = findNumericNeighborForItem(items, r.item, fieldValue ?? null);
      const bboxes = numBbox ? [r.bbox, numBbox] : [r.bbox];
      return { kind: 'single', bboxes, segmentNames: [rawText] };
    }

    // ── CASO FORMULA (segmenti contengono cifre inline) ──────────────────────
    if (isCalculatedFormula(rawSegments)) {
      const firstSeg  = rawSegments[0];
      const nameOnly  = segmentDisplayName(firstSeg);
      const lookupSeg = nameOnly.length >= 3 ? nameOnly : firstSeg;
      const r = await findSingleBboxWithItem(items, lookupSeg, fieldValue);
      if (!r) return null;
      const { numBbox } = findNumericNeighborForItem(items, r.item, fieldValue ?? null);
      const bboxes   = numBbox ? [r.bbox, numBbox] : [r.bbox];
      const segNames = rawSegments.map(segmentDisplayName).filter(Boolean);
      return { kind: 'formula', bboxes, segmentNames: segNames };
    }

    // ── CASO MULTI-SUM ────────────────────────────────────────────────────────
    // Per ogni segmento: cerca l'etichetta testuale + il suo valore parziale.
    // Il valore parziale è estratto dal testo del segmento (non dal totale).
    const bboxes:       BBox[]   = [];
    const segmentNames: string[] = [];

    for (const seg of rawSegments) {
      // Valore numerico del singolo segmento (es. 500.000 da "Debiti banche 500.000")
      const segValue  = extractSegmentValue(seg);

      const cleanSeg  = segmentDisplayName(seg);
      const lookupSeg = cleanSeg.length >= 3 ? cleanSeg : seg;

      // Cerca l'etichetta; se ci sono duplicati usa segValue per disambiguare
      const r = await findSingleBboxWithItem(items, lookupSeg, segValue);
      if (!r) continue;

      const isDup = bboxes.some(b =>
        Math.abs(b.y0 - r.bbox.y0) < 2 && Math.abs(b.x0 - r.bbox.x0) < 2
      );
      if (isDup) continue;

      // bbox etichetta
      bboxes.push(r.bbox);
      segmentNames.push(cleanSeg || seg);

      // bbox valore parziale sulla stessa riga
      const { numBbox } = findNumericNeighborForItem(items, r.item, segValue);
      if (numBbox) bboxes.push(numBbox);
      // segmentNames non cresce per numBbox: la legenda mostra solo le etichette
    }

    if (bboxes.length === 0) return null;
    return { kind: 'multi-sum', bboxes, segmentNames };
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
// Colori highlight
// ---------------------------------------------------------------------------
const HIGHLIGHT_LABEL_COLOR  = { fill: 'rgba(59,130,246,0.22)',  stroke: 'rgba(59,130,246,0.85)'  };
const HIGHLIGHT_VALUE_COLOR  = { fill: 'rgba(16,185,129,0.28)',  stroke: 'rgba(16,185,129,0.90)'  };
// multi-sum: coppie etichetta(blu)/valore(verde) che si ripetono per ogni segmento
const MULTI_HIGHLIGHT_COLORS = [
  { fill: 'rgba(59,130,246,0.22)',  stroke: 'rgba(59,130,246,0.85)'  },  // etichetta seg 1
  { fill: 'rgba(16,185,129,0.28)',  stroke: 'rgba(16,185,129,0.90)'  },  // valore seg 1
  { fill: 'rgba(245,158,11,0.22)',  stroke: 'rgba(245,158,11,0.85)'  },  // etichetta seg 2
  { fill: 'rgba(239,68,68,0.22)',   stroke: 'rgba(239,68,68,0.85)'   },  // valore seg 2
  { fill: 'rgba(168,85,247,0.22)',  stroke: 'rgba(168,85,247,0.85)'  },  // etichetta seg 3
  { fill: 'rgba(20,184,166,0.28)',  stroke: 'rgba(20,184,166,0.90)'  },  // valore seg 3
];

interface ActiveHighlight {
  page:         number;
  bboxes:       BBox[];
  segmentNames: string[];
  color:        string;
  isMultiSum:   boolean;
}

const EMPTY_BBOX: BBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
function isBboxEmpty(b: BBox) { return b.x0 === 0 && b.y0 === 0 && b.x1 === 0 && b.y1 === 0; }

// ---------------------------------------------------------------------------
// PdfViewer
// ---------------------------------------------------------------------------
interface PdfViewerProps {
  file:      File;
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
  const renderTaskRef  = useRef<pdfjsLib.RenderTask | null>(null);
  const renderingRef   = useRef(false);

  useEffect(() => { highlightRef.current = highlight; }, [highlight]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  const doRender = useCallback(async (seq: number) => {
    const pdf    = pdfDocRef.current;
    const canvas = canvasRef.current;
    const page   = currentPageRef.current;
    const hl     = highlightRef.current;
    if (!pdf || !canvas) return;
    if (seq !== renderSeqRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /* ignorato */ }
      renderTaskRef.current = null;
    }
    if (renderingRef.current) return;
    renderingRef.current = true;

    try {
      const pdfPage = await pdf.getPage(page);
      if (seq !== renderSeqRef.current) return;

      // FIX sfuocatura HiDPI: scala il canvas per devicePixelRatio
      // così su schermi retina (dpr=2) il canvas è 2× più grande in pixel
      // fisici ma viene mostrato alle dimensioni CSS logiche → nitido.
      const dpr      = window.devicePixelRatio || 1;
      const BASE_SCALE = 1.5;
      const viewport = pdfPage.getViewport({ scale: BASE_SCALE * dpr });

      // Dimensioni fisiche del canvas (pixel reali)
      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      // Dimensioni CSS logiche (pixel logici) → il browser scala correttamente
      canvas.style.width  = `${viewport.width  / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const ctx  = canvas.getContext('2d')!;
      const task = pdfPage.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      if (seq !== renderSeqRef.current) return;

      if (hl && hl.page === page && hl.bboxes.length > 0) {
        hl.bboxes.forEach((bbox, idx) => {
          if (isBboxEmpty(bbox)) return;

          let colors: { fill: string; stroke: string };
          if (hl.isMultiSum) {
            // coppie: idx pari = etichetta, idx dispari = valore
            colors = MULTI_HIGHLIGHT_COLORS[idx % MULTI_HIGHLIGHT_COLORS.length];
          } else {
            colors = idx === 0 ? HIGHLIGHT_LABEL_COLOR : HIGHLIGHT_VALUE_COLOR;
          }

          const [ax, ay] = viewport.convertToViewportPoint(bbox.x0, bbox.y1);
          const [bx, by] = viewport.convertToViewportPoint(bbox.x1, bbox.y0);
          ctx.save();
          ctx.fillStyle   = colors.fill;
          ctx.fillRect(Math.min(ax,bx), Math.min(ay,by), Math.abs(bx-ax), Math.abs(by-ay));
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth   = 2;
          ctx.strokeRect(Math.min(ax,bx), Math.min(ay,by), Math.abs(bx-ax), Math.abs(by-ay));
          ctx.restore();
        });
      }
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name;
      if (name !== 'RenderingCancelledException') {
        console.warn('[PdfViewer] render error:', e);
      }
    } finally {
      renderingRef.current = false;
    }
  }, []);

  const requestRender = useCallback(() => {
    const seq = ++renderSeqRef.current;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /* ignorato */ }
      renderTaskRef.current = null;
    }
    doRender(seq);
  }, [doRender]);

  const goToPage = useCallback((p: number) => {
    currentPageRef.current = p;
    setCurrentPage(p);
    requestRender();
  }, [requestRender]);

  useEffect(() => {
    pdfDocRef.current = null;
    renderSeqRef.current++;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /* ignorato */ }
      renderTaskRef.current = null;
    }
    renderingRef.current = false;
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
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    highlightRef.current = highlight;
    if (highlight?.page && highlight.page !== currentPageRef.current) {
      currentPageRef.current = highlight.page;
      setCurrentPage(highlight.page);
    }
    if (pdfDocRef.current) requestRender();
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleBboxes = highlight?.bboxes.filter(b => !isBboxEmpty(b)) ?? [];

  // Legenda multi-sum: mostra solo le etichette (bbox pari), con il loro colore
  const legendItems = (() => {
    if (!highlight || visibleBboxes.length === 0) return [];
    if (highlight.isMultiSum) {
      return highlight.segmentNames.map((name, i) => ({
        color: MULTI_HIGHLIGHT_COLORS[(i * 2) % MULTI_HIGHLIGHT_COLORS.length].stroke,
        name,
      }));
    }
    const items = [];
    if (visibleBboxes[0]) items.push({ color: HIGHLIGHT_LABEL_COLOR.stroke,  name: 'Etichetta' });
    if (visibleBboxes[1]) items.push({ color: HIGHLIGHT_VALUE_COLOR.stroke, name: 'Valore' });
    return items;
  })();

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
          {legendItems.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-slate-600 font-medium">{item.name}</span>
              <span className="text-xs text-slate-400">&middot; pag. {highlight!.page}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Componente principale DataVerification
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

const CHECKLIST_LABELS: {
  key: 'debitiGSE' | 'accantonamenti' | 'riduzioniRicavi' | 'contenziosi';
  label: string;
}[] = [
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

function matchKindFromRawText(rawText: string | null | undefined): MatchResult['kind'] {
  if (!rawText) return 'single';
  const segments = rawText.split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  if (segments.length <= 1) return 'single';
  return isCalculatedFormula(segments) ? 'formula' : 'multi-sum';
}

function segmentNamesFromRawText(rawText: string): string[] {
  return rawText
    .split(/\s*\+\s*/)
    .map(s => s.replace(/[\d.,]+/g, '').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
}

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

    if (!field?.page || !field?.rawText) {
      setActiveHighlight(null);
      return;
    }

    setActiveHighlight({
      page: field.page, bboxes: [EMPTY_BBOX],
      segmentNames: [], color, isMultiSum: false,
    });

    if (!files[fileIdx]) return;

    try {
      const doc    = await getPdfDoc(fileIdx, files[fileIdx]);
      const result = await findBboxByText(
        doc,
        field.page,
        field.rawText,
        field.value as number | null,
      );
      if (!result) return;
      setActiveHighlight({
        page:         field.page,
        bboxes:       result.bboxes,
        segmentNames: result.segmentNames,
        color,
        isMultiSum:   result.kind === 'multi-sum',
      });
    } catch {
      // lascia navigate-only
    }
  }, [files, getPdfDoc]);

  const updateYearField = (yearIdx: number, key: keyof FinancialYearData, value: number | null) => {
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

  const checklist = data.checklist;

  return (
    <div className="flex h-[calc(100vh-80px)] gap-0 overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">

      {/* ---- PANNELLO SINISTRO ---- */}
      <div className="w-2/5 flex flex-col border-r border-slate-200 overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {tabLabels.map((lbl, i) => (
            <button key={i}
              onClick={() => { setActiveTab(i); setActiveHighlight(null); }}
              className={`flex-1 py-3 px-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === i ? tabColors[i] : 'border-transparent ' + tabColorsInactive[i]}`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* Tab 0 — Importo GSE */}
          {activeTab === 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Inserisci l&apos;importo residuo da restituire al GSE per l&apos;assolvimento dell&apos;obbligo
                extraprofitti derivante dalla vendita dell&apos;energia elettrica (art. 15-bis D.L. 4/2022).
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
                <p className="mt-2 text-xs text-slate-400 italic">Testo estratto: &ldquo;{data.gseResidual.rawText}&rdquo;</p>
              )}
            </div>
          )}

          {/* Tab 1+ — Bilancio anno */}
          {activeTab >= 1 && (() => {
            const yearIdx = activeTab - 1;
            const year    = data.yearsData[yearIdx];
            if (!year) return null;
            return (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 mb-1">
                  Verifica e correggi i dati estratti. Clicca su un campo per evidenziare la voce nel PDF.
                </p>

                {/* Anno */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Anno di Esercizio</label>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={year.year ?? ''}
                    onChange={e => setData(prev => {
                      const next = JSON.parse(JSON.stringify(prev)) as ExtractedData;
                      next.yearsData[yearIdx].year = e.target.value;
                      return next;
                    })}
                  />
                </div>

                {/* Campi KPI */}
                {YEAR_FIELDS.map(({ key, label }) => {
                  const field     = year[key] as ExtractedField<number>;
                  const isUnavail = field?.value === null && !!field?.rawText;
                  const hasPage   = !!field?.page;

                  const kind      = matchKindFromRawText(field?.rawText);
                  const showSigma = kind === 'multi-sum';
                  const segNames  = field?.rawText ? segmentNamesFromRawText(field.rawText) : [];

                  return (
                    <div key={key as string}>
                      <label className="flex items-center gap-1 flex-wrap text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        {label}

                        {hasPage && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-slate-400">
                            <ChevronRight className="w-2.5 h-2.5" /> p.{field.page}
                          </span>
                        )}

                        {showSigma && segNames.length > 0 && (
                          <span
                            title={`Somma di: ${segNames.join(' + ')}`}
                            className="ml-1 text-[9px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 cursor-help"
                          >
                            &Sigma; {segNames.join(' + ')}
                          </span>
                        )}

                        {!showSigma && kind === 'formula' && (
                          <span
                            title={`Formula: ${segNames.join(' + ')}`}
                            className="ml-1 text-[9px] font-semibold text-teal-600 bg-teal-50 border border-teal-200 rounded px-1 py-0.5 cursor-help"
                          >
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

                {/* Checklist GSE */}
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

        {/* Bottone approva */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button onClick={() => onApprove(data)}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl transition-colors shadow-sm">
            <CheckCircle className="w-5 h-5" />
            Conferma dati e genera report
          </button>
        </div>
      </div>

      {/* ---- PANNELLO DESTRO — PDF viewer ---- */}
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
