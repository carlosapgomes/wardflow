/**
 * VisitaMed App Header
 * Cabeçalho da aplicação com menu e usuário
 */

import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { subscribeToAuth, signOutUser, type AuthState } from '@/services/auth/auth-service';
import { navigate } from '@/router/router';
import { getResolvedTheme, toggleTheme, type AppTheme } from '@/services/theme/theme-service';
import { config } from '@/config/env';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let cachedInstallPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    cachedInstallPrompt = event as BeforeInstallPromptEvent;
  });

  window.addEventListener('appinstalled', () => {
    cachedInstallPrompt = null;
  });
}

@customElement('app-header')
export class AppHeader extends LitElement {
  @property({ type: String }) override title = 'VisitaMed';
  @state() private user: AuthState['user'] = null;
  @state() private showMenu = false;
  @state() private showAboutModal = false;
  @state() private showInstallHelpModal = false;
  @state() private showAndroidInstallHelpModal = false;
  @state() private currentTheme: AppTheme = 'light';
  @state() private canInstallApp = false;
  @state() private canShowIosInstallHelp = false;
  @state() private canShowAndroidInstallHelp = false;

  private unsubscribe: (() => void) | null = null;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.currentTheme = getResolvedTheme();

    this.unsubscribe = subscribeToAuth((state: AuthState) => {
      this.user = state.user;
    });

    // Fecha menu ao clicar fora
    document.addEventListener('click', this.handleOutsideClick);

    // Detecta quando o app pode ser instalado (Android/Chrome)
    this.deferredInstallPrompt = cachedInstallPrompt;
    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.handleAppInstalled);
    this.updateInstallOptions();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    document.removeEventListener('click', this.handleOutsideClick);
    window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.handleAppInstalled);
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
      this.updateInstallOptions();
      this.showMenu = !this.showMenu;
    } else {
      this.dispatchEvent(new CustomEvent('user-click', { bubbles: true, composed: true }));
    }
  };

  private handleThemeToggle = (e?: Event): void => {
    e?.stopPropagation();
    this.showMenu = false;
    this.currentTheme = toggleTheme();
  };

  private handleAboutOpen = (e?: Event): void => {
    e?.stopPropagation();
    this.showMenu = false;
    this.showAboutModal = true;
  };

  private handleSettingsOpen = (e?: Event): void => {
    e?.stopPropagation();
    this.showMenu = false;
    navigate('/configuracoes');
  };

  private handleAboutClose = (): void => {
    this.showAboutModal = false;
  };

  private isInstalled(): boolean {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  }

  private isIosDevice(): boolean {
    const ua = window.navigator.userAgent;
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
    const isTouchMac = ua.includes('Mac') && 'ontouchend' in document;
    return isAppleMobile || isTouchMac;
  }

  private updateInstallOptions(): void {
    const installed = this.isInstalled();
    const iosDevice = this.isIosDevice();
    const nonIosDevice = !iosDevice;

    this.canInstallApp = !installed && nonIosDevice && this.deferredInstallPrompt !== null;
    this.canShowIosInstallHelp = !installed && iosDevice;
    this.canShowAndroidInstallHelp = !installed && nonIosDevice && this.deferredInstallPrompt === null;
  }

  private handleBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    cachedInstallPrompt = event as BeforeInstallPromptEvent;
    this.deferredInstallPrompt = cachedInstallPrompt;
    this.updateInstallOptions();
  };

  private handleAppInstalled = (): void => {
    cachedInstallPrompt = null;
    this.deferredInstallPrompt = null;
    this.updateInstallOptions();
  };

  private handleInstallClick = async (e?: Event): Promise<void> => {
    e?.stopPropagation();
    this.showMenu = false;

    if (!this.deferredInstallPrompt) return;

    const installEvent = this.deferredInstallPrompt;
    this.deferredInstallPrompt = null;
    cachedInstallPrompt = null;

    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch (error) {
      console.error('Erro ao abrir prompt de instalação:', error);
    } finally {
      this.updateInstallOptions();
    }
  };

  private handleInstallHelpOpen = (e?: Event): void => {
    e?.stopPropagation();
    this.showMenu = false;
    this.showInstallHelpModal = true;
  };

  private handleInstallHelpClose = (): void => {
    this.showInstallHelpModal = false;
  };

  private handleAndroidInstallHelpOpen = (e?: Event): void => {
    e?.stopPropagation();
    this.showMenu = false;
    this.showAndroidInstallHelpModal = true;
  };

  private handleAndroidInstallHelpClose = (): void => {
    this.showAndroidInstallHelpModal = false;
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

  private renderAboutModal() {
    if (!this.showAboutModal) return null;

    const version = config.app.version;

    return html`
      <div class="modal-backdrop fade show" @click=${this.handleAboutClose}></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleAboutClose}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h2 class="h6 mb-2">Sobre o VisitaMed</h2>
              <p class="text-secondary small mb-3">
                App simples para anotações rápidas durante a visita.
              </p>
              <p class="text-secondary small mb-1">Versão ${version}</p>
              <p class="text-secondary small mb-3">© ${new Date().getFullYear()} VisitaMed</p>
              <div class="d-grid">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleAboutClose}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderInstallHelpModal() {
    if (!this.showInstallHelpModal) return null;

    return html`
      <div class="modal-backdrop fade show" @click=${this.handleInstallHelpClose}></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleInstallHelpClose}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h2 class="h6 mb-2">Instalar no iPhone</h2>
              <ol class="small text-secondary ps-3 mb-3">
                <li>Toque no botão Compartilhar do Safari.</li>
                <li>Selecione “Adicionar à Tela de Início”.</li>
                <li>Confirme em “Adicionar”.</li>
              </ol>
              <div class="d-grid">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleInstallHelpClose}>
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderAndroidInstallHelpModal() {
    if (!this.showAndroidInstallHelpModal) return null;

    return html`
      <div class="modal-backdrop fade show" @click=${this.handleAndroidInstallHelpClose}></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleAndroidInstallHelpClose}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h2 class="h6 mb-2">Instalar no Android</h2>
              <ol class="small text-secondary ps-3 mb-3">
                <li>Toque no menu do navegador (⋮).</li>
                <li>Selecione “Instalar app” ou “Adicionar à tela inicial”.</li>
                <li>Confirme em “Instalar”/“Adicionar”.</li>
              </ol>
              <div class="d-grid">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleAndroidInstallHelpClose}>
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  override render() {
    return html`
      <div class="wf-app-header fixed-top border-bottom">
        <nav class="navbar p-0">
          <div class="container-fluid wf-page-container px-3">
            <div class="d-flex align-items-center justify-content-between w-100">
              <div class="wf-header-slot">
                <span class="wf-brand text-primary" aria-label="VisitaMed">
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24" fill="none" role="img">
                    <!-- V -->
                    <path d="M2 4L8 20L14 4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- M -->
                    <path d="M18 20V4L26 20L34 4V20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
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
                              <button class="dropdown-item" @click=${this.handleThemeToggle}>
                                ${this.currentTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
                              </button>
                              <button class="dropdown-item" @click=${this.handleSettingsOpen}>
                                Configurações
                              </button>
                              <button class="dropdown-item" @click=${this.handleAboutOpen}>
                                Sobre
                              </button>
                              ${this.canInstallApp
                                ? html`
                                    <button class="dropdown-item" @click=${this.handleInstallClick}>
                                      Instalar app
                                    </button>
                                  `
                                : null}
                              ${this.canShowIosInstallHelp
                                ? html`
                                    <button class="dropdown-item" @click=${this.handleInstallHelpOpen}>
                                      Como instalar no iPhone
                                    </button>
                                  `
                                : null}
                              ${this.canShowAndroidInstallHelp
                                ? html`
                                    <button class="dropdown-item" @click=${this.handleAndroidInstallHelpOpen}>
                                      Como instalar no Android
                                    </button>
                                  `
                                : null}
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

      ${this.renderAboutModal()}
      ${this.renderInstallHelpModal()}
      ${this.renderAndroidInstallHelpModal()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
