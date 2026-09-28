// Mapa com trilhas (MapLibre GL + tiles do OpenStreetMap, dessaturados; invertidos no tema escuro).
import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapaML } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
// O Vite empacota o worker (com suas dependências) e devolve a URL final, no dev e no build.
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef } from 'preact/hooks';
import type { Esporte } from '../../shared/modelo';
import { ORDEM_ESPORTES } from '../../shared/esportes';
import { decodificarPolyline } from '../../ingest/lib/geo';
import { temaEscuro } from '../tema';

maplibregl.setWorkerUrl(urlWorker);

export interface TrilhaMapa {
  id: string;
  esporte: Esporte;
  polyline: string;
  titulo?: string;
}

interface Props {
  trilhas: TrilhaMapa[];
  aoClicar?: (id: string) => void;
  classe?: string;
  /** Linhas mais grossas e opacas (mapa de uma atividade só). */
  destaque?: boolean;
}

function estilo(escuro: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
      },
    },
    layers: [
      {
        id: 'base',
        type: 'raster',
        source: 'base',
        // Fundo apagado para as trilhas se destacarem. No tema escuro, inverter o brilho
        // (min 1 → max 0) transforma o mapa claro do OSM num mapa escuro.
        paint: escuro
          ? { 'raster-brightness-min': 0.92, 'raster-brightness-max': 0.08, 'raster-saturation': -0.9, 'raster-contrast': 0.1 }
          : { 'raster-saturation': -0.85, 'raster-opacity': 0.9 },
      },
    ],
  };
}

/** Lê a cor real de cada esporte das variáveis CSS (o MapLibre não entende var()). */
function coresEsportes(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(ORDEM_ESPORTES.map((e) => [e, css.getPropertyValue(`--esp-${e}`).trim()]));
}

function geojson(trilhas: TrilhaMapa[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: trilhas.map((t) => ({
      type: 'Feature',
      properties: { id: t.id, esporte: t.esporte, titulo: t.titulo ?? '' },
      geometry: { type: 'LineString', coordinates: decodificarPolyline(t.polyline).map(([lat, lon]) => [lon, lat]) },
    })),
  };
}

function limites(trilhas: TrilhaMapa[]): maplibregl.LngLatBounds | undefined {
  let b: maplibregl.LngLatBounds | undefined;
  for (const t of trilhas) {
    for (const [lat, lon] of decodificarPolyline(t.polyline)) {
      if (!b) b = new maplibregl.LngLatBounds([lon, lat], [lon, lat]);
      else b.extend([lon, lat]);
    }
  }
  return b;
}

export function Mapa({ trilhas, aoClicar, classe = 'mapa', destaque }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML>();
  const cliqueRef = useRef(aoClicar);
  cliqueRef.current = aoClicar;

  // Cria o mapa uma vez; recria o estilo se o tema mudar.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: ref.current!,
      style: estilo(temaEscuro()),
      center: [-45, -22],
      zoom: 4,
      attributionControl: { compact: true },
      cooperativeGestures: !destaque,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapa.current = m;
    const aoTrocarTema = () => {
      m.setStyle(estilo(temaEscuro()));
      m.once('styledata', () => adicionarCamadas(m));
    };
    window.addEventListener('tema-mudou', aoTrocarTema);
    return () => {
      window.removeEventListener('tema-mudou', aoTrocarTema);
      m.remove();
    };
  }, []);

  function adicionarCamadas(m: MapaML) {
    const cores = coresEsportes();
    const corExpr = ['match', ['get', 'esporte'], ...Object.entries(cores).flat(), '#888'] as unknown as maplibregl.ExpressionSpecification;
    if (!m.getSource('trilhas')) m.addSource('trilhas', { type: 'geojson', data: geojson(trilhasRef.current) });
    if (!m.getLayer('trilhas')) {
      m.addLayer({
        id: 'trilhas',
        type: 'line',
        source: 'trilhas',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': corExpr,
          'line-width': destaque ? 4 : ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 3],
          // Opacidade baixa: sobreposições acumulam e formam o "mapa de calor" dos percursos.
          'line-opacity': destaque ? 0.95 : 0.45,
        },
      });
      m.addLayer({
        id: 'trilhas-toque',
        type: 'line',
        source: 'trilhas',
        paint: { 'line-width': 14, 'line-opacity': 0 },
      });
    }
  }

  const trilhasRef = useRef(trilhas);
  trilhasRef.current = trilhas;

  // Atualiza os dados quando os filtros mudam.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const aplicar = () => {
      adicionarCamadas(m);
      (m.getSource('trilhas') as GeoJSONSource).setData(geojson(trilhas));
      const b = limites(trilhas);
      if (b) m.fitBounds(b, { padding: 40, maxZoom: 15, duration: 0 });
    };
    if (m.isStyleLoaded()) aplicar();
    else m.once('load', aplicar);
  }, [trilhas]);

  // Clique abre a atividade; o cursor indica que dá para clicar.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const clique = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const { id, titulo } = f.properties as { id: string; titulo: string };
      if (!cliqueRef.current) return;
      if (titulo) {
        const el = document.createElement('div');
        const link = document.createElement('a');
        link.href = `#/atividade/${id}`;
        link.textContent = titulo;
        el.append(link);
        new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(el).addTo(m);
      } else {
        cliqueRef.current(id);
      }
    };
    const entrar = () => (m.getCanvas().style.cursor = 'pointer');
    const sair = () => (m.getCanvas().style.cursor = '');
    m.on('click', 'trilhas-toque', clique);
    m.on('mouseenter', 'trilhas-toque', entrar);
    m.on('mouseleave', 'trilhas-toque', sair);
    return () => {
      m.off('click', 'trilhas-toque', clique);
      m.off('mouseenter', 'trilhas-toque', entrar);
      m.off('mouseleave', 'trilhas-toque', sair);
    };
  }, []);

  return <div ref={ref} class={classe} role="region" aria-label="Mapa de trilhas" />;
}
