// Formatação de números, tempos e datas em pt-BR.
import type { Atividade, Esporte } from '../shared/modelo';

const nf = (casas: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const nf0 = nf(0);
const nf1 = nf(1);

export const inteiro = (n: number) => nf0.format(n);
export const decimal = (n: number, casas = 1) => (casas === 1 ? nf1 : nf(casas)).format(n);

/** Quilômetros com casas decimais proporcionais ao tamanho. */
export function km(m: number | undefined): string {
  if (m === undefined) return '—';
  const k = m / 1000;
  return k >= 100 ? inteiro(k) : decimal(k, k >= 10 ? 1 : 2);
}

/** "1 h 05 min", "42 min", "35 s". */
export function duracao(s: number | undefined): string {
  if (s === undefined) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${inteiro(h)} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min`;
  return `${Math.round(s)} s`;
}

/** Horas totais para agregados: "1.234 h". */
export const horas = (s: number) => `${inteiro(Math.round(s / 3600))} h`;

/** "5:32" (mm:ss) ou "1:05:32". */
export function relogio(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const seg = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}` : `${m}:${String(seg).padStart(2, '0')}`;
}

/** Ritmo por km a partir de m/s: "5:32 /km". */
export const ritmoKm = (velMs: number | undefined) => (velMs && velMs > 0 ? `${relogio(1000 / velMs)} /km` : '—');
export const ritmo100 = (s: number | undefined) => (s ? `${relogio(s)} /100 m` : '—');
export const kmh = (velMs: number | undefined) => (velMs ? `${decimal(velMs * 3.6)} km/h` : '—');

/** Esportes em que se fala de ritmo (min/km) e não de velocidade. */
export const usaRitmo = (e: Esporte) => e === 'corrida' || e === 'caminhada' || e === 'trilha';

export function velocidadeOuRitmo(a: Pick<Atividade, 'esporte' | 'velMediaMs' | 'distanciaM' | 'movimentoS' | 'duracaoS'>): string {
  const vel = a.velMediaMs ?? (a.distanciaM ? a.distanciaM / (a.movimentoS ?? a.duracaoS) : undefined);
  if (a.esporte.startsWith('natacao')) return vel ? ritmo100(100 / vel) : '—';
  return usaRitmo(a.esporte) ? ritmoKm(vel) : kmh(vel);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-08-05" → "5 ago 2026". */
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m! - 1]} ${a}`;
}
export const mesCurto = (m: number) => MESES[m]!;
export const mesLongo = (m: number) => MESES_LONGOS[m]!;

/** Hora local "18:45" a partir do início UTC + offset. */
export function horaLocal(a: Pick<Atividade, 'inicio' | 'offsetMin'>): string {
  const d = new Date(Date.parse(a.inicio) + a.offsetMin * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`;
