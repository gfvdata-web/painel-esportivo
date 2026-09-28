// Rótulos dos esportes, usados no ingest (nomes gerados) e no site.
import type { Esporte } from './modelo';

export interface InfoEsporte {
  rotulo: string;
  /** Rótulo curto para legendas estreitas. */
  curto: string;
  /** Gênero gramatical do substantivo usado nos nomes gerados ("Corrida noturna", "Treino noturno"). */
  genero: 'f' | 'm';
  substantivo: string;
}

export const ESPORTES: Record<Esporte, InfoEsporte> = {
  corrida: { rotulo: 'Corrida', curto: 'Corrida', genero: 'f', substantivo: 'Corrida' },
  pedal: { rotulo: 'Pedal', curto: 'Pedal', genero: 'f', substantivo: 'Pedalada' },
  natacao_piscina: { rotulo: 'Natação (piscina)', curto: 'Piscina', genero: 'f', substantivo: 'Natação' },
  natacao_aguas_abertas: { rotulo: 'Natação (águas abertas)', curto: 'Águas abertas', genero: 'f', substantivo: 'Natação em águas abertas' },
  caminhada: { rotulo: 'Caminhada', curto: 'Caminhada', genero: 'f', substantivo: 'Caminhada' },
  trilha: { rotulo: 'Trilha', curto: 'Trilha', genero: 'f', substantivo: 'Trilha' },
  musculacao: { rotulo: 'Musculação', curto: 'Musculação', genero: 'm', substantivo: 'Treino de musculação' },
  outro: { rotulo: 'Outros', curto: 'Outros', genero: 'm', substantivo: 'Treino' },
};

/** Ordem fixa dos esportes em legendas e pilhas de gráfico. */
export const ORDEM_ESPORTES: Esporte[] = [
  'corrida',
  'pedal',
  'natacao_piscina',
  'natacao_aguas_abertas',
  'caminhada',
  'trilha',
  'musculacao',
  'outro',
];

/** "Corrida matinal", "Treino noturno"… a partir da hora local. */
export function nomeGerado(esporte: Esporte, horaLocal: number): string {
  const { substantivo, genero } = ESPORTES[esporte];
  const periodo =
    horaLocal >= 5 && horaLocal < 12
      ? 'matinal'
      : horaLocal >= 12 && horaLocal < 18
        ? genero === 'f' ? 'vespertina' : 'vespertino'
        : genero === 'f' ? 'noturna' : 'noturno';
  return `${substantivo} ${periodo}`;
}
