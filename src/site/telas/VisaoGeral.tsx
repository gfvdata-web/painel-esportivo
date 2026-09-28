import { useMemo, useState } from 'preact/hooks';
import { ESPORTES, ORDEM_ESPORTES } from '../../shared/esportes';
import { agruparPor, empilhar, type Metrica, sequenciasSemanas, totais, valorMetrica } from '../agregados';
import { ChipEsporte, FiltrosGlobais, Intro, Opcoes, Secao, Tile, usePainel } from '../componentes';
import { dataCurta, decimal, horas, inteiro, km, plural } from '../formatos';
import { BarrasEmpilhadas } from '../graficos/BarrasEmpilhadas';
import { Linhas, type SerieLinha } from '../graficos/Linhas';

const formatarMetrica = (m: Metrica) => (v: number) =>
  m === 'distancia' ? `${inteiro(v)} km` : m === 'tempo' ? `${inteiro(v)} h` : inteiro(v);

/** Dia do ano (1–366) de uma data AAAA-MM-DD. */
const diaDoAno = (data: string) =>
  Math.floor((Date.parse(`${data}T00:00:00Z`) - Date.UTC(+data.slice(0, 4), 0, 1)) / 86_400_000) + 1;

const INICIO_MES = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

export function VisaoGeral() {
  const { atividades, dados } = usePainel();
  const [metricaAno, setMetricaAno] = useState<Metrica>('tempo');
  const [metricaAcum, setMetricaAcum] = useState<Metrica>('distancia');
  const t = totais(atividades);
  const seq = sequenciasSemanas(atividades);
  const anos = [...new Set(atividades.map((a) => a.data.slice(0, 4)))].sort();
  const [anoDestaque, setAnoDestaque] = useState<string>();
  const destaque = anoDestaque && anos.includes(anoDestaque) ? anoDestaque : anos.at(-1);

  const porAno = useMemo(() => empilhar(atividades, 'ano', metricaAno), [atividades, metricaAno]);

  // Acumulado ao longo do ano: o ano escolhido em destaque, os demais em cinza como contexto.
  const acumulado: SerieLinha[] = useMemo(() => {
    const porAnoMap = agruparPor(atividades, (a) => a.data.slice(0, 4));
    return anos.map((ano) => {
      const lista = (porAnoMap.get(ano) ?? []).slice().sort((a, b) => a.data.localeCompare(b.data));
      let soma = 0;
      const pontos: [number, number][] = [[1, 0]];
      for (const a of lista) {
        soma += valorMetrica(a, metricaAcum);
        pontos.push([diaDoAno(a.data), soma]);
      }
      return { id: ano, rotulo: ano, cor: 'var(--accent)', pontos, fundo: ano !== destaque };
    });
  }, [atividades, metricaAcum, destaque, anos.join()]);

  const porEsporte = ORDEM_ESPORTES.map((e) => {
    const lista = atividades.filter((a) => a.esporte === e);
    return { e, lista, t: totais(lista) };
  }).filter((x) => x.lista.length);

  return (
    <>
      <Intro kicker="Histórico esportivo" titulo="Tudo o que já treinei, num lugar só">
        {dados.meta.primeira && dados.meta.ultima && (
          <>
            De {dataCurta(dados.meta.primeira)} a {dataCurta(dados.meta.ultima)}, juntando Strava e Samsung Health.
          </>
        )}
      </Intro>
      <FiltrosGlobais />

      <div class="grade-cartoes">
        <Tile rotulo="Atividades" valor={inteiro(t.atividades)} detalhe={plural(t.dias, 'dia ativo', 'dias ativos')} />
        <Tile rotulo="Tempo" valor={inteiro(Math.round(t.segundos / 3600))} unidade="h" detalhe="em movimento" />
        <Tile rotulo="Distância" valor={inteiro(t.metros / 1000)} unidade="km" />
        <Tile rotulo="Elevação" valor={inteiro(t.elevacao)} unidade="m" detalhe="ganho acumulado" />
        <Tile
          rotulo="Sequência"
          valor={inteiro(seq.atual)}
          unidade={seq.atual === 1 ? 'semana' : 'semanas'}
          detalhe={`recorde: ${plural(seq.maior, 'semana', 'semanas')}${seq.maiorFim ? ` (até ${dataCurta(seq.maiorFim)})` : ''}`}
        />
      </div>

      <Secao numero={1} titulo="Por ano" sub="volume anual empilhado por esporte">
        <div class="cartao">
          <div class="filtros">
            <Opcoes
              rotulo="Medida"
              valor={metricaAno}
              aoMudar={setMetricaAno}
              opcoes={[
                ['tempo', 'Tempo'],
                ['distancia', 'Distância'],
                ['contagem', 'Atividades'],
              ]}
            />
          </div>
          <BarrasEmpilhadas
            titulo="Volume por ano e esporte"
            pilhas={porAno}
            rotuloX={(k) => k}
            formatar={formatarMetrica(metricaAno)}
            cadaN={1}
          />
        </div>
      </Secao>

      <Secao numero={2} titulo="Ano a ano" sub="acumulado desde 1º de janeiro">
        <div class="cartao">
          <div class="filtros">
            <Opcoes
              rotulo="Medida"
              valor={metricaAcum}
              aoMudar={setMetricaAcum}
              opcoes={[
                ['distancia', 'Distância'],
                ['tempo', 'Tempo'],
                ['contagem', 'Atividades'],
              ]}
            />
            <Opcoes rotulo="Destaque" valor={destaque ?? ''} aoMudar={setAnoDestaque} opcoes={anos.map((a) => [a, a])} />
          </div>
          <p class="suave" style={{ margin: '0 0 8px', fontSize: '14px' }}>
            <span class="chip-esporte">
              <span class="amostra" style={{ background: 'var(--accent)' }} />
              {destaque}
            </span>{' '}
            em destaque; os demais anos em cinza para comparação.
          </p>
          <Linhas
            titulo="Acumulado por dia do ano"
            series={acumulado}
            formatarX={(d) => {
              const m = INICIO_MES.findLastIndex((i) => i <= d);
              return `${Math.round(d - INICIO_MES[m]! + 1)}/${String(m + 1).padStart(2, '0')}`;
            }}
            formatarY={formatarMetrica(metricaAcum)}
            ticksX={[1, 91, 182, 274, 365]}
            yDoZero
          />
        </div>
      </Secao>

      <Secao numero={3} titulo="Por esporte">
        <div class="cartao tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Esporte</th>
                <th class="num">Atividades</th>
                <th class="num">Tempo</th>
                <th class="num">Distância</th>
                <th class="num">Média</th>
                <th>Primeira</th>
                <th>Última</th>
              </tr>
            </thead>
            <tbody>
              {porEsporte.map(({ e, lista, t }) => (
                <tr key={e}>
                  <td>
                    <ChipEsporte esporte={e} />
                  </td>
                  <td class="num">{inteiro(t.atividades)}</td>
                  <td class="num">{horas(t.segundos)}</td>
                  <td class="num">{t.metros ? `${km(t.metros)} km` : '—'}</td>
                  <td class="num">{t.metros ? `${decimal(t.metros / 1000 / t.atividades)} km` : '—'}</td>
                  <td>{dataCurta(lista.at(-1)!.data)}</td>
                  <td>{dataCurta(lista[0]!.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="suave" style={{ fontSize: '13px' }}>
          {ESPORTES.outro.rotulo} inclui os exercícios do Samsung Health cujo código ainda não foi mapeado.
        </p>
      </Secao>
    </>
  );
}
