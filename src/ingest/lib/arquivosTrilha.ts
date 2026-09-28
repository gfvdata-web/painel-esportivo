// Leitura de arquivos de trilha: GPX, TCX e FIT, opcionalmente compactados com gzip.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { Decoder, Stream } from '@garmin/fitsdk';
import type { Amostra, PontoGps } from '../types';

export interface ConteudoTrilha {
  pontos: PontoGps[];
  /** Amostras de sensores (FC, cadência, potência, velocidade) alinhadas por tempo. */
  amostras: Amostra[];
}

export type FormatoTrilha = 'gpx' | 'tcx' | 'fit';

export function formatoDoArquivo(caminho: string): FormatoTrilha | undefined {
  const m = /\.(gpx|tcx|fit)(\.gz)?$/i.exec(caminho);
  return m ? (m[1]!.toLowerCase() as FormatoTrilha) : undefined;
}

export function lerArquivoTrilha(caminho: string): ConteudoTrilha {
  const formato = formatoDoArquivo(caminho);
  if (!formato) throw new Error('extensão não suportada');
  let buf = readFileSync(caminho);
  if (/\.gz$/i.test(caminho)) buf = gunzipSync(buf);
  if (formato === 'fit') return lerFit(buf);
  // Exports do Strava às vezes trazem espaços/linhas em branco antes do "<?xml".
  const xml = buf.toString('utf8').replace(/^﻿/, '').trimStart();
  return formato === 'gpx' ? lerGpx(xml) : lerTcx(xml);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: true,
  isArray: (nome) => ['trk', 'trkseg', 'trkpt', 'Activity', 'Lap', 'Track', 'Trackpoint'].includes(nome),
});

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const tempo = (v: unknown): number | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
};

/** Monta uma amostra só se houver algum dado de sensor além do tempo. */
function amostraSe(t: number | undefined, dados: Omit<Amostra, 't'>): Amostra | undefined {
  if (t === undefined) return undefined;
  const limpo = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined));
  return Object.keys(limpo).length ? { t, ...limpo } : undefined;
}

export function lerGpx(xml: string): ConteudoTrilha {
  const doc = parser.parse(xml);
  const pontos: PontoGps[] = [];
  const amostras: Amostra[] = [];
  for (const trk of doc.gpx?.trk ?? []) {
    for (const seg of trk.trkseg ?? []) {
      for (const p of seg.trkpt ?? []) {
        const lat = num(p.lat);
        const lon = num(p.lon);
        if (lat === undefined || lon === undefined) continue;
        const t = tempo(p.time);
        const ele = num(p.ele);
        pontos.push({ lat, lon, ...(ele !== undefined && { ele }), ...(t !== undefined && { t }) });
        const ext = p.extensions ?? {};
        const tpe = ext.TrackPointExtension ?? {};
        const a = amostraSe(t, {
          fc: num(tpe.hr ?? ext.hr),
          cadencia: num(tpe.cad ?? ext.cad),
          potencia: num(ext.power),
        });
        if (a) amostras.push(a);
      }
    }
  }
  return { pontos, amostras };
}

export function lerTcx(xml: string): ConteudoTrilha {
  const doc = parser.parse(xml);
  const pontos: PontoGps[] = [];
  const amostras: Amostra[] = [];
  for (const act of doc.TrainingCenterDatabase?.Activities?.Activity ?? []) {
    for (const lap of act.Lap ?? []) {
      for (const track of lap.Track ?? []) {
        for (const tp of track.Trackpoint ?? []) {
          const t = tempo(tp.Time);
          const ele = num(tp.AltitudeMeters);
          const lat = num(tp.Position?.LatitudeDegrees);
          const lon = num(tp.Position?.LongitudeDegrees);
          if (lat !== undefined && lon !== undefined) {
            pontos.push({ lat, lon, ...(ele !== undefined && { ele }), ...(t !== undefined && { t }) });
          }
          const tpx = tp.Extensions?.TPX ?? {};
          const a = amostraSe(t, {
            fc: num(tp.HeartRateBpm?.Value),
            cadencia: num(tp.Cadence ?? tpx.RunCadence),
            velMs: num(tpx.Speed),
            potencia: num(tpx.Watts),
            distanciaM: num(tp.DistanceMeters),
          });
          if (a) amostras.push(a);
        }
      }
    }
  }
  return { pontos, amostras };
}

const SEMICIRCULO_PARA_GRAU = 180 / 2 ** 31;

export function lerFit(buf: Buffer): ConteudoTrilha {
  const stream = Stream.fromBuffer(buf);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new Error('arquivo FIT inválido');
  const { messages, errors } = decoder.read();
  if (errors.length && !messages.recordMesgs?.length) throw new Error(`FIT ilegível: ${errors[0]}`);
  const pontos: PontoGps[] = [];
  const amostras: Amostra[] = [];
  for (const r of messages.recordMesgs ?? []) {
    const t = r.timestamp instanceof Date ? r.timestamp.getTime() : undefined;
    const ele = num(r.enhancedAltitude ?? r.altitude);
    if (typeof r.positionLat === 'number' && typeof r.positionLong === 'number') {
      pontos.push({
        lat: r.positionLat * SEMICIRCULO_PARA_GRAU,
        lon: r.positionLong * SEMICIRCULO_PARA_GRAU,
        ...(ele !== undefined && { ele }),
        ...(t !== undefined && { t }),
      });
    }
    const a = amostraSe(t, {
      fc: num(r.heartRate),
      cadencia: num(r.cadence),
      velMs: num(r.enhancedSpeed ?? r.speed),
      potencia: num(r.power),
      distanciaM: num(r.distance),
    });
    if (a) amostras.push(a);
  }
  return { pontos, amostras };
}
