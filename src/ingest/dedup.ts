// Deduplicação entre fontes e merge campo a campo.
//
// Duas atividades de fontes diferentes são a mesma quando os esportes são compatíveis e
// (a) os inícios diferem até `toleranciaInicioS`, ou (b) os intervalos se sobrepõem em pelo menos
// `sobreposicaoMinima` da mais curta. Comparamos intervalos, e não durações, porque o Samsung
// registra o tempo ativo e o Strava o tempo decorrido.
//
// Sessões detectadas automaticamente pelo relógio que caem dentro de uma atividade de outro
// esporte (ex.: "caminhada" durante um pedal) são absorvidas: não viram atividade própria.
import type { Config } from './config';
import type { AtividadeFonte, Esporte, Fonte } from './types';

export interface Grupo {
  /** Uma atividade por fonte. */
  partes: Partial<Record<Fonte, AtividadeFonte>>;
}

export interface Conflito {
  campo: string;
  valores: Partial<Record<Fonte, number | string>>;
  escolhido: Fonte;
}

export interface RelatorioDedup {
  unidas: { strava: string; samsung: string; diferencaInicioS: number; sobreposicao: number; conflitos: Conflito[] }[];
  absorvidas: { samsung: string; dentroDe: string; esporte: Esporte }[];
}

/** Duração usada para o intervalo: ignora tempos absurdos (gravação esquecida ligada). */
export function duracaoConfiavel(a: AtividadeFonte): number {
  const suspeita = a.anomalias.some((m) => m.startsWith('tempo decorrido'));
  return suspeita && a.duracaoMovimentoS ? a.duracaoMovimentoS : a.duracaoTotalS;
}

function intervalo(a: AtividadeFonte): [number, number] {
  const ini = Date.parse(a.inicioUtc);
  return [ini, ini + duracaoConfiavel(a) * 1000];
}

const FAMILIAS: Esporte[][] = [
  ['caminhada', 'trilha', 'corrida'],
  ['natacao_piscina', 'natacao_aguas_abertas'],
];

export function esportesCompativeis(a: Esporte, b: Esporte): boolean {
  if (a === b || a === 'outro' || b === 'outro') return true;
  return FAMILIAS.some((f) => f.includes(a) && f.includes(b));
}

export function sobreposicao(a: AtividadeFonte, b: AtividadeFonte): number {
  const [ia, fa] = intervalo(a);
  const [ib, fb] = intervalo(b);
  const comum = Math.max(0, Math.min(fa, fb) - Math.max(ia, ib));
  const menor = Math.min(fa - ia, fb - ib);
  return menor > 0 ? comum / menor : 0;
}

export function agrupar(
  strava: AtividadeFonte[],
  samsung: AtividadeFonte[],
  cfg: Config['deduplicacao'],
): { grupos: Grupo[]; relatorio: RelatorioDedup } {
  const relatorio: RelatorioDedup = { unidas: [], absorvidas: [] };
  const grupos: Grupo[] = strava.map((s) => ({ partes: { strava: s } }));
  const porId = new Map(grupos.map((g) => [g.partes.strava!.idOriginal, g]));
  const ordenadas = [...strava].sort((a, b) => a.inicioUtc.localeCompare(b.inicioUtc));
  const inicios = ordenadas.map((a) => Date.parse(a.inicioUtc));

  // Candidatas por proximidade de horário (busca binária numa janela de ±1 dia).
  const vizinhas = (a: AtividadeFonte) => {
    const t = Date.parse(a.inicioUtc);
    let lo = 0;
    let hi = inicios.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (inicios[m]! < t - 86_400_000) lo = m + 1;
      else hi = m;
    }
    const saida: AtividadeFonte[] = [];
    for (let i = lo; i < ordenadas.length && inicios[i]! <= t + 86_400_000; i++) saida.push(ordenadas[i]!);
    return saida;
  };

  for (const h of samsung) {
    let melhor: { s: AtividadeFonte; sob: number; dIni: number } | undefined;
    let hospedeira: AtividadeFonte | undefined;
    for (const s of vizinhas(h)) {
      const sob = sobreposicao(s, h);
      if (sob <= 0) continue;
      const dIni = Math.abs(Date.parse(s.inicioUtc) - Date.parse(h.inicioUtc)) / 1000;
      const bate = dIni <= cfg.toleranciaInicioS || sob >= cfg.sobreposicaoMinima;
      if (bate && esportesCompativeis(s.esporte, h.esporte) && !porId.get(s.idOriginal)!.partes.samsung) {
        if (!melhor || sob > melhor.sob) melhor = { s, sob, dIni };
      } else if (h.autoDetectada && sob >= 0.8) {
        hospedeira = s;
      }
    }
    if (melhor) {
      const g = porId.get(melhor.s.idOriginal)!;
      g.partes.samsung = h;
      relatorio.unidas.push({
        strava: melhor.s.idOriginal,
        samsung: h.idOriginal,
        diferencaInicioS: Math.round(melhor.dIni),
        sobreposicao: Math.round(melhor.sob * 100) / 100,
        conflitos: [],
      });
    } else if (hospedeira) {
      relatorio.absorvidas.push({ samsung: h.idOriginal, dentroDe: hospedeira.idOriginal, esporte: h.esporte });
    } else {
      grupos.push({ partes: { samsung: h } });
    }
  }
  return { grupos, relatorio };
}

// Qual fonte vence em cada campo quando as duas têm valor.
const PREFERENCIA: Record<string, Fonte> = {
  nome: 'strava',
  equipamento: 'strava',
  distanciaM: 'strava',
  ganhoElevM: 'strava',
  duracaoTotalS: 'strava',
  duracaoMovimentoS: 'strava',
  velMediaMs: 'strava',
  velMaxMs: 'strava',
  fcMedia: 'samsung',
  fcMax: 'samsung',
  calorias: 'samsung',
  cadenciaMedia: 'samsung',
  dispositivo: 'samsung',
  offsetMin: 'samsung',
  natacao: 'samsung',
};

export interface Mesclada {
  atividade: AtividadeFonte;
  fontes: Fonte[];
  ids: Partial<Record<Fonte, string>>;
  origem: Record<string, Fonte>;
  conflitos: Conflito[];
}

/** Combina as partes de um grupo numa única atividade, anotando a origem de cada campo. */
export function mesclar(g: Grupo): Mesclada {
  const s = g.partes.strava;
  const h = g.partes.samsung;
  const fontes = (['strava', 'samsung'] as const).filter((f) => g.partes[f]);
  const ids = Object.fromEntries(fontes.map((f) => [f, g.partes[f]!.idOriginal]));
  if (!s || !h) {
    const unica = (s ?? h)!;
    return { atividade: unica, fontes, ids, origem: {}, conflitos: [] };
  }

  const origem: Record<string, Fonte> = {};
  const conflitos: Conflito[] = [];
  const base: AtividadeFonte = { ...s, anomalias: [...new Set([...s.anomalias, ...h.anomalias])] };
  const partes = { strava: s, samsung: h } as const;

  // Se o Strava tem tempo absurdo (gravação esquecida ligada) e o relógio não, as medidas de
  // tempo/distância/velocidade e a trilha do Strava não são confiáveis: o Samsung passa a vencer.
  const tempoSuspeito = (a: AtividadeFonte) => a.anomalias.some((m) => m.startsWith('tempo decorrido'));
  const stravaSuspeito = tempoSuspeito(s) && !tempoSuspeito(h);
  const CAMPOS_TEMPO = ['distanciaM', 'duracaoTotalS', 'duracaoMovimentoS', 'velMediaMs', 'velMaxMs', 'ganhoElevM'];

  for (const [campo, padrao] of Object.entries(PREFERENCIA)) {
    const preferida: Fonte = stravaSuspeito && CAMPOS_TEMPO.includes(campo) ? 'samsung' : padrao;
    const outra: Fonte = preferida === 'strava' ? 'samsung' : 'strava';
    const vp = (partes[preferida] as unknown as Record<string, unknown>)[campo];
    const vo = (partes[outra] as unknown as Record<string, unknown>)[campo];
    const escolhida = vp !== undefined ? preferida : vo !== undefined ? outra : undefined;
    if (!escolhida) continue;
    (base as unknown as Record<string, unknown>)[campo] = escolhida === preferida ? vp : vo;
    origem[campo] = escolhida;
    if (typeof vp === 'number' && typeof vo === 'number' && Math.abs(vp - vo) > 0.1 * Math.max(Math.abs(vp), Math.abs(vo))) {
      conflitos.push({ campo, valores: { [preferida]: vp, [outra]: vo }, escolhido: escolhida });
    }
  }

  // Esporte: o do Strava, salvo quando ele não sabe ("outro").
  base.esporte = s.esporte === 'outro' ? h.esporte : s.esporte;
  // Trilha: a mais completa; o Strava vence no empate.
  const nS = s.trilha?.length ?? 0;
  const nH = h.trilha?.length ?? 0;
  if (nS || nH) {
    const usarStrava = nH === 0 || (nS >= nH && !stravaSuspeito);
    base.trilha = usarStrava ? s.trilha : h.trilha;
    // Trilha do Strava com gravação esquecida: fica só o trecho coberto pelo relógio.
    if (usarStrava && stravaSuspeito && base.trilha) {
      const limite = Date.parse(h.inicioUtc) + (duracaoConfiavel(h) + 60) * 1000;
      base.trilha = base.trilha.filter((p) => p.t === undefined || p.t <= limite);
    }
    origem.trilha = usarStrava ? 'strava' : 'samsung';
  }
  if (stravaSuspeito) base.anomalias = h.anomalias.slice();
  // Série: a do relógio (tem FC) quando existir.
  const serieH = h.serie?.some((a) => a.fc) ? h.serie : undefined;
  base.serie = serieH ?? s.serie ?? h.serie;
  if (base.serie) origem.serie = base.serie === s.serie ? 'strava' : 'samsung';
  base.autoDetectada = false;

  return { atividade: base, fontes, ids, origem, conflitos };
}
