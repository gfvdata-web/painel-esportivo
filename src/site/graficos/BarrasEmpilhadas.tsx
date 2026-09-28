// Barras verticais empilhadas por esporte, com rolagem horizontal quando há muitas barras.
import { useState } from 'preact/hooks';
import type { Esporte } from '../../shared/modelo';
import { ESPORTES, ORDEM_ESPORTES } from '../../shared/esportes';
import type { Pilha } from '../agregados';
import { barraArredondada, ComTabela, corEsporte, Dica, type EstadoDica, escala, LinhaDica, ticks, useLargura } from './base';

interface Props {
  pilhas: Pilha[];
  rotuloX: (chave: string) => string;
  /** Rótulo mais longo, para a dica e a tabela. */
  rotuloCompleto?: (chave: string) => string;
  formatar: (v: number) => string;
  altura?: number;
  /** Mostra rótulo no eixo x só a cada N barras (automático se omitido). */
  cadaN?: number;
  titulo: string;
}

const MARGEM = { topo: 12, dir: 8, base: 26, esq: 44 };
const LARGURA_MIN_BARRA = 7;
const LARGURA_MAX_BARRA = 24;
const GAP = 2;

export function BarrasEmpilhadas({ pilhas, rotuloX, rotuloCompleto = rotuloX, formatar, altura = 260, cadaN, titulo }: Props) {
  const [ref, larguraDisponivel] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<EstadoDica>();
  const esportes = ORDEM_ESPORTES.filter((e) => pilhas.some((p) => p.porEsporte[e]));

  const n = pilhas.length;
  const larguraMin = MARGEM.esq + MARGEM.dir + n * (LARGURA_MIN_BARRA + 3);
  const largura = Math.max(larguraDisponivel, larguraMin);
  const passo = n ? (largura - MARGEM.esq - MARGEM.dir) / n : 0;
  const larguraBarra = Math.min(LARGURA_MAX_BARRA, Math.max(3, passo * 0.72));
  const max = Math.max(0, ...pilhas.map((p) => p.total));
  const marcas = ticks(max || 1);
  const topoEscala = marcas.at(-1)!;
  const y = escala(0, topoEscala, altura - MARGEM.base, MARGEM.topo);
  const intervaloRotulo = cadaN ?? Math.max(1, Math.ceil(60 / Math.max(passo, 1)));

  const tabela = () => (
    <table>
      <caption class="visualmente-oculto">{titulo}</caption>
      <thead>
        <tr>
          <th>Período</th>
          {esportes.map((e) => (
            <th class="num" key={e}>
              {ESPORTES[e].curto}
            </th>
          ))}
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {pilhas
          .filter((p) => p.total > 0)
          .map((p) => (
            <tr key={p.chave}>
              <td>{rotuloCompleto(p.chave)}</td>
              {esportes.map((e) => (
                <td class="num" key={e}>
                  {p.porEsporte[e] ? formatar(p.porEsporte[e]!) : '—'}
                </td>
              ))}
              <td class="num">{formatar(p.total)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  return (
    <ComTabela tabela={tabela}>
      <ul class="legenda" aria-label="Legenda">
        {esportes.map((e) => (
          <li key={e}>
            <span class="amostra" style={{ background: corEsporte(e) }} />
            {ESPORTES[e].rotulo}
          </li>
        ))}
      </ul>
      <div class="rolagem" ref={ref}>
        <div class="grafico" style={{ width: `${largura}px` }} onMouseLeave={() => setDica(undefined)}>
          {larguraDisponivel > 0 && (
            <svg width={largura} height={altura} role="img" aria-label={titulo}>
              {marcas.map((v) => (
                <g key={v}>
                  <line class={v === 0 ? 'eixo' : 'grade'} x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y(v)} y2={y(v)} />
                  <text x={MARGEM.esq - 6} y={y(v)} dy="0.32em" text-anchor="end">
                    {formatar(v)}
                  </text>
                </g>
              ))}
              {pilhas.map((p, i) => {
                const x = MARGEM.esq + i * passo + (passo - larguraBarra) / 2;
                let base = y(0);
                const segmentos = esportes.filter((e) => p.porEsporte[e]);
                const destacar = (ev: MouseEvent | FocusEvent) => {
                  const alvo = (ev.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
                  const cont = (ev.currentTarget as SVGElement).closest('.grafico')!.getBoundingClientRect();
                  setDica({
                    x: x + larguraBarra / 2 + (alvo.left - cont.left),
                    y: y(p.total),
                    conteudo: (
                      <>
                        <div class="titulo">{rotuloCompleto(p.chave)}</div>
                        {segmentos
                          .slice()
                          .reverse()
                          .map((e) => (
                            <LinhaDica key={e} cor={corEsporte(e)} rotulo={ESPORTES[e].curto} valor={formatar(p.porEsporte[e]!)} />
                          ))}
                        {segmentos.length > 1 && <LinhaDica rotulo="Total" valor={formatar(p.total)} />}
                        {!segmentos.length && <span class="suave">nada registrado</span>}
                      </>
                    ),
                  });
                };
                return (
                  <g key={p.chave}>
                    {segmentos.map((e, k) => {
                      const topo = y((p.total && sumAte(p, segmentos, k)) || 0);
                      const h = base - topo;
                      const ultimo = k === segmentos.length - 1;
                      const hVisivel = Math.max(ultimo ? 1 : 0, h - (ultimo ? 0 : GAP));
                      const caminho = ultimo
                        ? barraArredondada(x, base - hVisivel, larguraBarra, hVisivel, 4)
                        : `M${x},${base}h${larguraBarra}v${-hVisivel}h${-larguraBarra}Z`;
                      base = topo;
                      return <path key={e} d={caminho} fill={corEsporte(e as Esporte)} />;
                    })}
                    {/* Área de toque maior que a barra: a coluna inteira. */}
                    <rect
                      x={MARGEM.esq + i * passo}
                      y={MARGEM.topo}
                      width={passo}
                      height={altura - MARGEM.topo - MARGEM.base}
                      fill="transparent"
                      tabIndex={p.total ? 0 : -1}
                      aria-label={`${rotuloCompleto(p.chave)}: ${formatar(p.total)}`}
                      onMouseEnter={destacar}
                      onFocus={destacar}
                      onBlur={() => setDica(undefined)}
                    />
                    {i % intervaloRotulo === 0 && (
                      <text x={x + larguraBarra / 2} y={altura - MARGEM.base + 16} text-anchor="middle">
                        {rotuloX(p.chave)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          <Dica estado={dica} />
        </div>
      </div>
    </ComTabela>
  );
}

function sumAte(p: Pilha, segmentos: Esporte[], k: number): number {
  let s = 0;
  for (let i = 0; i <= k; i++) s += p.porEsporte[segmentos[i]!] ?? 0;
  return s;
}
