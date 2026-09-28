// Plugin do Vite que entrega data/processed/ ao site.
//
//  - `npm run dev`: serve os JSONs abertos em /dados/ (só na sua máquina, sem senha).
//  - `npm run build`: compacta (gzip) e cifra cada arquivo com PAINEL_SENHA e grava em dist/dados/.
//    Nenhum JSON em claro vai para dist/. Ao final, confere o dist/ inteiro por garantia.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';
import { criarArquivoChave, cifrar, derivarChave, ITERACOES_PADRAO, nomeOfuscado, paraBase64 } from '../shared/cripto';

const SENHA_EXEMPLO = 'TROQUE-ESTA-SENHA';
const TAMANHO_MINIMO = 12;
// Trechos que só aparecem nos dados em claro; se surgirem no dist/, o build falha.
const MARCAS_DE_DADO_ABERTO = ['"esporte":"', '"inicio":"', '"fontes":['];

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    return statSync(c).isDirectory() ? listar(c) : [c];
  });
}

export function pluginDados(opcoes: { senha?: string; raiz: string }): Plugin {
  const dirProcessado = resolve(opcoes.raiz, 'data', 'processed');
  let dirSaida = '';

  return {
    name: 'painel-dados',

    configureServer(server) {
      server.middlewares.use('/dados/', (req, res, next) => {
        const nome = decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\//, ''));
        const caminho = resolve(dirProcessado, nome);
        if (!caminho.startsWith(dirProcessado) || !nome.endsWith('.json') || !existsSync(caminho)) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(readFileSync(caminho));
      });
    },

    configResolved(config) {
      dirSaida = resolve(config.root, config.build.outDir);
    },

    buildStart() {
      if (this.meta.watchMode) return;
      const senha = opcoes.senha ?? '';
      if (!senha || senha === SENHA_EXEMPLO) {
        this.error('Defina PAINEL_SENHA no arquivo .env antes do build (troque o valor de exemplo).');
      }
      if (senha.length < TAMANHO_MINIMO) {
        this.error(`PAINEL_SENHA muito curta: use pelo menos ${TAMANHO_MINIMO} caracteres (idealmente 4–5 palavras).`);
      }
      if (!existsSync(join(dirProcessado, 'atividades.json'))) {
        this.error('data/processed/ está vazio. Rode `npm run ingest` antes do build.');
      }
    },

    async writeBundle() {
      const senha = opcoes.senha!;
      const sal = crypto.getRandomValues(new Uint8Array(16));
      const chave = await derivarChave(senha, sal, ITERACOES_PADRAO);
      const salB64 = paraBase64(sal);
      const destino = join(dirSaida, 'dados');
      mkdirSync(join(destino, 'd'), { recursive: true });

      const empacotar = async (origem: string) => cifrar(chave, gzipSync(readFileSync(origem), { level: 9 }));

      for (const nome of ['atividades', 'trilhas', 'meta']) {
        writeFileSync(join(destino, `${nome}.bin`), await empacotar(join(dirProcessado, `${nome}.json`)));
      }
      const dirDetalhes = join(dirProcessado, 'detalhes');
      let n = 0;
      if (existsSync(dirDetalhes)) {
        for (const arq of readdirSync(dirDetalhes)) {
          const id = arq.replace(/\.json$/, '');
          writeFileSync(join(destino, 'd', `${await nomeOfuscado(salB64, id)}.bin`), await empacotar(join(dirDetalhes, arq)));
          n++;
        }
      }
      writeFileSync(join(destino, 'chave.json'), JSON.stringify(await criarArquivoChave(chave, sal, ITERACOES_PADRAO)));

      // Trava final: nenhum dado em claro pode ter ido parar no dist/.
      for (const arq of listar(dirSaida)) {
        if (arq.endsWith('.bin')) continue;
        const texto = readFileSync(arq, 'utf8');
        const marca = MARCAS_DE_DADO_ABERTO.find((m) => texto.includes(m));
        if (marca) this.error(`Dado em claro encontrado em ${arq} (${marca}). Build abortado.`);
      }
      this.info?.(`dados cifrados: 3 arquivos principais + ${n} detalhes`);
    },
  };
}
