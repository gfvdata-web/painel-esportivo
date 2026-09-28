import { ORDEM_ESPORTES } from '../../shared/esportes';
import type { Atividade } from '../../shared/modelo';
import { agruparPor } from '../agregados';
import { ChipEsporte, FiltrosGlobais, Intro, linkAtividade, Secao, Tile, usePainel } from '../componentes';
import { dataCurta, inteiro, km, plural } from '../formatos';

const DISTANCIA_VIAGEM_KM = 100;

const nomeLugar = (l: NonNullable<Atividade['local']>) => (l.uf ? `${l.cidade} – ${l.uf}` : l.cidade);
const chaveLugar = (l: NonNullable<Atividade['local']>) => `${l.cidade}|${l.uf ?? ''}|${l.codPais}`;

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface Viagem {
  lugar: string;
  pais: string;
  inicio: string;
  fim: string;
  atividades: Atividade[];
  distanciaBaseKm: number;
}

export function Destinos() {
  const { atividades } = usePainel();
  const comLocal = atividades.filter((a) => a.local);
  const porLugar = [...agruparPor(comLocal, (a) => chaveLugar(a.local!)).values()].sort((a, b) => b.length - a.length);
  const paises = [...agruparPor(comLocal, (a) => a.local!.pais)].sort((a, b) => b[1].length - a[1].length);

  if (!porLugar.length) {
    return (
      <>
        <Intro kicker="Destinos" titulo="Onde treinei" />
        <FiltrosGlobais />
        <p class="vazio">Nenhuma atividade com localização nos filtros atuais.</p>
      </>
    );
  }

  // "Base" = cidade com mais atividades em cada ano (mudanças de cidade não viram viagem).
  const basePorAno = new Map<string, { lat: number; lon: number; nome: string }>();
  for (const [ano, lista] of agruparPor(comLocal, (a) => a.data.slice(0, 4))) {
    const maior = [...agruparPor(lista, (a) => chaveLugar(a.local!)).values()].sort((a, b) => b.length - a.length)[0]!;
    const lat = maior.reduce((s, a) => s + a.local!.lat, 0) / maior.length;
    const lon = maior.reduce((s, a) => s + a.local!.lon, 0) / maior.length;
    basePorAno.set(ano, { lat, lon, nome: nomeLugar(maior[0]!.local!) });
  }

  // Viagens: atividades a mais de 100 km da base do ano, agrupadas por lugar e dias próximos.
  const longe = comLocal
    .map((a) => ({ a, d: distanciaKm(a.local!, basePorAno.get(a.data.slice(0, 4))!) }))
    .filter((x) => x.d > DISTANCIA_VIAGEM_KM)
    .sort((x, y) => x.a.data.localeCompare(y.a.data));
  const viagens: Viagem[] = [];
  for (const { a, d } of longe) {
    const ultima = viagens.at(-1);
    const dias = ultima ? (Date.parse(a.data) - Date.parse(ultima.fim)) / 86_400_000 : Infinity;
    if (ultima && ultima.pais === a.local!.pais && dias <= 7) {
      ultima.fim = a.data;
      ultima.atividades.push(a);
      if (!ultima.lugar.includes(a.local!.cidade)) ultima.lugar += `, ${a.local!.cidade}`;
    } else {
      viagens.push({ lugar: nomeLugar(a.local!), pais: a.local!.pais, inicio: a.data, fim: a.data, atividades: [a], distanciaBaseKm: d });
    }
  }
  viagens.reverse();

  return (
    <>
      <Intro kicker="Destinos" titulo="Onde treinei">
        Cidades e países pelo ponto de início de cada atividade (só as que têm GPS). Viagens são atividades a mais de{' '}
        {DISTANCIA_VIAGEM_KM} km da cidade onde mais treinei naquele ano.
      </Intro>
      <FiltrosGlobais />
      <div class="grade-cartoes">
        <Tile rotulo="Países" valor={inteiro(paises.length)} detalhe={paises.map(([p]) => p).join(', ')} />
        <Tile rotulo="Cidades" valor={inteiro(porLugar.length)} />
        <Tile rotulo="Viagens" valor={inteiro(viagens.length)} detalhe={`com ${plural(longe.length, 'atividade', 'atividades')}`} />
      </div>

      <Secao numero={1} titulo="Viagens" sub="mais recentes primeiro">
        <div class="cartao tabela-rolagem">
          {viagens.length ? (
            <table>
              <thead>
                <tr>
                  <th>Destino</th>
                  <th>Quando</th>
                  <th class="num">Atividades</th>
                  <th class="num">Distância</th>
                  <th>Esportes</th>
                </tr>
              </thead>
              <tbody>
                {viagens.map((v) => (
                  <tr key={v.inicio + v.lugar}>
                    <td>
                      {v.lugar}
                      {v.pais !== 'Brasil' ? `, ${v.pais}` : ''}
                    </td>
                    <td>
                      {v.inicio === v.fim ? (
                        <a href={linkAtividade(v.atividades[0]!.id)}>{dataCurta(v.inicio)}</a>
                      ) : (
                        `${dataCurta(v.inicio)} → ${dataCurta(v.fim)}`
                      )}
                    </td>
                    <td class="num">{v.atividades.length}</td>
                    <td class="num">{km(v.atividades.reduce((s, a) => s + (a.distanciaM ?? 0), 0))} km</td>
                    <td>
                      {ORDEM_ESPORTES.filter((e) => v.atividades.some((a) => a.esporte === e)).map((e) => (
                        <span key={e} style={{ marginRight: '10px' }}>
                          <ChipEsporte esporte={e} curto />
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p class="vazio">Nenhuma viagem identificada.</p>
          )}
        </div>
      </Secao>

      <Secao numero={2} titulo="Cidades" sub="ordenadas por número de atividades">
        <div class="cartao tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Cidade</th>
                <th>País</th>
                <th class="num">Atividades</th>
                <th class="num">Distância</th>
                <th>Primeira visita</th>
                <th>Última visita</th>
              </tr>
            </thead>
            <tbody>
              {porLugar.map((lista) => {
                const l = lista[0]!.local!;
                const datas = lista.map((a) => a.data).sort();
                return (
                  <tr key={chaveLugar(l)}>
                    <td>{nomeLugar(l)}</td>
                    <td>{l.pais}</td>
                    <td class="num">{lista.length}</td>
                    <td class="num">{km(lista.reduce((s, a) => s + (a.distanciaM ?? 0), 0))} km</td>
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
