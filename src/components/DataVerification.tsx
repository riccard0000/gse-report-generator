import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { ExtractedData, ExtractedField, FinancialYearData } from '../types';
import { CheckCircle, ChevronRight, FileSearch } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const TEXT_LAYER_CSS = `
.pdfTextLayer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 1;
  text-size-adjust: none;
  forced-color-adjust: none;
  user-select: none;
  -webkit-user-select: none;
}
.pdfTextLayer span,
.pdfTextLayer br {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: default;
  transform-origin: 0% 0%;
  user-select: none;
  -webkit-user-select: none;
}
.pdfTextLayer ::selection {
  background: transparent;
  color: transparent;
}
.pdfTextLayer .endOfContent {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: -1;
  cursor: default;
  user-select: none;
}
`;

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

/**
 * Testo da mostrare nella didascalia sotto il campo.
 * Usa rawLabel se disponibile (solo etichetta, senza numeri),
 * altrimenti cade su rawText con pulizia leggera.
 */
function captionText(field: ExtractedField<unknown>, maxLen = 60): string {
  // Preferisce rawLabel — già privo di numeri per costruzione
  const src = (field.rawLabel?.trim()) || field.rawText?.trim() || '';
  if (!src) return '';
  // Rimuove numeri residui solo se stiamo usando rawText come fallback
  let s = field.rawLabel
    ? src
    : src
        .replace(/[\t]/g, ' ')
        // spazio lettera→cifra e cifra→lettera (non cifra→cifra)
        .replace(/([A-Za-z\u00c0-\u00ff)])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-z\u00c0-\u00ff(])/g, '$1 $2')
        .replace(/\s{2,}/g, ' ')
        .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen) + '\u2026';
  return s;
}

/**
 * Testo da usare per cercare la bbox nel PDF.
 * Usa rawLabel se disponibile (etichetta pura),
 * altrimenti estrae la parte testuale da rawText rimuovendo i numeri.
 */
function lookupLabel(field: ExtractedField<unknown>): string {
  if (field.rawLabel?.trim()) return field.rawLabel.trim();
  // Fallback: rimuove numeri e punteggiatura numerica da rawText
  const s = (field.rawText || '')
    .replace(/[\t]/g, ' ')
    .replace(/-?[\d][\d.,]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s;
}

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------
interface BBox { x0: number; y0: number; x1: number; y1: number; }

type MatchResult =
  | { kind: 'single';    bboxes: BBox[];  segmentNames: string[] }
  | { kind: 'formula';   bboxes: BBox[];  segmentNames: string[] }
  | { kind: 'multi-sum'; bboxes: BBox[];  segmentNames: string[] };

function normalizeNumStr(s: string): string {
  return s.replace(/[.,\s-]/g, '');
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Fonde token adiacenti sulla STESSA riga con gap molto stretto (≤2pt).
 * Serve per numeri spezzati dal PDF (es. "160." + "638").
 * NON fonde colonne distanti come anno corrente vs anno precedente.
 */
function buildMergedTokens(items: PdfTextItem[]): PdfTextItem[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > 3) return dy;
    return a.transform[4] - b.transform[4];
  });
  const merged: PdfTextItem[] = [];
  let i = 0;
  while (i < sorted.length) {
    const cur   = sorted[i];
    const curY  = cur.transform[5];
    let fusedStr    = cur.str;
    let fusedX1     = cur.transform[4] + cur.width;
    let fusedHeight = cur.height;
    let j = i + 1;
    while (j < sorted.length) {
      const next  = sorted[j];
      const gap   = next.transform[4] - fusedX1;
      if (Math.abs(next.transform[5] - curY) > 3) break;  // riga diversa
      if (gap > 2) break;                                   // colonne separate — NON fondere
      if (!/\d/.test(fusedStr) && !/\d/.test(next.str)) break; // nessuna cifra — non vale
      fusedStr    += next.str;
      fusedX1      = next.transform[4] + next.width;
      fusedHeight  = Math.max(fusedHeight, next.height);
      j++;
    }
    merged.push({
      str: fusedStr,
      transform: [...cur.transform],
      width: fusedX1 - cur.transform[4],
      height: fusedHeight,
    });
    i = j > i + 1 ? j : i + 1;
  }
  return merged;
}

function findNumericNeighborForItem(
  items: PdfTextItem[],
  labelItem: PdfTextItem,
  fieldValue: number | null | undefined,
): { numBbox: BBox | null; numericDistance: number } {
  const labelY  = labelItem.transform[5];
  const labelX1 = labelItem.transform[4] + labelItem.width;
  const Y_TOL   = 5;

  // Usa i token fusi (solo gap ≤2pt) per ricomporre numeri spezzati
  const mergedItems = buildMergedTokens(items);

  const sameRow = mergedItems.filter(it => {
    const tf = it.transform;
    return Math.abs(tf[5] - labelY) <= Y_TOL && tf[4] > labelX1;
  });
  if (sameRow.length === 0) return { numBbox: null, numericDistance: Infinity };

  const numericTokens = sameRow.filter(it => /^-?[\d.,\s]+[-]?$/.test(it.str.trim()));
  const pool          = numericTokens.length > 0 ? numericTokens : sameRow;

  if (fieldValue !== null && fieldValue !== undefined) {
    const absVal       = Math.abs(fieldValue);
    const targetDigits = normalizeNumStr(String(Math.round(absVal)));

    // Match esatto sulle cifre normalizzate
    const exactMatch = pool.find(it => normalizeNumStr(it.str) === targetDigits);
    if (exactMatch) {
      const tf = exactMatch.transform;
      return {
        numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + exactMatch.width, y1: tf[5] + exactMatch.height },
        numericDistance: 0,
      };
    }

    // Fallback: token numerico più vicino per valore assoluto
    let bestDist = Infinity;
    let bestItem: PdfTextItem | null = null;
    for (const it of pool) {
      const parsed = parseIT(it.str.replace(/(?<=\d) (?=\d)/g, ''));
      if (!isNaN(parsed)) {
        const dist = Math.abs(parsed - absVal);
        if (dist < bestDist) { bestDist = dist; bestItem = it; }
      }
    }
    // Accetta il best match solo se ragionevolmente vicino (entro 5% o 10 unità)
    const threshold = Math.max(10, absVal * 0.05);
    if (bestItem && bestDist <= threshold) {
      const tf = bestItem.transform;
      return {
        numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + bestItem.width, y1: tf[5] + bestItem.height },
        numericDistance: bestDist,
      };
    }
    // Se nessun token è sufficientemente vicino, non evidenziare il numero
    return { numBbox: null, numericDistance: Infinity };
  }

  // Nessun fieldValue: usa il token numerico più a sinistra nella riga
  const closest = pool.reduce((a, b) => a.transform[4] < b.transform[4] ? a : b);
  const tf = closest.transform;
  return {
    numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + closest.width, y1: tf[5] + closest.height },
    numericDistance: Infinity,
  };
}

async function findSingleBboxWithItem(
  items: PdfTextItem[],
  labelText: string,
  fieldValue?: number | null,
): Promise<{ bbox: BBox; item: PdfTextItem } | null> {
  const seg = labelText.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!seg) return null;

  // Match esatto sull'etichetta
  const exactMatches = items.filter(it => it.str.toLowerCase().replace(/\s+/g, ' ').trim() === seg);
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
      if (candidates.length === 0)
        candidates = items.filter(it => it.str.toLowerCase().includes(keywords[0]));
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const found = candidates[0];
    const tf    = found.transform;
    return { bbox: { x0: tf[4], y0: tf[5], x1: tf[4] + found.width, y1: tf[5] + found.height }, item: found };
  }
  // Più candidati: scegli quello con il valore numerico più vicino a fieldValue
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
  const tf    = found.transform;
  return { bbox: { x0: tf[4], y0: tf[5], x1: tf[4] + found.width, y1: tf[5] + found.height }, item: found };
}

async function findBboxForField(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  field: ExtractedField<unknown>,
): Promise<MatchResult | null> {
  try {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items   = content.items as PdfTextItem[];
    const fv      = typeof field.value === 'number' ? field.value : null;

    // Determina il testo dell'etichetta da cercare
    const label = lookupLabel(field);
    if (!label) return null;

    // Cerca la riga etichetta nel PDF
    const r = await findSingleBboxWithItem(items, label, fv);
    if (!r) return null;

    // Trova il numero vicino corrispondente a field.value
    const { numBbox } = findNumericNeighborForItem(items, r.item, fv);

    return {
      kind: 'single',
      bboxes: numBbox ? [r.bbox, numBbox] : [r.bbox],
      segmentNames: [label],
    };
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

const NumericInput: React.FC<NumericInputProps> = ({ value, onChange, onFocus, className, isUnavailable }) => {
  const [displayValue, setDisplayValue] = useState(isUnavailable ? '' : formatIT(value ?? 0));
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) setDisplayValue(isUnavailable ? '' : formatIT(value ?? 0));
  }, [value, isUnavailable]);

  return (
    <input
      type="text" inputMode="numeric" className={className}
      value={displayValue}
      placeholder={isUnavailable ? 'n.d.' : '0'}
      onFocus={e => { isEditing.current = true; e.target.select(); onFocus?.(); }}
      onChange={e => setDisplayValue(e.target.value.replace(/[^0-9.,-]/g, ''))}
      onBlur={() => {
        isEditing.current = false;
        if (displayValue.trim() === '') { onChange(null); setDisplayValue(''); }
        else { const p = parseIT(displayValue); onChange(p); setDisplayValue(formatIT(p)); }
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Colori highlight
// ---------------------------------------------------------------------------
const HIGHLIGHT_LABEL_COLOR = { bg: 'rgba(59,130,246,0.22)',  border: 'rgba(59,130,246,0.85)' };
const HIGHLIGHT_VALUE_COLOR = { bg: 'rgba(16,185,129,0.28)',  border: 'rgba(16,185,129,0.90)' };

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

  const containerRef     = useRef<HTMLDivElement>(null);
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const textLayerRef     = useRef<HTMLDivElement>(null);
  const hlLayerRef       = useRef<HTMLDivElement>(null);
  const pdfDocRef        = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const currentPageRef   = useRef(1);
  const highlightRef     = useRef<ActiveHighlight | null>(null);
  const renderSeqRef     = useRef(0);
  const renderTaskRef    = useRef<pdfjsLib.RenderTask | null>(null);
  const textLayerTaskRef = useRef<TextLayer | null>(null);
  const renderingRef     = useRef(false);
  const pageCssSize      = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => { highlightRef.current = highlight; }, [highlight]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  const drawHighlights = useCallback((hl: ActiveHighlight | null, viewport: pdfjsLib.PageViewport) => {
    const hlDiv = hlLayerRef.current;
    if (!hlDiv) return;
    hlDiv.innerHTML = '';
    if (!hl || hl.bboxes.length === 0) return;

    hl.bboxes.forEach((bbox, idx) => {
      if (isBboxEmpty(bbox)) return;
      const colors = idx === 0 ? HIGHLIGHT_LABEL_COLOR : HIGHLIGHT_VALUE_COLOR;
      const [ax, ay] = viewport.convertToViewportPoint(bbox.x0, bbox.y1);
      const [bx, by] = viewport.convertToViewportPoint(bbox.x1, bbox.y0);
      const dpr = window.devicePixelRatio || 1;
      const x = Math.min(ax, bx) / dpr;
      const y = Math.min(ay, by) / dpr;
      const w = Math.abs(bx - ax) / dpr;
      const h = Math.abs(by - ay) / dpr;

      const div = document.createElement('div');
      div.style.cssText = [
        'position:absolute',
        `left:${x}px`, `top:${y}px`,
        `width:${w}px`, `height:${h}px`,
        `background:${colors.bg}`,
        `border:2px solid ${colors.border}`,
        'border-radius:2px',
        'pointer-events:none',
        'z-index:10',
      ].join(';');
      hlDiv.appendChild(div);
    });
  }, []);

  const doRender = useCallback(async (seq: number) => {
    const pdf    = pdfDocRef.current;
    const canvas = canvasRef.current;
    const tlDiv  = textLayerRef.current;
    const page   = currentPageRef.current;
    const hl     = highlightRef.current;
    if (!pdf || !canvas || !tlDiv) return;
    if (seq !== renderSeqRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /**/ }
      renderTaskRef.current = null;
    }
    if (textLayerTaskRef.current) {
      try { textLayerTaskRef.current.cancel(); } catch { /**/ }
      textLayerTaskRef.current = null;
    }
    if (renderingRef.current) return;
    renderingRef.current = true;

    try {
      const pdfPage = await pdf.getPage(page);
      if (seq !== renderSeqRef.current) return;

      const dpr        = window.devicePixelRatio || 1;
      const BASE_SCALE = 1.5;
      const viewport   = pdfPage.getViewport({ scale: BASE_SCALE * dpr });

      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      const cssW = viewport.width  / dpr;
      const cssH = viewport.height / dpr;
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      pageCssSize.current = { w: cssW, h: cssH };

      tlDiv.style.width  = `${cssW}px`;
      tlDiv.style.height = `${cssH}px`;
      tlDiv.innerHTML    = '';
      if (hlLayerRef.current) {
        hlLayerRef.current.style.width  = `${cssW}px`;
        hlLayerRef.current.style.height = `${cssH}px`;
        hlLayerRef.current.innerHTML    = '';
      }

      const ctx  = canvas.getContext('2d')!;
      const task = pdfPage.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      if (seq !== renderSeqRef.current) return;

      const textViewport = pdfPage.getViewport({ scale: BASE_SCALE });
      const textContent  = await pdfPage.getTextContent();
      if (seq !== renderSeqRef.current) return;

      const tl = new TextLayer({
        textContentSource: textContent,
        container: tlDiv,
        viewport: textViewport,
      });
      textLayerTaskRef.current = tl;
      await tl.render();
      textLayerTaskRef.current = null;
      if (seq !== renderSeqRef.current) return;

      if (hl && hl.page === page) drawHighlights(hl, viewport);

    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException')
        console.warn('[PdfViewer] render error:', e);
    } finally {
      renderingRef.current = false;
    }
  }, [drawHighlights]);

  const requestRender = useCallback(() => {
    const seq = ++renderSeqRef.current;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /**/ } renderTaskRef.current = null; }
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
      requestRender();
    })();
    return () => { cancelled = true; };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    highlightRef.current = highlight;
    if (highlight?.page && highlight.page !== currentPageRef.current) {
      currentPageRef.current = highlight.page;
      setCurrentPage(highlight.page);
      if (pdfDocRef.current) requestRender();
    } else if (pdfDocRef.current) {
      requestRender();
    }
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (document.getElementById('pdfjs-text-layer-css')) return;
    const style = document.createElement('style');
    style.id = 'pdfjs-text-layer-css';
    style.textContent = TEXT_LAYER_CSS;
    document.head.appendChild(style);
  }, []);

  const visibleBboxes = highlight?.bboxes.filter(b => !isBboxEmpty(b)) ?? [];
  const legendItems = (() => {
    if (!highlight || visibleBboxes.length === 0) return [];
    const items = [];
    if (visibleBboxes[0]) items.push({ color: HIGHLIGHT_LABEL_COLOR.border, name: 'Etichetta' });
    if (visibleBboxes[1]) items.push({ color: HIGHLIGHT_VALUE_COLOR.border, name: 'Valore' });
    return items;
  })();

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0">
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

      <div
        className="flex-1 overflow-auto flex justify-center p-4 bg-slate-100"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <div ref={containerRef} className="relative shadow-2xl inline-block">
          <canvas ref={canvasRef} className="block" />
          <div
            ref={textLayerRef}
            className="pdfTextLayer"
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          />
          <div
            ref={hlLayerRef}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          />
        </div>
      </div>

      {legendItems.length > 0 && (
        <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-3 flex-wrap flex-shrink-0">
          {legendItems.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
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
    field: ExtractedField<unknown> | null,
    colorIndex: number,
    fileIdx: number,
  ) => {
    const color = HIGHLIGHT_COLORS[colorIndex] ?? HIGHLIGHT_COLORS[0];
    if (!field?.page || (!field?.rawText && !field?.rawLabel)) { setActiveHighlight(null); return; }

    setActiveHighlight({ page: field.page, bboxes: [EMPTY_BBOX], segmentNames: [], color, isMultiSum: false });
    if (!files[fileIdx]) return;

    try {
      const doc    = await getPdfDoc(fileIdx, files[fileIdx]);
      const result = await findBboxForField(doc, field.page, field);
      if (!result) return;
      setActiveHighlight({
        page: field.page,
        bboxes: result.bboxes,
        segmentNames: result.segmentNames,
        color,
        isMultiSum: false,
      });
    } catch { /**/ }
  }, [files, getPdfDoc]);

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

      {/* ---- PANNELLO SINISTRO ---- */}
      <div className="w-2/5 flex flex-col border-r border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          {tabLabels.map((lbl, i) => (
            <button key={i} onClick={() => { setActiveTab(i); setActiveHighlight(null); }}
              className={`flex-1 py-3 px-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === i ? tabColors[i] : 'border-transparent ' + tabColorsInactive[i]}`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Inserisci l&apos;importo residuo da restituire al GSE per l&apos;assolvimento dell&apos;obbligo
                extraprofitti derivante dalla vendita dell&apos;energia elettrica (art. 15-bis D.L. 4/2022).
              </p>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Ammontare residuo GSE (&euro;)</label>
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

          {activeTab >= 1 && (() => {
            const yearIdx = activeTab - 1;
            const year    = data.yearsData[yearIdx];
            if (!year) return null;
            return (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 mb-1">Verifica e correggi i dati estratti. Clicca su un campo per evidenziare la voce nel PDF.</p>
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

                {YEAR_FIELDS.map(({ key, label }) => {
                  const field     = year[key] as ExtractedField<number>;
                  const isUnavail = field?.value === null && !!field?.rawText;
                  const hasPage   = !!field?.page;
                  const caption   = field ? captionText(field) : '';
                  return (
                    <div key={key as string}>
                      <label className="flex items-center gap-1 flex-wrap text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        {label}
                        {hasPage && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-slate-400">
                            <ChevronRight className="w-2.5 h-2.5" /> p.{field.page}
                          </span>
                        )}
                        {isUnavail && (
                          <span className="ml-1 text-[9px] font-semibold text-amber-500 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">non disponibile</span>
                        )}
                      </label>
                      <NumericInput
                        value={field?.value} isUnavailable={isUnavail}
                        className={`w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2 ${
                          isUnavail ? 'border-amber-200 bg-amber-50 text-amber-600 focus:ring-amber-300 cursor-pointer italic'
                          : hasPage ? 'border-slate-200 focus:ring-blue-300 cursor-pointer'
                          : 'border-slate-200 focus:ring-slate-300'}`}
                        onFocus={() => handleFieldFocus(field, yearIdx, yearIdx)}
                        onChange={n => updateYearField(yearIdx, key, n)}
                      />
                      {caption && (
                        <p className="mt-0.5 text-[10px] text-slate-400 italic">&laquo;{caption}&raquo;</p>
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
                          {item?.dettaglio && <p className="text-[10px] text-slate-500 mb-1.5 leading-relaxed">{item.dettaglio}</p>}
                          {item?.fonteTestuale && (
                            <div className="mt-1.5 bg-white/70 border border-slate-200 rounded px-2 py-1.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <FileSearch className="w-2.5 h-2.5 text-slate-400" />
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Fonte{item.page ? ` \u2014 pag. ${item.page}` : ''}</span>
                              </div>
                              <p className="text-[10px] text-slate-600 italic leading-relaxed">&ldquo;{item.fonteTestuale}&rdquo;</p>
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

      {/* ---- PANNELLO DESTRO ---- */}
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
