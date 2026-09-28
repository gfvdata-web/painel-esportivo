import { useMemo, useState } from 'preact/hooks';
import { ORDEM_ESPORTES } from '../../shared/esportes';
import { ChipEsporte, FiltrosGlobais, Intro, usePainel } from '../componentes';
import { dataCurta, inteiro } from '../formatos';
import { Mapa, type TrilhaMapa } from '../graficos/MapaSobDemanda';

const nomeLugar = (l: { cidade: string; uf?: string; pais: string }) => (l.uf ? `${l.cidade} – ${l.uf}` : `${l.cidade}, ${l.pais}`);

export function MapaTela() {
  const { atividades, dados } = usePainel();
  const [ano, setAno] = useState('');
  const [regiao, setRegiao] = useState('');

  const comTrilha = atividades.filter((a) => a.temTrilha && dados.trilhas[a.id]);
  const anos = [...new Set(comTrilha.map((a) => a.data.slice(0, 4)))].sort().reverse();
  const paises = [...new Set(comTrilha.map((a) => a.local?.pais).filter(Boolean))].sort() as string[];
  const cidades = [...new Set(comTrilha.map((a) => a.local && nomeLugar(a.local)).filter(Boolean))].sort() as string[];

  const filtradas = comTrilha.filter(
    (a) =>
      (!ano || a.data.startsWith(ano)) &&
      (!regiao || (regiao.startsWith('p:') ? a.local?.pais === regiao.slice(2) : a.local && nomeLugar(a.local) === regiao.slice(2))),
  );
  const trilhas: TrilhaMapa[] = useMemo(
    () =>
      filtradas.map((a) => ({
        id: a.id,
        esporte: a.esporte,
        polyline: dados.trilhas[a.id]!,
        titulo: `${a.nome} · ${dataCurta(a.data)}`,
      })),
    [filtradas.map((a) => a.id).join()],
  );
  const esportes = ORDEM_ESPORTES.filter((e) => filtradas.some((a) => a.esporte === e));

  return (
    <>
      <Intro kicker="Mapa" titulo="Por onde passei">
        Todas as trilhas sobrepostas: quanto mais forte a linha, mais vezes passei ali. O começo e o fim das trilhas perto
        de lugares frequentes (como a casa) são cortados. Clique numa linha para abrir a atividade.
      </Intro>
      <FiltrosGlobais>
        <div class="grupo">
          <label class="rotulo" for="f-ano">
            Ano
          </label>
          <select id="f-ano" class="campo" value={ano} onChange={(e) => setAno((e.target as HTMLSelectElement).value)}>
            <option value="">Todos</option>
            {anos.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <label class="rotulo" for="f-regiao">
            Região
          </label>
          <select id="f-regiao" class="campo" value={regiao} onChange={(e) => setRegiao((e.target as HTMLSelectElement).value)}>
            <option value="">Todas</option>
            <optgroup label="Países">
              {paises.map((p) => (
                <option key={p} value={`p:${p}`}>
                  {p}
                </option>
              ))}
            </optgroup>
            <optgroup label="Cidades">
              {cidades.map((c) => (
                <option key={c} value={`c:${c}`}>
                  {c}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </FiltrosGlobais>
      <ul class="legenda">
        {esportes.map((e) => (
          <li key={e}>
            <ChipEsporte esporte={e} />
          </li>
        ))}
        <li class="mono">{inteiro(filtradas.length)} trilhas</li>
      </ul>
      <Mapa trilhas={trilhas} aoClicar={(id) => (location.hash = `#/atividade/${id}`)} />
    </>
  );
}
