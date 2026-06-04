import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { OPENROUTER_ENDPOINT } from '../constants';

export interface ModelConfig {
  extract:   { primary: string; fallback: string };
  narrative: { primary: string; fallback: string };
}

const DEFAULT_CONFIG: ModelConfig = {
  extract:   { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'openai/gpt-oss-120b:free' },
  narrative: { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'openai/gpt-oss-120b:free' },
};

interface ModelConfigCtx {
  config: ModelConfig;
  setConfig: (c: ModelConfig) => void;
  saveConfig: () => Promise<void>;
  saving: boolean;
  saved: boolean;
  loadError: string | null;
}

const Ctx = createContext<ModelConfigCtx>({
  config: DEFAULT_CONFIG,
  setConfig: () => {},
  saveConfig: async () => {},
  saving: false,
  saved: false,
  loadError: null,
});

export const useModelConfig = () => useContext(Ctx);

const CONFIG_URL = () => {
  const base = OPENROUTER_ENDPOINT ?? '';
  // OPENROUTER_ENDPOINT punta a es. https://gse-proxy.riccardoooo.workers.dev
  // togliamo eventuale trailing slash
  return base.replace(/\/$/, '') + '/config';
};

export const ModelConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Carica configurazione dal Worker KV all'avvio
  useEffect(() => {
    const url = CONFIG_URL();
    if (!url || url === '/config') return;
    fetch(url)
      .then((r) => r.json())
      .then((data: { models?: ModelConfig }) => {
        if (data?.models) setConfig(data.models);
      })
      .catch(() => setLoadError('Impossibile caricare la configurazione dal server.'));
  }, []);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const url = CONFIG_URL();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setLoadError('Errore nel salvataggio della configurazione.');
    } finally {
      setSaving(false);
    }
  }, [config]);

  return (
    <Ctx.Provider value={{ config, setConfig, saveConfig, saving, saved, loadError }}>
      {children}
    </Ctx.Provider>
  );
};
