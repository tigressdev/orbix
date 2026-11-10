import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// In development the Python API runs on :8765 (python trip.py serve); Vite proxies /api to it so the HttpOnly session cookie stays same-origin.
const API = process.env.API_URL ?? 'http://localhost:8765';
const proxy = { '/api': { target: API, changeOrigin: true, configure: (p: { on: (e: string, f: (req: { getHeader: (n: string) => unknown; setHeader: (n: string, v: string) => void }) => void) => void }) => { p.on('proxyReq', (req) => { if (req.getHeader('origin')) req.setHeader('origin', API); }); } } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks(id: string) { if (id.includes('maplibre-gl')) return 'maplibre'; if (id.includes('recharts') || id.includes('d3-')) return 'charts'; return undefined; } } },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'] },
});
