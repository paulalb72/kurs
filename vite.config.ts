import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Baut alles in eine einzige dist/index.html – der Server liefert genau diese Datei aus.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  server: {
    // Im Dev-Modus läuft die API separat auf Port 3000 (npm run dev startet beides).
    proxy: { '/api': `http://localhost:${process.env.PORT || 3000}` },
  },
});
