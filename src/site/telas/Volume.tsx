import { useMemo, useState } from 'preact/hooks';
import { empilhar, type Granularidade, type Metrica } from '../agregados';
import { FiltrosGlobais, Intro, Opcoes, Secao, usePainel } from '../componentes';
import { dataCurta, decimal, inteiro, mesCurto, mesLongo } from '../formatos';
import { BarrasEmpilhadas } from '../graficos/BarrasEmpilhadas';

export function Volume() {
  const { atividades } = usePainel();
  const [g, setG] = useState<Granularidade>('mes');
  const [m, setM] = useState<Metrica>('tempo');
  const pilhas = useMemo(() => empilhar(atividades, g, m), [atividades, g, m]);

  const formatar = (v: number) =>
    m === 'distancia' ? `${v >= 100 ? inteiro(v) : decimal(v)} km` : m === 'tempo' ? `${v >= 10 ? inteiro(v) : decimal(v)} h` : inteiro(v);
  const rotuloX = (k: string) => {
    if (g === 'ano') return k;
    if (g === 'mes') {
      const [a, mm] = k.split('-');
      return mm === '01' ? a! : mesCurto(+mm! - 1);
    }
    return dataCurta(k).split(' ').slice(0, 2).join(' ');
  };
  const rotuloCompleto = (k: string) => {
    if (g === 'ano') return k;
    if (g === 'mes') {
      const [a, mm] = k.split('-');
      return `${mesLongo(+mm! - 1)} de ${a}`;
    }
    return `semana de ${dataCurta(k)}`;
  };

  return (
    <>
      <Intro kicker="Volume" titulo="Quanto treinei em cada período">
        Barras empilhadas por esporte. Em telas estreitas, role o gráfico para os lados.
      </Intro>
      <FiltrosGlobais>
        <Opcoes
          rotulo="Período"
          valor={g}
          aoMudar={setG}
          opcoes={[
            ['semana', 'Semana'],
            ['mes', 'Mês'],
            ['ano', 'Ano'],
          ]}
        />
        <Opcoes
          rotulo="Medida"
          valor={m}
          aoMudar={setM}
          opcoes={[
            ['tempo', 'Tempo'],
            ['distancia', 'Distância'],
            ['contagem', 'Atividades'],
          ]}
        />
      </FiltrosGlobais>
      <Secao numero={1} titulo={`Por ${g === 'mes' ? 'mês' : g}`}>
        <div class="cartao">
          {pilhas.length ? (
            <BarrasEmpilhadas
              titulo="Volume por período e esporte"
              pilhas={pilhas}
              rotuloX={rotuloX}
              rotuloCompleto={rotuloCompleto}
              formatar={formatar}
              altura={300}
              cadaN={g === 'mes' ? undefined : g === 'ano' ? 1 : undefined}
            />
          ) : (
            <p class="vazio">Nenhuma atividade com os filtros atuais.</p>
          )}
        </div>
      </Secao>
    </>
  );
}
