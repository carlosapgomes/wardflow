/**
 * WardFlow App
 * Componente principal que gerencia roteamento e views
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { initializeRouter, subscribeToRoute, type RouteMatch } from '@/router/router';
import { initializeAuth, subscribeToAuth, type AuthState } from '@/services/auth/auth-service';
import { initializeTheme } from '@/services/theme/theme-service';
import { cleanExpiredNotes } from '@/services/db/dexie-db';
import { cleanupSync, initializeSync, pullRemoteNotes, syncNow } from '@/services/sync/sync-service';

// Import layout components
import './components/layout/app-header';

// Import views
import './views/dashboard-view';
import './views/new-note-view';
import './views/login-view';

@customElement('wardflow-app')
export class WardFlowApp extends LitElement {
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
      this.isAuthLoading = state.loading;

      if (!state.loading && state.user) {
        void syncNow();
        void pullRemoteNotes();
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
    'wardflow-app': WardFlowApp;
  }
}
