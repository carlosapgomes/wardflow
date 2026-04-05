/**
 * Invite Accept View
 * Tela para aceitar convite por token
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate, getCurrentRoute } from '@/router/router';
import { acceptVisitInviteByToken, type AcceptInviteStatus, type AcceptInviteResult } from '@/services/db/visit-invites-service';
import { getVisitById } from '@/services/db/visits-service';
import { getCurrentUserVisitMember } from '@/services/db/visit-members-service';
import { pullRemoteNotes, pullRemoteVisitMembershipsAndVisits, syncNow } from '@/services/sync/sync-service';

@customElement('invite-accept-view')
export class InviteAcceptView extends LitElement {
  @state() private status: AcceptInviteStatus | null = null;
  @state() private visitId: string | null = null;
  @state() private isLoading = true;
  @state() private isPreparingVisit = false;
  @state() private isVisitReady = false;
  @state() private error = '';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.handleAcceptInvite();
  }

  private async handleAcceptInvite(): Promise<void> {
    const route = getCurrentRoute();
    const params = route?.params;
    const token = params?.['token'];

    if (!token) {
      this.status = 'invite-not-found';
      this.isLoading = false;
      return;
    }

    try {
      const result: AcceptInviteResult = await acceptVisitInviteByToken(token);
      this.status = result.status;
      this.visitId = result.visitId ?? null;

      const isSuccessfulAccept = result.status === 'accepted' || result.status === 'already-member';

      if (isSuccessfulAccept && result.visitId) {
        this.isLoading = false;
        this.isPreparingVisit = true;
        this.isVisitReady = await this.prepareVisitForNavigation(result.visitId);
        this.isPreparingVisit = false;
        return;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao processar convite';
    } finally {
      this.isLoading = false;
      this.isPreparingVisit = false;
    }
  }

  private async prepareVisitForNavigation(visitId: string): Promise<boolean> {
    try {
      await syncNow();
      await pullRemoteVisitMembershipsAndVisits();
      await pullRemoteNotes();
    } catch (error) {
      console.warn('[InviteAcceptView] Hidratação após aceite falhou (best-effort):', error);
    }

    return this.waitForVisitReady(visitId);
  }

  private async waitForVisitReady(visitId: string): Promise<boolean> {
    const timeoutMs = 6000;
    const intervalMs = 250;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const [visit, member] = await Promise.all([
        getVisitById(visitId).catch(() => undefined),
        getCurrentUserVisitMember(visitId).catch(() => undefined),
      ]);

      if (visit && member?.status === 'active') {
        return true;
      }

      await this.sleep(intervalMs);
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  private handleGoBack = () => {
    navigate('/dashboard');
  };

  private handleGoToVisit = () => {
    if (this.visitId) {
      navigate(`/visita/${this.visitId}`);
    } else {
      navigate('/dashboard');
    }
  };

  private getStatusTitle(): string {
    if ((this.status === 'accepted' || this.status === 'already-member') && !this.isVisitReady) {
      return 'Convite aceito';
    }

    switch (this.status) {
      case 'accepted':
        return 'Convite aceito!';
      case 'already-member':
        return 'Você já é membro';
      case 'invite-not-found':
        return 'Convite não encontrado';
      case 'invite-expired':
        return 'Convite expirado';
      case 'invite-revoked':
        return 'Convite revogado';
      case 'access-revoked':
        return 'Acesso removido';
      default:
        return 'Status desconhecido';
    }
  }

  private getStatusMessage(): string {
    if ((this.status === 'accepted' || this.status === 'already-member') && !this.isVisitReady) {
      return 'Seu acesso foi confirmado, mas a visita ainda está sincronizando. Tente abrir novamente em alguns segundos.';
    }

    switch (this.status) {
      case 'accepted':
        return 'Você agora faz parte desta visita. Clique para começar.';
      case 'already-member':
        return 'Você já é membro desta visita.';
      case 'invite-not-found':
        return 'Este convite não existe ou já foi utilizado.';
      case 'invite-expired':
        return 'Este convite expirou e não pode mais ser usado.';
      case 'invite-revoked':
        return 'Este convite foi revogado pelo criador.';
      case 'access-revoked':
        return 'Seu acesso a esta visita foi removido.';
      default:
        return 'Ocorreu um erro ao processar o convite.';
    }
  }

  private getStatusIcon(): string {
    switch (this.status) {
      case 'accepted':
      case 'already-member':
        return 'check';
      case 'invite-not-found':
      case 'invite-expired':
      case 'invite-revoked':
      case 'access-revoked':
        return 'error';
      default:
        return 'error';
    }
  }

  private renderIcon(iconType: string, className: string) {
    if (iconType === 'check') {
      return html`
        <svg class="${className}" width="64" height="64" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      `;
    }
    // error icon
    return html`
      <svg class="${className}" width="64" height="64" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    `;
  }

  override render() {
    const isSuccess = this.status === 'accepted' || this.status === 'already-member';
    const iconClass = isSuccess ? 'text-success' : 'text-danger';

    if (this.isLoading) {
      return html`
        <app-header title="Aceitar convite"></app-header>
        <main class="container-fluid wf-page-container wf-with-header">
          <div class="d-flex align-items-center justify-content-center" style="min-height: 50vh;">
            <div class="text-center">
              <div class="spinner-border text-secondary" role="status">
                <span class="visually-hidden">Carregando...</span>
              </div>
              <p class="mt-3 text-secondary">Processando convite...</p>
            </div>
          </div>
        </main>
      `;
    }

    if (this.isPreparingVisit) {
      return html`
        <app-header title="Aceitar convite"></app-header>

        <main class="container-fluid wf-page-container wf-with-header">
          <div class="d-flex align-items-center justify-content-center" style="min-height: 50vh;">
            <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
              <div class="card-body p-4">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Sincronizando...</span>
                </div>
                <h5 class="mt-3 mb-2">Preparando sua visita</h5>
                <p class="text-secondary mb-0">Sincronizando seus dados. Isso pode levar alguns segundos.</p>
              </div>
            </div>
          </div>
        </main>
      `;
    }

    return html`
      <app-header title="Aceitar convite"></app-header>

      <main class="container-fluid wf-page-container wf-with-header">
        ${this.error
          ? html`<div class="alert alert-danger py-2 px-3 mt-3" role="alert">${this.error}</div>`
          : null}

        <div class="d-flex align-items-center justify-content-center" style="min-height: 50vh;">
          <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
            <div class="card-body p-4">
              ${this.renderIcon(this.getStatusIcon(), `mx-auto mb-3 ${iconClass}`)}

              <h5 class="mb-2">${this.getStatusTitle()}</h5>
              <p class="text-secondary mb-4">${this.getStatusMessage()}</p>

              <div class="d-flex gap-2 justify-content-center">
                <button
                  class="btn btn-outline-secondary"
                  @click=${this.handleGoBack}
                >
                  ${isSuccess && !this.isVisitReady ? 'Ir para minhas visitas' : 'Voltar'}
                </button>
                ${isSuccess && this.isVisitReady
                  ? html`
                      <button
                        class="btn btn-primary"
                        @click=${this.handleGoToVisit}
                      >
                        Ver visita
                      </button>
                    `
                  : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'invite-accept-view': InviteAcceptView;
  }
}
