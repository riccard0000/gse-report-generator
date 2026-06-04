import React, { useState, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { ReportViewer } from './components/ReportViewer';
import { extractDataFromPdfs, generateNarrative } from './geminiService';
import { DataVerification } from './components/DataVerification';
import { ExtractedData, NarrativeData } from './types';
import { MOCK_EXTRACTED_DATA, MOCK_FILE_NAMES, MOCK_PDF_URLS } from './mockData';
import { Zap, AlertTriangle, FlaskConical } from 'lucide-react';

type AppState = 'idle' | 'extracting' | 'verifying' | 'generating' | 'done' | 'error';

const REQUIRED_FILES = 3;

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [progress, setProgress] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [narrativeData, setNarrativeData] = useState<NarrativeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (files.length !== REQUIRED_FILES) return;
    setError(null);
    setIsDemoMode(false);
    setAppState('extracting');
    setExtractedData(null);
    setNarrativeData(null);

    try {
      const extracted = await extractDataFromPdfs(files, setProgress);
      setExtractedData(extracted);
      setAppState('verifying');
    } catch (e: any) {
      setError(e.message || 'Errore durante l\'estrazione');
      setAppState('error');
    }
  }, [files]);

  /**
   * DEMO MODE:
   * 1. Fetcha i 3 PDF statici dalla root del sito (pubblici, Vite li serve)
   * 2. Li converte in oggetti File sintetici
   * 3. Carica MOCK_EXTRACTED_DATA senza chiamare OpenRouter
   * Il viewer PDF funziona esattamente come con file caricati dall'utente.
   */
  const handleLoadDemo = useCallback(async () => {
    setError(null);
    setIsDemoMode(true);
    setAppState('extracting');
    setProgress('Caricamento PDF di esempio...');

    try {
      const demoFiles = await Promise.all(
        MOCK_PDF_URLS.map(async (url, i) => {
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
    } catch (e: any) {
      setError(e.message || 'Errore nel caricamento dei PDF demo');
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

  const isLoading = appState === 'extracting' || appState === 'generating';
  const showUpload = appState === 'idle' || appState === 'extracting' || appState === 'error';
  const showVerification = appState === 'verifying' || appState === 'generating';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">GSE Report Generator</h1>
              <p className="text-xs text-slate-500">Istruttoria Extraprofitti · art. 15-bis D.L. 4/2022</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDemoMode && appState === 'verifying' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <FlaskConical className="w-3.5 h-3.5" />
                DEMO — GEOSOL 2022-2024
              </span>
            )}
            {(appState === 'done' || appState === 'verifying') && (
              <button
                onClick={handleReset}
                className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Nuova analisi
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* STEP 1: Upload + Analyze */}
        {showUpload && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Carica i documenti</h2>
              <p className="text-sm text-slate-500 mb-6">
                Carica esattamente {REQUIRED_FILES} bilanci aziendali in formato PDF (ultimi 3 esercizi).
              </p>
              <FileUploader files={files} onFilesChange={setFiles} maxFiles={REQUIRED_FILES} />

              {files.length > 0 && files.length < REQUIRED_FILES && (
                <p className="text-xs text-amber-600 mb-3">
                  Mancano ancora {REQUIRED_FILES - files.length} bilancio/bilanci per poter avviare l'analisi.
                </p>
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
                  {/* Bottone principale */}
                  <button
                    onClick={handleAnalyze}
                    disabled={files.length !== REQUIRED_FILES}
                    className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                  >
                    {files.length === REQUIRED_FILES
                      ? 'Avvia Analisi AI'
                      : `Carica ${REQUIRED_FILES} bilanci per continuare`}
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400">oppure</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  {/* Bottone demo */}
                  <button
                    onClick={handleLoadDemo}
                    className="w-full py-2.5 px-6 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <FlaskConical className="w-4 h-4" />
                    Usa dati di esempio (GEOSOL 2022-2024)
                  </button>
                  <p className="text-xs text-slate-400 text-center -mt-1">
                    Carica automaticamente i 3 PDF e i dati estratti — nessuna chiave API necessaria.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Data Verification */}
        {showVerification && extractedData && (
          <DataVerification
            files={files}
            extractedData={extractedData}
            onApprove={async (finalData) => {
              try {
                setAppState('generating');
                setProgress('Generazione della narrativa in corso...');
                const narrative = await generateNarrative(finalData, setProgress);
                setNarrativeData(narrative);
                setAppState('done');
              } catch (e: any) {
                setError(e.message || 'Errore durante la generazione del report');
                setAppState('error');
              }
            }}
          />
        )}

        {/* STEP 3: Report Viewer */}
        {appState === 'done' && extractedData && narrativeData && (
          <ReportViewer
            extractedData={extractedData}
            narrativeData={narrativeData}
            sourceFiles={files}
          />
        )}

      </main>
    </div>
  );
}
