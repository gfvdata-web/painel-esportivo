// Contas sobre a lista de atividades usadas por várias telas.
import type { Atividade, Esporte } from '../shared/modelo';

export type Metrica = 'distancia' | 'tempo' | 'contagem';
export type Granularidade = 'semana' | 'mes' | 'ano';

export function valorMetrica(a: Atividade, m: Metrica): number {
  if (m === 'distancia') return (a.distanciaM ?? 0) / 1000;
  if (m === 'tempo') return (a.movimentoS ?? a.duracaoS) / 3600;
  return 1;
}

/** Segunda-feira da semana (AAAA-MM-DD) de uma data local. */
export function inicioSemana(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

export function chavePeriodo(data: string, g: Granularidade): string {
  if (g === 'ano') return data.slice(0, 4);
  if (g === 'mes') return data.slice(0, 7);
  return inicioSemana(data);
}

/** Lista contínua de períodos entre duas datas (inclui os vazios). */
export function periodosEntre(primeira: string, ultima: string, g: Granularidade): string[] {
  const saida: string[] = [];
  if (g === 'ano') {
    for (let a = +primeira.slice(0, 4); a <= +ultima.slice(0, 4); a++) saida.push(String(a));
    return saida;
  }
  if (g === 'mes') {
    let [a, m] = primeira.split('-').map(Number) as [number, number];
    const fim = ultima.slice(0, 7);
    for (;;) {
      const k = `${a}-${String(m).padStart(2, '0')}`;
      saida.push(k);
      if (k >= fim) break;
      m++;
      if (m > 12) {
        m = 1;
        a++;
      }
    }
    return saida;
  }
  const d = new Date(`${inicioSemana(primeira)}T00:00:00Z`);
  const fim = inicioSemana(ultima);
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    saida.push(k);
    if (k >= fim) break;
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return saida;
}

export interface Pilha {
  chave: string;
  porEsporte: Partial<Record<Esporte, number>>;
  total: number;
}

export function empilhar(atividades: Atividade[], g: Granularidade, m: Metrica): Pilha[] {
  if (!atividades.length) return [];
  const datas = atividades.map((a) => a.data).sort();
  const mapa = new Map<string, Pilha>(
    periodosEntre(datas[0]!, datas.at(-1)!, g).map((k) => [k, { chave: k, porEsporte: {}, total: 0 }]),
  );
  for (const a of atividades) {
    const p = mapa.get(chavePeriodo(a.data, g));
    if (!p) continue;
    const v = valorMetrica(a, m);
    p.porEsporte[a.esporte] = (p.porEsporte[a.esporte] ?? 0) + v;
    p.total += v;
  }
  return [...mapa.values()];
}

export interface Totais {
  atividades: number;
  segundos: number;
  metros: number;
  elevacao: number;
  dias: number;
}

export function totais(atividades: Atividade[]): Totais {
  const dias = new Set<string>();
  let segundos = 0;
  let metros = 0;
  let elevacao = 0;
  for (const a of atividades) {
    dias.add(a.data);
    segundos += a.movimentoS ?? a.duracaoS;
    metros += a.distanciaM ?? 0;
    elevacao += a.ganhoElevM ?? 0;
  }
  return { atividades: atividades.length, segundos, metros, elevacao, dias: dias.size };
}

/** Sequência atual e maior sequência de semanas seguidas com pelo menos uma atividade. */
export function sequenciasSemanas(atividades: Atividade[], hoje = new Date().toISOString().slice(0, 10)) {
  const semanas = new Set(atividades.map((a) => inicioSemana(a.data)));
  if (!semanas.size) return { atual: 0, maior: 0, maiorFim: undefined as string | undefined };
  const todas = periodosEntre([...semanas].sort()[0]!, hoje, 'semana');
  let maior = 0;
  let maiorFim: string | undefined;
  let corrente = 0;
  for (const s of todas) {
    corrente = semanas.has(s) ? corrente + 1 : 0;
    if (corrente > maior) {
      maior = corrente;
      maiorFim = s;
    }
  }
  // A semana atual ainda em andamento não quebra a sequência.
  const ultima = todas.at(-1)!;
  let atual = 0;
  for (let i = todas.length - 1; i >= 0; i--) {
    if (semanas.has(todas[i]!)) atual++;
    else if (todas[i] !== ultima) break;
  }
  return { atual, maior, maiorFim };
}

export function agruparPor<T, K>(itens: T[], chave: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const i of itens) {
    const k = chave(i);
    const l = m.get(k);
    if (l) l.push(i);
    else m.set(k, [i]);
  }
  return m;
}
