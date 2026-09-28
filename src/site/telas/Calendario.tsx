import { useMemo, useState } from 'preact/hooks';
import { agruparPor } from '../agregados';
import { ChipEsporte, FiltrosGlobais, Intro, linkAtividade, Secao, usePainel } from '../componentes';
import { dataCurta, duracao, horaLocal, km } from '../formatos';
import { Calendario } from '../graficos/Calendario';
import { ESPORTES } from '../../shared/esportes';

export function CalendarioTela() {
  const { atividades } = usePainel();
  const [dia, setDia] = useState<string>();
  const porDia = useMemo(() => agruparPor(atividades, (a) => a.data), [atividades]);
  const minutos = useMemo(
    () => new Map([...porDia].map(([d, l]) => [d, l.reduce((s, a) => s + (a.movimentoS ?? a.duracaoS) / 60, 0)])),
    [porDia],
  );
  const anos = [...new Set(atividades.map((a) => +a.data.slice(0, 4)))].sort((a, b) => b - a);
  const doDia = dia ? (porDia.get(dia) ?? []) : [];

  return (
    <>
      <Intro kicker="Calendário" titulo="Cada dia de treino">
        A cor mostra o tempo em movimento no dia. Clique num dia para ver as atividades.
      </Intro>
      <FiltrosGlobais />
      {dia && (
        <div class="cartao" style={{ marginBottom: '16px' }}>
          <p class="kicker">{dataCurta(dia)}</p>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {doDia.map((a) => (
              <li key={a.id}>
                <a href={linkAtividade(a.id)}>{a.nome}</a> · <ChipEsporte esporte={a.esporte} curto /> · {horaLocal(a)} ·{' '}
                {duracao(a.movimentoS ?? a.duracaoS)}
                {a.distanciaM ? ` · ${km(a.distanciaM)} km` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Secao numero={1} titulo="Heatmap diário" sub={`${minutos.size} dias com atividade`}>
        <div class="cartao">
          {anos.length ? (
            <Calendario
              valores={minutos}
              anos={anos}
              formatar={(v) => duracao(v * 60)}
              descrever={(d) =>
                porDia
                  .get(d)
                  ?.map((a) => ESPORTES[a.esporte].curto)
                  .join(', ')
              }
              aoClicar={setDia}
            />
          ) : (
            <p class="vazio">Nenhuma atividade com os filtros atuais.</p>
          )}
        </div>
      </Secao>
    </>
  );
}
