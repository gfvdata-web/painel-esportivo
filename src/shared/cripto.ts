// Criptografia dos dados publicados. Usa só WebCrypto, que existe no Node ≥ 20 e nos navegadores,
// então o mesmo código cifra no build e decifra na página.
//
// Esquema: chave AES-256-GCM derivada da senha com PBKDF2-SHA-256 (600 mil iterações, sal aleatório
// por build). Cada arquivo = IV (12 bytes) + texto cifrado. Um "verificador" cifrado permite dizer
// "senha errada" sem tentar abrir os dados.

export const ITERACOES_PADRAO = 600_000;
const VERIFICADOR = 'painel-esportivo';

export interface ArquivoChave {
  versao: 1;
  /** Sal do PBKDF2, em base64. */
  sal: string;
  iteracoes: number;
  /** VERIFICADOR cifrado com a chave, em base64. */
  verificador: string;
}

export const paraBase64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
export const deBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function derivarChave(senha: string, sal: Uint8Array, iteracoes: number, extraivel = false): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteracoes },
    base,
    { name: 'AES-GCM', length: 256 },
    extraivel,
    ['encrypt', 'decrypt'],
  );
}

export async function cifrar(chave: CryptoKey, dados: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, dados as BufferSource));
  const saida = new Uint8Array(iv.length + cifrado.length);
  saida.set(iv);
  saida.set(cifrado, iv.length);
  return saida;
}

/** Lança erro se a chave estiver errada ou o arquivo tiver sido alterado (GCM autentica). */
export async function decifrar(chave: CryptoKey, pacote: Uint8Array): Promise<Uint8Array> {
  const iv = pacote.subarray(0, 12);
  const corpo = pacote.subarray(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, chave, corpo as BufferSource));
}

export async function criarArquivoChave(chave: CryptoKey, sal: Uint8Array, iteracoes: number): Promise<ArquivoChave> {
  const v = await cifrar(chave, new TextEncoder().encode(VERIFICADOR));
  return { versao: 1, sal: paraBase64(sal), iteracoes, verificador: paraBase64(v) };
}

export async function senhaConfere(chave: CryptoKey, arq: ArquivoChave): Promise<boolean> {
  try {
    const v = await decifrar(chave, deBase64(arq.verificador));
    return new TextDecoder().decode(v) === VERIFICADOR;
  } catch {
    return false;
  }
}

/**
 * Nome publicado de um arquivo de detalhe: hash do sal + id. Esconde os ids originais
 * (um id do Strava levaria direto à atividade no site do Strava).
 */
export async function nomeOfuscado(salBase64: string, id: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salBase64}:${id}`));
  return [...new Uint8Array(h).subarray(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
