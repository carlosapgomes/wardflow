/**
 * VisitaMed App
 * Componente principal que gerencia roteamento e views
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { initializeRouter, subscribeToRoute, getCurrentRoute, navigate, type RouteMatch } from '@/router/router';
import { initializeAuth, subscribeToAuth, type AuthState } from '@/services/auth/auth-service';
import { initializeTheme } from '@/services/theme/theme-service';
import { cleanExpiredNotes } from '@/services/db/dexie-db';
import { cleanupSync, initializeSync, pullRemoteNotes, pullRemoteWardStats, syncNow } from '@/services/sync/sync-service';

// Import layout components
import './components/layout/app-header';

// Import views
import './views/dashboard-view';
import './views/new-note-view';
import './views/login-view';

@customElement('visitamed-app')
export class VisitaMedApp extends LitElement {
  @state() private currentComponent = 'dashboard-view';
  @state() private isAuthLoading = true;

  private unsubscribeAuth: (() => void) | null = null;
  private unsubscribeRoute: (() => void) | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  constructor() {
    super();
    this.initApp();
  }

  private initApp(): void {
    // Inicializa tema (com fallback para preferência do sistema)
    initializeTheme();

    // Higiene local (não bloqueia UI)
    void cleanExpiredNotes();

    // Inicializa orquestração de sync automática
    initializeSync();

    // Inicializa autenticação primeiro
    initializeAuth();

    // Subscribe ao estado de auth para saber quando terminou de carregar
    this.unsubscribeAuth = subscribeToAuth((state: AuthState) => {
      const wasLoading = this.isAuthLoading;
      this.isAuthLoading = state.loading;

      // Quando auth termina de carregar, revalida rota atual
      if (wasLoading && !state.loading) {
        this.revalidateRoute(state.user !== null);
      }

      // Sync sequencial após confirmar usuário logado
      if (!state.loading && state.user) {
        void this.performSync();
      }
    });

    // Inicializa router
    initializeRouter();
    this.unsubscribeRoute = subscribeToRoute(this.handleRouteChange.bind(this));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();

    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;

    this.unsubscribeRoute?.();
    this.unsubscribeRoute = null;

    cleanupSync();
  }

  private handleRouteChange(match: RouteMatch): void {
    this.currentComponent = match.route.component;
  }

  /**
   * Revalida a rota atual quando auth resolve
   * Garante que rotas protegidas não sejam exibidas para usuários deslogados
   */
  private revalidateRoute(isLoggedIn: boolean): void {
    const currentRoute = getCurrentRoute();
    if (!currentRoute) return;

    const isProtectedRoute = currentRoute.route.guard !== undefined;
    const isLoginRoute = currentRoute.route.path === '/login';

    // Deslogado em rota protegida -> /login
    if (isProtectedRoute && !isLoggedIn) {
      navigate('/login', true);
      return;
    }

    // Logado em /login -> /dashboard
    if (isLoginRoute && isLoggedIn) {
      navigate('/dashboard', true);
    }
  }

  /**
   * executa sync sequencialmente (sync + pull)
   */
  private async performSync(): Promise<void> {
    await syncNow();
    await pullRemoteNotes();
    await pullRemoteWardStats();
  }

  override render() {
    // Mostra loading enquanto verifica auth
    if (this.isAuthLoading) {
      return html`
        <div class="min-vh-100 d-flex align-items-center justify-content-center text-secondary">
          Carregando...
        </div>
      `;
    }

    let view;
    switch (this.currentComponent) {
      case 'dashboard-view':
        view = html`<dashboard-view></dashboard-view>`;
        break;
      case 'new-note-view':
        view = html`<new-note-view></new-note-view>`;
        break;
      case 'login-view':
        view = html`<login-view></login-view>`;
        break;
      default:
        view = html`<dashboard-view></dashboard-view>`;
    }

    return html`${view}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'visitamed-app': VisitaMedApp;
  }
}
