// Carregamento dos dados do painel.
//  - Em desenvolvimento: JSON aberto servido pelo Vite a partir de data/processed/.
//  - Publicado: arquivos .bin cifrados; pede a senha, deriva a chave e decifra no navegador.
import type { Atividade, Detalhe, Meta, Trilhas } from '../shared/modelo';
import { type ArquivoChave, decifrar, deBase64, derivarChave, nomeOfuscado, senhaConfere } from '../shared/cripto';

export interface Dados {
  atividades: Atividade[];
  trilhas: Trilhas;
  meta: Meta;
}

const CIFRADO = !import.meta.env.DEV;
const CHAVE_LEMBRADA = 'painel-chave';

let chave: CryptoKey | undefined;
let arquivoChave: ArquivoChave | undefined;

export const precisaSenha = () => CIFRADO && !chave;

async function baixar(caminho: string): Promise<Uint8Array> {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`Falha ao baixar ${caminho} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

async function descompactar(bytes: Uint8Array): Promise<string> {
  const fluxo = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(fluxo).text();
}

async function lerCifrado<T>(caminho: string): Promise<T> {
  const bruto = await decifrar(chave!, await baixar(caminho));
  return JSON.parse(await descompactar(bruto)) as T;
}

async function lerAberto<T>(caminho: string): Promise<T> {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`Falha ao baixar ${caminho} (${r.status}). Rodou \`npm run ingest\`?`);
  return (await r.json()) as T;
}

async function obterArquivoChave(): Promise<ArquivoChave> {
  arquivoChave ??= (await (await fetch('dados/chave.json')).json()) as ArquivoChave;
  return arquivoChave;
}

/** Tenta reaproveitar a chave guardada neste aparelho (se a pessoa pediu para lembrar). */
export async function tentarChaveLembrada(): Promise<boolean> {
  if (!CIFRADO) return true;
  let salva: string | null = null;
  try {
    salva = localStorage.getItem(CHAVE_LEMBRADA) ?? sessionStorage.getItem(CHAVE_LEMBRADA);
  } catch {
    return false;
  }
  if (!salva) return false;
  try {
    const arq = await obterArquivoChave();
    const [sal, bruto] = salva.split('.');
    if (sal !== arq.sal) return false; // build novo, sal novo: precisa digitar de novo
    const k = await crypto.subtle.importKey('raw', deBase64(bruto!) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
    if (!(await senhaConfere(k, arq))) return false;
    chave = k;
    return true;
  } catch {
    return false;
  }
}

/** Deriva a chave da senha. Devolve false se a senha estiver errada. */
export async function entrar(senha: string, lembrar: boolean): Promise<boolean> {
  const arq = await obterArquivoChave();
  const k = await derivarChave(senha, deBase64(arq.sal), arq.iteracoes, true);
  if (!(await senhaConfere(k, arq))) return false;
  chave = k;
  try {
    const bruto = new Uint8Array(await crypto.subtle.exportKey('raw', k));
    let s = '';
    for (const b of bruto) s += String.fromCharCode(b);
    const valor = `${arq.sal}.${btoa(s)}`;
    (lembrar ? localStorage : sessionStorage).setItem(CHAVE_LEMBRADA, valor);
  } catch {
    // Sem armazenamento disponível (aba privada etc.): segue só nesta visita.
  }
  return true;
}

export function sair() {
  try {
    localStorage.removeItem(CHAVE_LEMBRADA);
    sessionStorage.removeItem(CHAVE_LEMBRADA);
  } catch {
    /* nada a fazer */
  }
  location.reload();
}

export async function carregarDados(): Promise<Dados> {
  if (!CIFRADO) {
    const [atividades, trilhas, meta] = await Promise.all([
      lerAberto<Atividade[]>('dados/atividades.json'),
      lerAberto<Trilhas>('dados/trilhas.json'),
      lerAberto<Meta>('dados/meta.json'),
    ]);
    return { atividades, trilhas, meta };
  }
  const [atividades, trilhas, meta] = await Promise.all([
    lerCifrado<Atividade[]>('dados/atividades.bin'),
    lerCifrado<Trilhas>('dados/trilhas.bin'),
    lerCifrado<Meta>('dados/meta.bin'),
  ]);
  return { atividades, trilhas, meta };
}

const cacheDetalhes = new Map<string, Promise<Detalhe | undefined>>();

export function carregarDetalhe(id: string): Promise<Detalhe | undefined> {
  let p = cacheDetalhes.get(id);
  if (!p) {
    p = (async () => {
      try {
        if (!CIFRADO) return await lerAberto<Detalhe>(`dados/detalhes/${id}.json`);
        const arq = await obterArquivoChave();
        return await lerCifrado<Detalhe>(`dados/d/${await nomeOfuscado(arq.sal, id)}.bin`);
      } catch {
        return undefined;
      }
    })();
    cacheDetalhes.set(id, p);
  }
  return p;
}
