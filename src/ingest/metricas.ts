// Métricas derivadas: melhores tempos por distância, série reamostrada e ganho de elevação.
import { DISTANCIAS_RECORDE, type Serie } from '../shared/modelo';
import { distanciaM } from './lib/geo';
import type { AtividadeFonte, Esporte, PontoGps } from './types';

/** Velocidade acima da qual um trecho de GPS é considerado salto (m/s). */
// Corrida: 6,5 m/s ≈ 2:34/km, acima de qualquer amador; evita recordes inventados por ruído de GPS.
const VEL_MAXIMA: Partial<Record<Esporte, number>> = { corrida: 6.5, caminhada: 4, trilha: 4, pedal: 25 };

/** Distância acumulada ignorando saltos de GPS impossíveis para o esporte. */
export function acumuladoLimpo(pontos: PontoGps[], esporte: Esporte): number[] {
  const limite = VEL_MAXIMA[esporte] ?? 50;
  const acc: number[] = [0];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1]!;
    const b = pontos[i]!;
    let d = distanciaM(a, b);
    const dt = a.t !== undefined && b.t !== undefined ? (b.t - a.t) / 1000 : undefined;
    // Pontos com o mesmo horário contam como 1 s, senão viram distância em tempo zero.
    if (dt !== undefined && d / Math.max(dt, 1) > limite) d = 0;
    acc.push(acc[i - 1]! + d);
  }
  return acc;
}

/**
 * Menor tempo (s) para percorrer cada distância-alvo, com janela deslizante (dois ponteiros).
 * Precisa de pontos com tempo.
 */
export function melhoresTempos(pontos: PontoGps[], esporte: Esporte): Record<string, number> | undefined {
  const alvos = DISTANCIAS_RECORDE[esporte];
  if (!alvos || pontos.length < 2 || pontos.some((p) => p.t === undefined)) return undefined;
  const acc = acumuladoLimpo(pontos, esporte);
  const total = acc[acc.length - 1]!;
  const saida: Record<string, number> = {};
  for (const [rotulo, alvo] of alvos) {
    if (total < alvo) continue;
    let melhor = Infinity;
    let i = 0;
    for (let j = 1; j < pontos.length; j++) {
      while (i < j && acc[j]! - acc[i + 1]! >= alvo) i++;
      if (acc[j]! - acc[i]! >= alvo) {
        // A janela i..j passa do alvo por no máximo o 1º trecho (i→i+1): interpola o início
        // dentro desse trecho para a janela ter exatamente a distância-alvo.
        const excesso = acc[j]! - acc[i]! - alvo;
        const trecho = acc[i + 1]! - acc[i]!;
        const dtTrecho = pontos[i + 1]!.t! - pontos[i]!.t!;
        const tIni = pontos[i]!.t! + (trecho > 0 ? (excesso / trecho) * dtTrecho : 0);
        const dt = (pontos[j]!.t! - tIni) / 1000;
        if (dt > 0) melhor = Math.min(melhor, dt);
      }
    }
    if (Number.isFinite(melhor)) saida[rotulo] = Math.round(melhor);
  }
  return Object.keys(saida).length ? saida : undefined;
}

/** Ganho de elevação com histerese (ignora oscilações menores que `limiarM`). */
export function ganhoElevacao(pontos: PontoGps[], limiarM = 3): number | undefined {
  const eles = pontos.map((p) => p.ele).filter((e): e is number => e !== undefined);
  if (eles.length < 2) return undefined;
  let ganho = 0;
  let ref = eles[0]!;
  for (const e of eles) {
    if (e - ref >= limiarM) {
      ganho += e - ref;
      ref = e;
    } else if (ref - e >= limiarM) {
      ref = e;
    }
  }
  return Math.round(ganho);
}

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined);
const arred = (v: number | undefined, casas: number) =>
  v === undefined ? null : Math.round(v * 10 ** casas) / 10 ** casas;

/**
 * Série para o gráfico da atividade: junta trilha (elevação, distância) e sensores (FC, velocidade)
 * em até `maxPontos` baldes de tempo.
 */
export function construirSerie(a: AtividadeFonte, maxPontos = 600): Serie | undefined {
  const t0 = Date.parse(a.inicioUtc);
  const trilha = (a.trilha ?? []).filter((p) => p.t !== undefined);
  const sensores = a.serie ?? [];
  if (!trilha.length && !sensores.length) return undefined;

  const acc = trilha.length ? acumuladoLimpo(trilha, a.esporte) : [];
  const tFim = Math.max(trilha.at(-1)?.t ?? t0, sensores.at(-1)?.t ?? t0);
  const dur = (tFim - t0) / 1000;
  if (dur <= 0) return undefined;
  const n = Math.max(2, Math.min(maxPontos, Math.ceil(dur / 5)));
  const largura = dur / n;

  type Balde = { fc: number[]; vel: number[]; ele: number[]; dist?: number };
  const baldes: Balde[] = Array.from({ length: n }, () => ({ fc: [], vel: [], ele: [] }));
  const idx = (t: number) => Math.min(n - 1, Math.max(0, Math.floor((t - t0) / 1000 / largura)));

  trilha.forEach((p, i) => {
    const b = baldes[idx(p.t!)]!;
    if (p.ele !== undefined) b.ele.push(p.ele);
    b.dist = acc[i];
  });
  for (const s of sensores) {
    const b = baldes[idx(s.t)]!;
    if (s.fc) b.fc.push(s.fc);
    if (s.velMs !== undefined) b.vel.push(s.velMs);
    if (s.ele !== undefined) b.ele.push(s.ele);
    if (!trilha.length && s.distanciaM !== undefined) b.dist = Math.max(b.dist ?? 0, s.distanciaM);
  }

  const serie: Required<Serie> = { t: [], fc: [], velMs: [], ele: [], distM: [] };
  let distAnt: { t: number; d: number } | undefined;
  baldes.forEach((b, i) => {
    const t = Math.round((i + 0.5) * largura);
    let vel = media(b.vel);
    if (vel === undefined && b.dist !== undefined && distAnt && t > distAnt.t) {
      vel = (b.dist - distAnt.d) / (t - distAnt.t);
    }
    if (b.dist !== undefined) distAnt = { t, d: b.dist };
    serie.t.push(t);
    serie.fc.push(arred(media(b.fc), 0));
    serie.velMs.push(arred(vel, 2));
    serie.ele.push(arred(media(b.ele), 1));
    serie.distM.push(b.dist === undefined ? null : Math.round(b.dist));
  });

  const resultado: Serie = { t: serie.t };
  for (const k of ['fc', 'velMs', 'ele', 'distM'] as const) {
    if (serie[k].some((v) => v !== null)) resultado[k] = serie[k];
  }
  return Object.keys(resultado).length > 1 ? resultado : undefined;
}
