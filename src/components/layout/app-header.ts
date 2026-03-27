/**
 * WardFlow App Header
 * Cabeçalho da aplicação com menu e usuário
 */

import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { subscribeToAuth, signOutUser, type AuthState } from '@/services/auth/auth-service';
import { navigate } from '@/router/router';

@customElement('app-header')
export class AppHeader extends LitElement {
  @property({ type: String }) override title = 'WardFlow';
  @state() private user: AuthState['user'] = null;
  @state() private showMenu = false;

  private unsubscribe: (() => void) | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsubscribe = subscribeToAuth((state: AuthState) => {
      this.user = state.user;
    });

    // Fecha menu ao clicar fora
    document.addEventListener('click', this.handleOutsideClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    document.removeEventListener('click', this.handleOutsideClick);
  }

  private handleOutsideClick = (e: Event): void => {
    if (this.showMenu) {
      const target = e.target as HTMLElement;
      if (!this.contains(target)) {
        this.showMenu = false;
      }
    }
  };

  private handleUserClick = (e: Event): void => {
    e.stopPropagation();
    if (this.user) {
      this.showMenu = !this.showMenu;
    } else {
      this.dispatchEvent(new CustomEvent('user-click', { bubbles: true, composed: true }));
    }
  };

  private handleLogout = async (): Promise<void> => {
    this.showMenu = false;
    try {
      await signOutUser();
      navigate('/login', true);
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  private handleAvatarImageError = (e: Event): void => {
    const img = e.currentTarget as HTMLImageElement;
    img.style.display = 'none';
  };

  private getAvatarContent() {
    if (!this.user) return null;

    const initial = this.user.displayName?.charAt(0).toUpperCase() ?? 'U';

    return html`
      <span class="wf-avatar-initial">${initial}</span>
      ${this.user.photoURL
        ? html`<img src=${this.user.photoURL} alt="" referrerpolicy="no-referrer" @error=${this.handleAvatarImageError} />`
        : null}
    `;
  }

  override render() {
    return html`
      <div class="wf-app-header fixed-top border-bottom">
        <nav class="navbar p-0">
          <div class="container-fluid wf-page-container px-3">
            <div class="d-flex align-items-center justify-content-between w-100">
              <div class="wf-header-slot">
                <span class="wf-brand text-primary" aria-label="WardFlow">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="24" viewBox="0 0 32 24" fill="none" role="img">
                    <path d="M2 3L5.4 21L9.4 9.8L13.4 21L16.8 3" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M21 3V21" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
                    <path d="M21 3H30" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
                    <path d="M21 11.5H27.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
                  </svg>
                </span>
              </div>

              <h1 class="wf-header-title mb-0 text-center flex-grow-1">${this.title}</h1>

              <div class="wf-header-slot justify-content-end position-relative">
                ${this.user
                  ? html`
                      <button
                        class="btn p-0 border-0 bg-transparent wf-user-btn"
                        @click=${this.handleUserClick}
                        aria-label="Usuário"
                      >
                        <span class="wf-avatar">${this.getAvatarContent()}</span>
                      </button>
                      ${this.showMenu
                        ? html`
                            <div class="dropdown-menu show dropdown-menu-end position-absolute top-100 end-0 mt-2">
                              <button class="dropdown-item text-danger" @click=${this.handleLogout}>
                                Sair
                              </button>
                            </div>
                          `
                        : null}
                    `
                  : html`
                      <button
                        class="btn btn-link text-body p-2 text-decoration-none wf-user-btn"
                        @click=${this.handleUserClick}
                        aria-label="Usuário"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </button>
                    `}
              </div>
            </div>
          </div>
        </nav>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
