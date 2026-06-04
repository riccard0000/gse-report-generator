import React, { useEffect, useState } from 'react';
import { Save, CheckCircle, AlertTriangle, RefreshCw, Cpu } from 'lucide-react';
import { useModelConfig, ModelConfig } from '../context/ModelConfigContext';

interface OpenRouterModel {
  id: string;
  name: string;
}

const WORKER_MODELS_URL = () => {
  const base = import.meta.env.VITE_PROXY_URL ?? '';
  return base.replace(/\/$/, '') + '/models';
};

export const Settings: React.FC = () => {
  const { config, setConfig, saveConfig, saving, saved, loadError } = useModelConfig();
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const fetchModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const url = WORKER_MODELS_URL();
      const res = await fetch(url);
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

  const update = (section: keyof ModelConfig, field: 'primary' | 'fallback', value: string) => {
    setConfig({ ...config, [section]: { ...config[section], [field]: value } });
  };

  const ModelSelect = ({
    label, value, onChange,
  }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {/* Sempre presente il valore corrente anche se non nella lista */}
        {!models.find((m) => m.id === value) && (
          <option value={value}>{value}</option>
        )}
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.name || m.id}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
              <Cpu className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Configurazione Modelli AI</h2>
              <p className="text-xs text-slate-500">Imposta modello primario e fallback per ogni fase</p>
            </div>
          </div>
          <button
            onClick={fetchModels}
            disabled={loadingModels}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
            Aggiorna lista
          </button>
        </div>

        {/* Errore caricamento modelli */}
        {modelsError && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">{modelsError} — i modelli hardcoded restano disponibili.</p>
          </div>
        )}

        {/* Errore caricamento config */}
        {loadError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700">{loadError}</p>
          </div>
        )}

        {/* Loading modelli */}
        {loadingModels && (
          <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Caricamento modelli da OpenRouter...
          </div>
        )}

        {/* Sezione EXTRACT */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wide">EXTRACT</span>
            <span className="text-xs text-slate-400">Estrazione KPI dai bilanci PDF</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModelSelect
              label="Modello primario"
              value={config.extract.primary}
              onChange={(v) => update('extract', 'primary', v)}
            />
            <ModelSelect
              label="Modello fallback"
              value={config.extract.fallback}
              onChange={(v) => update('extract', 'fallback', v)}
            />
          </div>
        </div>

        {/* Divisore */}
        <div className="border-t border-slate-100 mb-6" />

        {/* Sezione NARRATIVE */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full uppercase tracking-wide">NARRATIVE</span>
            <span className="text-xs text-slate-400">Generazione testo report Word</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModelSelect
              label="Modello primario"
              value={config.narrative.primary}
              onChange={(v) => update('narrative', 'primary', v)}
            />
            <ModelSelect
              label="Modello fallback"
              value={config.narrative.fallback}
              onChange={(v) => update('narrative', 'fallback', v)}
            />
          </div>
        </div>

        {/* Salva */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Le impostazioni vengono salvate sul server e persistono tra le sessioni.</p>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Salvataggio...' : saved ? 'Salvato!' : 'Salva impostazioni'}
          </button>
        </div>

      </div>
    </div>
  );
};
