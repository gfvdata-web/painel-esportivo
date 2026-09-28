// Heatmap diário estilo GitHub: uma faixa por ano, colunas = semanas, linhas = dias (seg → dom).
import { useState } from 'preact/hooks';
import { Dica, type EstadoDica } from './base';
import { dataCurta, mesCurto } from '../formatos';

interface Props {
  /** data AAAA-MM-DD → valor (ex.: minutos). */
  valores: Map<string, number>;
  anos: number[];
  formatar: (v: number) => string;
  /** Texto extra por dia na dica (ex.: lista de atividades). */
  descrever?: (data: string) => string | undefined;
  aoClicar?: (data: string) => void;
}

const CEL = 11;
const PASSO = 13;
const ESQ = 26;
const TOPO = 16;
const DIAS = ['seg', '', 'qua', '', 'sex', '', ''];

/** Quatro faixas por quantis dos dias com atividade (a cor mais clara ainda aparece). */
function limiares(valores: number[]): number[] {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [1, 2, 3];
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]!;
  return [q(0.25), q(0.5), q(0.75)];
}

export function Calendario({ valores, anos, formatar, descrever, aoClicar }: Props) {
  const [dica, setDica] = useState<EstadoDica>();
  const lim = limiares([...valores.values()]);
  const nivel = (v: number) => (v <= 0 ? 0 : v <= lim[0]! ? 1 : v <= lim[1]! ? 2 : v <= lim[2]! ? 3 : 4);
  const largura = ESQ + 54 * PASSO;

  return (
    <div class="grafico" onMouseLeave={() => setDica(undefined)}>
      <ul class="legenda" aria-label="Escala">
        <li>menos</li>
        {[0, 1, 2, 3, 4].map((n) => (
          <li key={n}>
            <span class="amostra" style={{ background: `var(--seq-${n})` }} />
          </li>
        ))}
        <li>mais</li>
      </ul>
      {anos.map((ano) => {
        const inicio = new Date(Date.UTC(ano, 0, 1));
        const deslocamento = (inicio.getUTCDay() + 6) % 7; // segunda = 0
        const dias: { data: string; col: number; lin: number }[] = [];
        for (let d = new Date(inicio); d.getUTCFullYear() === ano; d.setUTCDate(d.getUTCDate() + 1)) {
          const indice = Math.round((d.getTime() - inicio.getTime()) / 86_400_000) + deslocamento;
          dias.push({ data: d.toISOString().slice(0, 10), col: Math.floor(indice / 7), lin: indice % 7 });
        }
        const total = dias.reduce((s, d) => s + (valores.get(d.data) ?? 0), 0);
        const ativos = dias.filter((d) => valores.get(d.data)).length;
        return (
          <div key={ano} style={{ marginBottom: '14px' }}>
            <div class="mono" style={{ fontSize: '13px', marginBottom: '4px' }}>
              <strong>{ano}</strong> <span class="suave">· {ativos} dias ativos · {formatar(total)}</span>
            </div>
            <div class="rolagem">
              <svg width={largura} height={TOPO + 7 * PASSO} role="img" aria-label={`Calendário de ${ano}`}>
                {Array.from({ length: 12 }, (_, m) => {
                  const primeiro = dias.find((d) => d.data.slice(5, 7) === String(m + 1).padStart(2, '0'))!;
                  return (
                    <text key={m} x={ESQ + primeiro.col * PASSO} y={10}>
                      {mesCurto(m)}
                    </text>
                  );
                })}
                {DIAS.map((d, i) =>
                  d ? (
                    <text key={i} x={0} y={TOPO + i * PASSO + 9}>
                      {d}
                    </text>
                  ) : null,
                )}
                {dias.map((d) => {
                  const v = valores.get(d.data) ?? 0;
                  const x = ESQ + d.col * PASSO;
                  const y = TOPO + d.lin * PASSO;
                  const mostrar = (ev: Event) => {
                    const svg = (ev.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
                    const cont = (ev.currentTarget as SVGElement).closest('.grafico')!.getBoundingClientRect();
                    const extra = descrever?.(d.data);
                    setDica({
                      x: svg.left - cont.left + x + CEL / 2,
                      y: svg.top - cont.top + y,
                      conteudo: (
                        <>
                          <div class="titulo">{dataCurta(d.data)}</div>
                          <div>{v ? formatar(v) : 'sem atividade'}</div>
                          {extra && <div class="suave">{extra}</div>}
                        </>
                      ),
                    });
                  };
                  return (
                    <rect
                      key={d.data}
                      x={x}
                      y={y}
                      width={CEL}
                      height={CEL}
                      rx={2}
                      fill={`var(--seq-${nivel(v)})`}
                      onMouseEnter={mostrar}
                      onClick={v && aoClicar ? () => aoClicar(d.data) : undefined}
                      style={v && aoClicar ? { cursor: 'pointer' } : undefined}

                    />
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}
      <Dica estado={dica} />
    </div>
  );
}
