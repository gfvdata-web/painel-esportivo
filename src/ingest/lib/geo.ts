// Geometria básica sobre coordenadas: distância, simplificação e codificação de trilhas.

const RAIO_TERRA_M = 6_371_008.8;
const rad = (g: number) => (g * Math.PI) / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Distância em metros entre dois pontos (haversine). */
export function distanciaM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distância acumulada ponto a ponto (m). */
export function distanciasAcumuladas(pontos: LatLon[]): number[] {
  const acc = new Array<number>(pontos.length);
  let total = 0;
  for (let i = 0; i < pontos.length; i++) {
    if (i > 0) total += distanciaM(pontos[i - 1]!, pontos[i]!);
    acc[i] = total;
  }
  return acc;
}

/**
 * Douglas-Peucker com tolerância em metros. Projeta localmente (equiretangular),
 * o que é preciso o bastante na escala de uma atividade. Iterativo para não estourar a pilha.
 */
export function simplificar<T extends LatLon>(pontos: T[], toleranciaM: number): T[] {
  if (pontos.length <= 2) return pontos.slice();
  const lat0 = rad(pontos[0]!.lat);
  const xy = pontos.map((p) => [rad(p.lon) * Math.cos(lat0) * RAIO_TERRA_M, rad(p.lat) * RAIO_TERRA_M] as const);
  const manter = new Uint8Array(pontos.length);
  manter[0] = manter[pontos.length - 1] = 1;
  const pilha: [number, number][] = [[0, pontos.length - 1]];
  const tol2 = toleranciaM * toleranciaM;
  while (pilha.length) {
    const [ini, fim] = pilha.pop()!;
    const [ax, ay] = xy[ini]!;
    const [bx, by] = xy[fim]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = ini + 1; i < fim; i++) {
      const [px, py] = xy[i]!;
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2 && idx > 0) {
      manter[idx] = 1;
      pilha.push([ini, idx], [idx, fim]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
}

/** Codifica uma trilha no formato "encoded polyline" do Google (precisão 5 ≈ 1 m). */
export function codificarPolyline(pontos: LatLon[], precisao = 5): string {
  const fator = 10 ** precisao;
  let saida = '';
  let latAnt = 0;
  let lonAnt = 0;
  const codificar = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of pontos) {
    const lat = Math.round(p.lat * fator);
    const lon = Math.round(p.lon * fator);
    saida += codificar(lat - latAnt) + codificar(lon - lonAnt);
    latAnt = lat;
    lonAnt = lon;
  }
  return saida;
}

/** Inverso de codificarPolyline. Devolve pares [lat, lon]. */
export function decodificarPolyline(texto: string, precisao = 5): [number, number][] {
  const fator = 10 ** precisao;
  const pontos: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const ler = () => {
    let resultado = 0;
    let deslocamento = 0;
    let b: number;
    do {
      b = texto.charCodeAt(i++) - 63;
      resultado |= (b & 0x1f) << deslocamento;
      deslocamento += 5;
    } while (b >= 0x20);
    return resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
  };
  while (i < texto.length) {
    lat += ler();
    lon += ler();
    pontos.push([lat / fator, lon / fator]);
  }
  return pontos;
}
