/**
 * browserDiagnostics.ts
 * Esegue una serie di check autonomi nel browser per verificare la raggiungibilità
 * di GitHub Pages, degli asset, del PDF worker, del proxy e dei PDF di test GEOSOL.
 * Include anche un contract-test sul tipo discriminato MatchResult (single/formula/multi-sum).
 */

export type DiagnosticStatus = 'ok' | 'warn' | 'error';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

export interface DiagnosticRun {
  startedAt: string;
  finishedAt: string;
  checks: DiagnosticCheck[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://riccard0000.github.io/gse-report-generator';
const PROXY_URL = 'https://gse-proxy.riccardoooo.workers.dev';
const PDF_WORKER_URL =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const PDF_FILES = [
  { id: 'pdf-2022', label: 'PDF GEOSOL 2022', name: 'OUTLASTBILIC0163700089220202220GEOSOL.pdf' },
  { id: 'pdf-2023', label: 'PDF GEOSOL 2023', name: 'OUTLASTBILIC0163700089220202320GEOSOL.pdf' },
  { id: 'pdf-2024', label: 'PDF GEOSOL 2024', name: 'OUTLASTBILIC0163700089220202420GEOSOL.pdf' },
];

async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<{ res: Response; durationMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { res, durationMs: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkGet(
  id: string,
  label: string,
  url: string,
  mode: RequestMode = 'cors'
): Promise<DiagnosticCheck> {
  try {
    const { res, durationMs } = await timedFetch(url, { method: 'GET', mode });
    return {
      id,
      label,
      status: res.ok ? 'ok' : 'error',
      message: res.ok ? `HTTP ${res.status}` : `HTTP ${res.status} ${res.statusText}`,
      durationMs,
      details: { url, status: res.status },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = msg.toLowerCase().includes('abort');
    return {
      id,
      label,
      status: 'error',
      message: isAbort ? 'Timeout (>10 s)' : msg,
      durationMs: 10_000,
      details: { url },
    };
  }
}

// ---------------------------------------------------------------------------
// Check 1 — GitHub Pages root
// ---------------------------------------------------------------------------
async function checkGitHubPages(): Promise<DiagnosticCheck> {
  return checkGet('github-pages-root', 'GitHub Pages (root app)', `${BASE_URL}/`, 'no-cors').then(
    (c) => ({
      ...c,
      // no-cors → opaque → res.ok è sempre false; usiamo status 0 come successo opaco
      status: c.details?.status === 0 || c.status === 'ok' ? 'ok' : c.status,
      message:
        c.details?.status === 0 ? 'Raggiungibile (opaque)' : c.message,
    })
  );
}

// ---------------------------------------------------------------------------
// Check 2 — PDF.js worker CDN
// ---------------------------------------------------------------------------
async function checkPdfWorker(): Promise<DiagnosticCheck> {
  return checkGet('pdf-worker', 'PDF.js worker (jsDelivr CDN)', PDF_WORKER_URL, 'cors');
}

// ---------------------------------------------------------------------------
// Check 3 — Proxy /config
// ---------------------------------------------------------------------------
async function checkProxyConfig(): Promise<DiagnosticCheck> {
  return checkGet('proxy-config', 'Proxy /config', `${PROXY_URL}/config`, 'cors');
}

// ---------------------------------------------------------------------------
// Check 4 — Proxy CORS (OPTIONS preflight)
// ---------------------------------------------------------------------------
async function checkProxyCors(): Promise<DiagnosticCheck> {
  const id = 'proxy-cors';
  const label = 'Proxy CORS (OPTIONS preflight)';
  try {
    const t0 = performance.now();
    const res = await fetch(PROXY_URL, {
      method: 'OPTIONS',
      mode: 'cors',
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    const durationMs = Math.round(performance.now() - t0);
    const allow = res.headers.get('access-control-allow-origin') ?? '';
    const ok = res.ok || res.status === 204;
    return {
      id,
      label,
      status: ok ? 'ok' : 'warn',
      message: ok ? `CORS OK — origin: ${allow || '(non esposto)'}` : `HTTP ${res.status}`,
      durationMs,
      details: { status: res.status, allowOrigin: allow },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { id, label, status: 'error', message: msg, durationMs: 0 };
  }
}

// ---------------------------------------------------------------------------
// Check 5-7 — PDF GEOSOL (HEAD se possibile, fallback GET parziale)
// ---------------------------------------------------------------------------
async function checkPdf(id: string, label: string, fileName: string): Promise<DiagnosticCheck> {
  const url = `${BASE_URL}/${fileName}`;
  try {
    const { res, durationMs } = await timedFetch(url, { method: 'HEAD', mode: 'cors' });
    if (res.ok || res.status === 200) {
      const size = res.headers.get('content-length');
      return {
        id,
        label,
        status: 'ok',
        message: `Trovato${size ? ` (${Math.round(+size / 1024)} KB)` : ''}`,
        durationMs,
        details: { url, status: res.status, contentLength: size },
      };
    }
    // Alcuni server non supportano HEAD → riprova GET solo i primi 4 KB
    const { res: res2, durationMs: d2 } = await timedFetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { Range: 'bytes=0-4095' },
    });
    const ok2 = res2.ok || res2.status === 206;
    return {
      id,
      label,
      status: ok2 ? 'ok' : 'error',
      message: ok2 ? `Trovato (GET parziale, HTTP ${res2.status})` : `HTTP ${res2.status}`,
      durationMs: d2,
      details: { url, status: res2.status },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { id, label, status: 'error', message: msg, durationMs: 0, details: { url } };
  }
}

// ---------------------------------------------------------------------------
// Check 8 — MatchResult kind consistency (contract test lato browser)
// ---------------------------------------------------------------------------
function isCalculatedFormula(segments: string[]): boolean {
  // Specchia la logica di DataVerification.tsx
  if (segments.length < 2) return false;
  // Se ogni segmento non è una semplice voce contabile ma contiene un numero
  // dopo la parola chiave, la trattiamo come formula calcolata (es. "EBIT 160.638")
  const looksLikeValuedSegment = (s: string) => /\d/.test(s) && s.trim().length > 3;
  return segments.every(looksLikeValuedSegment);
}

type MatchKind = 'single' | 'formula' | 'multi-sum';

export function matchKindFromRawText(rawText: string | null | undefined): MatchKind {
  if (!rawText) return 'single';
  const segments = rawText.split('+').map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) return 'single';
  return isCalculatedFormula(segments) ? 'formula' : 'multi-sum';
}

interface ContractCase {
  rawText: string;
  expectedKind: MatchKind;
  label: string;
}

const CONTRACT_CASES: ContractCase[] = [
  {
    label: 'EBITDA (formula calcolata)',
    rawText: 'EBIT 160.638 + ammortamenti 145.786',
    expectedKind: 'formula',
  },
  {
    label: 'Debiti tributari (somma di righe)',
    rawText: 'Erario c/IRES + IRAP + ritenute',
    expectedKind: 'multi-sum',
  },
  {
    label: 'Ricavi (voce singola)',
    rawText: 'Totale valore della produzione 235.589',
    expectedKind: 'single',
  },
  {
    label: 'rawText null',
    rawText: '',
    expectedKind: 'single',
  },
];

async function checkMatcherKindConsistency(): Promise<DiagnosticCheck> {
  const t0 = performance.now();
  const failures: string[] = [];

  for (const c of CONTRACT_CASES) {
    const got = matchKindFromRawText(c.rawText);
    if (got !== c.expectedKind) {
      failures.push(`"${c.label}": atteso "${c.expectedKind}", ottenuto "${got}"`);
    }
  }

  const durationMs = Math.round(performance.now() - t0);
  if (failures.length === 0) {
    return {
      id: 'matcher-kind-consistency',
      label: 'MatchResult kind consistency (DataVerification)',
      status: 'ok',
      message: `Tutti i ${CONTRACT_CASES.length} casi superati`,
      durationMs,
      details: { cases: CONTRACT_CASES.length },
    };
  }
  return {
    id: 'matcher-kind-consistency',
    label: 'MatchResult kind consistency (DataVerification)',
    status: 'error',
    message: `${failures.length} caso/i fallito/i`,
    durationMs,
    details: { failures },
  };
}

// ---------------------------------------------------------------------------
// Entry point principale
// ---------------------------------------------------------------------------
export async function runBrowserDiagnostics(): Promise<DiagnosticRun> {
  const startedAt = new Date().toISOString();

  const [ghPages, pdfWorker, proxyConfig, proxyCors, ...pdfChecks] = await Promise.all([
    checkGitHubPages(),
    checkPdfWorker(),
    checkProxyConfig(),
    checkProxyCors(),
    ...PDF_FILES.map((f) => checkPdf(f.id, f.label, f.name)),
  ]);

  const matcherCheck = await checkMatcherKindConsistency();

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    checks: [ghPages, pdfWorker, proxyConfig, proxyCors, ...pdfChecks, matcherCheck],
  };
}
