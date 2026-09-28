import { useMemo, useState } from 'preact/hooks';
import { ChipEsporte, FiltrosGlobais, Intro, linkAtividade, usePainel } from '../componentes';
import { dataCurta, duracao, horaLocal, inteiro, km, velocidadeOuRitmo } from '../formatos';

const POR_PAGINA = 100;

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Atividades() {
  const { atividades } = usePainel();
  const [busca, setBusca] = useState('');
  const [ano, setAno] = useState('');
  const [fonte, setFonte] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);

  const anos = [...new Set(atividades.map((a) => a.data.slice(0, 4)))].sort().reverse();
  const filtradas = useMemo(() => {
    const termo = normalizar(busca.trim());
    return atividades.filter(
      (a) =>
        (!ano || a.data.startsWith(ano)) &&
        (!fonte || a.fontes.join('+') === fonte) &&
        (!termo || normalizar(`${a.nome} ${a.local?.cidade ?? ''} ${a.local?.pais ?? ''} ${a.equipamento ?? ''}`).includes(termo)),
    );
  }, [atividades, busca, ano, fonte]);

  return (
    <>
      <Intro kicker="Atividades" titulo="Lista completa">
        Busque por nome, cidade ou equipamento. Clique numa linha para ver o detalhe.
      </Intro>
      <FiltrosGlobais>
        <div class="grupo">
          <label class="visualmente-oculto" for="busca">
            Buscar
          </label>
          <input
            id="busca"
            class="campo"
            type="search"
            placeholder="Buscar…"
            value={busca}
            onInput={(e) => {
              setBusca((e.target as HTMLInputElement).value);
              setLimite(POR_PAGINA);
            }}
          />
          <select class="campo" aria-label="Ano" value={ano} onChange={(e) => setAno((e.target as HTMLSelectElement).value)}>
            <option value="">Todos os anos</option>
            {anos.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select class="campo" aria-label="Fonte" value={fonte} onChange={(e) => setFonte((e.target as HTMLSelectElement).value)}>
            <option value="">Todas as fontes</option>
            <option value="strava">Só Strava</option>
            <option value="samsung">Só Samsung Health</option>
            <option value="strava+samsung">Nas duas</option>
          </select>
        </div>
      </FiltrosGlobais>
      <p class="suave mono" style={{ fontSize: '13px' }}>
        {inteiro(filtradas.length)} atividades
      </p>
      <div class="cartao tabela-rolagem" style={{ padding: '8px 12px' }}>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Atividade</th>
              <th>Esporte</th>
              <th class="num">Distância</th>
              <th class="num">Tempo</th>
              <th class="num">Ritmo/vel.</th>
              <th class="num">Elev.</th>
              <th class="num">FC</th>
              <th>Local</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, limite).map((a) => (
              <tr key={a.id} class="clicavel" onClick={() => (location.hash = linkAtividade(a.id))}>
                <td class="num">
                  {dataCurta(a.data)} <span class="suave">{horaLocal(a)}</span>
                </td>
                <td>
                  <a href={linkAtividade(a.id)} onClick={(e) => e.stopPropagation()}>
                    {a.nome}
                  </a>
                  {a.auto && <span class="suave"> · auto</span>}
                </td>
                <td>
                  <ChipEsporte esporte={a.esporte} curto />
                </td>
                <td class="num">{a.distanciaM ? `${km(a.distanciaM)} km` : '—'}</td>
                <td class="num">{duracao(a.movimentoS ?? a.duracaoS)}</td>
                <td class="num">{a.distanciaM ? velocidadeOuRitmo(a) : '—'}</td>
                <td class="num">{a.ganhoElevM ? `${inteiro(a.ganhoElevM)} m` : '—'}</td>
                <td class="num">{a.fcMedia ?? '—'}</td>
                <td>{a.local ? (a.local.uf ? `${a.local.cidade} – ${a.local.uf}` : `${a.local.cidade}, ${a.local.pais}`) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtradas.length > limite && (
        <p>
          <button type="button" class="pilula" onClick={() => setLimite(limite + POR_PAGINA)}>
            Mostrar mais {Math.min(POR_PAGINA, filtradas.length - limite)}
          </button>
        </p>
      )}
    </>
  );
}
