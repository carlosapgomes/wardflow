/**
 * WardFlow Router
 * Router customizado simples para SPA
 */

export type RouteParams = Record<string, string>;

export interface Route {
  path: string;
  component: string;
  guard?: () => boolean | Promise<boolean>;
}

export interface RouteMatch {
  route: Route;
  params: RouteParams;
}

type RouteChangeCallback = (match: RouteMatch) => void;

const subscribers: Set<RouteChangeCallback> = new Set();
let currentMatch: RouteMatch | null = null;

/**
 * Configuração de rotas
 */
export const routes: Route[] = [
  { path: '/', component: 'dashboard-view' }, // Redireciona para dashboard
  { path: '/dashboard', component: 'dashboard-view' },
  { path: '/nova-nota', component: 'new-note-view' },
];

/**
 * Inicializa o router
 */
export function initializeRouter(): void {
  window.addEventListener('popstate', handlePopState);
  handleRouteChange();
}

/**
 * Navega para uma rota
 */
export function navigate(path: string, replace = false): void {
  if (window.location.pathname === path) {
    return;
  }

  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }

  handleRouteChange();
}

/**
 * Volta para a rota anterior
 */
export function goBack(): void {
  window.history.back();
}

/**
 * Obtém a rota atual
 */
export function getCurrentRoute(): RouteMatch | null {
  return currentMatch;
}

/**
 * Subscribe para mudanças de rota
 */
export function subscribeToRoute(callback: RouteChangeCallback): () => void {
  subscribers.add(callback);
  if (currentMatch) {
    callback(currentMatch);
  }
  return () => subscribers.delete(callback);
}

/**
 * Trata mudanças de rota
 */
async function handleRouteChange(): Promise<void> {
  const path = window.location.pathname;
  const match = matchRoute(path);

  if (!match) {
    // Rota não encontrada - redireciona para dashboard
    navigate('/dashboard', true);
    return;
  }

  // Executa guard se existir
  if (match.route.guard) {
    const canAccess = await match.route.guard();
    if (!canAccess) {
      navigate('/login', true);
      return;
    }
  }

  currentMatch = match;
  notifySubscribers();
}

/**
 * Faz match da rota com o path atual
 */
function matchRoute(path: string): RouteMatch | null {
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

/**
 * Compara path com padrão de rota
 */
function matchPath(pattern: string, path: string): RouteParams | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: RouteParams = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // Parâmetro dinâmico
      const paramName = patternPart.slice(1);
      params[paramName] = pathPart;
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

/**
 * Handler para popstate
 */
function handlePopState(): void {
  handleRouteChange();
}

/**
 * Notifica subscribers
 */
function notifySubscribers(): void {
  if (!currentMatch) return;
  for (const callback of subscribers) {
    callback(currentMatch);
  }
}
