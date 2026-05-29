import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANTE: imposta qui il nome ESATTO del tuo repository GitHub
const REPO_NAME = 'gse-report-generator';

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    // La chiave viene iniettata da GitHub Actions tramite VITE_GEMINI_API_KEY secret
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY ?? ''),
  },
});