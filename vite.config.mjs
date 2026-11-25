import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'frontend',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: { main: resolve('frontend/index.html'), guide: resolve('frontend/guide.html') }, output: { manualChunks: { ethereum: ['ethers'], react: ['react', 'react-dom'] } } } },
});
