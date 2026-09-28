import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dataSamsung,
  lerCsvSamsung,
  natacaoDoAdicional,
  offsetSamsung,
  samsungHealthExport,
  serieDoLiveData,
} from '../src/ingest/adapters/samsungHealthExport';

const FIXTURES = join(import.meta.dirname, 'fixtures');

describe('utilitários do Samsung Health', () => {
  it('lê horário UTC e fuso', () => {
    expect(dataSamsung('2023-03-08 20:49:38.983')).toBe(Date.parse('2023-03-08T20:49:38.983Z'));
    expect(offsetSamsung('UTC-0300')).toBe(-180);
    expect(offsetSamsung('UTC+0530')).toBe(330);
    expect(offsetSamsung('')).toBeUndefined();
  });

  it('pula a linha de metadados e remove o prefixo das colunas', () => {
    const csv = 'com.samsung.shealth.exercise,1,1\nsource_type,com.samsung.health.exercise.distance\n4,100.5\n';
    expect(lerCsvSamsung(csv)).toEqual([{ source_type: '4', distance: '100.5' }]);
  });

  it('funde o live_data fragmentado por instante', () => {
    const serie = serieDoLiveData([
      { start_time: 2000, heart_rate: 120 },
      { start_time: 1000, speed: 2.5, cadence: 80 },
      { start_time: 2000, speed: 3 },
      { start_time: 3000 },
    ]);
    expect(serie).toEqual([
      { t: 1000, velMs: 2.5, cadencia: 80 },
      { t: 2000, fc: 120, velMs: 3 },
    ]);
  });

  it('calcula SWOLF e ritmo a partir das voltas', () => {
    const n = natacaoDoAdicional({
      pool_length: 25,
      pool_length_unit: 'meter',
      total_distance: 50,
      lengths: [
        { duration: 30000, stroke_count: 15, stroke_type: 'Freestyle', resting_time: 0 },
        { duration: 40000, stroke_count: 17, stroke_type: 'Breaststroke', resting_time: 20000 },
      ],
    })!;
    expect(n.voltas).toBe(2);
    expect(n.bracadas).toBe(32);
    expect(n.swolfMedio).toBe(51); // ((30+15) + (40+17)) / 2
    expect(n.ritmo100mS).toBe(140); // 70 s nadando / 50 m × 100
    expect(n.porVolta?.map((v) => v.estilo)).toEqual(['livre', 'peito']);
    expect(n.porVolta?.[1]?.descansoS).toBe(20);
  });
});

describe('samsungHealthExport (fixture)', async () => {
  const { atividades, ignorados } = await samsungHealthExport.ler(FIXTURES);
  const porTipo = (t: string) => atividades.find((a) => a.tipoOriginal === t)!;

  it('lê as sessões sem ignorar nada', () => {
    expect(atividades).toHaveLength(4);
    expect(ignorados).toEqual([]);
  });

  it('natação: métricas por volta, dispositivo e fuso', () => {
    const n = porTipo('14001');
    expect(n.esporte).toBe('natacao_piscina');
    expect(n.offsetMin).toBe(-180);
    expect(n.dispositivo).toBe('Galaxy Fit3');
    expect(n.distanciaM).toBe(1275);
    expect(n.natacao).toMatchObject({ piscinaM: 25, voltas: 51, bracadas: 709 });
    expect(n.natacao?.ritmo100mS).toBeGreaterThan(100);
    expect(n.serie?.length).toBeGreaterThan(0);
  });

  it('corrida: trilha do location_data e tempo ativo separado do total', () => {
    const c = porTipo('1002');
    expect(c.esporte).toBe('corrida');
    expect(c.trilha).toHaveLength(20);
    expect(c.trilha![0]).toMatchObject({ lat: 10, lon: 20 });
    expect(c.duracaoMovimentoS).toBeLessThanOrEqual(c.duracaoTotalS);
    expect(c.autoDetectada).toBe(false);
  });

  it('caminhada automática é marcada', () => {
    const w = porTipo('1001');
    expect(w.esporte).toBe('caminhada');
    expect(w.autoDetectada).toBe(true);
  });

  it('treino de academia (15002) vira musculação, sem aviso', () => {
    const x = porTipo('15002');
    expect(x.esporte).toBe('musculacao');
    expect(x.anomalias).toEqual([]);
  });
});
