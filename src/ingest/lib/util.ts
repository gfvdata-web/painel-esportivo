// Utilitários pequenos compartilhados pelos adaptadores.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Converte texto numérico em número, aceitando vírgula decimal ("10,10") e
 * separador de milhar ("1.234,5"). Vazio, zero-como-ausente e lixo viram undefined.
 */
export function numero(v: string | undefined | null, opcoes: { zeroEhVazio?: boolean } = {}): number | undefined {
  if (v === undefined || v === null) return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (s.includes(',')) s = s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  if (opcoes.zeroEhVazio && n === 0) return undefined;
  return n;
}

/** Remove chaves com valor undefined, para o JSON final ficar enxuto. */
export function semVazios<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Lista arquivos recursivamente (caminhos absolutos). */
export function listarArquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...listarArquivos(caminho));
    else saida.push(caminho);
  }
  return saida;
}
