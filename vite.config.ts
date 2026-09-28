import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import { pluginDados } from './src/build/pluginDados';

export default defineConfig(({ mode }) => {
  // Só variáveis PAINEL_*; ficam no processo do build e nunca são expostas ao navegador.
  const env = loadEnv(mode, process.cwd(), 'PAINEL_');
  return {
    plugins: [preact(), pluginDados({ senha: env.PAINEL_SENHA, raiz: process.cwd() })],
    // Caminhos relativos para funcionar em qualquer subpasta do GitHub Pages.
    base: './',
    worker: { format: 'es' },
    // O MapLibre 6 acha o worker por caminho relativo ao próprio arquivo; fora do pré-empacotamento
    // isso funciona no dev, e no build usamos setWorkerUrl com o worker empacotado pelo Vite.
    optimizeDeps: { exclude: ['maplibre-gl'] },
  };
});
