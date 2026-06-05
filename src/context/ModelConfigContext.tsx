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
  config:          ModelConfig;
  setConfig:       (c: ModelConfig) => void;
  promptCustom:    PromptCustom;
  setPromptCustom: (p: PromptCustom) => void;
  saveModels:      () => Promise<void>;
  savePrompts:     () => Promise<void>;
  /** @deprecated usa saveModels + savePrompts separatamente */
  saveConfig:      () => Promise<void>;
  saving:          boolean;
  saved:           boolean;
  loadError:       string | null;
}

const Ctx = createContext<ModelConfigCtx>({
  config:          DEFAULT_MODEL_CONFIG,
  setConfig:       () => {},
  promptCustom:    DEFAULT_PROMPT_CUSTOM,
  setPromptCustom: () => {},
  saveModels:      async () => {},
  savePrompts:     async () => {},
  saveConfig:      async () => {},
  saving:          false,
  saved:           false,
  loadError:       null,
});

export const useModelConfig = () => useContext(Ctx);

function workerBase() {
  return (OPENROUTER_ENDPOINT ?? '').replace(/\/$/, '');
}

export const ModelConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config,         setConfig]         = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [promptCustom,   setPromptCustom]   = useState<PromptCustom>(DEFAULT_PROMPT_CUSTOM);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [loadError,      setLoadError]      = useState<string | null>(null);

  // ── Caricamento all'avvio: modelli da /config, prompt da /prompts ────────────
  useEffect(() => {
    const base = workerBase();
    if (!base || base === '') return;

    // Modelli
    fetch(`${base}/config`)
      .then(r => r.json())
      .then((data: { models?: ModelConfig }) => {
        if (data?.models) setConfig(data.models);
      })
      .catch(() => setLoadError('Impossibile caricare la configurazione modelli.'));

    // Prompt
    fetch(`${base}/prompts`)
      .then(r => r.json())
      .then((data: Partial<PromptCustom>) => {
        if (data?.extraction || data?.narrative) {
          setPromptCustom({
            extraction: data.extraction ?? EXTRACTION_PROMPT_CUSTOM_DEFAULT,
            narrative:  data.narrative  ?? NARRATIVE_PROMPT_CUSTOM_DEFAULT,
          });
        }
      })
      .catch(() => { /* prompt: fallback ai default, non bloccante */ });
  }, []);

  // ── Salva solo modelli su GSE_CONFIG ───────────────────────────────────────
  const saveModels = useCallback(async () => {
    const base = workerBase();
    setSaving(true); setSaved(false);
    try {
      const res = await fetch(`${base}/config`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ models: config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setLoadError('Errore nel salvataggio dei modelli.');
    } finally {
      setSaving(false);
    }
  }, [config]);

  // ── Salva solo prompt su GSE_PROMPT ───────────────────────────────────────
  const savePrompts = useCallback(async () => {
    const base = workerBase();
    setSaving(true); setSaved(false);
    try {
      const res = await fetch(`${base}/prompts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ extraction: promptCustom.extraction, narrative: promptCustom.narrative }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setLoadError('Errore nel salvataggio dei prompt.');
    } finally {
      setSaving(false);
    }
  }, [promptCustom]);

  // saveConfig = compatibilità retroattiva: salva entrambi
  const saveConfig = useCallback(async () => {
    await saveModels();
    await savePrompts();
  }, [saveModels, savePrompts]);

  return (
    <Ctx.Provider value={{
      config, setConfig, promptCustom, setPromptCustom,
      saveModels, savePrompts, saveConfig,
      saving, saved, loadError,
    }}>
      {children}
    </Ctx.Provider>
  );
};
