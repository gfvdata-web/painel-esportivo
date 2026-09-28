// Envia dist/ (já cifrado pelo build) para a branch gh-pages como um commit único, sem histórico.
// Monta um repositório temporário contendo SÓ o dist/, então nada do main vaza para a branch.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = process.cwd();
const dist = join(raiz, 'dist');
if (!existsSync(join(dist, 'dados', 'chave.json'))) {
  console.error('dist/ sem dados cifrados. Rode `npm run build` antes.');
  process.exit(1);
}

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const remoto = git(['remote', 'get-url', 'origin'], raiz);
const tmp = mkdtempSync(join(tmpdir(), 'painel-pub-'));

try {
  cpSync(dist, tmp, { recursive: true });
  writeFileSync(join(tmp, '.nojekyll'), '');
  git(['init', '-q', '-b', 'gh-pages'], tmp);
  git(['add', '-A'], tmp);
  // Mesmo autor do repositório principal; sem hooks (o hook de privacidade é do main).
  const nome = git(['config', 'user.name'], raiz);
  const email = git(['config', 'user.email'], raiz);
  git(['-c', `user.name=${nome}`, '-c', `user.email=${email}`, 'commit', '-q', '--no-verify', '-m', 'Publicação do painel (dados cifrados)'], tmp);
  git(['push', '-q', '--force', remoto, 'gh-pages:gh-pages'], tmp);
  console.log('Publicado na branch gh-pages.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
