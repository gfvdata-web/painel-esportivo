import { ESPORTES, ORDEM_ESPORTES } from '../../shared/esportes';
import { type Atividade, DISTANCIAS_RECORDE, type Esporte } from '../../shared/modelo';
import { ChipEsporte, FiltrosGlobais, Intro, linkAtividade, Secao, usePainel } from '../componentes';
import { dataCurta, decimal, duracao, inteiro, km, kmh, relogio, ritmo100, ritmoKm, usaRitmo } from '../formatos';

interface Marca {
  rotulo: string;
  valor: string;
  extra?: string;
  atividade: Atividade;
}

function maiorPor(lista: Atividade[], f: (a: Atividade) => number | undefined): Atividade | undefined {
  let melhor: Atividade | undefined;
  let v = -Infinity;
  for (const a of lista) {
    const x = f(a);
    if (x !== undefined && x > v) {
      v = x;
      melhor = a;
    }
  }
  return melhor;
}

function marcasDoEsporte(e: Esporte, lista: Atividade[]): Marca[] {
  const marcas: Marca[] = [];
  const add = (rotulo: string, a: Atividade | undefined, valor: (a: Atividade) => string, extra?: (a: Atividade) => string) => {
    if (a) marcas.push({ rotulo, atividade: a, valor: valor(a), extra: extra?.(a) });
  };

  // Melhores tempos por distância (calculados no ingest a partir do GPS).
  for (const [rot, dist] of DISTANCIAS_RECORDE[e] ?? []) {
    const melhor = lista
      .filter((a) => a.melhores?.[rot])
      .sort((a, b) => a.melhores![rot]! - b.melhores![rot]!)[0];
    add(`Melhor ${rot}`, melhor, (a) => relogio(a.melhores![rot]!), (a) =>
      usaRitmo(e) ? ritmoKm(dist / a.melhores![rot]!) : kmh(dist / a.melhores![rot]!),
    );
  }

  if (e.startsWith('natacao')) {
    add('Maior distância', maiorPor(lista, (a) => a.distanciaM), (a) => `${inteiro(a.distanciaM!)} m`);
    add('Melhor ritmo', maiorPor(lista, (a) => a.natacao?.ritmo100mS && -a.natacao.ritmo100mS), (a) => ritmo100(a.natacao!.ritmo100mS));
    add('Menor SWOLF', maiorPor(lista, (a) => a.natacao?.swolfMedio && -a.natacao.swolfMedio), (a) => decimal(a.natacao!.swolfMedio!));
    add('Mais voltas', maiorPor(lista, (a) => a.natacao?.voltas), (a) => inteiro(a.natacao!.voltas!));
  } else {
    add('Maior distância', maiorPor(lista, (a) => a.distanciaM), (a) => `${km(a.distanciaM)} km`);
    add('Mais elevação', maiorPor(lista, (a) => a.ganhoElevM), (a) => `${inteiro(a.ganhoElevM!)} m`);
    if (e === 'pedal') {
      add('Maior velocidade média', maiorPor(lista.filter((a) => (a.distanciaM ?? 0) >= 10_000), (a) => a.velMediaMs), (a) => kmh(a.velMediaMs), () => 'em pedais ≥ 10 km');
    }
  }
  add('Mais tempo', maiorPor(lista, (a) => a.movimentoS ?? a.duracaoS), (a) => duracao(a.movimentoS ?? a.duracaoS));
  add('Maior FC máxima', maiorPor(lista, (a) => a.fcMax), (a) => `${a.fcMax} bpm`);
  return marcas;
}

export function Recordes() {
  const { atividades } = usePainel();
  const esportes = ORDEM_ESPORTES.filter((e) => e !== 'outro' && atividades.some((a) => a.esporte === e));

  return (
    <>
      <Intro kicker="Recordes" titulo="As melhores marcas">
        Melhores tempos por distância são o trecho mais rápido dentro de qualquer atividade com GPS, não só atividades
        daquela distância. Saltos de GPS impossíveis são descartados.
      </Intro>
      <FiltrosGlobais />
      {esportes.map((e, i) => {
        const marcas = marcasDoEsporte(
          e,
          atividades.filter((a) => a.esporte === e),
        );
        return (
          <Secao key={e} numero={i + 1} titulo={ESPORTES[e].rotulo}>
            <div class="cartao tabela-rolagem">
              <table>
                <tbody>
                  {marcas.map((m) => (
                    <tr key={m.rotulo}>
                      <td style={{ width: '220px' }}>
                        <ChipEsporte esporte={e} curto /> <span class="suave">·</span> {m.rotulo}
                      </td>
                      <td class="num">
                        <strong>{m.valor}</strong>
                      </td>
                      <td class="suave">{m.extra ?? ''}</td>
                      <td>
                        <a href={linkAtividade(m.atividade.id)}>{m.atividade.nome}</a>
                      </td>
                      <td class="suave">{dataCurta(m.atividade.data)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        );
      })}
      {!esportes.length && <p class="vazio">Nenhuma atividade com os filtros atuais.</p>}
    </>
  );
}
