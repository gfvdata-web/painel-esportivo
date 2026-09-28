import { agruparPor } from '../agregados';
import { ChipEsporte, Intro, Secao, usePainel } from '../componentes';
import { dataCurta, horas, inteiro, km } from '../formatos';
import { Linhas, type SerieLinha } from '../graficos/Linhas';

// Cores das séries de equipamento: a paleta categórica na ordem fixa (no máximo 8).
const CORES = ['corrida', 'pedal', 'natacao_piscina', 'natacao_aguas_abertas', 'caminhada', 'trilha', 'musculacao', 'outro'].map(
  (e) => `var(--esp-${e})`,
);

const diaNum = (data: string) => Date.parse(`${data}T00:00:00Z`) / 86_400_000;
const numParaData = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function Equipamentos() {
  const { dados } = usePainel();
  const comEquip = dados.atividades.filter((a) => a.equipamento);
  const grupos = [...agruparPor(comEquip, (a) => a.equipamento!)].sort(
    (a, b) => b[1].reduce((s, x) => s + (x.distanciaM ?? 0), 0) - a[1].reduce((s, x) => s + (x.distanciaM ?? 0), 0),
  );

  if (!grupos.length) {
    return (
      <>
        <Intro kicker="Equipamentos" titulo="Tênis e bikes">
          Nenhuma atividade tem equipamento associado ainda.
        </Intro>
        <div class="cartao">
          <p style={{ marginTop: 0 }}>O export do Strava não trouxe tênis nem bikes cadastrados. Há dois jeitos de preencher esta tela:</p>
          <ol>
            <li>Cadastrar os equipamentos no Strava e associar às atividades; o próximo export já os traz.</li>
            <li>
              Ou listar no <code>config.local.json</code>, por esporte e período, e rodar <code>npm run ingest</code> de novo:
              <pre class="mono" style={{ fontSize: '13px', overflowX: 'auto' }}>{`"equipamentos": [
  { "nome": "Caloi Elite", "esporte": "pedal", "de": "2018-01-01", "ate": "2021-12-31" },
  { "nome": "Tênis X", "esporte": "corrida", "de": "2024-03-01" }
]`}</pre>
            </li>
          </ol>
        </div>
      </>
    );
  }

  const series: SerieLinha[] = grupos.slice(0, 8).map(([nome, lista], i) => {
    let soma = 0;
    return {
      id: nome,
      rotulo: nome,
      cor: CORES[i]!,
      pontos: lista
        .slice()
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((a) => {
          soma += (a.distanciaM ?? 0) / 1000;
          return [diaNum(a.data), soma] as [number, number];
        }),
    };
  });

  return (
    <>
      <Intro kicker="Equipamentos" titulo="Tênis e bikes">
        Quilometragem acumulada por equipamento.
      </Intro>
      <Secao numero={1} titulo="Km acumulados">
        <div class="cartao">
          <Linhas
            titulo="Quilômetros acumulados por equipamento"
            series={series}
            formatarX={(n) => dataCurta(numParaData(n))}
            formatarY={(v) => `${inteiro(v)} km`}
            legenda
            yDoZero
          />
        </div>
      </Secao>
      <Secao numero={2} titulo="Resumo">
        <div class="cartao tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Equipamento</th>
                <th>Esporte</th>
                <th class="num">Atividades</th>
                <th class="num">Distância</th>
                <th class="num">Tempo</th>
                <th>Desde</th>
                <th>Último uso</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(([nome, lista]) => {
                const datas = lista.map((a) => a.data).sort();
                return (
                  <tr key={nome}>
                    <td>{nome}</td>
                    <td>
                      <ChipEsporte esporte={lista[0]!.esporte} curto />
                    </td>
                    <td class="num">{lista.length}</td>
                    <td class="num">{km(lista.reduce((s, a) => s + (a.distanciaM ?? 0), 0))} km</td>
                    <td class="num">{horas(lista.reduce((s, a) => s + (a.movimentoS ?? a.duracaoS), 0))}</td>
                    <td>{dataCurta(datas[0]!)}</td>
                    <td>{dataCurta(datas.at(-1)!)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Secao>
    </>
  );
}
