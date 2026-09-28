// Converte uma atividade mesclada no formato final publicado (Atividade + Detalhe + trilha).
import { createHash } from 'node:crypto';
import { nomeGerado } from '../shared/esportes';
import type { Atividade, Detalhe, EstiloNado, ResumoNatacao } from '../shared/modelo';
import type { Config, ZonaPrivada } from './config';
import { duracaoConfiavel, type Mesclada } from './dedup';
import { codificarPolyline, simplificar } from './lib/geo';
import { fusoDaCoordenada, geocodificar, offsetDoFuso } from './lib/lugares';
import { construirSerie, ganhoElevacao, melhoresTempos } from './metricas';
import { cortarTrilha } from './privacidade';
import { semVazios } from './lib/util';

export interface Normalizada {
  atividade: Atividade;
  detalhe?: Detalhe;
  trilha?: string;
}

/** Id estável: prefere o id do Strava; senão, derivado do uuid do Samsung. */
export function idEstavel(m: Pick<Mesclada, 'ids'>): string {
  if (m.ids.strava) return `s${m.ids.strava}`;
  return `h${createHash('sha1').update(m.ids.samsung ?? '').digest('hex').slice(0, 12)}`;
}

function equipamentoManual(cfg: Config, esporte: Atividade['esporte'], data: string): string | undefined {
  return cfg.equipamentos.find(
    (e) => e.esporte === esporte && (!e.de || e.de <= data) && (!e.ate || data <= e.ate),
  )?.nome;
}

export function normalizar(m: Mesclada, cfg: Config, zonas: ZonaPrivada[]): Normalizada {
  const a = m.atividade;
  const id = idEstavel(m);
  const inicio = new Date(a.inicioUtc);
  const pontos = a.trilha ?? [];
  const primeiro = pontos[0];

  // Fuso: pela coordenada; senão o padrão. O offset informado pelo relógio tem prioridade.
  const fuso = primeiro ? fusoDaCoordenada(primeiro.lat, primeiro.lon) : cfg.fusoPadrao;
  const offsetMin = a.offsetMin ?? offsetDoFuso(fuso, inicio);
  const local = new Date(inicio.getTime() + offsetMin * 60_000);
  const data = local.toISOString().slice(0, 10);

  // Cidade pelo ponto original (nível de cidade não expõe endereço); trilha publicada já cortada.
  const lugar = primeiro ? geocodificar(primeiro.lat, primeiro.lon) : undefined;
  const cortada = cortarTrilha(pontos, zonas);
  const simplificada = cortada.length >= 2 ? simplificar(cortada, cfg.trilhas.toleranciaM) : [];
  const pontoPublico = cortada[0] ?? primeiro;

  // Tempos absurdos (gravação esquecida) são trocados pelo tempo em movimento.
  const duracaoS = Math.round(duracaoConfiavel(a));

  let natacao: ResumoNatacao | undefined;
  if (a.natacao) {
    const { porVolta, ...resto } = a.natacao;
    const estilos: Partial<Record<EstiloNado, number>> = {};
    for (const v of porVolta ?? []) estilos[v.estilo] = (estilos[v.estilo] ?? 0) + 1;
    natacao = semVazios({ ...resto, estilos: porVolta?.length ? estilos : undefined });
  }

  const serie = construirSerie(a);
  const detalhe: Detalhe | undefined =
    serie || a.natacao?.porVolta ? semVazios({ id, serie, voltas: a.natacao?.porVolta }) : undefined;

  const atividade = semVazios<Atividade>({
    id,
    fontes: m.fontes,
    ids: m.ids,
    esporte: a.esporte,
    tipoOriginal: a.tipoOriginal,
    auto: a.autoDetectada,
    inicio: inicio.toISOString(),
    fuso,
    offsetMin,
    data,
    duracaoS,
    movimentoS: a.duracaoMovimentoS && Math.round(a.duracaoMovimentoS),
    distanciaM: a.distanciaM && Math.round(a.distanciaM),
    ganhoElevM: Math.round(a.ganhoElevM ?? ganhoElevacao(pontos) ?? 0) || undefined,
    fcMedia: a.fcMedia && Math.round(a.fcMedia),
    fcMax: a.fcMax && Math.round(a.fcMax),
    calorias: a.calorias && Math.round(a.calorias),
    velMediaMs: a.velMediaMs && Math.round(a.velMediaMs * 100) / 100,
    velMaxMs: a.velMaxMs && Math.round(a.velMaxMs * 100) / 100,
    cadencia: a.cadenciaMedia && Math.round(a.cadenciaMedia),
    nome: a.nome ?? nomeGerado(a.esporte, local.getUTCHours()),
    equipamento: a.equipamento ?? equipamentoManual(cfg, a.esporte, data),
    dispositivo: a.dispositivo,
    local:
      lugar && pontoPublico
        ? { lat: Math.round(pontoPublico.lat * 100) / 100, lon: Math.round(pontoPublico.lon * 100) / 100, ...lugar }
        : undefined,
    temTrilha: simplificada.length >= 2,
    temDetalhe: !!detalhe,
    natacao,
    melhores: melhoresTempos(pontos, a.esporte),
    origem: Object.keys(m.origem).length ? m.origem : undefined,
    anomalias: a.anomalias.length ? a.anomalias : undefined,
  });

  return {
    atividade,
    detalhe,
    trilha: simplificada.length >= 2 ? codificarPolyline(simplificada) : undefined,
  };
}
