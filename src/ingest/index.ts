// Pipeline de ingestão: lê data/raw/, normaliza e grava em data/processed/.
// Por enquanto roda só os adaptadores e mostra um resumo; normalização e dedup vêm no passo 3.
import { join } from 'node:path';
import { adaptadores } from './adapters';

const DIR_RAW = join(process.cwd(), 'data', 'raw');

async function main() {
  for (const adaptador of adaptadores) {
    if (!adaptador.disponivel(DIR_RAW)) {
      console.log(`– ${adaptador.descricao}: não encontrado em data/raw, pulando.`);
      continue;
    }
    const inicio = performance.now();
    const { atividades, ignorados } = await adaptador.ler(DIR_RAW);
    const porEsporte = new Map<string, number>();
    for (const a of atividades) porEsporte.set(a.esporte, (porEsporte.get(a.esporte) ?? 0) + 1);
    const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
    console.log(`\n✔ ${adaptador.descricao}: ${atividades.length} atividades (${segundos} s)`);
    for (const [esporte, n] of [...porEsporte].sort((a, b) => b[1] - a[1])) console.log(`   ${esporte.padEnd(22)} ${n}`);
    console.log(`   com trilha: ${atividades.filter((a) => a.trilha).length} · com série: ${atividades.filter((a) => a.serie).length} · automáticas: ${atividades.filter((a) => a.autoDetectada).length}`);
    const anomalias = atividades.filter((a) => a.anomalias.length);
    if (anomalias.length) {
      console.log(`   anomalias (${anomalias.length}):`);
      const contagem = new Map<string, number>();
      for (const a of anomalias) for (const m of a.anomalias) contagem.set(m, (contagem.get(m) ?? 0) + 1);
      for (const [m, n] of contagem) console.log(`     ${n}× ${m}`);
    }
    if (ignorados.length) {
      console.log(`   arquivos ignorados (${ignorados.length}):`);
      for (const i of ignorados.slice(0, 10)) console.log(`     ${i.arquivo}: ${i.motivo}`);
      if (ignorados.length > 10) console.log(`     … e mais ${ignorados.length - 10}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
