/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base Azure Function proxy (es. http://localhost:7071/api/proxy in dev, /api/proxy in prod SWA) */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
