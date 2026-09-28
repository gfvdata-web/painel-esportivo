// Tema claro/escuro: segue o sistema por padrão; o botão fixa claro ou escuro (lembrado no aparelho).
export type Tema = 'auto' | 'claro' | 'escuro';
const CHAVE = 'painel-tema';

export function temaSalvo(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === 'claro' || t === 'escuro' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function aplicarTema(t: Tema) {
  const raiz = document.documentElement;
  if (t === 'auto') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', t === 'claro' ? 'light' : 'dark');
  try {
    if (t === 'auto') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, t);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  window.dispatchEvent(new Event('tema-mudou'));
}

export function temaEscuro(): boolean {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr) return attr === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Alterna para o oposto do que está na tela agora. */
export function alternarTema(): Tema {
  const novo: Tema = temaEscuro() ? 'claro' : 'escuro';
  aplicarTema(novo);
  return novo;
}
