// Peças comuns dos gráficos SVG: largura responsiva, escalas, "ticks" e a dica flutuante.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Esporte } from '../../shared/modelo';

export const corEsporte = (e: Esporte) => `var(--esp-${e})`;

/** Mede a largura do contêiner e acompanha redimensionamentos. */
export function useLargura<T extends HTMLElement>(): [preact.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargura(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, largura];
}

/** Valores "redondos" para o eixo (1, 2, 5 × 10^n). */
export function ticks(max: number, quantidade = 4, min = 0): number[] {
  const faixa = max - min;
  if (faixa <= 0) return [min];
  const bruto = faixa / quantidade;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => faixa / p <= quantidade) ?? 10 * mag;
  const saida: number[] = [];
  // Vai até o primeiro valor ≥ max, para a escala sempre cobrir a maior barra.
  for (let v = Math.ceil(min / passo) * passo; v < max + passo - passo * 1e-9; v += passo) saida.push(Math.round(v * 1e6) / 1e6);
  return saida;
}

export const escala = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** Retângulo com os cantos de cima arredondados (ponta de dado) e a base reta. */
export function barraArredondada(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface EstadoDica {
  x: number;
  y: number;
  conteudo: ComponentChildren;
}

export function Dica({ estado }: { estado?: EstadoDica }) {
  if (!estado) return null;
  return (
    <div class="dica" style={{ left: `${estado.x}px`, top: `${estado.y}px` }} role="status">
      {estado.conteudo}
    </div>
  );
}

export function LinhaDica({ cor, rotulo, valor }: { cor?: string; rotulo: string; valor: string }) {
  return (
    <div class="linha">
      <span>
        {cor && <span class="amostra" style={{ background: cor }} />}
        {rotulo}
      </span>
      <strong class="num">{valor}</strong>
    </div>
  );
}

/** Botão "ver como tabela" + a tabela, para ninguém depender de cor ou de hover. */
export function ComTabela({ tabela, children }: { tabela: () => ComponentChildren; children: ComponentChildren }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <>
      {mostrar ? <div class="tabela-rolagem">{tabela()}</div> : children}
      <button type="button" class="alternar-tabela" onClick={() => setMostrar(!mostrar)}>
        {mostrar ? 'ver gráfico' : 'ver como tabela'}
      </button>
    </>
  );
}
