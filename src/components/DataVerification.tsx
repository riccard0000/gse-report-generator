import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { ExtractedData, ExtractedField, DerivedField, FinancialYearData } from '../types';
import { computeDerivedFields } from '../kpiCalculator';
import { BALANCE_SCHEMA, BalanceFieldKey, getSearchLabels } from '../balanceSchema';
import { AlertTriangle, CheckCircle, ChevronRight, FileSearch, Layers, RefreshCw } from 'lucide-react';

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

// ---------------------------------------------------------------------------
// Helpers formato numerico italiano
// ---------------------------------------------------------------------------
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

function captionText(field: ExtractedField<unknown>, maxLen = 60): string {
  const src = (field.rawLabel ?? field.rawText ?? '').trim();
  if (!src) return '';
  const firstLine = src.split('\n')[0];
  let s = firstLine
    .replace(/[\t]/g, ' ')
    .replace(/([A-Za-z\u00c0-\u00ff)])(\d)/g, '$1 $2')
    .replace(/([\d])([A-Za-z\u00c0-\u00ff(])/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) + '\u2026' : s;
}

function isMultiLineField(field: ExtractedField<unknown> | null | undefined): boolean {
  if (!field?.rawText) return false;
  return field.rawText.includes('\n');
}

function countRawLines(field: ExtractedField<unknown>): number {
  if (!field?.rawText) return 0;
  return field.rawText.split('\n').filter(l => l.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// Tipi interni
// ---------------------------------------------------------------------------
interface BBox { x0: number; y0: number; x1: number; y1: number; }

function normalizeNumStr(s: string): string {
  return s.replace(/[.,\s-]/g, '');
}

function isPureNumeric(s: string): boolean {
  return /^-?[\d.,\s]+[-]?$/.test(s.trim());
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// buildMergedTokens
// ---------------------------------------------------------------------------
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
    const cur       = sorted[i];
    const curY      = cur.transform[5];
    let fusedStr    = cur.str;
    let fusedX1     = cur.transform[4] + cur.width;
    let fusedHeight = cur.height;
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j];
      const gap  = next.transform[4] - fusedX1;
      if (Math.abs(next.transform[5] - curY) > 3) break;
      const bothNumeric = isPureNumeric(fusedStr) && isPureNumeric(next.str);
      const maxGap = bothNumeric ? 2 : 8;
      if (gap > maxGap) break;
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

function buildRowTokens(items: PdfTextItem[]): PdfTextItem[] {
  if (items.length === 0) return [];
  const Y_ROW_TOL = 6;
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > Y_ROW_TOL) return dy;
    return a.transform[4] - b.transform[4];
  });
  const rows: PdfTextItem[][] = [];
  let currentRow: PdfTextItem[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = currentRow[currentRow.length - 1];
    if (Math.abs(sorted[i].transform[5] - prev.transform[5]) <= Y_ROW_TOL) {
      currentRow.push(sorted[i]);
    } else {
      rows.push(currentRow);
      currentRow = [sorted[i]];
    }
  }
  rows.push(currentRow);
  return rows.map(row => {
    const first   = row[0];
    const last    = row[row.length - 1];
    const x0      = first.transform[4];
    const x1      = last.transform[4] + last.width;
    const fullStr = row.map(t => t.str).join(' ').replace(/\s{2,}/g, ' ');
    return {
      str: fullStr,
      transform: [...first.transform],
      width: x1 - x0,
      height: Math.max(...row.map(t => t.height)),
    };
  });
}

// ---------------------------------------------------------------------------
// findNumericNeighbor
// ---------------------------------------------------------------------------
function findNumericNeighbor(
  items: PdfTextItem[],
  labelItem: PdfTextItem,
  fieldValue: number | null | undefined,
): { numBbox: BBox | null; numericDistance: number } {
  const labelY  = labelItem.transform[5];
  const labelX1 = labelItem.transform[4] + labelItem.width;
  const Y_TOL   = 8;
  const mergedItems = buildMergedTokens(items);

  const sameRow = mergedItems
    .filter(it => {
      const tf = it.transform;
      return Math.abs(tf[5] - labelY) <= Y_TOL && tf[4] > labelX1;
    })
    .sort((a, b) => a.transform[4] - b.transform[4]);

  if (sameRow.length === 0) return { numBbox: null, numericDistance: Infinity };

  const numericTokens = sameRow.filter(it => isPureNumeric(it.str));
  const pool          = numericTokens.length > 0 ? numericTokens : sameRow;

  if (fieldValue !== null && fieldValue !== undefined) {
    const absVal       = Math.abs(fieldValue);
    const targetDigits = normalizeNumStr(String(Math.round(absVal)));

    const exactMatches = pool.filter(it => normalizeNumStr(it.str) === targetDigits);
    if (exactMatches.length > 0) {
      const best = exactMatches.reduce((a, b) =>
        a.transform[4] < b.transform[4] ? a : b
      );
      const tf = best.transform;
      return {
        numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + best.width, y1: tf[5] + best.height },
        numericDistance: 0,
      };
    }

    let bestDist = Infinity;
    let bestItem: PdfTextItem | null = null;
    for (const it of pool) {
      const cleaned = it.str.replace(/(\d) (\d)/g, '$1$2');
      const parsed  = parseIT(cleaned);
      if (!isNaN(parsed)) {
        const dist = Math.abs(parsed - absVal);
        if (dist < bestDist) { bestDist = dist; bestItem = it; }
      }
    }
    const threshold = Math.max(1, absVal * 0.01);
    if (bestItem && bestDist <= threshold) {
      const tf = bestItem.transform;
      return {
        numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + bestItem.width, y1: tf[5] + bestItem.height },
        numericDistance: bestDist,
      };
    }
    return { numBbox: null, numericDistance: Infinity };
  }

  const closest = pool[0];
  const tf = closest.transform;
  return {
    numBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + closest.width, y1: tf[5] + closest.height },
    numericDistance: Infinity,
  };
}

// ---------------------------------------------------------------------------
// matchLabelInPage
// ---------------------------------------------------------------------------
function matchLabelInPage(
  items: PdfTextItem[],
  rowTokens: PdfTextItem[],
  searchStr: string,
  fieldValue: number | null | undefined,
): { labelBbox: BBox; item: PdfTextItem; numericDistance: number } | null {
  const needle = searchStr.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!needle) return null;

  const exactSingle = items.filter(it =>
    it.str.toLowerCase().replace(/\s+/g, ' ').trim() === needle
  );
  const exactRow = rowTokens.filter(rt =>
    rt.str.toLowerCase().replace(/\s+/g, ' ').trim() === needle
  );
  const startRow = rowTokens.filter(rt =>
    rt.str.toLowerCase().replace(/\s+/g, ' ').trimStart().startsWith(needle)
  );
  const containsRow = rowTokens.filter(rt => {
    const rowStr = rt.str.toLowerCase().replace(/\s+/g, ' ');
    return rowStr.includes(needle);
  });
  const needleContainsRow = rowTokens.filter(rt => {
    const rowStr = rt.str.toLowerCase().replace(/\s+/g, ' ').trim();
    return rowStr.length >= 8 && needle.includes(rowStr);
  });
  const keywords = needle
    .replace(/[^a-z\u00e0\u00e8\u00e9\u00ec\u00f2\u00f9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
  const kwMatches: PdfTextItem[] = [];
  if (keywords.length > 0) {
    const threshold70 = Math.max(1, Math.ceil(keywords.length * 0.7));
    for (const pool of [rowTokens, items]) {
      for (const it of pool) {
        const txt   = it.str.toLowerCase();
        const count = keywords.filter(w => txt.includes(w)).length;
        if (count >= threshold70) kwMatches.push(it);
      }
      if (kwMatches.length > 0) break;
    }
  }

  const candidates: PdfTextItem[] = [];
  const seen = new Set<number>();
  for (const it of [...exactSingle, ...exactRow, ...startRow, ...containsRow, ...needleContainsRow, ...kwMatches]) {
    const key = it.transform[4] * 10000 + it.transform[5];
    if (!seen.has(key)) { seen.add(key); candidates.push(it); }
  }
  if (candidates.length === 0) return null;

  let bestCandidate: PdfTextItem | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const { numericDistance } = findNumericNeighbor(items, c, fieldValue);
    if (numericDistance < bestDist) {
      bestDist      = numericDistance;
      bestCandidate = c;
    }
  }
  if (!bestCandidate) bestCandidate = candidates[0];

  const tf = bestCandidate.transform;
  return {
    labelBbox: { x0: tf[4], y0: tf[5], x1: tf[4] + bestCandidate.width, y1: tf[5] + bestCandidate.height },
    item: bestCandidate,
    numericDistance: bestDist,
  };
}

// ---------------------------------------------------------------------------
// findAllMatchesForPrefix
// ---------------------------------------------------------------------------
function findAllMatchesForPrefix(
  items: PdfTextItem[],
  rowTokens: PdfTextItem[],
  prefix: string,
): PdfTextItem[] {
  const needle = prefix.toLowerCase().trim();
  if (!needle) return [];
  const seen = new Set<number>();
  const result: PdfTextItem[] = [];
  for (const pool of [rowTokens, items]) {
    for (const it of pool) {
      const key = it.transform[4] * 10000 + it.transform[5];
      if (seen.has(key)) continue;
      const txt = it.str.toLowerCase().replace(/\s+/g, ' ').trimStart();
      if (txt.startsWith(needle)) {
        seen.add(key);
        result.push(it);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// findBboxForField
// ---------------------------------------------------------------------------
async function findBboxForField(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  fieldKey: BalanceFieldKey | null,
  field: ExtractedField<unknown>,
): Promise<{ bboxes: BBox[]; isMultiSum: boolean } | null> {
  try {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items   = content.items as PdfTextItem[];
    const rows    = buildRowTokens(items);
    const fv      = typeof field.value === 'number' ? field.value : null;
    const rawLabel = (field.rawLabel ?? '').trim();
    const rawText  = (field.rawText  ?? '').trim();

    if (rawText.includes('\n')) {
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const allBboxes: BBox[] = [];

      for (const line of lines) {
        const parts      = line.split('\t');
        const labelPart  = parts[0].trim();
        const lineValue  = parts.length > 1 ? parseIT(parts[1].trim()) : null;
        const lineValArg = (lineValue !== null && !isNaN(lineValue) && lineValue !== 0)
          ? lineValue : null;

        if (!labelPart) continue;

        const match = matchLabelInPage(items, rows, labelPart, lineValArg);
        if (!match) continue;

        allBboxes.push(match.labelBbox);

        const { numBbox } = findNumericNeighbor(items, match.item, lineValArg);
        if (numBbox) allBboxes.push(numBbox);
      }

      if (allBboxes.length === 0 && rawLabel) {
        const matches = findAllMatchesForPrefix(items, rows, rawLabel);
        for (const m of matches) {
          const tf = m.transform;
          allBboxes.push({ x0: tf[4], y0: tf[5], x1: tf[4] + m.width, y1: tf[5] + m.height });
        }
      }

      if (allBboxes.length > 0) return { bboxes: allBboxes, isMultiSum: true };
      return null;
    }

    const schemaLabels = fieldKey ? getSearchLabels(fieldKey) : [];
    const aiLabel      = rawLabel;
    const allLabels    = aiLabel && !schemaLabels.includes(aiLabel)
      ? [...schemaLabels, aiLabel]
      : schemaLabels;

    let lastTextOnlyMatch: { labelBbox: BBox; item: PdfTextItem } | null = null;

    for (let li = 0; li < allLabels.length; li++) {
      const searchStr = allLabels[li];
      if (!searchStr) continue;

      const match = matchLabelInPage(items, rows, searchStr, fv);
      if (!match) continue;

      const { numBbox } = findNumericNeighbor(items, match.item, fv);
      if (numBbox !== null) {
        return { bboxes: [match.labelBbox, numBbox], isMultiSum: false };
      }
      if (!lastTextOnlyMatch) {
        lastTextOnlyMatch = { labelBbox: match.labelBbox, item: match.item };
      }
    }

    if (lastTextOnlyMatch) {
      return { bboxes: [lastTextOnlyMatch.labelBbox], isMultiSum: false };
    }

    return null;
  } catch {
    return null;
  }
}

async function findBboxForFreeText(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  text: string,
): Promise<BBox[]> {
  try {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items   = content.items as PdfTextItem[];
    const words   = text
      .toLowerCase()
      .replace(/[^\w\u00c0-\u00ff\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4)
      .slice(0, 6);
    if (words.length === 0) return [];
    const threshold   = Math.max(1, Math.ceil(words.length * 0.5));
    const rowTokens   = buildRowTokens(items);
    const matchedRow  = rowTokens.filter(rt => {
      const txt   = rt.str.toLowerCase();
      const count = words.filter(w => txt.includes(w)).length;
      return count >= threshold;
    });
    const matched = matchedRow.length > 0
      ? matchedRow
      : items.filter(it => {
          const txt   = it.str.toLowerCase();
          const count = words.filter(w => txt.includes(w)).length;
          return count >= threshold;
        });
    if (matched.length === 0) {
      const fb = rowTokens.find(rt => rt.str.toLowerCase().includes(words[0]))
               ?? items.find(it => it.str.toLowerCase().includes(words[0]));
      if (fb) return [{ x0: fb.transform[4], y0: fb.transform[5], x1: fb.transform[4] + fb.width, y1: fb.transform[5] + fb.height }];
      return [];
    }
    return matched.slice(0, 3).map(it => {
      const tf = it.transform;
      return { x0: tf[4], y0: tf[5], x1: tf[4] + it.width, y1: tf[5] + it.height };
    });
  } catch {
    return [];
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
  readOnly?: boolean;
}

const NumericInput: React.FC<NumericInputProps> = ({ value, onChange, onFocus, className, isUnavailable, readOnly }) => {
  const [displayValue, setDisplayValue] = useState(isUnavailable ? '' : formatIT(value ?? 0));
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) setDisplayValue(isUnavailable ? '' : formatIT(value ?? 0));
  }, [value, isUnavailable]);

  return (
    <input
      type="text" inputMode="numeric" className={className}
      value={displayValue}
      readOnly={readOnly}
      placeholder={isUnavailable ? 'n.d.' : '0'}
      onFocus={e => { if (!readOnly) { isEditing.current = true; e.target.select(); } onFocus?.(); }}
      onChange={e => { if (!readOnly) setDisplayValue(e.target.value.replace(/[^0-9.,-]/g, '')); }}
      onBlur={() => {
        if (readOnly) return;
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
const HIGHLIGHT_LABEL_COLOR     = { bg: 'rgba(59,130,246,0.22)',  border: 'rgba(59,130,246,0.85)' };
const HIGHLIGHT_VALUE_COLOR     = { bg: 'rgba(16,185,129,0.28)',  border: 'rgba(16,185,129,0.90)' };
const HIGHLIGHT_MULTIROW_COLOR  = { bg: 'rgba(139,92,246,0.20)',  border: 'rgba(139,92,246,0.85)' };
const HIGHLIGHT_CHECKLIST_COLOR = { bg: 'rgba(239,68,68,0.18)',   border: 'rgba(239,68,68,0.85)' };

interface ActiveHighlight {
  page:         number;
  bboxes:       BBox[];
  segmentNames: string[];
  color:        string;
  isMultiSum:   boolean;
  isChecklist?: boolean;
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
  const cssViewportRef   = useRef<pdfjsLib.PageViewport | null>(null);

  useEffect(() => { highlightRef.current = highlight; }, [highlight]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  const drawHighlights = useCallback((hl: ActiveHighlight | null, viewport: pdfjsLib.PageViewport) => {
    const hlDiv = hlLayerRef.current;
    if (!hlDiv) return;
    hlDiv.innerHTML = '';
    if (!hl || hl.bboxes.length === 0) return;
    hl.bboxes.forEach((bbox, idx) => {
      if (isBboxEmpty(bbox)) return;
      let colors: { bg: string; border: string };
      if (hl.isChecklist) {
        colors = HIGHLIGHT_CHECKLIST_COLOR;
      } else if (hl.isMultiSum) {
        colors = idx % 2 === 0 ? HIGHLIGHT_MULTIROW_COLOR : HIGHLIGHT_VALUE_COLOR;
      } else {
        colors = idx === 0 ? HIGHLIGHT_LABEL_COLOR : HIGHLIGHT_VALUE_COLOR;
      }
      const [ax, ay] = viewport.convertToViewportPoint(bbox.x0, bbox.y1);
      const [bx, by] = viewport.convertToViewportPoint(bbox.x1, bbox.y0);
      const x = Math.min(ax, bx);
      const y = Math.min(ay, by);
      const w = Math.abs(bx - ax);
      const h = Math.abs(by - ay);
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

  const drawHighlightsOnly = useCallback((hl: ActiveHighlight | null) => {
    const vp = cssViewportRef.current;
    if (!vp) {
      requestAnimationFrame(() => {
        const vp2 = cssViewportRef.current;
        if (vp2) drawHighlights(hl, vp2);
      });
      return;
    }
    drawHighlights(hl, vp);
  }, [drawHighlights]);

  const doRender = useCallback(async (seq: number) => {
    const pdf    = pdfDocRef.current;
    const canvas = canvasRef.current;
    const tlDiv  = textLayerRef.current;
    const page   = currentPageRef.current;
    const hl     = highlightRef.current;
    if (!pdf || !canvas || !tlDiv) return;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /**/ } renderTaskRef.current = null; }
    if (textLayerTaskRef.current) { try { textLayerTaskRef.current.cancel(); } catch { /**/ } textLayerTaskRef.current = null; }
    try {
      const pdfPage = await pdf.getPage(page);
      if (seq !== renderSeqRef.current) return;
      const dpr        = window.devicePixelRatio || 1;
      const BASE_SCALE = 1.5;
      const canvasViewport = pdfPage.getViewport({ scale: BASE_SCALE * dpr });
      const cssViewport    = pdfPage.getViewport({ scale: BASE_SCALE });
      cssViewportRef.current = cssViewport;
      canvas.width  = canvasViewport.width;
      canvas.height = canvasViewport.height;
      const cssW = cssViewport.width;
      const cssH = cssViewport.height;
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      tlDiv.style.width  = `${cssW}px`;
      tlDiv.style.height = `${cssH}px`;
      tlDiv.innerHTML    = '';
      if (hlLayerRef.current) {
        hlLayerRef.current.style.width  = `${cssW}px`;
        hlLayerRef.current.style.height = `${cssH}px`;
        hlLayerRef.current.innerHTML    = '';
      }
      const ctx  = canvas.getContext('2d')!;
      const task = pdfPage.render({ canvasContext: ctx, viewport: canvasViewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      if (seq !== renderSeqRef.current) return;
      const textContent = await pdfPage.getTextContent();
      if (seq !== renderSeqRef.current) return;
      const tl = new TextLayer({
        textContentSource: textContent,
        container: tlDiv,
        viewport: cssViewport,
      });
      textLayerTaskRef.current = tl;
      await tl.render();
      textLayerTaskRef.current = null;
      if (seq !== renderSeqRef.current) return;
      if (hl && hl.page === page) drawHighlights(hl, cssViewport);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException')
        console.warn('[PdfViewer] render error:', e);
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
    cssViewportRef.current = null;
    renderSeqRef.current++;
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
    if (!pdfDocRef.current) return;
    const targetPage = highlight?.page ?? null;
    if (targetPage && targetPage !== currentPageRef.current) {
      currentPageRef.current = targetPage;
      setCurrentPage(targetPage);
      requestRender();
    } else {
      drawHighlightsOnly(highlight);
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
    if (highlight.isChecklist) return [{ color: HIGHLIGHT_CHECKLIST_COLOR.border, name: 'Fonte checklist' }];
    if (highlight.isMultiSum) {
      return [{
        color: HIGHLIGHT_MULTIROW_COLOR.border,
        name: `${visibleBboxes.length} elementi evidenziati (campo multi-riga)`,
      }];
    }
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
      <div className="flex-1 overflow-auto flex justify-center p-4 bg-slate-100"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
        <div ref={containerRef} className="relative shadow-2xl inline-block">
          <canvas ref={canvasRef} className="block" />
          <div ref={textLayerRef} className="pdfTextLayer"
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
          <div ref={hlLayerRef}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
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
// Definizione campi
// ---------------------------------------------------------------------------
const YEAR_FIELDS: { key: BalanceFieldKey; label: string }[] = [
  { key: 'ricavi',               label: 'Ricavi' },
  { key: 'ebit',                 label: 'EBIT' },
  { key: 'ammortamenti',         label: 'Ammortamenti' },
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

// ---------------------------------------------------------------------------
// Componente principale DataVerification
// ---------------------------------------------------------------------------
interface Props {
  files: File[];
  extractedData: ExtractedData;
  onApprove: (updatedData: ExtractedData) => void | Promise<void>;
  readOnly?: boolean;
  onRegenerateNarrative?: (finalData: ExtractedData) => void;
}

export const DataVerification: React.FC<Props> = ({
  files,
  extractedData,
  onApprove,
  readOnly = false,
  onRegenerateNarrative,
}) => {
  const [data, setData]                       = useState<ExtractedData>(JSON.parse(JSON.stringify(extractedData)));
  const [activeTab, setActiveTab]             = useState(0);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null);
  const [showGseError, setShowGseError]       = useState(false);

  // Valido solo se è un numero strettamente maggiore di 0
  const gseResidualValid =
    data.gseResidual?.value !== null &&
    data.gseResidual?.value !== undefined &&
    data.gseResidual.value > 0;

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
    fieldKey: BalanceFieldKey,
    field: ExtractedField<unknown> | null,
    fileIdx: number,
  ) => {
    const color = HIGHLIGHT_COLORS[fileIdx] ?? HIGHLIGHT_COLORS[0];
    if (!field?.page) { setActiveHighlight(null); return; }
    setActiveHighlight({ page: field.page, bboxes: [EMPTY_BBOX], segmentNames: [], color, isMultiSum: false });
    if (!files[fileIdx]) return;
    try {
      const doc    = await getPdfDoc(fileIdx, files[fileIdx]);
      const result = await findBboxForField(doc, field.page, fieldKey, field);
      if (!result) return;
      setActiveHighlight({
        page:         field.page,
        bboxes:       result.bboxes,
        segmentNames: [],
        color,
        isMultiSum:   result.isMultiSum,
      });
    } catch { /**/ }
  }, [files, getPdfDoc]);

  const handleChecklistClick = useCallback(async (
    fonteTestuale: string | null | undefined,
    page: number | null | undefined,
    fileIdx: number,
  ) => {
    if (!fonteTestuale || !page || !files[fileIdx]) { setActiveHighlight(null); return; }
    setActiveHighlight({ page, bboxes: [EMPTY_BBOX], segmentNames: [], color: 'rgba(239,68,68,0.35)', isMultiSum: false, isChecklist: true });
    try {
      const doc    = await getPdfDoc(fileIdx, files[fileIdx]);
      const bboxes = await findBboxForFreeText(doc, page, fonteTestuale);
      setActiveHighlight({ page, bboxes: bboxes.length > 0 ? bboxes : [EMPTY_BBOX], segmentNames: [], color: 'rgba(239,68,68,0.35)', isMultiSum: false, isChecklist: true });
    } catch { /**/ }
  }, [files, getPdfDoc]);

  const updateYearField = (yearIdx: number, key: BalanceFieldKey, value: number | null) => {
    if (readOnly) return;
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as ExtractedData;
      (next.yearsData[yearIdx][key] as ExtractedField<number>).value = value;
      computeDerivedFields(next.yearsData[yearIdx]);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!gseResidualValid) {
      setShowGseError(true);
      setActiveTab(0);
      return;
    }
    onApprove(data);
  };

  const tabLabels = ['Importo GSE', ...data.yearsData.map(y => `Bilancio ${y.year || (data.yearsData.indexOf(y) + 1)}`)];
  const tabColors = [
    gseResidualValid
      ? 'border-purple-500 text-purple-700 bg-purple-50'
      : 'border-red-500 text-red-700 bg-red-50',
    'border-blue-500 text-blue-700 bg-blue-50',
    'border-emerald-500 text-emerald-700 bg-emerald-50',
    'border-amber-500 text-amber-700 bg-amber-50',
  ];
  const tabColorsInactive = [
    gseResidualValid
      ? 'text-slate-500 hover:text-purple-600 hover:bg-purple-50'
      : 'text-red-400 hover:text-red-600 hover:bg-red-50',
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
              {i === 0 && !gseResidualValid && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-1 align-middle" />
              )}
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

              {showGseError && !gseResidualValid && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-700">Campo obbligatorio</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Inserisci un importo residuo GSE maggiore di zero per proseguire.
                    </p>
                  </div>
                </div>
              )}

              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Ammontare residuo GSE (&euro;)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">&euro;</span>
                <NumericInput
                  value={data.gseResidual?.value}
                  readOnly={readOnly}
                  className={`w-full pl-8 pr-3 py-3 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 transition ${
                    showGseError && !gseResidualValid
                      ? 'border-red-400 ring-1 ring-red-300 bg-red-50 focus:ring-red-400'
                      : readOnly
                      ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-default'
                      : 'border-slate-300 focus:ring-purple-400 focus:border-transparent'
                  }`}
                  onChange={n => {
                    if (readOnly) return;
                    setData(prev => ({ ...prev, gseResidual: { ...prev.gseResidual, value: n } }));
                    if (n !== null && n > 0) setShowGseError(false);
                  }}
                />
              </div>
              {data.gseResidual?.rawText && (
                <p className="mt-2 text-xs text-slate-400 italic">Testo estratto: &ldquo;{data.gseResidual.rawText}&rdquo;</p>
              )}
              <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                <strong>Nota:</strong> se il documento GSE non era allegato o l&apos;importo non è stato trovato
                automaticamente, inserisci il valore manualmente. Il campo accetta solo valori positivi.
              </p>
            </div>
          )}

          {activeTab >= 1 && (() => {
            const yearIdx = activeTab - 1;
            const year    = data.yearsData[yearIdx];
            if (!year) return null;
            const ebitdaField = year.ebitda as DerivedField<number>;

            return (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 mb-1">
                  {readOnly
                    ? 'Dati del report in sola lettura. Usa "Rigenera narrativa" per aggiornare il testo.'
                    : 'Verifica e correggi i dati estratti. Clicca su un campo per evidenziare la voce nel PDF.'}
                </p>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Anno di Esercizio</label>
                  <input
                    className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                      readOnly ? 'bg-slate-50 text-slate-500 cursor-default' : 'bg-slate-50 text-slate-700'
                    }`}
                    value={year.year ?? ''}
                    readOnly={readOnly}
                    onChange={e => {
                      if (readOnly) return;
                      setData(prev => {
                        const next = JSON.parse(JSON.stringify(prev)) as ExtractedData;
                        next.yearsData[yearIdx].year = e.target.value;
                        return next;
                      });
                    }}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1 flex-wrap text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    EBITDA
                    <span className="ml-1 text-[9px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 rounded px-1 py-0.5">calcolato</span>
                  </label>
                  <NumericInput
                    value={ebitdaField?.value}
                    readOnly={true}
                    className="w-full px-3 py-2 border border-sky-200 rounded-lg text-sm bg-sky-50 text-sky-700 font-semibold cursor-default select-none"
                    onChange={() => { /* sola lettura */ }}
                  />
                  {ebitdaField?.formula && (
                    <p className="mt-0.5 text-[10px] text-sky-500 italic">{ebitdaField.formula}</p>
                  )}
                </div>

                {YEAR_FIELDS.map(({ key, label }) => {
                  const field      = year[key] as ExtractedField<number>;
                  const isUnavail  = field?.value === null && !!field?.rawText;
                  const hasPage    = !!field?.page;
                  const isMultiRow = isMultiLineField(field);
                  const rowCount   = isMultiRow ? countRawLines(field) : 0;
                  const caption    = field ? captionText(field) : '';
                  const schemaHint = BALANCE_SCHEMA[key]?.primary ?? '';

                  return (
                    <div key={key as string}>
                      <label className="flex items-center gap-1 flex-wrap text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        {label}
                        {hasPage && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-slate-400">
                            <ChevronRight className="w-2.5 h-2.5" /> p.{field.page}
                          </span>
                        )}
                        {isMultiRow && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1 py-0.5">
                            <Layers className="w-2.5 h-2.5" /> multi-riga
                          </span>
                        )}
                        {isUnavail && (
                          <span className="ml-1 text-[9px] font-semibold text-amber-500 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">non disponibile</span>
                        )}
                      </label>
                      <NumericInput
                        value={field?.value}
                        isUnavailable={isUnavail}
                        readOnly={readOnly}
                        className={`w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2 ${
                          readOnly
                            ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-default'
                            : isMultiRow
                            ? 'border-violet-200 bg-violet-50 text-violet-800 focus:ring-violet-300 cursor-pointer font-semibold'
                            : isUnavail
                            ? 'border-amber-200 bg-amber-50 text-amber-600 focus:ring-amber-300 cursor-pointer italic'
                            : hasPage
                            ? 'border-slate-200 focus:ring-blue-300 cursor-pointer'
                            : 'border-slate-200 focus:ring-slate-300'
                        }`}
                        onFocus={() => handleFieldFocus(key, field, yearIdx)}
                        onChange={n => updateYearField(yearIdx, key, n)}
                      />
                      {isMultiRow && field?.value !== null && field?.value !== undefined && (
                        <p className="mt-0.5 text-[10px] text-violet-600 font-semibold flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          &Sigma;&nbsp;=&nbsp;&euro;&nbsp;{formatIT(field.value)}
                          <span className="text-violet-400 font-normal">({rowCount}&nbsp;voci)</span>
                        </p>
                      )}
                      {caption && !isMultiRow && (
                        <p className="mt-0.5 text-[10px] text-slate-400 italic" title={schemaHint}>&laquo;{caption}&raquo;</p>
                      )}
                      {caption && isMultiRow && (
                        <p className="mt-0.5 text-[10px] text-violet-400 italic" title={schemaHint}>&laquo;{caption}&raquo;</p>
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
                    Voci ricercate nel documento dal modello AI. Clicca su una voce per evidenziare la fonte nel PDF.
                  </p>
                  <div className="space-y-3">
                    {CHECKLIST_LABELS.map(({ key, label }) => {
                      const item       = checklist[key];
                      const isPres     = item?.presente;
                      const hasSource  = !!(item?.fonteTestuale && item.page);
                      const badgeBg    = isPres ? 'bg-red-50 border-red-200'   : 'bg-emerald-50 border-emerald-200';
                      const badgeText  = isPres ? 'text-red-700'               : 'text-emerald-700';
                      const badgeLabel = isPres ? '\u26a0 Presente'            : '\u2713 Assente';
                      return (
                        <div key={key}
                          className={`rounded-lg border p-3 ${badgeBg} ${hasSource ? 'cursor-pointer hover:brightness-95 transition-all' : ''}`}
                          onClick={() => { if (hasSource) handleChecklistClick(item.fonteTestuale, item.page, yearIdx); }}
                          title={hasSource ? 'Clicca per evidenziare nel PDF' : undefined}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-600 leading-tight">{label}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {hasSource && (
                                <span className="text-[9px] font-medium text-indigo-500 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 flex items-center gap-0.5">
                                  <FileSearch className="w-2 h-2" /> p.{item.page}
                                </span>
                              )}
                              <span className={`text-[10px] font-bold whitespace-nowrap ${badgeText}`}>{badgeLabel}</span>
                            </div>
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

        {/* ---- Footer con bottone conferma / rigenera ---- */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          {readOnly ? (
            <button
              onClick={() => onRegenerateNarrative?.(data)}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 font-semibold rounded-xl transition-colors shadow-sm bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white"
            >
              <RefreshCw className="w-5 h-5" />
              Rigenera narrativa
            </button>
          ) : (
            <>
              {!gseResidualValid && (
                <p className="text-[11px] text-amber-600 text-center mb-2 flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Importo GSE obbligatorio e &gt; 0 — vai al tab &ldquo;Importo GSE&rdquo;
                </p>
              )}
              <button
                onClick={handleConfirm}
                disabled={!gseResidualValid}
                className={`w-full flex items-center justify-center gap-2 py-3 px-6 font-semibold rounded-xl transition-colors shadow-sm ${
                  gseResidualValid
                    ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                Conferma dati e genera report
              </button>
            </>
          )}
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
