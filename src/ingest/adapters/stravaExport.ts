// Adaptador do export completo da conta Strava (data/raw/strava/).
//
// O activities.csv vem com cabeçalhos no idioma da conta e colunas com nome repetido:
//  - 1ª "Distância"/"Distance": na unidade de exibição (km), com vírgula decimal em pt-BR;
//  - 2ª "Distância"/"Distance": em metros, com ponto decimal. É a que usamos.
//  - O mesmo vale para "Tempo decorrido" e "Frequência cardíaca máxima" (a 2ª é a numérica "crua").
// A data da atividade está em UTC (confere com o <time>…Z</time> dos GPX).
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'csv-parse/sync';
import { formatoDoArquivo, lerArquivoTrilha } from '../lib/arquivosTrilha';
import { anomaliasDeTempo, listarArquivos, numero, semVazios } from '../lib/util';
import type { Adaptador, ArquivoIgnorado, AtividadeFonte, Esporte, ResultadoAdaptador } from '../types';

/** Nomes possíveis de cada coluna (pt-BR e inglês). */
const COLUNAS = {
  id: ['ID da atividade', 'Activity ID'],
  data: ['Data da atividade', 'Activity Date'],
  nome: ['Nome da atividade', 'Activity Name'],
  tipo: ['Tipo de atividade', 'Activity Type'],
  tempoDecorrido: ['Tempo decorrido', 'Elapsed Time'],
  tempoMovimento: ['Tempo de movimentação', 'Moving Time'],
  distancia: ['Distância', 'Distance'],
  fcMax: ['Frequência cardíaca máxima', 'Max Heart Rate'],
  fcMedia: ['Frequência cardíaca média', 'Average Heart Rate'],
  velMax: ['Velocidade máx.', 'Max Speed'],
  velMedia: ['Velocidade média', 'Average Speed'],
  ganhoElev: ['Ganho de elevação', 'Elevation Gain'],
  cadencia: ['Cadência média', 'Average Cadence'],
  calorias: ['Calorias', 'Calories'],
  equipamento: ['Equipamento da atividade', 'Activity Gear'],
  arquivo: ['Nome do arquivo', 'Filename'],
  piscina: ['Extensão da piscina', 'Pool Length'],
} as const;

type Coluna = keyof typeof COLUNAS;

/** Índices de cada ocorrência de cada coluna no cabeçalho. */
export function mapearCabecalho(cabecalho: string[]): Record<Coluna, number[]> {
  const mapa = {} as Record<Coluna, number[]>;
  for (const [chave, nomes] of Object.entries(COLUNAS) as [Coluna, readonly string[]][]) {
    mapa[chave] = cabecalho.flatMap((c, i) => (nomes.includes(c.trim()) ? [i] : []));
  }
  return mapa;
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

/**
 * Converte a data do CSV (UTC) para ISO.
 * pt-BR: "5 de ago. de 2026, 20:45:59"   en: "Aug 5, 2026, 8:45:59 PM"
 */
export function parseDataStrava(texto: string): string | undefined {
  const s = texto.trim();
  let dia: number, mes: number | undefined, ano: number, h: number, min: number, seg: number;
  let m = /^(\d{1,2}) de (\p{L}+)\.? de (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})$/u.exec(s);
  if (m) {
    [dia, mes, ano, h, min, seg] = [+m[1]!, MESES[m[2]!.slice(0, 3).toLowerCase()], +m[3]!, +m[4]!, +m[5]!, +m[6]!];
  } else {
    m = /^(\p{L}+)\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/iu.exec(s);
    if (!m) return undefined;
    [mes, dia, ano, h, min, seg] = [MESES[m[1]!.slice(0, 3).toLowerCase()], +m[2]!, +m[3]!, +m[4]!, +m[5]!, +m[6]!];
    const ampm = m[7]?.toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }
  if (!mes) return undefined;
  return new Date(Date.UTC(ano, mes - 1, dia, h, min, seg)).toISOString();
}

const ESPORTES: [RegExp, Esporte][] = [
  [/^(corrida|run|trail ?run|corrida em trilha|virtual ?run|corrida virtual)/i, 'corrida'],
  [/(pedal|ride|bike|ciclismo|cycling|velomobile|handcycle)/i, 'pedal'],
  [/^(natação|natacao|swim)/i, 'natacao_piscina'],
  [/^(trilha|hike|caminhada na trilha)/i, 'trilha'],
  [/^(caminhada|walk)/i, 'caminhada'],
  [/(treino com peso|weight ?training|musculação|crossfit|workout|treino)/i, 'musculacao'],
];

export function esporteStrava(tipo: string, temTrilha: boolean): Esporte {
  const esporte = ESPORTES.find(([re]) => re.test(tipo.trim()))?.[1] ?? 'outro';
  // Natação com GPS só acontece em águas abertas.
  if (esporte === 'natacao_piscina' && temTrilha) return 'natacao_aguas_abertas';
  return esporte;
}

export function lerActivitiesCsv(
  texto: string,
  dirStrava: string,
): ResultadoAdaptador & { arquivosCitados: string[] } {
  const linhas: string[][] = parse(texto.replace(/^﻿/, ''), { relax_column_count: true, skip_empty_lines: true });
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { fonte: 'strava', atividades: [], ignorados: [], arquivosCitados: [] };
  const col = mapearCabecalho(cabecalho);
  const ignorados: ArquivoIgnorado[] = [];
  const atividades: AtividadeFonte[] = [];
  const arquivosCitados: string[] = [];

  // Pega a ocorrência "crua" (a última) de uma coluna, ou a única que existir.
  const valor = (linha: string[], c: Coluna, ocorrencia: 'primeira' | 'ultima' = 'ultima') => {
    const idx = col[c];
    const i = ocorrencia === 'primeira' ? idx[0] : idx[idx.length - 1];
    return i === undefined ? undefined : linha[i]?.trim();
  };

  for (const linha of dados) {
    const id = valor(linha, 'id');
    const inicioUtc = parseDataStrava(valor(linha, 'data') ?? '');
    if (!id || !inicioUtc) {
      ignorados.push({ arquivo: 'activities.csv', motivo: `linha sem ID ou data legível (${id ?? '?'})` });
      continue;
    }
    const anomalias: string[] = [];
    const tipo = valor(linha, 'tipo') ?? '';

    // Distância: 2ª coluna em metros; se só houver uma, ela está em km.
    let distanciaM = col.distancia.length > 1 ? numero(valor(linha, 'distancia')) : undefined;
    if (distanciaM === undefined && col.distancia.length === 1) {
      const km = numero(valor(linha, 'distancia', 'primeira'));
      if (km !== undefined) distanciaM = km * 1000;
    }

    let trilha: AtividadeFonte['trilha'];
    let serie: AtividadeFonte['serie'];
    const arquivo = valor(linha, 'arquivo');
    if (arquivo) {
      arquivosCitados.push(arquivo);
      const caminho = join(dirStrava, arquivo);
      if (!existsSync(caminho)) {
        ignorados.push({ arquivo, motivo: 'citado no activities.csv mas ausente' });
      } else if (!formatoDoArquivo(arquivo)) {
        ignorados.push({ arquivo, motivo: 'formato de trilha não suportado' });
      } else {
        try {
          const conteudo = lerArquivoTrilha(caminho);
          if (conteudo.pontos.length) trilha = conteudo.pontos;
          if (conteudo.amostras.length) serie = conteudo.amostras;
        } catch (e) {
          ignorados.push({ arquivo, motivo: `erro ao ler: ${(e as Error).message}` });
        }
      }
    }

    const duracaoTotalS = numero(valor(linha, 'tempoDecorrido')) ?? 0;
    const duracaoMovimentoS = numero(valor(linha, 'tempoMovimento'), { zeroEhVazio: true });
    anomalias.push(...anomaliasDeTempo(duracaoTotalS, duracaoMovimentoS));

    const piscina = numero(valor(linha, 'piscina'), { zeroEhVazio: true });
    const esporte = esporteStrava(tipo, !!trilha);

    atividades.push(
      semVazios<AtividadeFonte>({
        fonte: 'strava',
        idOriginal: id,
        esporte,
        tipoOriginal: tipo,
        autoDetectada: false,
        inicioUtc,
        duracaoTotalS,
        duracaoMovimentoS,
        distanciaM: distanciaM || undefined,
        ganhoElevM: numero(valor(linha, 'ganhoElev')),
        fcMedia: numero(valor(linha, 'fcMedia'), { zeroEhVazio: true }),
        fcMax: numero(valor(linha, 'fcMax'), { zeroEhVazio: true }),
        calorias: numero(valor(linha, 'calorias'), { zeroEhVazio: true }),
        velMediaMs: numero(valor(linha, 'velMedia'), { zeroEhVazio: true }),
        velMaxMs: numero(valor(linha, 'velMax'), { zeroEhVazio: true }),
        cadenciaMedia: numero(valor(linha, 'cadencia'), { zeroEhVazio: true }),
        nome: valor(linha, 'nome') || undefined,
        equipamento: valor(linha, 'equipamento') || undefined,
        trilha,
        serie,
        natacao: piscina ? { piscinaM: piscina } : undefined,
        anomalias,
      }),
    );
  }
  return { fonte: 'strava', atividades, ignorados, arquivosCitados };
}

export const stravaExport: Adaptador = {
  fonte: 'strava',
  descricao: 'Export da conta Strava',
  disponivel: (dirRaw) => existsSync(join(dirRaw, 'strava', 'activities.csv')),
  async ler(dirRaw) {
    const dir = join(dirRaw, 'strava');
    const { arquivosCitados, ...resultado } = lerActivitiesCsv(readFileSync(join(dir, 'activities.csv'), 'utf8'), dir);

    // Arquivos de trilha que o CSV não menciona também entram no relatório.
    const citados = new Set(arquivosCitados);
    const dirAtividades = join(dir, 'activities');
    if (existsSync(dirAtividades)) {
      for (const caminho of listarArquivos(dirAtividades)) {
        const rel = relative(dir, caminho).replace(/\\/g, '/');
        if (!citados.has(rel)) resultado.ignorados.push({ arquivo: rel, motivo: 'não citado no activities.csv' });
      }
    }
    return resultado;
  },
};
