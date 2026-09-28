import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esporteStrava, mapearCabecalho, parseDataStrava, stravaExport } from '../src/ingest/adapters/stravaExport';
import { numero } from '../src/ingest/lib/util';

const FIXTURES = join(import.meta.dirname, 'fixtures');

describe('parseDataStrava', () => {
  it('entende o formato pt-BR (UTC)', () => {
    expect(parseDataStrava('5 de ago. de 2026, 20:45:59')).toBe('2026-08-05T20:45:59.000Z');
    expect(parseDataStrava('1 de mai. de 2018, 07:03:00')).toBe('2018-05-01T07:03:00.000Z');
  });
  it('entende o formato em inglês com AM/PM', () => {
    expect(parseDataStrava('Aug 5, 2026, 8:45:59 PM')).toBe('2026-08-05T20:45:59.000Z');
    expect(parseDataStrava('Jan 1, 2020, 12:05:00 AM')).toBe('2020-01-01T00:05:00.000Z');
  });
  it('devolve undefined para lixo', () => {
    expect(parseDataStrava('ontem')).toBeUndefined();
  });
});

describe('numero', () => {
  it('aceita vírgula decimal e separador de milhar', () => {
    expect(numero('10,10')).toBe(10.1);
    expect(numero('1.234,5')).toBe(1234.5);
    expect(numero('10100.5')).toBe(10100.5);
    expect(numero('')).toBeUndefined();
    expect(numero('0.0', { zeroEhVazio: true })).toBeUndefined();
  });
});

describe('mapearCabecalho', () => {
  it('encontra as duas ocorrências de colunas repetidas', () => {
    const mapa = mapearCabecalho(['ID da atividade', 'Distância', 'Tempo decorrido', 'Distância', 'Tempo decorrido']);
    expect(mapa.distancia).toEqual([1, 3]);
    expect(mapa.tempoDecorrido).toEqual([2, 4]);
    expect(mapa.id).toEqual([0]);
  });
});

describe('esporteStrava', () => {
  it('normaliza tipos em pt e en', () => {
    expect(esporteStrava('Pedalada', true)).toBe('pedal');
    expect(esporteStrava('Pedalada virtual', false)).toBe('pedal');
    expect(esporteStrava('Run', true)).toBe('corrida');
    expect(esporteStrava('Trilha', true)).toBe('trilha');
    expect(esporteStrava('Caminhada', true)).toBe('caminhada');
    expect(esporteStrava('Treino com peso', false)).toBe('musculacao');
    expect(esporteStrava('Yoga', false)).toBe('outro');
  });
  it('natação com GPS vira águas abertas', () => {
    expect(esporteStrava('Natação', false)).toBe('natacao_piscina');
    expect(esporteStrava('Swim', true)).toBe('natacao_aguas_abertas');
  });
});

describe('stravaExport (fixture)', async () => {
  const { atividades, ignorados } = await stravaExport.ler(FIXTURES);
  const porId = Object.fromEntries(atividades.map((a) => [a.idOriginal, a]));

  it('lê todas as linhas do CSV', () => {
    expect(atividades).toHaveLength(3);
  });

  it('usa a distância em metros e o tempo "cru" das colunas duplicadas', () => {
    const p = porId['1001']!;
    expect(p.esporte).toBe('pedal');
    expect(p.inicioUtc).toBe('2026-08-05T20:45:59.000Z');
    expect(p.distanciaM).toBe(10100.5);
    expect(p.duracaoTotalS).toBe(5431);
    expect(p.duracaoMovimentoS).toBe(3273);
    expect(p.nome).toBe('Pedal de teste');
  });

  it('lê a trilha do GPX', () => {
    const trilha = porId['1001']!.trilha!;
    expect(trilha).toHaveLength(15);
    expect(trilha[0]).toMatchObject({ lat: 10, lon: 20, t: Date.parse('2026-08-05T20:45:59Z') });
    expect(trilha[0]!.ele).toBeTypeOf('number');
  });

  it('atividade manual fica sem trilha', () => {
    expect(porId['1002']!.trilha).toBeUndefined();
  });

  it('lê TCX compactado com espaço antes do XML e guarda a piscina', () => {
    const n = porId['1003']!;
    expect(n.esporte).toBe('natacao_piscina');
    expect(n.natacao?.piscinaM).toBe(25);
    expect(n.serie).toEqual([
      { t: Date.parse('2020-01-01T10:00:00Z'), fc: 120 },
      { t: Date.parse('2020-01-01T10:00:10Z'), fc: 130, velMs: 1.1 },
    ]);
  });

  it('relata arquivos não citados no CSV', () => {
    expect(ignorados).toContainEqual({ arquivo: 'activities/orfao.gpx', motivo: 'não citado no activities.csv' });
  });
});
