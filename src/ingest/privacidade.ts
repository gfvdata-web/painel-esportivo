// Zonas privadas: cortam o começo e o fim das trilhas perto de lugares sensíveis.
//
// Além das zonas manuais do config.local.json, detectamos automaticamente os lugares onde
// muitas atividades começam ou terminam (casa, trabalho, academia). Assim ninguém precisa
// digitar a própria coordenada. As zonas NUNCA são gravadas em data/processed/.
import type { ZonaPrivada } from './config';
import { distanciaM, type LatLon } from './lib/geo';

/**
 * Agrupa pontos de início/fim próximos (guloso: o ponto com mais vizinhos vira centro,
 * remove o grupo e repete). Retorna zonas com pelo menos `minAtividades` atividades distintas.
 */
export function detectarZonas(
  extremos: { idAtividade: string; ponto: LatLon }[],
  opcoes: { minAtividades: number; raioAgrupamentoM: number; raioCorteM: number },
): ZonaPrivada[] {
  let restantes = extremos.slice();
  const zonas: ZonaPrivada[] = [];
  while (restantes.length) {
    let melhor: typeof restantes = [];
    for (const e of restantes) {
      const vizinhos = restantes.filter((o) => distanciaM(e.ponto, o.ponto) <= opcoes.raioAgrupamentoM);
      if (vizinhos.length > melhor.length) melhor = vizinhos;
    }
    const atividades = new Set(melhor.map((v) => v.idAtividade));
    if (atividades.size < opcoes.minAtividades) break;
    const lat = melhor.reduce((s, v) => s + v.ponto.lat, 0) / melhor.length;
    const lon = melhor.reduce((s, v) => s + v.ponto.lon, 0) / melhor.length;
    zonas.push({ nome: `automática ${zonas.length + 1}`, lat, lon, raioM: opcoes.raioCorteM });
    const usados = new Set(melhor);
    restantes = restantes.filter((r) => !usados.has(r));
  }
  return zonas;
}

const dentro = (p: LatLon, zonas: ZonaPrivada[]) => zonas.some((z) => distanciaM(p, z) <= z.raioM);

/**
 * Remove os pontos do início até sair de todas as zonas, e o mesmo a partir do fim.
 * Se a trilha inteira estiver dentro de zonas, devolve lista vazia.
 */
export function cortarTrilha<T extends LatLon>(pontos: T[], zonas: ZonaPrivada[]): T[] {
  if (!zonas.length) return pontos;
  let ini = 0;
  while (ini < pontos.length && dentro(pontos[ini]!, zonas)) ini++;
  let fim = pontos.length - 1;
  while (fim >= ini && dentro(pontos[fim]!, zonas)) fim--;
  return pontos.slice(ini, fim + 1);
}
