/**
 * VisitaMed App
 * Componente principal que gerencia roteamento e views
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { initializeRouter, subscribeToRoute, getCurrentRoute, navigate, type RouteMatch } from '@/router/router';
import { initializeAuth, subscribeToAuth, type AuthState } from '@/services/auth/auth-service';
import { initializeTheme } from '@/services/theme/theme-service';
import { cleanExpiredLocalData } from '@/services/db/dexie-db';
import { validateRedirectUrl, getCurrentPathWithQuery } from '@/utils/redirect-validator';
import {
  cleanupSync,
  initializeSync,
  pullRemoteNotes,
  pullRemoteSettings,
  pullRemoteVisitMembershipsAndVisits,
  syncNow,
  setActiveVisitRealtime,
} from '@/services/sync/sync-service';

// Import layout components
import './components/layout/app-header';

// Import views
import './views/visits-view';
import './views/dashboard-view';
import './views/new-note-view';
import './views/login-view';
import './views/settings-view';
import './views/invite-accept-view';

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
    void cleanExpiredLocalData();

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

      // S5D: alinhar listener realtime com auth/rota atual
      if (!state.loading) {
        const currentRoute = getCurrentRoute();
        const currentVisitId = currentRoute?.params['visitId'] ?? null;

        if (state.user) {
          setActiveVisitRealtime(currentVisitId);
        } else {
          setActiveVisitRealtime(null);
        }
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

    // S5D: ativa/desativa realtime conforme a visita aberta
    const visitId = match.params['visitId'] as string | undefined ?? null;
    setActiveVisitRealtime(visitId);
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

    // Deslogado em rota protegida -> /login com next
    if (isProtectedRoute && !isLoggedIn) {
      const currentPath = getCurrentPathWithQuery();
      const loginUrl = `/login?next=${encodeURIComponent(currentPath)}`;
      navigate(loginUrl, true);
      return;
    }

    // Logado em /login -> usa o next ou dashboard
    if (isLoginRoute && isLoggedIn) {
      const urlParams = new URLSearchParams(window.location.search);
      const next = urlParams.get('next');
      const redirectTo = validateRedirectUrl(next);
      navigate(redirectTo, true);
      return;
    }
  }

  /**
   * executa sync sequencialmente (sync + pull)
   */
  private async performSync(): Promise<void> {
    // S14A: ordem de sync para hidratar memberships/visitas antes do pull de notas
    await syncNow();
    await pullRemoteVisitMembershipsAndVisits();
    await pullRemoteNotes();
    await pullRemoteSettings();
    await cleanExpiredLocalData();
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
      case 'visits-view':
        view = html`<visits-view></visits-view>`;
        break;
      case 'dashboard-view':
        view = html`<dashboard-view></dashboard-view>`;
        break;
      case 'new-note-view':
        view = html`<new-note-view></new-note-view>`;
        break;
      case 'login-view':
        view = html`<login-view></login-view>`;
        break;
      case 'settings-view':
        view = html`<settings-view></settings-view>`;
        break;
      case 'invite-accept-view':
        view = html`<invite-accept-view></invite-accept-view>`;
        break;
      default:
        view = html`<visits-view></visits-view>`;
    }

    return html`${view}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'visitamed-app': VisitaMedApp;
  }
}
