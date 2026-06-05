import React, { useState, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { ReportViewer } from './components/ReportViewer';
import { extractDataFromPdfs, generateNarrative } from './aiService';
import { DataVerification } from './components/DataVerification';
import { Settings } from './components/Settings';
import { BrowserDiagnosticsPanel } from './components/BrowserDiagnosticsPanel';
import { ExtractionHistory } from './components/ExtractionHistory';
import { ExtractedData, NarrativeData, ExtractionMeta } from './types';
import { MOCK_EXTRACTED_DATA, MOCK_FILE_NAMES, getMockPdfUrls, MOCK_NARRATIVE_DATA } from './mockData';
import { ModelConfigProvider, useModelConfig } from './context/ModelConfigContext';
import { saveExtraction } from './lib/extractionStorage';
import {
  Zap, AlertTriangle, FlaskConical, Settings as SettingsIcon,
  Home, ChevronLeft, ChevronRight, Menu, Stethoscope, History,
} from 'lucide-react';

type AppState = 'idle' | 'extracting' | 'verifying' | 'generating' | 'done' | 'error';
type Page = 'home' | 'settings' | 'diagnostics';

const REQUIRED_FILES = 3;

function AppInner() {
  const { promptCustom } = useModelConfig();

  const [files,          setFiles]          = useState<File[]>([]);
  const [appState,       setAppState]       = useState<AppState>('idle');
  const [progress,       setProgress]       = useState('');
  const [extractedData,  setExtractedData]  = useState<ExtractedData | null>(null);
  const [narrativeData,  setNarrativeData]  = useState<NarrativeData | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [isDemoMode,     setIsDemoMode]     = useState(false);
  const [page,           setPage]           = useState<Page>('home');
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);

  const navigate = (p: Page) => { setPage(p); setSidebarOpen(false); };

  const handleAnalyze = useCallback(async () => {
    if (files.length !== REQUIRED_FILES) return;
    setError(null);
    setIsDemoMode(false);
    setAppState('extracting');
    setExtractedData(null);
    setNarrativeData(null);
    try {
      const extracted = await extractDataFromPdfs(
        files,
        () => promptCustom.extraction,
        setProgress
      );
      setExtractedData(extracted);
      setAppState('verifying');
      // Salva silentemente su KV
      saveExtraction(extracted, false);
    } catch (e: unknown) {
      setError((e as Error).message || 'Errore durante l\'estrazione');
      setAppState('error');
    }
  }, [files, promptCustom.extraction]);

  const handleLoadDemo = useCallback(async () => {
    setError(null);
    setIsDemoMode(true);
    setAppState('extracting');
    setProgress('Caricamento PDF di esempio...');
    try {
      const pdfUrls   = getMockPdfUrls();
      const demoFiles = await Promise.all(
        pdfUrls.map(async (url, i) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`PDF demo non trovato: ${url}`);
          const blob = await res.blob();
          return new File([blob], MOCK_FILE_NAMES[i], { type: 'application/pdf' });
        })
      );
      setFiles(demoFiles);
      setExtractedData(MOCK_EXTRACTED_DATA);
      setAppState('verifying');
      setProgress('');
    } catch (e: unknown) {
      setError((e as Error).message || 'Errore nel caricamento dei PDF demo');
      setAppState('error');
      setIsDemoMode(false);
    }
  }, []);

  const handleReset = () => {
    setFiles([]);
    setAppState('idle');
    setExtractedData(null);
    setNarrativeData(null);
    setError(null);
    setProgress('');
    setIsDemoMode(false);
  };

  const handleApprove = useCallback(async (finalData: ExtractedData) => {
    try {
      setAppState('generating');
      setProgress('Generazione del report in corso...');
      let narrative: NarrativeData;
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 800));
        narrative = MOCK_NARRATIVE_DATA;
      } else {
        narrative = await generateNarrative(
          finalData,
          () => promptCustom.narrative,
          setProgress
        );
      }
      setNarrativeData(narrative);
      setAppState('done');
    } catch (e: unknown) {
      setError((e as Error).message || 'Errore durante la generazione del report');
      setAppState('error');
    }
  }, [isDemoMode, promptCustom.narrative]);

  // ── Ricarica da storico ────────────────────────────────────────────────────
  const handleLoadFromHistory = useCallback(async (
    data: ExtractedData,
    meta: ExtractionMeta,
  ) => {
    setHistorySidebarOpen(false);
    setError(null);
    setNarrativeData(null);
    setIsDemoMode(meta.isDemoMode);
    setProgress('Caricamento PDF dallo storico...');
    setAppState('extracting');
    setPage('home');

    // Tenta di ricaricare i PDF dai nomi file presenti in data
    const fileNames = (data.yearsData ?? []).map(y => y.sourceFileName).filter(Boolean) as string[];
    if (fileNames.length > 0) {
      try {
        // Prova a scaricare i PDF dalla stessa base URL usata dai mock demo
        const rawBase = (import.meta.env.BASE_URL ?? '/') as string;
        const base    = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
        const loaded  = await Promise.all(
          fileNames.map(async name => {
            const url  = `${base}${encodeURIComponent(name)}`;
            const res  = await fetch(url);
            if (!res.ok) throw new Error(`PDF non trovato: ${url}`);
            const blob = await res.blob();
            return new File([blob], name, { type: 'application/pdf' });
          })
        );
        setFiles(loaded);
      } catch {
        // PDF non disponibili — continua senza file (viewer mostrerà placeholder)
        setFiles([]);
      }
    } else {
      setFiles([]);
    }

    setExtractedData(data);
    setAppState('verifying');
    setProgress('');
  }, []);

  const isLoading         = appState === 'extracting' || appState === 'generating';
  const showUpload        = appState === 'idle' || appState === 'extracting' || appState === 'error';
  const showVerification  = appState === 'verifying' || appState === 'generating';

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'home',        label: 'Analisi',      icon: <Home className="w-5 h-5" /> },
    { id: 'diagnostics', label: 'Diagnostica',  icon: <Stethoscope className="w-5 h-5" /> },
    { id: 'settings',   label: 'Impostazioni', icon: <SettingsIcon className="w-5 h-5" /> },
  ];

  const PAGE_TITLES: Record<Page, { title: string; subtitle: string }> = {
    home:        { title: 'GSE Report Generator',  subtitle: 'Istruttoria Extraprofitti \u00b7 art. 15-bis D.L. 4/2022' },
    diagnostics: { title: 'Diagnostica Browser',   subtitle: 'Verifica autonoma della catena app \u2192 proxy \u2192 PDF' },
    settings:    { title: 'Impostazioni',           subtitle: 'Configurazione modelli AI e prompt' },
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Overlay mobile nav */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Overlay storico mobile */}
      {historySidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setHistorySidebarOpen(false)} />
      )}

      {/* Sidebar sinistra — navigazione */}
      <aside className={`fixed top-0 left-0 h-full z-30 bg-white border-r border-slate-200 shadow-lg flex flex-col transition-all duration-200 ${sidebarOpen ? 'w-52' : 'w-14'} lg:static lg:shadow-none`}>
        <div className="flex items-center justify-between px-3 py-4 border-b border-slate-100 min-h-[64px]">
          {sidebarOpen && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-slate-800 whitespace-nowrap">GSE Report</span>
            </div>
          )}
          {!sidebarOpen && (
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center mx-auto">
              <Zap className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ${!sidebarOpen ? 'absolute right-1.5 top-[18px]' : ''}`}
            aria-label={sidebarOpen ? 'Chiudi menu' : 'Apri menu'}
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
        <nav className="flex-1 py-3 px-2 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex items-center gap-3 rounded-lg px-2 py-2.5 w-full text-left transition-colors ${
                page === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>}
            </button>
          ))}
        </nav>
        {sidebarOpen && (
          <div className="px-3 py-3 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 leading-tight">art. 15-bis D.L. 4/2022</p>
          </div>
        )}
      </aside>

      {/* Area contenuto principale */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 shadow-sm">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setSidebarOpen(true)} aria-label="Apri menu">
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{PAGE_TITLES[page].title}</h1>
                <p className="text-xs text-slate-500">{PAGE_TITLES[page].subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isDemoMode && appState === 'verifying' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                  <FlaskConical className="w-3.5 h-3.5" /> DEMO — GEOSOL 2022-2024
                </span>
              )}
              {/* Bottone storico — sempre visibile in home */}
              {page === 'home' && (
                <button
                  onClick={() => setHistorySidebarOpen(true)}
                  className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <History className="w-4 h-4" /> Storico
                </button>
              )}
              {page === 'home' && (appState === 'done' || appState === 'verifying') && (
                <button onClick={handleReset} className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                  Nuova analisi
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
          {page === 'diagnostics' && <div className="max-w-2xl mx-auto"><BrowserDiagnosticsPanel /></div>}
          {page === 'settings'    && <Settings />}
          {page === 'home' && (
            <>
              {showUpload && (
                <div className="max-w-2xl mx-auto">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-800 mb-1">Carica i documenti</h2>
                    <p className="text-sm text-slate-500 mb-6">
                      Carica esattamente {REQUIRED_FILES} bilanci aziendali in formato PDF (ultimi 3 esercizi).
                    </p>
                    <FileUploader files={files} onFilesChange={setFiles} maxFiles={REQUIRED_FILES} />
                    {files.length > 0 && files.length < REQUIRED_FILES && (
                      <p className="text-xs text-amber-600 mb-3">Mancano ancora {REQUIRED_FILES - files.length} bilancio/bilanci per poter avviare l'analisi.</p>
                    )}
                    {error && (
                      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    )}
                    {isLoading ? (
                      <div className="text-center py-4">
                        <div className="inline-flex items-center space-x-3 text-blue-600">
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span className="text-sm font-medium">{progress || 'Elaborazione...'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-col gap-3">
                        <button
                          onClick={handleAnalyze}
                          disabled={files.length !== REQUIRED_FILES}
                          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                        >
                          {files.length === REQUIRED_FILES ? 'Avvia Analisi AI' : `Carica ${REQUIRED_FILES} bilanci per continuare`}
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-slate-200" />
                          <span className="text-xs text-slate-400">oppure</span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <button
                          onClick={handleLoadDemo}
                          className="w-full py-2.5 px-6 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          <FlaskConical className="w-4 h-4" />
                          Usa dati di esempio (GEOSOL 2022-2024)
                        </button>
                        <p className="text-xs text-slate-400 text-center -mt-1">Carica automaticamente i 3 PDF e i dati estratti — nessuna chiave API necessaria.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {showVerification && extractedData && (
                <DataVerification files={files} extractedData={extractedData} onApprove={handleApprove} />
              )}
              {appState === 'generating' && (
                <div className="fixed inset-0 bg-white/70 flex items-center justify-center z-50">
                  <div className="flex items-center space-x-3 text-blue-600 bg-white border border-slate-200 rounded-xl px-6 py-4 shadow-lg">
                    <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm font-medium">{progress || 'Generazione report...'}</span>
                  </div>
                </div>
              )}
              {appState === 'done' && extractedData && narrativeData && (
                <ReportViewer extractedData={extractedData} narrativeData={narrativeData} sourceFiles={files} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Sidebar destra — storico estrazioni */}
      <aside
        className={`fixed top-0 right-0 h-full z-30 bg-white border-l border-slate-200 shadow-xl flex flex-col transition-all duration-300 overflow-hidden ${
          historySidebarOpen ? 'w-80' : 'w-0'
        }`}
      >
        {historySidebarOpen && (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-sm font-bold text-slate-700">Storico Estrazioni</span>
              <button
                onClick={() => setHistorySidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                aria-label="Chiudi storico"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ExtractionHistory onLoadExtraction={handleLoadFromHistory} />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default function App() {
  return (
    <ModelConfigProvider>
      <AppInner />
    </ModelConfigProvider>
  );
}
