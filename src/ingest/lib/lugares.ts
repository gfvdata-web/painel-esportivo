// Geocodificação reversa offline (cidade/estado/país) e fuso horário por coordenada.
// Base de cidades: GeoNames (≥ 1000 habitantes) via pacote all-the-cities, que já vem no npm.
import { createRequire } from 'node:module';
import tzLookup from '@photostructure/tz-lookup';
import type { Local } from '../../shared/modelo';
import { distanciaM } from './geo';

interface Cidade {
  name: string;
  country: string;
  adminCode: string;
  population: number;
  featureCode: string;
  loc: { coordinates: [number, number] };
}

// Códigos admin1 do GeoNames para o Brasil → sigla da UF.
const UF_BR: Record<string, string> = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF', '08': 'ES',
  '11': 'MS', '13': 'MA', '14': 'MT', '15': 'MG', '16': 'PA', '17': 'PB', '18': 'PR', '20': 'PI',
  '21': 'RJ', '22': 'RN', '23': 'RS', '24': 'RO', '25': 'RR', '26': 'SC', '27': 'SP', '28': 'SE',
  '29': 'GO', '30': 'PE', '31': 'TO',
};

// PPLX = bairro; PPLH/PPLQ/PPLW = histórico, abandonado, destruído; PPLCH = antiga capital.
const BAIRROS_E_AFINS = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH']);

const nomesPaises = new Intl.DisplayNames(['pt-BR'], { type: 'region' });

let grade: Map<string, Cidade[]> | undefined;
const chave = (lat: number, lon: number) => `${Math.floor(lat)}:${Math.floor(lon)}`;

/** Indexa as cidades numa grade de 1° para a busca do vizinho mais próximo ser rápida. */
function indice(): Map<string, Cidade[]> {
  if (grade) return grade;
  const require = createRequire(import.meta.url);
  const cidades = require('all-the-cities') as Cidade[];
  grade = new Map();
  for (const c of cidades) {
    // Bairros e lugares abandonados/históricos não contam como cidade.
    if (BAIRROS_E_AFINS.has(c.featureCode)) continue;
    const [lon, lat] = c.loc.coordinates;
    const k = chave(lat, lon);
    const lista = grade.get(k);
    if (lista) lista.push(c);
    else grade.set(k, [c]);
  }
  return grade;
}

const cache = new Map<string, Omit<Local, 'lat' | 'lon'> | null>();

/** Cidade mais próxima (até ~150 km). Resultado em cache por célula de ~1 km. */
export function geocodificar(lat: number, lon: number): Omit<Local, 'lat' | 'lon'> | undefined {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (cache.has(k)) return cache.get(k) ?? undefined;
  const g = indice();
  let melhor: Cidade | undefined;
  let melhorD = Infinity;
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {
      for (const c of g.get(chave(lat + dLat, lon + dLon)) ?? []) {
        const [cLon, cLat] = c.loc.coordinates;
        const d = distanciaM({ lat, lon }, { lat: cLat, lon: cLon });
        if (d < melhorD) {
          melhorD = d;
          melhor = c;
        }
      }
    }
  }
  const resultado = melhor
    ? {
        cidade: melhor.name,
        ...(melhor.country === 'BR' && UF_BR[melhor.adminCode] ? { uf: UF_BR[melhor.adminCode] } : {}),
        pais: nomesPaises.of(melhor.country) ?? melhor.country,
        codPais: melhor.country,
      }
    : null;
  cache.set(k, resultado);
  return resultado ?? undefined;
}

export function fusoDaCoordenada(lat: number, lon: number): string {
  return tzLookup(lat, lon);
}

/** Deslocamento (min) do fuso IANA no instante dado, ex.: America/Sao_Paulo → -180. */
export function offsetDoFuso(fuso: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' }).formatToParts(instante);
  const nome = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nome);
  if (!m) return 0;
  const min = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -min : min;
}
