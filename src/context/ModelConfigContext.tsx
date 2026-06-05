import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { OPENROUTER_ENDPOINT, EXTRACTION_PROMPT_CUSTOM_DEFAULT, NARRATIVE_PROMPT_CUSTOM_DEFAULT } from '../constants';

export interface ModelConfig {
  extract:   { primary: string; fallback: string };
  narrative: { primary: string; fallback: string };
}

export interface PromptCustom {
  extraction: string;
  narrative:  string;
}

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  extract:   { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'google/gemma-4-31b-it:free' },
  narrative: { primary: 'nvidia/nemotron-3-super-120b-a12b:free', fallback: 'google/gemma-4-31b-it:free' },
};

const DEFAULT_PROMPT_CUSTOM: PromptCustom = {
  extraction: EXTRACTION_PROMPT_CUSTOM_DEFAULT,
  narrative:  NARRATIVE_PROMPT_CUSTOM_DEFAULT,
};

interface ModelConfigCtx {
  config:         ModelConfig;
  setConfig:      (c: ModelConfig) => void;
  promptCustom:   PromptCustom;
  setPromptCustom:(p: PromptCustom) => void;
  saveConfig:     () => Promise<void>;
  saving:         boolean;
  saved:          boolean;
  loadError:      string | null;
}

const Ctx = createContext<ModelConfigCtx>({
  config:          DEFAULT_MODEL_CONFIG,
  setConfig:       () => {},
  promptCustom:    DEFAULT_PROMPT_CUSTOM,
  setPromptCustom: () => {},
  saveConfig:      async () => {},
  saving:          false,
  saved:           false,
  loadError:       null,
});

export const useModelConfig = () => useContext(Ctx);

const CONFIG_URL = () => {
  const base = OPENROUTER_ENDPOINT ?? '';
  return base.replace(/\/$/, '') + '/config';
};

export const ModelConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config,         setConfig]         = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [promptCustom,   setPromptCustom]   = useState<PromptCustom>(DEFAULT_PROMPT_CUSTOM);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [loadError,      setLoadError]      = useState<string | null>(null);

  // Carica configurazione dal Worker KV all'avvio
  useEffect(() => {
    const url = CONFIG_URL();
    if (!url || url === '/config') return;
    fetch(url)
      .then((r) => r.json())
      .then((data: { models?: ModelConfig; prompts?: PromptCustom }) => {
        if (data?.models)  setConfig(data.models);
        if (data?.prompts) setPromptCustom({
          extraction: data.prompts.extraction ?? EXTRACTION_PROMPT_CUSTOM_DEFAULT,
          narrative:  data.prompts.narrative  ?? NARRATIVE_PROMPT_CUSTOM_DEFAULT,
        });
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
        body: JSON.stringify({ models: config, prompts: promptCustom }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setLoadError('Errore nel salvataggio della configurazione.');
    } finally {
      setSaving(false);
    }
  }, [config, promptCustom]);

  return (
    <Ctx.Provider value={{ config, setConfig, promptCustom, setPromptCustom, saveConfig, saving, saved, loadError }}>
      {children}
    </Ctx.Provider>
  );
};
