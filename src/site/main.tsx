import './estilo.css';
import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { aplicarFiltros, Ctx, type Filtros } from './componentes';
import { carregarDados, type Dados, entrar, precisaSenha, sair, tentarChaveLembrada } from './dados';
import { alternarTema, aplicarTema, temaEscuro, temaSalvo } from './tema';
import { Atividades } from './telas/Atividades';
import { CalendarioTela } from './telas/Calendario';
import { DetalheAtividade } from './telas/Detalhe';
import { Destinos } from './telas/Destinos';
import { Equipamentos } from './telas/Equipamentos';
import { MapaTela } from './telas/Mapa';
import { Natacao } from './telas/Natacao';
import { Recordes } from './telas/Recordes';
import { VisaoGeral } from './telas/VisaoGeral';
import { Volume } from './telas/Volume';

aplicarTema(temaSalvo());

const ROTAS: { caminho: string; rotulo: string }[] = [
  { caminho: '', rotulo: 'Visão geral' },
  { caminho: 'calendario', rotulo: 'Calendário' },
  { caminho: 'volume', rotulo: 'Volume' },
  { caminho: 'mapa', rotulo: 'Mapa' },
  { caminho: 'destinos', rotulo: 'Destinos' },
  { caminho: 'natacao', rotulo: 'Natação' },
  { caminho: 'recordes', rotulo: 'Recordes' },
  { caminho: 'equipamentos', rotulo: 'Equipamentos' },
  { caminho: 'atividades', rotulo: 'Atividades' },
];

function useRota(): string[] {
  const ler = () => location.hash.replace(/^#\/?/, '').split('/');
  const [rota, setRota] = useState(ler);
  useEffect(() => {
    const aoMudar = () => {
      setRota(ler());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return rota;
}

function Porta({ aoEntrar }: { aoEntrar: () => void }) {
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [estado, setEstado] = useState<'pronto' | 'verificando' | 'errada'>('pronto');
  const enviar = async (e: Event) => {
    e.preventDefault();
    setEstado('verificando');
    if (await entrar(senha, lembrar)) aoEntrar();
    else setEstado('errada');
  };
  return (
    <main class="porta">
      <form class="cartao" onSubmit={enviar}>
        <p class="kicker">Painel esportivo</p>
        <h1 style={{ fontSize: '24px' }}>Dados protegidos</h1>
        <p class="suave" style={{ margin: '8px 0 0', fontSize: '15px' }}>
          Os dados deste painel são cifrados. Digite a senha para abrir.
        </p>
        <label class="visualmente-oculto" for="senha">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onInput={(e) => setSenha((e.target as HTMLInputElement).value)}
          autoFocus
          required
        />
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', marginBottom: '14px' }}>
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar((e.target as HTMLInputElement).checked)} />
          Lembrar neste aparelho
        </label>
        <button type="submit" disabled={estado === 'verificando'}>
          {estado === 'verificando' ? 'Abrindo…' : 'Abrir'}
        </button>
        {estado === 'errada' && (
          <p class="erro" role="alert">
            Senha incorreta.
          </p>
        )}
      </form>
    </main>
  );
}

function Painel({ dados }: { dados: Dados }) {
  const rota = useRota();
  const [filtros, setFiltros] = useState<Filtros>({ esportes: new Set(), incluirAuto: false });
  const [escuro, setEscuro] = useState(temaEscuro());
  const atividades = useMemo(() => aplicarFiltros(dados.atividades, filtros), [dados, filtros]);
  const [pagina, ...resto] = rota;

  let tela;
  switch (pagina) {
    case 'calendario':
      tela = <CalendarioTela />;
      break;
    case 'volume':
      tela = <Volume />;
      break;
    case 'mapa':
      tela = <MapaTela />;
      break;
    case 'destinos':
      tela = <Destinos />;
      break;
    case 'natacao':
      tela = <Natacao />;
      break;
    case 'recordes':
      tela = <Recordes />;
      break;
    case 'equipamentos':
      tela = <Equipamentos />;
      break;
    case 'atividades':
      tela = <Atividades />;
      break;
    case 'atividade':
      tela = <DetalheAtividade id={resto[0] ?? ''} />;
      break;
    default:
      tela = <VisaoGeral />;
  }
  const ativa = pagina === 'atividade' ? 'atividades' : (pagina ?? '');

  return (
    <Ctx.Provider value={{ dados, filtros, setFiltros, atividades }}>
      <nav class="topo" aria-label="Seções">
        <div class="topo-interno">
          <a class="marca" href="#/">
            Painel
          </a>
          <div class="pilulas">
            {ROTAS.map((r) => (
              <a key={r.caminho} class="pilula" href={`#/${r.caminho}`} aria-current={ativa === r.caminho ? 'page' : undefined}>
                {r.rotulo}
              </a>
            ))}
          </div>
          <button
            type="button"
            class="botao-icone"
            onClick={() => {
              alternarTema();
              setEscuro(temaEscuro());
            }}
            aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
            title={escuro ? 'Tema claro' : 'Tema escuro'}
          >
            {escuro ? '☀' : '☾'}
          </button>
          {!import.meta.env.DEV && (
            <button type="button" class="botao-icone" onClick={sair} aria-label="Sair e esquecer a senha" title="Sair">
              ⎋
            </button>
          )}
        </div>
      </nav>
      <main class="conteudo">{tela}</main>
    </Ctx.Provider>
  );
}

function App() {
  const [fase, setFase] = useState<'inicio' | 'senha' | 'carregando' | 'pronto' | 'erro'>('inicio');
  const [dados, setDados] = useState<Dados>();
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setFase('carregando');
    try {
      setDados(await carregarDados());
      setFase('pronto');
    } catch (e) {
      setErro((e as Error).message);
      setFase('erro');
    }
  };

  useEffect(() => {
    (async () => {
      if (precisaSenha() && !(await tentarChaveLembrada())) setFase('senha');
      else carregar();
    })();
  }, []);

  if (fase === 'senha') return <Porta aoEntrar={carregar} />;
  if (fase === 'erro')
    return (
      <main class="porta">
        <div class="cartao">
          <p class="erro">Não foi possível carregar os dados.</p>
          <p class="suave">{erro}</p>
        </div>
      </main>
    );
  if (fase !== 'pronto' || !dados)
    return (
      <main class="porta">
        <p class="suave mono">carregando…</p>
      </main>
    );
  return <Painel dados={dados} />;
}

render(<App />, document.getElementById('app')!);
