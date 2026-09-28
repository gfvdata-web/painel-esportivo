// Carrega o MapLibre (~1 MB) só quando uma tela com mapa é aberta.
import type { ComponentProps, FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Mapa as MapaReal } from './Mapa';

type Props = ComponentProps<typeof MapaReal>;
export type { TrilhaMapa } from './Mapa';

let modulo: Promise<{ Mapa: FunctionComponent<Props> }> | undefined;

export function Mapa(props: Props) {
  const [Componente, setComponente] = useState<FunctionComponent<Props>>();
  useEffect(() => {
    modulo ??= import('./Mapa');
    modulo.then((m) => setComponente(() => m.Mapa));
  }, []);
  if (!Componente) return <div class={props.classe ?? 'mapa'} aria-busy="true" />;
  return <Componente {...props} />;
}
