// Gráfico de linhas (ou pontos) com eixo x numérico, mira vertical e dica com o valor mais próximo.
import { useState } from 'preact/hooks';
import { ComTabela, Dica, type EstadoDica, escala, LinhaDica, ticks, useLargura } from './base';

export interface SerieLinha {
  id: string;
  rotulo: string;
  cor: string;
  /** Pares [x, y]; y null interrompe a linha. */
  pontos: [number, number | null][];
  /** Série de contexto (cinza, fina, sem dica): ex. anos anteriores. */
  fundo?: boolean;
}

interface Props {
  series: SerieLinha[];
  titulo: string;
  formatarX: (x: number) => string;
  formatarY: (y: number) => string;
  altura?: number;
  /** Desenha só os pontos (dados esparsos, ex.: sessões de natação). */
  somentePontos?: boolean;
  /** Eixo y invertido (ritmo: menor é melhor, então "melhor" fica em cima). */
  inverterY?: boolean;
  /** Força o y a começar do zero. */
  yDoZero?: boolean;
  ticksX?: number[];
  /** Mostra legenda (≥ 2 séries principais). */
  legenda?: boolean;
  /** Ao clicar num ponto (modo somentePontos). */
  aoClicar?: (serie: SerieLinha, indice: number) => void;
}

const MARGEM = { topo: 12, dir: 12, base: 26, esq: 52 };

export function Linhas({
  series,
  titulo,
  formatarX,
  formatarY,
  altura = 240,
  somentePontos,
  inverterY,
  yDoZero,
  ticksX,
  legenda,
  aoClicar,
}: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<EstadoDica & { xData?: number }>();
  const todos = series.flatMap((s) => s.pontos.filter((p): p is [number, number] => p[1] !== null));
  if (!todos.length) return <p class="vazio">Sem dados para este gráfico.</p>;

  const xs = todos.map((p) => p[0]);
  const ys = todos.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = yDoZero ? 0 : Math.min(...ys);
  let y1 = Math.max(...ys);
  if (!yDoZero) {
    const folga = (y1 - y0) * 0.08 || Math.abs(y1) * 0.1 || 1;
    y0 -= folga;
    y1 += folga;
  }
  const marcasY = ticks(y1, 4, y0).filter((v) => v >= y0 && v <= y1);
  const px = escala(x0, x1, MARGEM.esq + (somentePontos ? 8 : 0), Math.max(MARGEM.esq + 1, largura - MARGEM.dir - (somentePontos ? 8 : 0)));
  const py = inverterY ? escala(y0, y1, MARGEM.topo, altura - MARGEM.base) : escala(y0, y1, altura - MARGEM.base, MARGEM.topo);
  const marcasX = ticksX ?? ticks(x1, Math.max(2, Math.floor(largura / 110)), x0).filter((v) => v >= x0 && v <= x1);
  const principais = series.filter((s) => !s.fundo);

  const caminho = (s: SerieLinha) => {
    let d = '';
    let aberto = false;
    for (const [x, y] of s.pontos) {
      if (y === null) {
        aberto = false;
        continue;
      }
      d += `${aberto ? 'L' : 'M'}${px(x).toFixed(1)},${py(y).toFixed(1)}`;
      aberto = true;
    }
    return d;
  };

  const mover = (ev: MouseEvent) => {
    const r = (ev.currentTarget as SVGElement).getBoundingClientRect();
    const mx = ev.clientX - r.left;
    let melhor: { s: SerieLinha; p: [number, number]; d: number } | undefined;
    for (const s of principais) {
      for (const p of s.pontos) {
        if (p[1] === null) continue;
        const d = somentePontos ? Math.hypot(px(p[0]) - mx, py(p[1]) - (ev.clientY - r.top)) : Math.abs(px(p[0]) - mx);
        if (!melhor || d < melhor.d) melhor = { s, p: p as [number, number], d };
      }
    }
    if (!melhor || (somentePontos && melhor.d > 30)) return setDica(undefined);
    const xData = melhor.p[0];
    const linhas = somentePontos
      ? [{ s: melhor.s, y: melhor.p[1] }]
      : principais.flatMap((s) => {
          const p = s.pontos.reduce<[number, number | null] | undefined>(
            (m, q) => (q[1] !== null && (!m || Math.abs(q[0] - xData) < Math.abs(m[0] - xData)) ? q : m),
            undefined,
          );
          return p && p[1] !== null && Math.abs(px(p[0]) - px(xData)) < 12 ? [{ s, y: p[1] }] : [];
        });
    setDica({
      x: px(xData),
      y: py(melhor.p[1]),
      xData,
      conteudo: (
        <>
          <div class="titulo">{formatarX(xData)}</div>
          {linhas.map(({ s, y }) => (
            <LinhaDica key={s.id} cor={principais.length > 1 ? s.cor : undefined} rotulo={s.rotulo} valor={formatarY(y)} />
          ))}
        </>
      ),
    });
  };

  const tabela = () => (
    <table>
      <caption class="visualmente-oculto">{titulo}</caption>
      <thead>
        <tr>
          <th>Série</th>
          <th>x</th>
          <th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {principais.flatMap((s) =>
          s.pontos
            .filter((p) => p[1] !== null)
            .map((p, i) => (
              <tr key={`${s.id}-${i}`}>
                <td>{s.rotulo}</td>
                <td>{formatarX(p[0])}</td>
                <td class="num">{formatarY(p[1]!)}</td>
              </tr>
            )),
        )}
      </tbody>
    </table>
  );

  return (
    <ComTabela tabela={tabela}>
      {legenda && principais.length > 1 && (
        <ul class="legenda">
          {principais.map((s) => (
            <li key={s.id}>
              <span class="amostra" style={{ background: s.cor }} />
              {s.rotulo}
            </li>
          ))}
          {series.some((s) => s.fundo) && (
            <li>
              <span class="amostra" style={{ background: 'var(--border)' }} />
              demais
            </li>
          )}
        </ul>
      )}
      <div class="grafico" ref={ref} onMouseLeave={() => setDica(undefined)}>
        {largura > 0 && (
          <svg width={largura} height={altura} role="img" aria-label={titulo} onMouseMove={mover}>
            {marcasY.map((v) => (
              <g key={v}>
                <line class="grade" x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={py(v)} y2={py(v)} />
                <text x={MARGEM.esq - 6} y={py(v)} dy="0.32em" text-anchor="end">
                  {formatarY(v)}
                </text>
              </g>
            ))}
            <line class="eixo" x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={altura - MARGEM.base} y2={altura - MARGEM.base} />
            {marcasX.map((v) => (
              <text key={v} x={px(v)} y={altura - MARGEM.base + 16} text-anchor="middle">
                {formatarX(v)}
              </text>
            ))}
            {series
              .slice()
              .sort((a, b) => Number(!!b.fundo) - Number(!!a.fundo))
              .map((s) =>
                somentePontos ? (
                  <g key={s.id}>
                    {s.pontos.map((p, i) =>
                      p[1] === null ? null : (
                        <circle
                          key={i}
                          cx={px(p[0])}
                          cy={py(p[1])}
                          r={5}
                          fill={s.cor}
                          stroke="var(--surface)"
                          stroke-width={2}
                          style={aoClicar ? { cursor: 'pointer' } : undefined}
                          onClick={aoClicar ? () => aoClicar(s, i) : undefined}
                        />
                      ),
                    )}
                  </g>
                ) : (
                  <path
                    key={s.id}
                    d={caminho(s)}
                    fill="none"
                    stroke={s.fundo ? 'var(--border)' : s.cor}
                    stroke-width={s.fundo ? 1.5 : 2}
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                ),
              )}
            {dica?.xData !== undefined && !somentePontos && (
              <line class="eixo" x1={px(dica.xData)} x2={px(dica.xData)} y1={MARGEM.topo} y2={altura - MARGEM.base} />
            )}
          </svg>
        )}
        <Dica estado={dica} />
      </div>
    </ComTabela>
  );
}
