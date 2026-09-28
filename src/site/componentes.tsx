// Componentes de layout reutilizados pelas telas.
import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Atividade, Esporte } from '../shared/modelo';
import { ESPORTES, ORDEM_ESPORTES } from '../shared/esportes';
import type { Dados } from './dados';
import { corEsporte } from './graficos/base';

// ── Estado global (dados + filtros que valem para todas as telas) ──
export interface Filtros {
  esportes: Set<Esporte>;
  incluirAuto: boolean;
}

export interface Contexto {
  dados: Dados;
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
  /** Atividades já filtradas pelos filtros globais. */
  atividades: Atividade[];
}

export const Ctx = createContext<Contexto>(null!);
export const usePainel = () => useContext(Ctx);

export function aplicarFiltros(atividades: Atividade[], f: Filtros): Atividade[] {
  return atividades.filter((a) => (f.incluirAuto || !a.auto) && (!f.esportes.size || f.esportes.has(a.esporte)));
}

// ── Layout ──
export function Intro({ kicker, titulo, children }: { kicker: string; titulo: string; children?: ComponentChildren }) {
  return (
    <header class="intro">
      <p class="kicker">{kicker}</p>
      <h1>{titulo}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

export function Secao({
  numero,
  titulo,
  sub,
  children,
}: {
  numero: number;
  titulo: string;
  sub?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="secao">
      <div class="secao-titulo">
        <span class="numero">{String(numero).padStart(2, '0')} —</span>
        <h2>{titulo}</h2>
        {sub && <span class="suave">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

export function Tile({ rotulo, valor, unidade, detalhe }: { rotulo: string; valor: string; unidade?: string; detalhe?: ComponentChildren }) {
  return (
    <div class="cartao tile">
      <div class="rotulo">{rotulo}</div>
      <div class="valor">
        {valor}
        {unidade && <small>{unidade}</small>}
      </div>
      {detalhe && <div class="detalhe">{detalhe}</div>}
    </div>
  );
}

export function ChipEsporte({ esporte, curto }: { esporte: Esporte; curto?: boolean }) {
  return (
    <span class="chip-esporte">
      <span class="amostra" style={{ background: corEsporte(esporte) }} />
      {curto ? ESPORTES[esporte].curto : ESPORTES[esporte].rotulo}
    </span>
  );
}

/** Linha de filtros globais: esportes (pílulas) + caminhadas automáticas. */
export function FiltrosGlobais({ children }: { children?: ComponentChildren }) {
  const { dados, filtros, setFiltros } = usePainel();
  const presentes = ORDEM_ESPORTES.filter((e) => dados.atividades.some((a) => a.esporte === e));
  const alternar = (e: Esporte) => {
    const s = new Set(filtros.esportes);
    if (s.has(e)) s.delete(e);
    else s.add(e);
    setFiltros({ ...filtros, esportes: s });
  };
  return (
    <div class="filtros" role="group" aria-label="Filtros">
      <div class="grupo">
        <button
          type="button"
          class="pilula"
          aria-pressed={filtros.esportes.size === 0}
          onClick={() => setFiltros({ ...filtros, esportes: new Set() })}
        >
          Todos
        </button>
        {presentes.map((e) => (
          <button type="button" key={e} class="pilula" aria-pressed={filtros.esportes.has(e)} onClick={() => alternar(e)}>
            <ChipEsporte esporte={e} curto />
          </button>
        ))}
      </div>
      <div class="grupo">
        <button
          type="button"
          class="pilula"
          aria-pressed={filtros.incluirAuto}
          onClick={() => setFiltros({ ...filtros, incluirAuto: !filtros.incluirAuto })}
          title="Caminhadas registradas automaticamente pelo relógio"
        >
          Incluir automáticas
        </button>
      </div>
      {children}
    </div>
  );
}

/** Grupo de pílulas de escolha única. */
export function Opcoes<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo: string;
  opcoes: [T, string][];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <div class="grupo" role="group" aria-label={rotulo}>
      <label class="rotulo">{rotulo}</label>
      {opcoes.map(([v, texto]) => (
        <button type="button" key={v} class="pilula" aria-pressed={valor === v} onClick={() => aoMudar(v)}>
          {texto}
        </button>
      ))}
    </div>
  );
}

export const linkAtividade = (id: string) => `#/atividade/${id}`;
