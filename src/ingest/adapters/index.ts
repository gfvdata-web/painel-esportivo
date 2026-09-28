// Registro das fontes. Para adicionar uma fonte nova (ex.: Strava API, Health Connect),
// implemente a interface Adaptador e inclua-a aqui — o resto do pipeline não muda.
import type { Adaptador } from '../types';
import { samsungHealthExport } from './samsungHealthExport';
import { stravaExport } from './stravaExport';

export const adaptadores: Adaptador[] = [stravaExport, samsungHealthExport];
