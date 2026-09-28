import { describe, expect, it } from 'vitest';
import { CONFIG_PADRAO } from '../src/ingest/config';
import { agrupar, esportesCompativeis, mesclar } from '../src/ingest/dedup';
import { codificarPolyline, decodificarPolyline, distanciaM, simplificar } from '../src/ingest/lib/geo';
import { fusoDaCoordenada, geocodificar, offsetDoFuso } from '../src/ingest/lib/lugares';
import { construirSerie, ganhoElevacao, melhoresTempos } from '../src/ingest/metricas';
import { idEstavel, normalizar } from '../src/ingest/normalizar';
import { cortarTrilha, detectarZonas } from '../src/ingest/privacidade';
import type { AtividadeFonte, PontoGps } from '../src/ingest/types';

const T0 = Date.parse('2025-01-10T10:00:00Z');

function atividade(p: Partial<AtividadeFonte> & Pick<AtividadeFonte, 'fonte' | 'idOriginal'>): AtividadeFonte {
  return {
    esporte: 'corrida',
    tipoOriginal: 'x',
    autoDetectada: false,
    inicioUtc: new Date(T0).toISOString(),
    duracaoTotalS: 3600,
    anomalias: [],
    ...p,
  };
}

/** Linha reta para o norte, 1 ponto por segundo, `velMs` metros por segundo. */
function reta(n: number, velMs: number, lat0 = 10, lon0 = 20): PontoGps[] {
  const grauPorM = 1 / 111_195;
  return Array.from({ length: n }, (_, i) => ({ lat: lat0 + i * velMs * grauPorM, lon: lon0, t: T0 + i * 1000 }));
}

describe('geo', () => {
  it('polyline ida e volta', () => {
    const pts = [
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ];
    // Exemplo oficial da documentação do Google.
    expect(codificarPolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodificarPolyline(codificarPolyline(pts))).toEqual(pts.map((p) => [p.lat, p.lon]));
  });

  it('Douglas-Peucker remove pontos colineares e mantém as pontas', () => {
    const r = reta(100, 3);
    const s = simplificar(r, 5);
    expect(s).toHaveLength(2);
    expect(s[0]).toBe(r[0]);
    expect(s[1]).toBe(r[99]);
  });

  it('distância de 1 grau de latitude ≈ 111 km', () => {
    expect(distanciaM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -2);
  });
});

describe('dedup', () => {
  const strava = atividade({ fonte: 'strava', idOriginal: '1', esporte: 'pedal', nome: 'Pedal', distanciaM: 20000 });

  it('une atividades que se sobrepõem, mesmo com início 10 min diferente', () => {
    const samsung = atividade({
      fonte: 'samsung',
      idOriginal: 'a',
      esporte: 'pedal',
      inicioUtc: new Date(T0 + 600_000).toISOString(),
      duracaoTotalS: 2400,
      fcMedia: 140,
      distanciaM: 17000,
    });
    const { grupos, relatorio } = agrupar([strava], [samsung], CONFIG_PADRAO.deduplicacao);
    expect(grupos).toHaveLength(1);
    expect(relatorio.unidas[0]).toMatchObject({ strava: '1', samsung: 'a', diferencaInicioS: 600 });

    const m = mesclar(grupos[0]!);
    expect(m.fontes).toEqual(['strava', 'samsung']);
    expect(m.atividade.nome).toBe('Pedal');
    expect(m.atividade.fcMedia).toBe(140);
    expect(m.atividade.distanciaM).toBe(20000);
    expect(m.origem).toMatchObject({ nome: 'strava', fcMedia: 'samsung', distanciaM: 'strava' });
    expect(m.conflitos.map((c) => c.campo)).toContain('distanciaM');
  });

  it('não une atividades distantes no tempo', () => {
    const outra = atividade({ fonte: 'samsung', idOriginal: 'b', esporte: 'pedal', inicioUtc: new Date(T0 + 7200_000).toISOString() });
    expect(agrupar([strava], [outra], CONFIG_PADRAO.deduplicacao).grupos).toHaveLength(2);
  });

  it('absorve caminhada automática dentro de um pedal', () => {
    const auto = atividade({
      fonte: 'samsung',
      idOriginal: 'c',
      esporte: 'caminhada',
      autoDetectada: true,
      inicioUtc: new Date(T0 + 900_000).toISOString(),
      duracaoTotalS: 900,
    });
    const { grupos, relatorio } = agrupar([strava], [auto], CONFIG_PADRAO.deduplicacao);
    expect(grupos).toHaveLength(1);
    expect(relatorio.absorvidas).toEqual([{ samsung: 'c', dentroDe: '1', esporte: 'caminhada' }]);
  });

  it('com gravação esquecida no Strava, tempo e distância vêm do relógio', () => {
    const esquecida = atividade({
      fonte: 'strava',
      idOriginal: '2',
      esporte: 'caminhada',
      duracaoTotalS: 1_000_000,
      duracaoMovimentoS: 3000,
      distanciaM: 41000,
      anomalias: ['tempo decorrido acima de 24 h'],
    });
    const relogio = atividade({ fonte: 'samsung', idOriginal: 'd', esporte: 'caminhada', duracaoTotalS: 3000, distanciaM: 4900 });
    const { grupos } = agrupar([esquecida], [relogio], CONFIG_PADRAO.deduplicacao);
    const m = mesclar(grupos[0]!);
    expect(m.atividade.distanciaM).toBe(4900);
    expect(m.atividade.duracaoTotalS).toBe(3000);
    expect(m.atividade.anomalias).toEqual([]);
  });

  it('compatibilidade de esportes', () => {
    expect(esportesCompativeis('caminhada', 'trilha')).toBe(true);
    expect(esportesCompativeis('pedal', 'outro')).toBe(true);
    expect(esportesCompativeis('pedal', 'caminhada')).toBe(false);
  });
});

describe('privacidade', () => {
  it('detecta onde muitas atividades começam e corta as pontas da trilha', () => {
    const casa = { lat: 10, lon: 20 };
    const extremos = Array.from({ length: 6 }, (_, i) => ({ idAtividade: String(i), ponto: { lat: 10.0001 * (1 + i * 1e-7), lon: 20 } }));
    extremos.push({ idAtividade: 'x', ponto: { lat: 11, lon: 21 } });
    const zonas = detectarZonas(extremos, { minAtividades: 5, raioAgrupamentoM: 200, raioCorteM: 400 });
    expect(zonas).toHaveLength(1);
    expect(distanciaM(zonas[0]!, casa)).toBeLessThan(50);

    // Ida e volta: sai de casa, anda ~1,8 km, volta.
    const ida = reta(600, 3);
    const trilha = [...ida, ...ida.slice().reverse()];
    const cortada = cortarTrilha(trilha, zonas);
    expect(cortada.length).toBeLessThan(trilha.length);
    expect(distanciaM(cortada[0]!, casa)).toBeGreaterThan(400);
    expect(distanciaM(cortada.at(-1)!, casa)).toBeGreaterThan(400);
  });

  it('trilha inteira dentro da zona some', () => {
    expect(cortarTrilha(reta(10, 1), [{ lat: 10, lon: 20, raioM: 500 }])).toEqual([]);
  });
});

describe('métricas', () => {
  it('melhor 1k numa corrida constante a 4 m/s = 250 s', () => {
    const m = melhoresTempos(reta(600, 4), 'corrida');
    expect(m?.['1k']).toBe(250);
    expect(m?.['5k']).toBeUndefined();
  });

  it('ignora saltos de GPS impossíveis', () => {
    const pts = reta(400, 3);
    pts[200] = { ...pts[200]!, lat: pts[200]!.lat + 0.01 }; // salto de ~1 km e volta
    // Sem o filtro, o salto de 2 km (ida e volta) daria um "1k" em poucos segundos.
    const m = melhoresTempos(pts, 'corrida');
    expect(m?.['1k']).toBeGreaterThanOrEqual(333);
  });

  it('ganho de elevação com histerese', () => {
    const eles = [100, 101, 100, 105, 104, 110, 109, 120];
    expect(ganhoElevacao(eles.map((ele) => ({ lat: 0, lon: 0, ele })))).toBe(20);
  });

  it('série reamostrada em colunas', () => {
    const a = atividade({
      fonte: 'samsung',
      idOriginal: 'e',
      trilha: reta(300, 3).map((p, i) => ({ ...p, ele: 100 + i / 10 })),
      serie: [{ t: T0 + 10_000, fc: 120 }],
    });
    const s = construirSerie(a, 30)!;
    expect(s.t).toHaveLength(30);
    expect(s.fc?.filter((v) => v !== null)).toEqual([120]);
    expect(s.distM?.at(-1)).toBeGreaterThan(850);
  });
});

describe('lugares e normalização', () => {
  it('geocodifica offline e ignora bairros', () => {
    expect(geocodificar(-20.3194, -40.3378)).toMatchObject({ cidade: 'Vitória', uf: 'ES', pais: 'Brasil', codPais: 'BR' });
    expect(geocodificar(-23.5733, -46.6417)?.cidade).toBe('São Paulo');
  });

  it('fuso pela coordenada e offset no instante', () => {
    expect(fusoDaCoordenada(-23.5, -46.6)).toBe('America/Sao_Paulo');
    expect(offsetDoFuso('America/Sao_Paulo', new Date('2025-01-10T10:00:00Z'))).toBe(-180);
    expect(offsetDoFuso('Europe/Lisbon', new Date('2025-07-10T10:00:00Z'))).toBe(60);
  });

  it('gera id estável, data local, nome e trilha sem as pontas da zona', () => {
    const a = atividade({ fonte: 'samsung', idOriginal: 'uuid-1', trilha: reta(600, 3, -20.32, -40.34) });
    const m = { atividade: a, fontes: ['samsung' as const], ids: { samsung: 'uuid-1' }, origem: {}, conflitos: [] };
    const n = normalizar(m, CONFIG_PADRAO, [{ lat: -20.32, lon: -40.34, raioM: 300 }]);
    expect(n.atividade.id).toBe(idEstavel(m));
    expect(n.atividade.id).toMatch(/^h[0-9a-f]{12}$/);
    expect(n.atividade.data).toBe('2025-01-10');
    expect(n.atividade.nome).toBe('Corrida matinal'); // 07:00 no horário local
    expect(n.atividade.local?.cidade).toBe('Vitória');
    const pontos = decodificarPolyline(n.trilha!);
    expect(distanciaM({ lat: pontos[0]![0], lon: pontos[0]![1] }, { lat: -20.32, lon: -40.34 })).toBeGreaterThan(300);
  });
});
