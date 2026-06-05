import React, { useEffect, useState, useCallback } from 'react';
import {
  History, Download, Eye, X, Loader2, AlertCircle,
  FlaskConical, ChevronRight, CheckCircle2, Clock,
} from 'lucide-react';
import { ExtractionMeta, ExtractionRecord, ExtractedData } from '../types';
import { listHistory, getHistoryRecord } from '../lib/extractionStorage';
import { MOCK_EXTRACTED_DATA } from '../mockData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// DiffViewer — confronto campo per campo tra dati AI e dati confermati
// ---------------------------------------------------------------------------
const YEAR_FIELDS = [
  'ricavi','ebit','ammortamenti','utileNetto','interessiPassivi',
  'totaleAttivo','patrimonioNetto','totaleDebiti','debitiBancheBreve','debitiBancheML',
  'disponibilitaLiquide','creditiEntro12Mesi','rimanenze','attivoCircolante',
  'passivitaCorrenti','debitiTributari','debitiPrevidenziali','fondoRischiOneri',
] as const;
type YearFieldKey = typeof YEAR_FIELDS[number];

interface DiffRowProps { label: string; valA: unknown; valB: unknown; labelA: string; labelB: string; }
const DiffRow: React.FC<DiffRowProps> = ({ label, valA, valB, labelA, labelB }) => {
  const strA  = valA === null || valA === undefined ? 'null' : String(valA);
  const strB  = valB === null || valB === undefined ? 'null' : String(valB);
  const equal = strA === strB;
  return (
    <tr className={`border-b border-slate-100 text-xs ${equal ? '' : 'bg-amber-50'}`}>
      <td className="py-1 px-2 text-slate-500 font-mono w-48 truncate">{label}</td>
      <td className={`py-1 px-2 font-mono ${equal ? 'text-green-700' : 'text-blue-700 font-semibold'}`} title={labelA}>{strA}</td>
      <td className={`py-1 px-2 font-mono ${equal ? 'text-green-700' : 'text-amber-700 font-semibold'}`} title={labelB}>{strB}</td>
    </tr>
  );
};

interface DiffViewerProps { record: ExtractionRecord; }
const DiffViewer: React.FC<DiffViewerProps> = ({ record }) => {
  const ai       = record.extractedData;
  const conf     = record.confirmedData;
  const labelA   = 'Dati AI estratti';
  const labelB   = conf ? 'Dati confermati' : 'Mock atteso';
  const dataB    = conf ?? MOCK_EXTRACTED_DATA;

  return (
    <div className="overflow-auto">
      <div className="flex items-center gap-4 mb-3 text-xs">
        <span className="flex items-center gap-1.5 text-blue-700 font-medium"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />{labelA}</span>
        <span className="flex items-center gap-1.5 text-amber-700 font-medium"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />{labelB}</span>
        {!conf && <span className="text-slate-400 italic">(nessuna conferma ancora)</span>}
      </div>
      <table className="w-full border border-slate-200 rounded text-xs">
        <thead className="bg-slate-100 sticky top-0">
          <tr>
            <th className="py-1.5 px-2 text-left font-semibold text-slate-600">Campo</th>
            <th className="py-1.5 px-2 text-left font-semibold text-blue-700">{labelA}</th>
            <th className="py-1.5 px-2 text-left font-semibold text-amber-700">{labelB}</th>
          </tr>
        </thead>
        <tbody>
          <DiffRow label="companyName" valA={ai?.companyName?.value} valB={dataB?.companyName?.value} labelA={labelA} labelB={labelB} />
          <DiffRow label="vatNumber"   valA={ai?.vatNumber?.value}   valB={dataB?.vatNumber?.value}   labelA={labelA} labelB={labelB} />
          {(ai?.yearsData ?? []).map((yd) => {
            const ydB = dataB?.yearsData?.find(m => m.year === yd.year);
            return YEAR_FIELDS.map(key => (
              <DiffRow
                key={`${yd.year}-${key}`}
                label={`${yd.year} · ${key}`}
                valA={(yd[key as YearFieldKey] as { value?: unknown })?.value ?? null}
                valB={ydB ? (ydB[key as YearFieldKey] as { value?: unknown })?.value ?? null : '—'}
                labelA={labelA} labelB={labelB}
              />
            ));
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// JsonModal — modale con 3 tab: JSON AI, JSON confermato, Diff
// ---------------------------------------------------------------------------
interface JsonModalProps {
  meta:    ExtractionMeta;
  record:  ExtractionRecord;
  onClose: () => void;
}

const JsonModal: React.FC<JsonModalProps> = ({ meta, record, onClose }) => {
  const [tab, setTab] = useState<'extracted' | 'confirmed' | 'diff'>('extracted');

  const handleDownload = (data: ExtractedData | null, suffix: string) => {
    if (!data) return;
    const safeName = (meta.companyName || meta.vatNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadJson(data, `extraction_${safeName}_${suffix}_${meta.timestamp}.json`);
  };

  const tabs: { id: 'extracted' | 'confirmed' | 'diff'; label: string; disabled?: boolean }[] = [
    { id: 'extracted', label: 'JSON AI estratto' },
    { id: 'confirmed', label: 'JSON confermato', disabled: !record.confirmedData },
    { id: 'diff',      label: 'Confronto' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">{meta.companyName || meta.vatNumber}</h2>
            <p className="text-xs text-slate-500">{formatDate(meta.timestamp)} · anni: {meta.years.join(', ')} · step: <span className={`font-medium ${meta.step === 'confirmed' ? 'text-green-600' : 'text-amber-600'}`}>{meta.step}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload(record.extractedData, 'ai')}
              disabled={!record.extractedData}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Scarica AI
            </button>
            {record.confirmedData && (
              <button
                onClick={() => handleDownload(record.confirmedData, 'confermato')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Scarica Confermato
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => !t.disabled && setTab(t.id)}
              disabled={t.disabled}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id ? 'border-blue-600 text-blue-700'
                : t.disabled ? 'border-transparent text-slate-300 cursor-not-allowed'
                : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >{t.label}</button>
          ))}
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {tab === 'extracted' && (
            <pre className="text-xs font-mono bg-slate-50 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all leading-relaxed text-slate-800">
              {JSON.stringify(record.extractedData, null, 2)}
            </pre>
          )}
          {tab === 'confirmed' && record.confirmedData && (
            <pre className="text-xs font-mono bg-green-50 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all leading-relaxed text-slate-800">
              {JSON.stringify(record.confirmedData, null, 2)}
            </pre>
          )}
          {tab === 'diff' && <DiffViewer record={record} />}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ExtractionHistory — sidebar/pannello storico
// ---------------------------------------------------------------------------
export interface ExtractionHistoryProps {
  onLoadExtraction: (record: ExtractionRecord, meta: ExtractionMeta) => void;
}

export const ExtractionHistory: React.FC<ExtractionHistoryProps> = ({ onLoadExtraction }) => {
  const [list,        setList]        = useState<ExtractionMeta[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [loadingId,   setLoadingId]   = useState<string | null>(null);
  const [previewRec,  setPreviewRec]  = useState<{ meta: ExtractionMeta; record: ExtractionRecord } | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try { setList(await listHistory()); }
    catch { setError('Impossibile caricare lo storico.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const loadRecord = async (meta: ExtractionMeta): Promise<ExtractionRecord | null> => {
    setLoadingId(meta.id);
    const rec = await getHistoryRecord(meta.id);
    setLoadingId(null);
    if (!rec) { setError('Impossibile caricare il record.'); return null; }
    return rec;
  };

  const handleLoad = async (meta: ExtractionMeta) => {
    const rec = await loadRecord(meta);
    if (rec) onLoadExtraction(rec, meta);
  };

  const handlePreview = async (meta: ExtractionMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    const rec = await loadRecord(meta);
    if (rec) setPreviewRec({ meta, record: rec });
  };

  const handleDownload = async (meta: ExtractionMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    const rec = await loadRecord(meta);
    if (!rec) return;
    const safeName = (meta.companyName || meta.vatNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    // Scarica il payload più completo disponibile
    const data = rec.confirmedData ?? rec.extractedData;
    downloadJson({ extractedData: rec.extractedData, confirmedData: rec.confirmedData }, `history_${safeName}_${meta.timestamp}.json`);
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Storico estrazioni</span>
          </div>
          <button onClick={fetchList} disabled={loading} className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aggiorna'}
          </button>
        </div>

        {error && (
          <div className="mx-3 mt-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-700">{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {loading && list.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          )}
          {!loading && list.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <History className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400">Nessuna estrazione salvata.</p>
              <p className="text-xs text-slate-300 mt-1">Le estrazioni AI vengono salvate automaticamente.</p>
            </div>
          )}

          {list.map(meta => (
            <div
              key={meta.id}
              className="group mx-2 mb-1 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors cursor-pointer"
              onClick={() => handleLoad(meta)}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {meta.isDemoMode && <FlaskConical className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                      {meta.step === 'confirmed'
                        ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                        : <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      }
                      <span className="text-xs font-semibold text-slate-800 truncate">{meta.companyName || meta.vatNumber}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{formatDate(meta.timestamp)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Anni: {meta.years.join(', ')}</p>
                  </div>
                  {loadingId === meta.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mt-0.5 flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 mt-0.5 flex-shrink-0 transition-colors" />
                  }
                </div>
                {/* Step badge */}
                <div className="mt-1.5">
                  <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                    meta.step === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {meta.step === 'confirmed' ? 'Confermato' : 'Solo AI'}
                  </span>
                </div>
                {/* Azioni inline visibili su hover */}
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => handlePreview(meta, e)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 rounded-md transition-colors"
                  >
                    <Eye className="w-3 h-3" /> Anteprima
                  </button>
                  <button
                    onClick={e => handleDownload(meta, e)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 rounded-md transition-colors"
                  >
                    <Download className="w-3 h-3" /> Scarica
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewRec && (
        <JsonModal
          meta={previewRec.meta}
          record={previewRec.record}
          onClose={() => setPreviewRec(null)}
        />
      )}
    </>
  );
};
