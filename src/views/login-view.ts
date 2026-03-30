/**
 * VisitaMed Login View
 * Tela de login com Google
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import { signInWithGoogle, subscribeToAuth, type AuthState } from '@/services/auth/auth-service';

@customElement('login-view')
export class LoginView extends LitElement {
  @state() private isLoading = false;
  @state() private error = '';

  private unsubscribe: (() => void) | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();

    // Subscribe para detectar se usuário já está logado
    this.unsubscribe = subscribeToAuth((state: AuthState) => {
      if (state.user && !state.loading) {
        navigate('/dashboard', true);
      }
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private handleLogin = async (): Promise<void> => {
    try {
      this.isLoading = true;
      this.error = '';
      await signInWithGoogle();
      // Navegação será feita pelo subscriber
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao fazer login';
      this.isLoading = false;
    }
  };

  override render() {
    const currentYear = new Date().getFullYear();

    return html`
      <main class="container min-vh-100 d-flex align-items-center justify-content-center py-4">
        <div class="w-100" style="max-width: 420px;">
          <div class="card border-0 shadow-sm w-100">
            <div class="card-body p-4 p-sm-5 text-center">
              <h1 class="h3 text-primary mb-2">VisitaMed</h1>
              <p class="text-secondary mb-4">Anotações rápidas durante a visita</p>

              <button class="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2" @click=${this.handleLogin} ?disabled=${this.isLoading}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>${this.isLoading ? 'Entrando...' : 'Entrar com Google'}</span>
              </button>

              ${this.error ? html`<div class="alert alert-danger py-2 px-3 mt-3 mb-0">${this.error}</div>` : null}
            </div>
          </div>

          <p class="text-secondary small text-center mt-3 mb-0">© ${currentYear} VisitaMed</p>
        </div>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'login-view': LoginView;
  }
}
