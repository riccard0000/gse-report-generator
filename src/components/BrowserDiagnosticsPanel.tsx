/**
 * BrowserDiagnosticsPanel.tsx
 * Pannello UI per eseguire e visualizzare i controlli browser autonomi.
 */
import React, { useState, useCallback } from 'react';
import {
  runBrowserDiagnostics,
  type DiagnosticRun,
  type DiagnosticCheck,
  type DiagnosticStatus,
} from '../lib/browserDiagnostics';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Download, Clock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  DiagnosticStatus,
  { icon: React.ReactNode; textClass: string; bgClass: string; borderClass: string; label: string }
> = {
  ok: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    label: 'OK',
  },
  warn: {
    icon: <AlertTriangle className="w-4 h-4" />,
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    label: 'WARN',
  },
  error: {
    icon: <XCircle className="w-4 h-4" />,
    textClass: 'text-red-700',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
    label: 'ERR',
  },
};

function CheckRow({ check }: { check: DiagnosticCheck }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[check.status];

  return (
    <div
      className={`rounded-lg border ${cfg.borderClass} ${cfg.bgClass} px-3 py-2 text-sm`}
    >
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => check.details && setExpanded((v) => !v)}
      >
        <span className={cfg.textClass}>{cfg.icon}</span>
        <span className="flex-1 font-medium text-slate-800">{check.label}</span>
        <span className={`text-xs font-semibold ${cfg.textClass}`}>{cfg.label}</span>
        <span className="text-xs text-slate-400 tabular-nums">{check.durationMs} ms</span>
        {check.details && (
          <span className="text-xs text-slate-400">{expanded ? '▲' : '▼'}</span>
        )}
      </div>
      <p className={`mt-0.5 text-xs ${cfg.textClass} pl-6`}>{check.message}</p>
      {expanded && check.details && (
        <pre className="mt-2 ml-6 text-[10px] bg-white/60 rounded p-2 overflow-x-auto text-slate-600 whitespace-pre-wrap">
          {JSON.stringify(check.details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principale
// ---------------------------------------------------------------------------

export function BrowserDiagnosticsPanel() {
  const [run, setRun] = useState<DiagnosticRun | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRun(null);
    try {
      const result = await runBrowserDiagnostics();
      setRun(result);
    } finally {
      setRunning(false);
    }
  }, []);

  const handleExport = useCallback(() => {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostics-${run.startedAt.replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [run]);

  const summary = run
    ? {
        ok: run.checks.filter((c) => c.status === 'ok').length,
        warn: run.checks.filter((c) => c.status === 'warn').length,
        error: run.checks.filter((c) => c.status === 'error').length,
        total: run.checks.length,
      }
    : null;

  const elapsed = run
    ? Math.round(
        (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())
      )
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Diagnostica Browser</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verifica autonoma di GitHub Pages, proxy, PDF worker e matcher.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {run && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-300 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              title="Scarica report JSON"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'In corso…' : 'Esegui check'}
          </button>
        </div>
      </div>

      {/* Barra riepilogo */}
      {summary && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-700 font-semibold">{summary.ok} ok</span>
          {summary.warn > 0 && (
            <span className="text-amber-700 font-semibold">{summary.warn} warn</span>
          )}
          {summary.error > 0 && (
            <span className="text-red-700 font-semibold">{summary.error} errori</span>
          )}
          <span className="text-slate-400 text-xs ml-auto flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {elapsed} ms totali
          </span>
        </div>
      )}

      {/* Lista check */}
      {running && (
        <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Esecuzione check in corso…
        </div>
      )}

      {run && !running && (
        <div className="space-y-2">
          {run.checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
          <p className="text-[10px] text-slate-400 pt-1">
            Avviato: {new Date(run.startedAt).toLocaleTimeString('it-IT')} —
            Completato: {new Date(run.finishedAt).toLocaleTimeString('it-IT')}
          </p>
        </div>
      )}

      {!run && !running && (
        <p className="text-sm text-slate-400 italic">
          Premi «Esegui check» per avviare la diagnostica.
        </p>
      )}
    </div>
  );
}
