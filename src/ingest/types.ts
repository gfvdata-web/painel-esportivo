// Formato comum que todo adaptador de fonte produz.
// A normalização final (dedup, simplificação de trilha, geocodificação) acontece depois,
// sobre listas de AtividadeFonte — nunca olhando para o formato original.

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

/** Ponto de GPS em resolução original. `t` em epoch ms (UTC). */
export interface PontoGps {
  lat: number;
  lon: number;
  ele?: number;
  t?: number;
}

/** Amostra de série temporal (FC, velocidade, cadência…). `t` em epoch ms (UTC). */
export interface Amostra {
  t: number;
  fc?: number;
  velMs?: number;
  cadencia?: number;
  ele?: number;
  distanciaM?: number;
  potencia?: number;
}

export type EstiloNado = 'livre' | 'peito' | 'costas' | 'borboleta' | 'pernada' | 'misto' | 'desconhecido';

export interface VoltaNatacao {
  duracaoS: number;
  bracadas: number;
  estilo: EstiloNado;
  descansoS: number;
}

export interface DadosNatacao {
  piscinaM?: number;
  voltas?: number;
  bracadas?: number;
  /** Média de (segundos + braçadas) por volta. */
  swolfMedio?: number;
  /** Ritmo em segundos por 100 m, sobre o tempo nadando (sem descansos). */
  ritmo100mS?: number;
  porVolta?: VoltaNatacao[];
}

export interface AtividadeFonte {
  fonte: Fonte;
  idOriginal: string;
  esporte: Esporte;
  /** Tipo exatamente como veio da fonte (ex.: "Pedalada", "1002"). */
  tipoOriginal: string;
  /** Registrada automaticamente pelo relógio, sem o usuário iniciar. */
  autoDetectada: boolean;

  /** ISO 8601 em UTC. */
  inicioUtc: string;
  /** Deslocamento do fuso local em minutos (ex.: -180), quando a fonte informa. */
  offsetMin?: number;
  duracaoTotalS: number;
  duracaoMovimentoS?: number;

  distanciaM?: number;
  ganhoElevM?: number;
  fcMedia?: number;
  fcMax?: number;
  calorias?: number;
  velMediaMs?: number;
  velMaxMs?: number;
  cadenciaMedia?: number;

  nome?: string;
  equipamento?: string;
  dispositivo?: string;

  trilha?: PontoGps[];
  serie?: Amostra[];
  natacao?: DadosNatacao;

  /** Avisos sobre dados suspeitos, em texto curto (ex.: "tempo decorrido > 24 h"). */
  anomalias: string[];
}

export interface ArquivoIgnorado {
  arquivo: string;
  motivo: string;
}

export interface ResultadoAdaptador {
  fonte: Fonte;
  atividades: AtividadeFonte[];
  ignorados: ArquivoIgnorado[];
}

/** Cada fonte (export manual, API futura…) implementa esta interface. */
export interface Adaptador {
  fonte: Fonte;
  /** Nome legível, para o resumo do terminal. */
  descricao: string;
  /** Diz se há dados desta fonte no diretório; se não houver, o adaptador é pulado. */
  disponivel(dirRaw: string): boolean;
  ler(dirRaw: string): Promise<ResultadoAdaptador>;
}
