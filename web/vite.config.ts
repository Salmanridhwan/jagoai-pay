import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Console dipisah dari API: dev memakai proxy supaya cookie sesi tetap satu asal (localhost:4020),
// jadi tidak perlu konfigurasi CORS saat mengembangkan.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4020,
    proxy: {
      '/api': { target: 'http://localhost:4010', changeOrigin: false },
      '/proofs': { target: 'http://localhost:4010', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
