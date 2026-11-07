import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8000' }, '/auth': { target: 'http://localhost:8000' } },
  },
  preview: { port: 5173, proxy: { '/api': 'http://localhost:8000', '/auth': 'http://localhost:8000' } },
  build: { outDir: '../dist', emptyOutDir: true },
});
