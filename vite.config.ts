import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // Caminhos relativos para funcionar em qualquer subpasta do GitHub Pages.
  base: './',
});
