// Configuração do ingest: valores padrão + config.local.json (opcional, fora do git).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Esporte } from './types';

export interface ZonaPrivada {
  nome?: string;
  lat: number;
  lon: number;
  raioM: number;
}

export interface EquipamentoManual {
  nome: string;
  esporte: Esporte;
  /** AAAA-MM-DD, inclusivo. */
  de?: string;
  ate?: string;
}

export interface Config {
  zonasPrivadas: ZonaPrivada[];
  zonasAutomaticas: {
    ativo: boolean;
    /** Mínimo de atividades começando/terminando no mesmo lugar para virar zona. */
    minAtividades: number;
    /** Raio usado para agrupar inícios/fins próximos. */
    raioAgrupamentoM: number;
    /** Raio cortado em volta de cada zona detectada. */
    raioCorteM: number;
  };
  deduplicacao: {
    /** Inícios até esta diferença contam como a mesma atividade (se o esporte for compatível). */
    toleranciaInicioS: number;
    /** Ou: sobreposição mínima dos intervalos, relativa à atividade mais curta. */
    sobreposicaoMinima: number;
  };
  trilhas: {
    /** Tolerância do Douglas-Peucker. */
    toleranciaM: number;
  };
  /** Fuso usado quando a atividade não tem GPS nem fuso informado. */
  fusoPadrao: string;
  equipamentos: EquipamentoManual[];
}

export const CONFIG_PADRAO: Config = {
  zonasPrivadas: [],
  zonasAutomaticas: { ativo: true, minAtividades: 5, raioAgrupamentoM: 200, raioCorteM: 400 },
  deduplicacao: { toleranciaInicioS: 120, sobreposicaoMinima: 0.6 },
  trilhas: { toleranciaM: 8 },
  fusoPadrao: 'America/Sao_Paulo',
  equipamentos: [],
};

export function carregarConfig(raiz = process.cwd()): Config {
  const arq = join(raiz, 'config.local.json');
  if (!existsSync(arq)) return CONFIG_PADRAO;
  const local = JSON.parse(readFileSync(arq, 'utf8')) as Partial<Config>;
  return {
    ...CONFIG_PADRAO,
    ...local,
    zonasAutomaticas: { ...CONFIG_PADRAO.zonasAutomaticas, ...local.zonasAutomaticas },
    deduplicacao: { ...CONFIG_PADRAO.deduplicacao, ...local.deduplicacao },
    trilhas: { ...CONFIG_PADRAO.trilhas, ...local.trilhas },
    // Zonas de exemplo com lat/lon zerados são ignoradas.
    zonasPrivadas: (local.zonasPrivadas ?? []).filter((z) => z.lat || z.lon),
  };
}
