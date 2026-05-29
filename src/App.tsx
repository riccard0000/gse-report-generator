import React, { useState, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { ReportViewer } from './components/ReportViewer';
import { extractDataFromPdfs, generateNarrative } from './geminiService';
import { DataVerification } from './components/DataVerification';
import { ExtractedData, NarrativeData } from './types';
import { Zap, AlertTriangle } from 'lucide-react';

type AppState = 'idle' | 'extracting' | 'verifying' | 'generating' | 'done' | 'error';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [progress, setProgress] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [narrativeData, setNarrativeData] = useState<NarrativeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) return;
    setError(null);
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

  const handleReset = () => {
    setFiles([]);
    setAppState('idle');
    setExtractedData(null);
    setNarrativeData(null);
    setError(null);
    setProgress('');
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
          {appState === 'done' && (
            <button
              onClick={handleReset}
              className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Nuova analisi
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* STEP 1: Upload + Analyze */}
        {showUpload && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Carica i documenti</h2>
              <p className="text-sm text-slate-500 mb-6">
                Carica i bilanci aziendali (fino a 3 anni) e il documento GSE con l'importo residuo.
              </p>
              <FileUploader files={files} onFilesChange={setFiles} />

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
                <button
                  onClick={handleAnalyze}
                  disabled={files.length === 0}
                  className="w-full py-3 px-6 mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  Avvia Analisi AI
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Data Verification */}
        {showVerification && extractedData && (
          <DataVerification
            files={files}
            extractedData={extractedData}
            onApprove={async () => {
              try {
                setAppState('generating');
                setProgress('Generazione della narrativa in corso...');
                const narrative = await generateNarrative(extractedData, setProgress);
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