import { useEffect, useState } from 'preact/hooks';
import { ESPORTES } from '../../shared/esportes';
import type { Detalhe, EstiloNado } from '../../shared/modelo';
import { ChipEsporte, Intro, Secao, Tile, usePainel } from '../componentes';
import { carregarDetalhe } from '../dados';
import { dataCurta, decimal, duracao, horaLocal, inteiro, km, kmh, relogio, ritmo100, usaRitmo, velocidadeOuRitmo } from '../formatos';
import { corEsporte } from '../graficos/base';
import { Linhas } from '../graficos/Linhas';
import { Mapa } from '../graficos/Mapa';

const ROTULO_CAMPO: Record<string, string> = {
  nome: 'nome',
  equipamento: 'equipamento',
  distanciaM: 'distância',
  ganhoElevM: 'elevação',
  duracaoTotalS: 'tempo total',
  duracaoMovimentoS: 'tempo em movimento',
  velMediaMs: 'velocidade média',
  velMaxMs: 'velocidade máxima',
  fcMedia: 'FC média',
  fcMax: 'FC máxima',
  calorias: 'calorias',
  cadenciaMedia: 'cadência',
  dispositivo: 'dispositivo',
  offsetMin: 'fuso',
  natacao: 'dados de natação',
  trilha: 'trilha',
  serie: 'gráficos',
};

const ESTILO: Record<EstiloNado, string> = {
  livre: 'Livre',
  peito: 'Peito',
  costas: 'Costas',
  borboleta: 'Borboleta',
  pernada: 'Pernada',
  misto: 'Medley',
  desconhecido: '—',
};

const minutos = (s: number) => relogio(s);

/** Pares [t, valor] só com os instantes que têm valor: sensores amostram em ritmos diferentes. */
const semBuracos = (t: number[], v: (number | null)[]): [number, number][] =>
  t.flatMap((x, i) => (v[i] === null || v[i] === undefined ? [] : [[x, v[i]!] as [number, number]]));

export function DetalheAtividade({ id }: { id: string }) {
  const { dados } = usePainel();
  const a = dados.atividades.find((x) => x.id === id);
  const [detalhe, setDetalhe] = useState<Detalhe | null>();

  useEffect(() => {
    setDetalhe(undefined);
    if (a?.temDetalhe) carregarDetalhe(id).then((d) => setDetalhe(d ?? null));
    else setDetalhe(null);
  }, [id]);

  if (!a) {
    return (
      <>
        <Intro kicker="Atividade" titulo="Não encontrada" />
        <p>
          <a href="#/atividades">Voltar para a lista</a>
        </p>
      </>
    );
  }

  const cor = corEsporte(a.esporte);
  const serie = detalhe?.serie;
  const natacao = a.esporte.startsWith('natacao');
  const trilha = dados.trilhas[a.id];
  // Numeração sequencial das seções que realmente aparecem.
  let n = 0;
  const proxima = () => ++n;
  const lugar = a.local ? (a.local.uf ? `${a.local.cidade} – ${a.local.uf}` : `${a.local.cidade}, ${a.local.pais}`) : undefined;

  // Ritmo nos esportes a pé (min/km, eixo invertido); velocidade no pedal.
  const pontosVel = serie?.velMs
    ? serie.t.flatMap((t, i) => {
        const v = serie.velMs![i];
        // Parado (< 0,3 m/s) não entra: o ritmo iria ao infinito.
        if (v === null || v === undefined || v <= 0.3) return [];
        return [[t, usaRitmo(a.esporte) ? 1000 / v : natacao ? 100 / v : v * 3.6] as [number, number]];
      })
    : [];

  return (
    <>
      <Intro kicker={`${ESPORTES[a.esporte].rotulo} · ${dataCurta(a.data)} · ${horaLocal(a)}`} titulo={a.nome}>
        {[lugar, a.dispositivo, a.equipamento].filter(Boolean).join(' · ') || undefined}
      </Intro>
      <p style={{ marginTop: '-8px' }}>
        <a href="#/atividades">← todas as atividades</a>
      </p>

      <div class="grade-cartoes">
        {a.distanciaM !== undefined && (
          <Tile rotulo="Distância" valor={natacao ? inteiro(a.distanciaM) : km(a.distanciaM)} unidade={natacao ? 'm' : 'km'} />
        )}
        <Tile rotulo="Tempo em movimento" valor={duracao(a.movimentoS ?? a.duracaoS)} detalhe={`total: ${duracao(a.duracaoS)}`} />
        {a.distanciaM !== undefined && (
          <Tile
            rotulo={usaRitmo(a.esporte) || natacao ? 'Ritmo médio' : 'Velocidade média'}
            valor={natacao && a.natacao?.ritmo100mS ? ritmo100(a.natacao.ritmo100mS) : velocidadeOuRitmo(a)}
            detalhe={a.velMaxMs && !natacao ? `máx.: ${kmh(a.velMaxMs)}` : undefined}
          />
        )}
        {a.ganhoElevM !== undefined && <Tile rotulo="Elevação" valor={inteiro(a.ganhoElevM)} unidade="m" />}
        {a.fcMedia !== undefined && <Tile rotulo="FC média" valor={String(a.fcMedia)} unidade="bpm" detalhe={a.fcMax ? `máx.: ${a.fcMax} bpm` : undefined} />}
        {a.calorias !== undefined && <Tile rotulo="Calorias" valor={inteiro(a.calorias)} unidade="kcal" />}
        {a.natacao?.swolfMedio !== undefined && <Tile rotulo="SWOLF médio" valor={decimal(a.natacao.swolfMedio)} />}
        {a.natacao?.voltas !== undefined && (
          <Tile rotulo="Voltas" valor={inteiro(a.natacao.voltas)} detalhe={a.natacao.piscinaM ? `piscina de ${a.natacao.piscinaM} m` : undefined} />
        )}
      </div>

      {trilha && (
        <Secao numero={proxima()} titulo="Percurso" sub="início e fim ocultos perto de lugares frequentes">
          <Mapa trilhas={[{ id: a.id, esporte: a.esporte, polyline: trilha }]} classe="mapa mapa-pequeno" destaque />
        </Secao>
      )}

      {detalhe === undefined && a.temDetalhe && <p class="suave mono">carregando gráficos…</p>}

      {serie && (
        <Secao numero={proxima()} titulo="Ao longo da atividade" sub="eixo x em minutos desde o início">
          <div class="grade-2">
            {serie.fc && (
              <div class="cartao">
                <p class="kicker">Frequência cardíaca</p>
                <Linhas
                  titulo="Frequência cardíaca"
                  series={[{ id: 'fc', rotulo: 'FC', cor, pontos: semBuracos(serie.t, serie.fc!) }]}
                  formatarX={minutos}
                  formatarY={(v) => `${Math.round(v)} bpm`}
                  altura={200}
                />
              </div>
            )}
            {pontosVel.some((p) => p[1] !== null) && (
              <div class="cartao">
                <p class="kicker">{usaRitmo(a.esporte) ? 'Ritmo (min/km)' : natacao ? 'Ritmo (/100 m)' : 'Velocidade (km/h)'}</p>
                <Linhas
                  titulo="Ritmo ou velocidade"
                  series={[{ id: 'vel', rotulo: usaRitmo(a.esporte) || natacao ? 'Ritmo' : 'Velocidade', cor, pontos: pontosVel }]}
                  formatarX={minutos}
                  formatarY={(v) => (usaRitmo(a.esporte) || natacao ? relogio(v) : `${decimal(v)} km/h`)}
                  inverterY={usaRitmo(a.esporte) || natacao}
                  altura={200}
                />
              </div>
            )}
            {serie.ele && (
              <div class="cartao">
                <p class="kicker">Elevação</p>
                <Linhas
                  titulo="Elevação"
                  series={[{ id: 'ele', rotulo: 'Elevação', cor, pontos: semBuracos(serie.t, serie.ele!) }]}
                  formatarX={minutos}
                  formatarY={(v) => `${inteiro(v)} m`}
                  altura={200}
                />
              </div>
            )}
          </div>
        </Secao>
      )}

      {detalhe?.voltas && (
        <Secao numero={proxima()} titulo="Voltas" sub={`${detalhe.voltas.length} voltas`}>
          <div class="cartao tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th class="num">#</th>
                  <th>Estilo</th>
                  <th class="num">Tempo</th>
                  <th class="num">Braçadas</th>
                  <th class="num">SWOLF</th>
                  <th class="num">Ritmo</th>
                  <th class="num">Descanso</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.voltas.map((v, i) => (
                  <tr key={i}>
                    <td class="num">{i + 1}</td>
                    <td>{ESTILO[v.estilo]}</td>
                    <td class="num">{relogio(v.duracaoS)}</td>
                    <td class="num">{v.bracadas}</td>
                    <td class="num">{Math.round(v.duracaoS + v.bracadas)}</td>
                    <td class="num">{a.natacao?.piscinaM ? ritmo100((v.duracaoS / a.natacao.piscinaM) * 100) : '—'}</td>
                    <td class="num">{v.descansoS ? `${Math.round(v.descansoS)} s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao numero={proxima()} titulo="Origem dos dados">
        <div class="cartao">
          <p style={{ marginTop: 0 }}>
            <ChipEsporte esporte={a.esporte} /> <span class="suave">· tipo original: {a.tipoOriginal}</span>
          </p>
          <p>
            Fonte{a.fontes.length > 1 ? 's' : ''}: {a.fontes.map((f) => (f === 'strava' ? 'Strava' : 'Samsung Health')).join(' + ')}
            {a.auto && ' · registrada automaticamente pelo relógio'}
          </p>
          {a.origem && (
            <p class="suave" style={{ fontSize: '14px' }}>
              Vindo do Strava:{' '}
              {Object.entries(a.origem)
                .filter(([, f]) => f === 'strava')
                .map(([c]) => ROTULO_CAMPO[c] ?? c)
                .join(', ') || '—'}
              .<br />
              Vindo do Samsung Health:{' '}
              {Object.entries(a.origem)
                .filter(([, f]) => f === 'samsung')
                .map(([c]) => ROTULO_CAMPO[c] ?? c)
                .join(', ') || '—'}
              .
            </p>
          )}
          {a.anomalias && (
            <p class="suave" style={{ fontSize: '14px', marginBottom: 0 }}>
              Avisos: {a.anomalias.join('; ')}.
            </p>
          )}
        </div>
      </Secao>
    </>
  );
}
