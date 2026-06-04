/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del Cloudflare Worker proxy (es. http://localhost:8787 in dev, https://gse-proxy.*.workers.dev in prod) */
  readonly VITE_PROXY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
