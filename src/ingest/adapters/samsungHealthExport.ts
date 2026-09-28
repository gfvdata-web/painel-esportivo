// Adaptador do export "Baixar dados pessoais" do Samsung Health (data/raw/samsung-health/).
//
// Particularidades do formato:
//  - Cada CSV tem uma linha de metadados antes do cabeçalho real
//    (ex.: "com.samsung.shealth.exercise,7006011,17").
//  - Colunas do exercício vêm com prefixo "com.samsung.health.exercise."; removemos.
//  - start_time/end_time estão em UTC; o fuso local está em time_offset ("UTC-0300").
//  - duration é o tempo ATIVO em ms (sem pausas).
//  - source_type 4 = sessão detectada automaticamente pelo relógio.
//  - Os campos *_data guardam o NOME de um JSON em jsons/<pacote>/<1º caractere>/<nome>.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { anomaliasDeTempo, coordenadaValida, listarArquivos, numero, semVazios } from '../lib/util';
import type {
  Adaptador,
  Amostra,
  ArquivoIgnorado,
  AtividadeFonte,
  DadosNatacao,
  Esporte,
  EstiloNado,
  PontoGps,
  VoltaNatacao,
} from '../types';

const PACOTE_EXERCICIO = 'com.samsung.shealth.exercise';
const PREFIXO_COLUNA = 'com.samsung.health.exercise.';

/**
 * Códigos de exercise_type conhecidos. Os que faltam viram "outro" (mantendo o código
 * em tipoOriginal) até serem confirmados.
 */
export const TIPOS_SAMSUNG: Record<string, { esporte: Esporte; rotulo: string }> = {
  '0': { esporte: 'outro', rotulo: 'Personalizado' },
  '1001': { esporte: 'caminhada', rotulo: 'Caminhada' },
  '1002': { esporte: 'corrida', rotulo: 'Corrida' },
  '11007': { esporte: 'pedal', rotulo: 'Pedal' },
  '13001': { esporte: 'trilha', rotulo: 'Trilha' },
  '14001': { esporte: 'natacao_piscina', rotulo: 'Natação (piscina)' },
  '9014001': { esporte: 'natacao_piscina', rotulo: 'Natação' },
  // Treinos de academia, identificados pelo perfil das sessões (sem GPS, duração e FC típicas).
  '15002': { esporte: 'musculacao', rotulo: 'Musculação' },
  '15003': { esporte: 'musculacao', rotulo: 'Aparelho de cardio' },
  '15005': { esporte: 'musculacao', rotulo: 'Esteira' },
  '10007': { esporte: 'musculacao', rotulo: 'Treino funcional' },
};

const ESTILOS: Record<string, EstiloNado> = {
  Freestyle: 'livre',
  Breaststroke: 'peito',
  Backstroke: 'costas',
  Butterfly: 'borboleta',
  Kickboard: 'pernada',
  Mixed: 'misto',
  IndividualMedley: 'misto',
};

/** Lê um CSV do Samsung Health: pula a linha de metadados e tira o prefixo das colunas. */
export function lerCsvSamsung(texto: string, prefixo = PREFIXO_COLUNA): Record<string, string>[] {
  const semMeta = texto.replace(/^﻿/, '').replace(/^[^\n]*\n/, '');
  return parse(semMeta, {
    columns: (cab: string[]) => cab.map((c) => (c.startsWith(prefixo) ? c.slice(prefixo.length) : c).trim()),
    relax_column_count: true,
    skip_empty_lines: true,
  });
}

/** "2023-03-08 20:49:38.983" (UTC) → epoch ms. */
export function dataSamsung(texto: string | undefined): number | undefined {
  if (!texto) return undefined;
  const t = Date.parse(texto.trim().replace(' ', 'T') + 'Z');
  return Number.isNaN(t) ? undefined : t;
}

/** "UTC-0300" → -180. */
export function offsetSamsung(texto: string | undefined): number | undefined {
  const m = /^UTC([+-])(\d{2}):?(\d{2})$/.exec(texto?.trim() ?? '');
  if (!m) return undefined;
  const min = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -min : min;
}

interface Adicional {
  exercise_type?: number;
  pool_length?: number;
  pool_length_unit?: string;
  total_distance?: number;
  lengths?: { duration: number; stroke_count: number; stroke_type: string; resting_time?: number }[];
}

export function natacaoDoAdicional(ad: Adicional): DadosNatacao | undefined {
  const lengths = ad.lengths ?? [];
  if (!lengths.length && !ad.pool_length) return undefined;
  const fator = ad.pool_length_unit === 'yard' ? 0.9144 : 1;
  const piscinaM = ad.pool_length ? ad.pool_length * fator : undefined;
  const porVolta: VoltaNatacao[] = lengths.map((l) => ({
    duracaoS: l.duration / 1000,
    bracadas: l.stroke_count,
    estilo: ESTILOS[l.stroke_type] ?? 'desconhecido',
    descansoS: (l.resting_time ?? 0) / 1000,
  }));
  const nadandoS = porVolta.reduce((s, v) => s + v.duracaoS, 0);
  const bracadas = porVolta.reduce((s, v) => s + v.bracadas, 0);
  const distancia = ad.total_distance || (piscinaM ? piscinaM * porVolta.length : 0);
  const arred = (n: number, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas;
  return semVazios<DadosNatacao>({
    piscinaM,
    voltas: porVolta.length || undefined,
    bracadas: bracadas || undefined,
    swolfMedio: porVolta.length
      ? arred(porVolta.reduce((s, v) => s + v.duracaoS + v.bracadas, 0) / porVolta.length)
      : undefined,
    ritmo100mS: distancia && nadandoS ? arred((nadandoS / distancia) * 100) : undefined,
    porVolta: porVolta.length ? porVolta : undefined,
  });
}

/** Junta as entradas do live_data (que vêm fragmentadas por métrica) em amostras por instante. */
export function serieDoLiveData(itens: Record<string, number>[]): Amostra[] {
  const porTempo = new Map<number, Amostra>();
  for (const it of itens) {
    if (typeof it.start_time !== 'number') continue;
    const a = porTempo.get(it.start_time) ?? { t: it.start_time };
    if (it.heart_rate) a.fc = it.heart_rate;
    if (it.speed !== undefined) a.velMs = it.speed;
    if (it.cadence) a.cadencia = it.cadence;
    if (it.distance !== undefined) a.distanciaM = it.distance;
    if (it.power) a.potencia = it.power;
    porTempo.set(it.start_time, a);
  }
  return [...porTempo.values()].filter((a) => Object.keys(a).length > 1).sort((x, y) => x.t - y.t);
}

export function trilhaDoLocationData(itens: Record<string, number>[]): PontoGps[] {
  return itens
    // O relógio grava (200, 200) como marcador (pausas); só passam coordenadas válidas.
    .filter((p) => coordenadaValida(p.latitude, p.longitude))
    .map((p) =>
      semVazios<PontoGps>({ lat: p.latitude!, lon: p.longitude!, ele: p.altitude, t: p.start_time }),
    )
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

/** Acha a pasta do export mais recente (samsunghealth_<usuário>_<data>/). */
export function acharExportSamsung(dirSamsung: string): string | undefined {
  if (!existsSync(dirSamsung)) return undefined;
  const re = /^com\.samsung\.shealth\.exercise\.(\d+)\.csv$/;
  const csvs = listarArquivos(dirSamsung)
    .filter((f) => re.test(basename(f)))
    .sort((a, b) => re.exec(basename(a))![1]!.localeCompare(re.exec(basename(b))![1]!));
  const ultimo = csvs.at(-1);
  return ultimo && dirname(ultimo);
}

function nomesDispositivos(dirExport: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const arq = listarArquivos(dirExport).find((f) => /^com\.samsung\.health\.device_profile\.\d+\.csv$/.test(basename(f)));
  if (!arq) return mapa;
  for (const d of lerCsvSamsung(readFileSync(arq, 'utf8'), '')) {
    if (!d.deviceuuid) continue;
    // "My Device" é o próprio celular; usamos o modelo para não expor o nome pessoal.
    mapa.set(d.deviceuuid, d.name && d.name !== 'My Device' ? d.name : `Celular ${d.model ?? ''}`.trim());
  }
  return mapa;
}

export function lerExportSamsung(dirExport: string): { atividades: AtividadeFonte[]; ignorados: ArquivoIgnorado[] } {
  const csv = listarArquivos(dirExport).find((f) => /^com\.samsung\.shealth\.exercise\.\d+\.csv$/.test(basename(f)))!;
  const dirJson = join(dirExport, 'jsons', PACOTE_EXERCICIO);
  const dispositivos = nomesDispositivos(dirExport);
  const ignorados: ArquivoIgnorado[] = [];
  const atividades: AtividadeFonte[] = [];

  const lerJson = <T>(nome: string | undefined): T | undefined => {
    if (!nome) return undefined;
    const caminho = join(dirJson, nome[0]!, nome);
    if (!existsSync(caminho)) {
      ignorados.push({ arquivo: nome, motivo: 'JSON citado no CSV mas ausente' });
      return undefined;
    }
    try {
      return JSON.parse(readFileSync(caminho, 'utf8')) as T;
    } catch (e) {
      ignorados.push({ arquivo: nome, motivo: `JSON inválido: ${(e as Error).message}` });
      return undefined;
    }
  };

  for (const r of lerCsvSamsung(readFileSync(csv, 'utf8'))) {
    const inicio = dataSamsung(r.start_time);
    const fim = dataSamsung(r.end_time);
    if (!r.datauuid || inicio === undefined) {
      ignorados.push({ arquivo: basename(csv), motivo: `linha sem datauuid ou start_time (${r.datauuid ?? '?'})` });
      continue;
    }
    const codigo = r.exercise_type ?? '';
    const tipo = TIPOS_SAMSUNG[codigo];
    const anomalias: string[] = [];
    if (!tipo) anomalias.push(`código de exercício ${codigo} ainda sem mapeamento`);

    const adicional = lerJson<Adicional>(r.additional);
    const natacao = adicional ? natacaoDoAdicional(adicional) : undefined;
    let esporte: Esporte = tipo?.esporte ?? 'outro';
    if (adicional?.exercise_type === 14001 && esporte === 'outro') esporte = 'natacao_piscina';
    if (esporte === 'natacao_piscina' && natacao && !natacao.piscinaM) anomalias.push('piscina sem comprimento configurado');

    const trilhaBruta = lerJson<Record<string, number>[]>(r.location_data);
    const trilha = trilhaBruta?.length ? trilhaDoLocationData(trilhaBruta) : undefined;
    if (esporte === 'natacao_piscina' && trilha && trilha.length > 20) esporte = 'natacao_aguas_abertas';

    const live = lerJson<Record<string, number>[]>(r.live_data);
    const serie = live?.length ? serieDoLiveData(live) : undefined;

    const duracaoMovimentoS = (numero(r.duration) ?? 0) / 1000;
    const duracaoTotalS = fim !== undefined && fim > inicio ? (fim - inicio) / 1000 : duracaoMovimentoS;
    anomalias.push(...anomaliasDeTempo(duracaoTotalS, duracaoMovimentoS));

    atividades.push(
      semVazios<AtividadeFonte>({
        fonte: 'samsung',
        idOriginal: r.datauuid,
        esporte,
        tipoOriginal: codigo,
        autoDetectada: r.source_type === '4',
        inicioUtc: new Date(inicio).toISOString(),
        offsetMin: offsetSamsung(r.time_offset),
        duracaoTotalS,
        duracaoMovimentoS: duracaoMovimentoS || undefined,
        distanciaM: numero(r.distance, { zeroEhVazio: true }),
        ganhoElevM: numero(r.altitude_gain, { zeroEhVazio: true }),
        fcMedia: numero(r.mean_heart_rate, { zeroEhVazio: true }),
        fcMax: numero(r.max_heart_rate, { zeroEhVazio: true }),
        calorias: numero(r.calorie, { zeroEhVazio: true }),
        velMediaMs: numero(r.mean_speed, { zeroEhVazio: true }),
        velMaxMs: numero(r.max_speed, { zeroEhVazio: true }),
        cadenciaMedia: numero(r.mean_cadence, { zeroEhVazio: true }),
        nome: r.title || undefined,
        dispositivo: dispositivos.get(r.deviceuuid ?? ''),
        trilha,
        serie,
        natacao,
        anomalias,
      }),
    );
  }
  return { atividades, ignorados };
}

export const samsungHealthExport: Adaptador = {
  fonte: 'samsung',
  descricao: 'Export do Samsung Health',
  disponivel: (dirRaw) => acharExportSamsung(join(dirRaw, 'samsung-health')) !== undefined,
  async ler(dirRaw) {
    const dirExport = acharExportSamsung(join(dirRaw, 'samsung-health'));
    if (!dirExport) return { fonte: 'samsung', atividades: [], ignorados: [] };
    return { fonte: 'samsung', ...lerExportSamsung(dirExport) };
  },
};
