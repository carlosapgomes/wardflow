/**
 * Redirect Validator
 * Valida URLs de redirecionamento para evitar open redirect
 */

/**
 * Valida se o `next` é um caminho interno seguro
 * Retorna o caminho válido ou '/' seinválido
 */
export function validateRedirectUrl(next: string | null | undefined): string {
  // Se não houver next, retorna dashboard
  if (!next) {
    return '/dashboard';
  }

  try {
    // Decodifica o URL-encoded string
    const decoded = decodeURIComponent(next);

    // Rejeita URLs absolutas (http, https, //)
    if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('//')) {
      return '/dashboard';
    }

    // Deve começar com /
    if (!decoded.startsWith('/')) {
      return '/dashboard';
    }

    // Rejeita /login como destino (para evitar loop)
    if (decoded === '/login') {
      return '/dashboard';
    }

    // Retorna o caminho validado
    return decoded;
  } catch {
    // Se houver erro de decoding, retorna dashboard
    return '/dashboard';
  }
}

/**
 * Extrai o pathname + search + hash da URL atual
 * Usado para passar como parâmetro 'next'
 */
export function getCurrentPathWithQuery(): string {
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
}