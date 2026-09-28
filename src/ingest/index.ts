// Pipeline de ingestão: data/raw/ → data/processed/.
//
//   1. cada adaptador lê a sua fonte e produz AtividadeFonte[];
//   2. dedup entre fontes + merge campo a campo;
//   3. zonas privadas (manuais + detectadas), trilhas simplificadas, fuso, cidade, métricas;
//   4. grava JSONs compactos e um relatório local.
//
// Idempotente: apaga e recria data/processed/ a cada execução.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Atividade, Meta, Trilhas } from '../shared/modelo';
import { adaptadores } from './adapters';
import { carregarConfig } from './config';
import { agrupar, mesclar } from './dedup';
import { normalizar } from './normalizar';
import { detectarZonas } from './privacidade';
import type { ArquivoIgnorado, AtividadeFonte, Fonte } from './types';

const RAIZ = process.cwd();
const DIR_RAW = join(RAIZ, 'data', 'raw');
const DIR_SAIDA = join(RAIZ, 'data', 'processed');

const gravar = (caminho: string, dados: unknown) => writeFileSync(caminho, JSON.stringify(dados));

async function main() {
  const t0 = performance.now();
  const cfg = carregarConfig(RAIZ);
  const porFonte: Record<Fonte, AtividadeFonte[]> = { strava: [], samsung: [] };
  const ignorados: (ArquivoIgnorado & { fonte: Fonte })[] = [];

  console.log('Lendo fontes…');
  for (const adaptador of adaptadores) {
    if (!adaptador.disponivel(DIR_RAW)) {
      console.log(`  – ${adaptador.descricao}: não encontrado em data/raw, pulando`);
      continue;
    }
    const r = await adaptador.ler(DIR_RAW);
    porFonte[r.fonte].push(...r.atividades);
    ignorados.push(...r.ignorados.map((i) => ({ ...i, fonte: r.fonte })));
    console.log(`  ✔ ${adaptador.descricao}: ${r.atividades.length} atividades`);
  }

  const { grupos, relatorio } = agrupar(porFonte.strava, porFonte.samsung, cfg.deduplicacao);
  const mescladas = grupos.map(mesclar);
  for (const m of mescladas) {
    const u = relatorio.unidas.find((x) => x.strava === m.ids.strava && x.samsung === m.ids.samsung);
    if (u) u.conflitos = m.conflitos;
  }

  // Zonas privadas: manuais + onde muitas atividades começam/terminam.
  let zonas = cfg.zonasPrivadas;
  if (cfg.zonasAutomaticas.ativo) {
    const extremos = mescladas.flatMap((m, i) => {
      const t = m.atividade.trilha;
      return t?.length ? [{ idAtividade: String(i), ponto: t[0]! }, { idAtividade: String(i), ponto: t.at(-1)! }] : [];
    });
    zonas = [...zonas, ...detectarZonas(extremos, cfg.zonasAutomaticas)];
  }

  const normalizadas = mescladas.map((m) => normalizar(m, cfg, zonas));
  normalizadas.sort((a, b) => b.atividade.inicio.localeCompare(a.atividade.inicio));

  // Grava a saída do zero.
  rmSync(DIR_SAIDA, { recursive: true, force: true });
  mkdirSync(join(DIR_SAIDA, 'detalhes'), { recursive: true });
  const atividades: Atividade[] = normalizadas.map((n) => n.atividade);
  const trilhas: Trilhas = {};
  for (const n of normalizadas) {
    if (n.trilha) trilhas[n.atividade.id] = n.trilha;
    if (n.detalhe) gravar(join(DIR_SAIDA, 'detalhes', `${n.atividade.id}.json`), n.detalhe);
  }
  const contagemFontes: Record<string, number> = {};
  for (const a of atividades) {
    const k = a.fontes.join('+');
    contagemFontes[k] = (contagemFontes[k] ?? 0) + 1;
  }
  const meta: Meta = {
    geradoEm: new Date().toISOString(),
    total: atividades.length,
    porFonte: contagemFontes,
    primeira: atividades.at(-1)?.data,
    ultima: atividades[0]?.data,
  };
  gravar(join(DIR_SAIDA, 'atividades.json'), atividades);
  gravar(join(DIR_SAIDA, 'trilhas.json'), trilhas);
  gravar(join(DIR_SAIDA, 'meta.json'), meta);
  // O relatório fica só local (não é publicado) e não inclui as coordenadas das zonas.
  writeFileSync(
    join(DIR_SAIDA, 'relatorio.json'),
    JSON.stringify(
      {
        ...relatorio,
        ignorados,
        zonasPrivadas: zonas.length,
        anomalias: atividades
          .filter((a) => a.anomalias?.length)
          .map((a) => ({ id: a.id, data: a.data, nome: a.nome, anomalias: a.anomalias })),
      },
      null,
      2,
    ),
  );

  // ── Resumo no terminal ──
  const cortadas = atividades.filter((a) => a.temTrilha).length;
  const porEsporte = new Map<string, number>();
  for (const a of atividades) porEsporte.set(a.esporte, (porEsporte.get(a.esporte) ?? 0) + 1);
  const comConflito = relatorio.unidas.filter((u) => u.conflitos.length).length;

  console.log(`\nResultado: ${atividades.length} atividades (${meta.primeira} → ${meta.ultima})`);
  for (const [k, n] of Object.entries(contagemFontes)) console.log(`  ${k.padEnd(16)} ${n}`);
  console.log('Por esporte:');
  for (const [e, n] of [...porEsporte].sort((a, b) => b[1] - a[1])) console.log(`  ${e.padEnd(24)} ${n}`);
  console.log(`Duplicatas unidas: ${relatorio.unidas.length} (${comConflito} com valores divergentes > 10%)`);
  console.log(`Sessões automáticas absorvidas por outra atividade: ${relatorio.absorvidas.length}`);
  console.log(`Zonas privadas aplicadas: ${zonas.length} (${cfg.zonasPrivadas.length} manuais) · trilhas publicadas: ${cortadas}`);
  if (ignorados.length) {
    console.log(`Arquivos ignorados: ${ignorados.length}`);
    const motivos = new Map<string, number>();
    for (const i of ignorados) motivos.set(`${i.fonte}: ${i.motivo}`, (motivos.get(`${i.fonte}: ${i.motivo}`) ?? 0) + 1);
    for (const [m, n] of motivos) console.log(`  ${n}× ${m}`);
  } else {
    console.log('Arquivos ignorados: nenhum');
  }
  const anomalas = atividades.filter((a) => a.anomalias?.length).length;
  if (anomalas) console.log(`Atividades com anomalias: ${anomalas} (detalhes em data/processed/relatorio.json)`);
  console.log(`\nConcluído em ${((performance.now() - t0) / 1000).toFixed(1)} s → data/processed/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
