import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const page = (file) => resolve(import.meta.dirname, file);

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    // Saat backend siap, arahkan /api ke server backend agar tidak kena CORS.
    proxy: {
      // '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        home: page('index.html'),
        iot: page('iot.html'),
        chatbot: page('chatbot.html'),
        vision: page('vision.html'),
      },
    },
  },
});
