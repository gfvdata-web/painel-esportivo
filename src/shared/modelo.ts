// Formato final gravado em data/processed/ e lido pelo site.
// Mantido pequeno de propósito: o que é pesado (trilhas, séries) fica em arquivos separados.

export type Fonte = 'strava' | 'samsung';

export type Esporte =
  | 'corrida'
  | 'pedal'
  | 'natacao_piscina'
  | 'natacao_aguas_abertas'
  | 'caminhada'
  | 'trilha'
  | 'musculacao'
  | 'outro';

export type EstiloNado = 'livre' | 'peito' | 'costas' | 'borboleta' | 'pernada' | 'misto' | 'desconhecido';

export interface Local {
  /** Ponto aproximado (2 casas decimais ≈ 1 km), já depois das zonas privadas. */
  lat: number;
  lon: number;
  cidade: string;
  uf?: string;
  pais: string;
  codPais: string;
}

export interface ResumoNatacao {
  piscinaM?: number;
  voltas?: number;
  bracadas?: number;
  swolfMedio?: number;
  ritmo100mS?: number;
  /** Número de voltas por estilo. */
  estilos?: Partial<Record<EstiloNado, number>>;
}

export interface Atividade {
  id: string;
  fontes: Fonte[];
  ids: Partial<Record<Fonte, string>>;
  esporte: Esporte;
  tipoOriginal: string;
  /** Detectada automaticamente pelo relógio. */
  auto: boolean;

  /** Início em UTC (ISO 8601). */
  inicio: string;
  /** Fuso IANA do local da atividade (ex.: America/Sao_Paulo). */
  fuso: string;
  offsetMin: number;
  /** Data local AAAA-MM-DD, para agrupar por dia sem refazer contas de fuso. */
  data: string;

  /** Duração total, já sem tempos absurdos (gravação esquecida ligada). */
  duracaoS: number;
  movimentoS?: number;
  distanciaM?: number;
  ganhoElevM?: number;
  fcMedia?: number;
  fcMax?: number;
  calorias?: number;
  velMediaMs?: number;
  velMaxMs?: number;
  cadencia?: number;

  nome: string;
  equipamento?: string;
  dispositivo?: string;

  local?: Local;
  temTrilha: boolean;
  temDetalhe: boolean;
  natacao?: ResumoNatacao;
  /** Melhores tempos (s) por distância dentro da atividade, ex.: { "5k": 1620 }. */
  melhores?: Record<string, number>;

  /** Fonte de cada campo quando a atividade veio de duas fontes. */
  origem?: Record<string, Fonte>;
  anomalias?: string[];
}

export interface VoltaNatacao {
  duracaoS: number;
  bracadas: number;
  estilo: EstiloNado;
  descansoS: number;
}

/** Série temporal em colunas (t em segundos desde o início). Valores ausentes = null. */
export interface Serie {
  t: number[];
  fc?: (number | null)[];
  velMs?: (number | null)[];
  ele?: (number | null)[];
  distM?: (number | null)[];
}

export interface Detalhe {
  id: string;
  serie?: Serie;
  voltas?: VoltaNatacao[];
}

/** id da atividade → trilha simplificada em "encoded polyline" (precisão 5). */
export type Trilhas = Record<string, string>;

export interface Meta {
  geradoEm: string;
  total: number;
  porFonte: Record<string, number>;
  primeira?: string;
  ultima?: string;
}

/** Distâncias usadas para os melhores tempos, por esporte. */
export const DISTANCIAS_RECORDE: Partial<Record<Esporte, [string, number][]>> = {
  corrida: [
    ['1k', 1000],
    ['5k', 5000],
    ['10k', 10000],
    ['21k', 21097.5],
    ['42k', 42195],
  ],
  pedal: [
    ['10k', 10000],
    ['20k', 20000],
    ['40k', 40000],
    ['100k', 100000],
  ],
};
