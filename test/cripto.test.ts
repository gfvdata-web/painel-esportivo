import { describe, expect, it } from 'vitest';
import { cifrar, criarArquivoChave, decifrar, derivarChave, nomeOfuscado, senhaConfere } from '../src/shared/cripto';

describe('cripto', () => {
  const sal = new Uint8Array(16).fill(7);
  const dados = new TextEncoder().encode('{"ok":true}');

  it('cifra e decifra com a mesma senha', async () => {
    const chave = await derivarChave('cavalo-nuvem-prego-limao', sal, 1000);
    const pacote = await cifrar(chave, dados);
    expect(new TextDecoder().decode(pacote)).not.toContain('ok');
    expect(await decifrar(chave, pacote)).toEqual(dados);
  });

  it('senha errada não abre e é detectada pelo verificador', async () => {
    const certa = await derivarChave('cavalo-nuvem-prego-limao', sal, 1000);
    const errada = await derivarChave('outra-senha-qualquer', sal, 1000);
    const arq = await criarArquivoChave(certa, sal, 1000);
    expect(await senhaConfere(certa, arq)).toBe(true);
    expect(await senhaConfere(errada, arq)).toBe(false);
    await expect(decifrar(errada, await cifrar(certa, dados))).rejects.toThrow();
  });

  it('nome ofuscado é determinístico e não contém o id', async () => {
    const a = await nomeOfuscado('c2Fs', 's17046787796');
    expect(a).toBe(await nomeOfuscado('c2Fs', 's17046787796'));
    expect(a).not.toContain('17046787796');
    expect(a).toMatch(/^[0-9a-f]{20}$/);
  });
});
