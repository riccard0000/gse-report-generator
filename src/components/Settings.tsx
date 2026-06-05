import React, { useEffect, useState } from 'react';
import { Save, CheckCircle, AlertTriangle, RefreshCw, Cpu, FileText, Lock, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useModelConfig, ModelConfig } from '../context/ModelConfigContext';
import {
  EXTRACTION_PROMPT_CONTRACT,
  EXTRACTION_PROMPT_CUSTOM_DEFAULT,
  NARRATIVE_PROMPT_CUSTOM_DEFAULT,
} from '../constants';

// Placeholder del contratto narrativa (la parte fissa non è una stringa semplice
// perché usa i parametri dati/kpi — mostriamo il template visivamente)
const NARRATIVE_CONTRACT_PREVIEW = `Sei un funzionario GSE esperto in istruttorie economico-finanziarie per la verifica\ndella sostenibilità del debito da extraprofitti (art. 15-bis D.L. 4/2022).\n\n[...dati estratti dai bilanci inseriti automaticamente...]\n[...KPI calcolati deterministicamente inseriti automaticamente...]\n\nRedigi una relazione tecnica con sezioni: analisiRicavi, analisiLiquidita,\naccantonamenti, conclusione, esito (SOSTENIBILE | CAUTELA | RISCHIO ELEVATO),\ncommentoCopertura.\n\nRispondi SOLO con JSON valido, senza markdown.`;

interface OpenRouterModel { id: string; name: string; }

const WORKER_MODELS_URL = () => {
  const base = import.meta.env.VITE_PROXY_URL ?? '';
  return base.replace(/\/$/, '') + '/models';
};

/** Sezione contrattuale read-only con collapse */
const ContractSection: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sezione contrattuale — non modificabile</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          <pre className="text-[10px] leading-relaxed text-slate-500 whitespace-pre-wrap font-mono bg-white border border-slate-200 rounded p-3 max-h-64 overflow-y-auto">
            {text}
          </pre>
          <p className="mt-2 text-[10px] text-slate-400 italic">
            Questa sezione garantisce la corretta estrazione JSON e la compliance con il processo GSE.
            Non è modificabile per preservare l&apos;integrità del flusso.
          </p>
        </div>
      )}
    </div>
  );
};

/** Textarea editabile con label, placeholder e pulsante reset */
const CustomPromptEditor: React.FC<{
  label: string;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}> = ({ label, value, defaultValue, onChange }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <button
        type="button"
        onClick={() => onChange(defaultValue)}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-50 transition-colors"
        title="Ripristina testo predefinito"
      >
        <RotateCcw className="w-2.5 h-2.5" /> Ripristina default
      </button>
    </div>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={6}
      className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-y min-h-[80px]"
      placeholder="Aggiungi qui istruzioni personalizzate che verranno accodate alla sezione contrattuale..."
    />
    <p className="text-[10px] text-slate-400 leading-relaxed">
      Questo testo viene accodato alla sezione contrattuale prima di ogni chiamata AI.
      Usalo per contestualizzare il settore, il tipo di impresa, o aggiungere enfasi su voci specifiche.
    </p>
  </div>
);

export const Settings: React.FC = () => {
  const { config, setConfig, promptCustom, setPromptCustom, saveConfig, saving, saved, loadError } = useModelConfig();
  const [models,        setModels]        = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError,   setModelsError]   = useState<string | null>(null);
  const [activeTab,     setActiveTab]     = useState<'models' | 'extract' | 'narrative'>('models');

  const fetchModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const url  = WORKER_MODELS_URL();
      const res  = await fetch(url);
      const data = await res.json() as { data?: OpenRouterModel[] };
      const free = (data.data ?? [])
        .filter((m) => m.id.endsWith(':free'))
        .sort((a, b) => a.id.localeCompare(b.id));
      setModels(free);
    } catch {
      setModelsError('Impossibile caricare i modelli da OpenRouter.');
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => { fetchModels(); }, []);

  const updateModel = (section: keyof ModelConfig, field: 'primary' | 'fallback', value: string) =>
    setConfig({ ...config, [section]: { ...config[section], [field]: value } });

  const ModelSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {!models.find(m => m.id === value) && <option value={value}>{value}</option>}
        {models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
      </select>
    </div>
  );

  const tabs = [
    { id: 'models'    as const, label: 'Modelli AI',           icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'extract'   as const, label: 'Prompt Estrazione',    icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'narrative' as const, label: 'Prompt Narrativa',     icon: <FileText className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Errori globali */}
          {loadError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{loadError}</p>
            </div>
          )}

          {/* ─── TAB MODELLI ─── */}
          {activeTab === 'models' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Imposta modello primario e fallback per ogni fase.</p>
                <button
                  onClick={fetchModels}
                  disabled={loadingModels}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
                  Aggiorna lista
                </button>
              </div>
              {modelsError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700">{modelsError} — i modelli hardcoded restano disponibili.</p>
                </div>
              )}
              {loadingModels && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Caricamento modelli da OpenRouter...
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wide">EXTRACT</span>
                  <span className="text-xs text-slate-400">Estrazione KPI dai bilanci PDF</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ModelSelect label="Modello primario" value={config.extract.primary}   onChange={v => updateModel('extract', 'primary', v)} />
                  <ModelSelect label="Modello fallback"  value={config.extract.fallback}  onChange={v => updateModel('extract', 'fallback', v)} />
                </div>
              </div>
              <div className="border-t border-slate-100" />
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full uppercase tracking-wide">NARRATIVE</span>
                  <span className="text-xs text-slate-400">Generazione testo report Word</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ModelSelect label="Modello primario" value={config.narrative.primary}  onChange={v => updateModel('narrative', 'primary', v)} />
                  <ModelSelect label="Modello fallback"  value={config.narrative.fallback} onChange={v => updateModel('narrative', 'fallback', v)} />
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB PROMPT ESTRAZIONE ─── */}
          {activeTab === 'extract' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Prompt Estrazione KPI</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Usato per ogni chiamata AI durante la lettura dei PDF bilancio.
                  La sezione contrattuale definisce la struttura JSON obbligatoria;
                  la sezione custom aggiunge istruzioni contestuali dell&apos;operatore.
                </p>
              </div>
              <ContractSection text={EXTRACTION_PROMPT_CONTRACT} />
              <CustomPromptEditor
                label="Istruzioni aggiuntive (editabile)"
                value={promptCustom.extraction}
                defaultValue={EXTRACTION_PROMPT_CUSTOM_DEFAULT}
                onChange={v => setPromptCustom({ ...promptCustom, extraction: v })}
              />
            </div>
          )}

          {/* ─── TAB PROMPT NARRATIVA ─── */}
          {activeTab === 'narrative' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Prompt Narrativa Tecnica</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Usato per generare i paragrafi discorsivi del report.
                  I dati estratti e i KPI vengono inseriti automaticamente nella sezione contrattuale.
                </p>
              </div>
              <ContractSection text={NARRATIVE_CONTRACT_PREVIEW} />
              <CustomPromptEditor
                label="Istruzioni aggiuntive (editabile)"
                value={promptCustom.narrative}
                defaultValue={NARRATIVE_PROMPT_CUSTOM_DEFAULT}
                onChange={v => setPromptCustom({ ...promptCustom, narrative: v })}
              />
            </div>
          )}

          {/* ─── Salva ─── */}
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
            <p className="text-xs text-slate-400">Le impostazioni vengono salvate sul server (KV Cloudflare) e persistono tra le sessioni.</p>
            <button
              onClick={saveConfig}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvataggio...' : saved ? 'Salvato!' : 'Salva impostazioni'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
