import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cambia 'gse-report-generator' con il nome ESATTO del tuo repository GitHub
const REPO_NAME = 'gse-report-generator';

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
  define: {
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY),
  },
});
