import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const REPO_NAME = 'gse-report-generator';

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
