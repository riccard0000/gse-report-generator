import React, { useEffect, useState, useCallback } from 'react';
import { History, Download, Eye, X, Loader2, AlertCircle, FlaskConical, ChevronRight } from 'lucide-react';
import { ExtractionMeta, ExtractedData } from '../types';
import { listExtractions, getExtraction } from '../lib/extractionStorage';
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
// DiffViewer — confronto campo per campo tra estrazione AI e mock
// ---------------------------------------------------------------------------
const YEAR_FIELDS = [
  'ricavi','ebit','ammortamenti','utileNetto','interessiPassivi',
  'totaleAttivo','patrimonioNetto','totaleDebiti','debitiBancheBreve','debitiBancheML',
  'disponibilitaLiquide','creditiEntro12Mesi','rimanenze','attivoCircolante',
  'passivitaCorrenti','debitiTributari','debitiPrevidenziali','fondoRischiOneri',
] as const;

type YearFieldKey = typeof YEAR_FIELDS[number];

interface DiffRowProps {
  label: string;
  aiVal:   unknown;
  mockVal: unknown;
}

const DiffRow: React.FC<DiffRowProps> = ({ label, aiVal, mockVal }) => {
  const aiStr   = aiVal   === null || aiVal   === undefined ? 'null' : String(aiVal);
  const mockStr = mockVal === null || mockVal === undefined ? 'null' : String(mockVal);
  const equal   = aiStr === mockStr;
  return (
    <tr className={`border-b border-slate-100 text-xs ${equal ? '' : 'bg-red-50'}` }>
      <td className="py-1 px-2 text-slate-500 font-mono w-48 truncate">{label}</td>
      <td className={`py-1 px-2 font-mono ${equal ? 'text-green-700' : 'text-red-600 font-semibold'}`}>{aiStr}</td>
      <td className={`py-1 px-2 font-mono ${equal ? 'text-green-700' : 'text-slate-500'}`}>{mockStr}</td>
    </tr>
  );
};

interface DiffViewerProps {
  aiData: ExtractedData;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ aiData }) => {
  const mockYears = MOCK_EXTRACTED_DATA.yearsData;

  return (
    <div className="overflow-auto">
      <table className="w-full border border-slate-200 rounded text-xs">
        <thead className="bg-slate-100 sticky top-0">
          <tr>
            <th className="py-1.5 px-2 text-left font-semibold text-slate-600">Campo</th>
            <th className="py-1.5 px-2 text-left font-semibold text-blue-700">AI estratto</th>
            <th className="py-1.5 px-2 text-left font-semibold text-slate-500">Mock atteso</th>
          </tr>
        </thead>
        <tbody>
          {/* Company info */}
          <DiffRow label="companyName"    aiVal={aiData.companyName?.value}   mockVal={MOCK_EXTRACTED_DATA.companyName?.value} />
          <DiffRow label="vatNumber"      aiVal={aiData.vatNumber?.value}      mockVal={MOCK_EXTRACTED_DATA.vatNumber?.value} />
          {/* Anni */}
          {aiData.yearsData.map((yd, yi) => {
            const mockYd = mockYears.find(m => m.year === yd.year);
            return YEAR_FIELDS.map(key => (
              <DiffRow
                key={`${yd.year}-${key}`}
                label={`${yd.year} · ${key}`}
                aiVal={(yd[key] as { value?: unknown })?.value ?? null}
                mockVal={mockYd ? (mockYd[key as YearFieldKey] as { value?: unknown })?.value ?? null : '—'}
              />
            ));
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// JsonModal — modale con tab JSON grezzo e diff mock
// ---------------------------------------------------------------------------
interface JsonModalProps {
  meta:     ExtractionMeta;
  aiData:   ExtractedData;
  onClose:  () => void;
}

const JsonModal: React.FC<JsonModalProps> = ({ meta, aiData, onClose }) => {
  const [tab, setTab] = useState<'json' | 'diff'>('json');

  const handleDownload = () => {
    const safeName = (meta.companyName || meta.vatNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadJson(aiData, `extraction_${safeName}_${meta.timestamp}.json`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">{meta.companyName || meta.vatNumber}</h2>
            <p className="text-xs text-slate-500">{formatDate(meta.timestamp)} · anni: {meta.years.join(', ')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Scarica JSON
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          {([['json', 'JSON Estratto'], ['diff', 'Confronto Mock']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {tab === 'json' && (
            <pre className="text-xs font-mono bg-slate-50 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all leading-relaxed text-slate-800">
              {JSON.stringify(aiData, null, 2)}
            </pre>
          )}
          {tab === 'diff' && (
            <DiffViewer aiData={aiData} />
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ExtractionHistory — sidebar/pannello storico
// ---------------------------------------------------------------------------
export interface ExtractionHistoryProps {
  /** Chiamato quando l'utente vuole riprendere la lavorazione da uno storico */
  onLoadExtraction: (data: ExtractedData, meta: ExtractionMeta) => void;
}

export const ExtractionHistory: React.FC<ExtractionHistoryProps> = ({ onLoadExtraction }) => {
  const [list,        setList]        = useState<ExtractionMeta[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [loadingId,   setLoadingId]   = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ meta: ExtractionMeta; data: ExtractedData } | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listExtractions();
      setList(data);
    } catch {
      setError('Impossibile caricare lo storico.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleLoad = async (meta: ExtractionMeta) => {
    setLoadingId(meta.id);
    const data = await getExtraction(meta.id);
    setLoadingId(null);
    if (!data) { setError('Impossibile caricare l\'estrazione.'); return; }
    onLoadExtraction(data, meta);
  };

  const handlePreview = async (meta: ExtractionMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingId(meta.id);
    const data = await getExtraction(meta.id);
    setLoadingId(null);
    if (!data) { setError('Impossibile caricare l\'estrazione.'); return; }
    setPreviewData({ meta, data });
  };

  const handleDownload = async (meta: ExtractionMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingId(meta.id);
    const data = await getExtraction(meta.id);
    setLoadingId(null);
    if (!data) { setError('Impossibile caricare l\'estrazione.'); return; }
    const safeName = (meta.companyName || meta.vatNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadJson(data, `extraction_${safeName}_${meta.timestamp}.json`);
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
                      {meta.isDemoMode && (
                        <FlaskConical className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {meta.companyName || meta.vatNumber}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">{formatDate(meta.timestamp)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Anni: {meta.years.join(', ')}</p>
                  </div>
                  {loadingId === meta.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mt-0.5 flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 mt-0.5 flex-shrink-0 transition-colors" />
                  }
                </div>

                {/* Azioni inline visibili su hover */}
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => handlePreview(meta, e)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 rounded-md transition-colors"
                  >
                    <Eye className="w-3 h-3" /> Anteprima JSON
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

      {previewData && (
        <JsonModal
          meta={previewData.meta}
          aiData={previewData.data}
          onClose={() => setPreviewData(null)}
        />
      )}
    </>
  );
};
