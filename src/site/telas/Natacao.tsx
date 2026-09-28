import type { EstiloNado } from '../../shared/modelo';
import { empilhar } from '../agregados';
import { ChipEsporte, Intro, linkAtividade, Secao, Tile, usePainel } from '../componentes';
import { dataCurta, decimal, duracao, inteiro, mesCurto, mesLongo, relogio, ritmo100 } from '../formatos';
import { BarrasEmpilhadas } from '../graficos/BarrasEmpilhadas';
import { corEsporte } from '../graficos/base';
import { Linhas } from '../graficos/Linhas';

const ESTILOS: Record<EstiloNado, string> = {
  livre: 'Livre',
  peito: 'Peito',
  costas: 'Costas',
  borboleta: 'Borboleta',
  pernada: 'Pernada (prancha)',
  misto: 'Medley',
  desconhecido: 'Não identificado',
};

const diaNum = (data: string) => Date.parse(`${data}T00:00:00Z`) / 86_400_000;
const numParaData = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function Natacao() {
  const { dados } = usePainel();
  // A natação ignora o filtro de esporte: a tela inteira é sobre ela.
  const sessoes = dados.atividades.filter((a) => a.esporte.startsWith('natacao')).sort((a, b) => a.data.localeCompare(b.data));

  if (!sessoes.length) {
    return (
      <>
        <Intro kicker="Natação" titulo="Na água" />
        <p class="vazio">Nenhuma sessão de natação encontrada.</p>
      </>
    );
  }

  const total = sessoes.reduce((s, a) => s + (a.distanciaM ?? 0), 0);
  const comRitmo = sessoes.filter((a) => a.natacao?.ritmo100mS);
  const melhorRitmo = comRitmo.reduce((m, a) => (!m || a.natacao!.ritmo100mS! < m.natacao!.ritmo100mS! ? a : m), comRitmo[0]);
  const maior = sessoes.reduce((m, a) => ((a.distanciaM ?? 0) > (m.distanciaM ?? 0) ? a : m));
  const piscina = sessoes.filter((a) => a.esporte === 'natacao_piscina').length;
  const estilos = new Map<EstiloNado, number>();
  for (const a of sessoes) for (const [e, n] of Object.entries(a.natacao?.estilos ?? {})) estilos.set(e as EstiloNado, (estilos.get(e as EstiloNado) ?? 0) + n);
  const totalVoltas = [...estilos.values()].reduce((s, n) => s + n, 0);
  const porMes = empilhar(sessoes, 'mes', 'distancia').map((p) => ({
    ...p,
    total: p.total * 1000,
    porEsporte: Object.fromEntries(Object.entries(p.porEsporte).map(([k, v]) => [k, v! * 1000])),
  }));
  const abrir = (i: number, lista: typeof sessoes) => (location.hash = linkAtividade(lista[i]!.id));

  return (
    <>
      <Intro kicker="Natação" titulo="Na água">
        Sessões do relógio (Samsung Health): ritmo, SWOLF e estilos. O ritmo considera só o tempo nadando, sem os
        descansos.
      </Intro>
      <div class="grade-cartoes">
        <Tile rotulo="Sessões" valor={inteiro(sessoes.length)} detalhe={`${piscina} em piscina · ${sessoes.length - piscina} em águas abertas`} />
        <Tile rotulo="Distância total" valor={inteiro(total)} unidade="m" />
        <Tile
          rotulo="Melhor ritmo"
          valor={melhorRitmo ? relogio(melhorRitmo.natacao!.ritmo100mS!) : '—'}
          unidade="/100 m"
          detalhe={melhorRitmo && <a href={linkAtividade(melhorRitmo.id)}>{dataCurta(melhorRitmo.data)}</a>}
        />
        <Tile
          rotulo="Maior sessão"
          valor={inteiro(maior.distanciaM ?? 0)}
          unidade="m"
          detalhe={<a href={linkAtividade(maior.id)}>{dataCurta(maior.data)}</a>}
        />
      </div>

      <div class="grade-2 secao">
        <div class="cartao">
          <div class="secao-titulo">
            <span class="numero">01 —</span>
            <h2>Ritmo por 100 m</h2>
            <span class="suave">mais alto = mais rápido</span>
          </div>
          <Linhas
            titulo="Ritmo por 100 m em cada sessão"
            series={[
              {
                id: 'ritmo',
                rotulo: 'Ritmo',
                cor: corEsporte('natacao_piscina'),
                pontos: comRitmo.map((a) => [diaNum(a.data), a.natacao!.ritmo100mS!]),
              },
            ]}
            somentePontos
            inverterY
            formatarX={(n) => dataCurta(numParaData(n))}
            formatarY={(v) => relogio(v)}
            aoClicar={(_, i) => abrir(i, comRitmo)}
          />
        </div>
        <div class="cartao">
          <div class="secao-titulo">
            <span class="numero">02 —</span>
            <h2>SWOLF médio</h2>
            <span class="suave">segundos + braçadas por volta; menor = mais eficiente</span>
          </div>
          <Linhas
            titulo="SWOLF médio por sessão"
            series={[
              {
                id: 'swolf',
                rotulo: 'SWOLF',
                cor: corEsporte('natacao_piscina'),
                pontos: sessoes.filter((a) => a.natacao?.swolfMedio).map((a) => [diaNum(a.data), a.natacao!.swolfMedio!]),
              },
            ]}
            somentePontos
            inverterY
            formatarX={(n) => dataCurta(numParaData(n))}
            formatarY={(v) => decimal(v)}
            aoClicar={(_, i) => abrir(i, sessoes.filter((a) => a.natacao?.swolfMedio))}
          />
        </div>
      </div>

      <Secao numero={3} titulo="Distância por mês">
        <div class="cartao">
          <BarrasEmpilhadas
            titulo="Metros nadados por mês"
            pilhas={porMes}
            rotuloX={(k) => {
              const [a, m] = k.split('-');
              return m === '01' ? a! : mesCurto(+m! - 1);
            }}
            rotuloCompleto={(k) => {
              const [a, m] = k.split('-');
              return `${mesLongo(+m! - 1)} de ${a}`;
            }}
            formatar={(v) => `${inteiro(v)} m`}
            altura={220}
          />
        </div>
      </Secao>

      {totalVoltas > 0 && (
        <Secao numero={4} titulo="Estilos" sub={`${inteiro(totalVoltas)} voltas identificadas pelo relógio`}>
          <div class="cartao tabela-rolagem">
            <table>
              <tbody>
                {[...estilos]
                  .sort((a, b) => b[1] - a[1])
                  .map(([e, n]) => (
                    <tr key={e}>
                      <td style={{ width: '160px' }}>{ESTILOS[e]}</td>
                      <td style={{ width: '100%' }}>
                        <div
                          style={{
                            height: '10px',
                            width: `${(n / totalVoltas) * 100}%`,
                            minWidth: '2px',
                            background: corEsporte('natacao_piscina'),
                            borderRadius: '0 4px 4px 0',
                          }}
                        />
                      </td>
                      <td class="num">{n}</td>
                      <td class="num suave">{inteiro((n / totalVoltas) * 100)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao numero={totalVoltas > 0 ? 5 : 4} titulo="Sessões">
        <div class="cartao tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th class="num">Distância</th>
                <th class="num">Tempo</th>
                <th class="num">Ritmo</th>
                <th class="num">Voltas</th>
                <th class="num">SWOLF</th>
                <th class="num">FC média</th>
              </tr>
            </thead>
            <tbody>
              {sessoes
                .slice()
                .reverse()
                .map((a) => (
                  <tr key={a.id} class="clicavel" onClick={() => (location.hash = linkAtividade(a.id))}>
                    <td>
                      <a href={linkAtividade(a.id)}>{dataCurta(a.data)}</a>
                    </td>
                    <td>
                      <ChipEsporte esporte={a.esporte} curto />
                    </td>
                    <td class="num">{a.distanciaM ? `${inteiro(a.distanciaM)} m` : '—'}</td>
                    <td class="num">{duracao(a.movimentoS ?? a.duracaoS)}</td>
                    <td class="num">{ritmo100(a.natacao?.ritmo100mS)}</td>
                    <td class="num">{a.natacao?.voltas ?? '—'}</td>
                    <td class="num">{a.natacao?.swolfMedio ? decimal(a.natacao.swolfMedio) : '—'}</td>
                    <td class="num">{a.fcMedia ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </>
  );
}
