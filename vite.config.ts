import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/' per Azure Static Web Apps
// (era '/gse-report-generator/' per GitHub Pages — vedere branch main)
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
