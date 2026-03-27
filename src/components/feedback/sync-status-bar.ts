/**
 * WardFlow Sync Status Bar
 * Barra de status de sincronização visível no dashboard
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { subscribeToSync, getSyncStatus, syncNow, type SyncStatus } from '@/services/sync/sync-service';

@customElement('sync-status-bar')
export class SyncStatusBar extends LitElement {
  @state() private syncStatus: SyncStatus = getSyncStatus();
  @state() private isRetrying = false;

  private unsubscribe: (() => void) | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsubscribe = subscribeToSync((status: SyncStatus) => {
      this.syncStatus = status;
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private handleRetry = async (): Promise<void> => {
    this.isRetrying = true;
    try {
      await syncNow();
    } finally {
      this.isRetrying = false;
    }
  };

  private formatLastSync(): string {
    if (!this.syncStatus.lastSyncAt) return 'Nunca';

    const now = new Date();
    const diff = now.getTime() - this.syncStatus.lastSyncAt.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${String(minutes)} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${String(hours)}h`;

    return this.syncStatus.lastSyncAt.toLocaleDateString('pt-BR');
  }

  private renderStatusContent() {
    const { isSyncing, pendingCount, error } = this.syncStatus;

    // Error state
    if (error) {
      return html`
        <div class="d-flex align-items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="text-danger">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="small">Erro de sync</span>
          <button
            type="button"
            class="btn btn-sm btn-outline-danger ms-auto"
            @click=${this.handleRetry}
            ?disabled=${this.isRetrying}
          >
            ${this.isRetrying ? 'Repetindo...' : 'Tentar novamente'}
          </button>
        </div>
      `;
    }

    // Syncing state
    if (isSyncing) {
      return html`
        <div class="d-flex align-items-center gap-2">
          <span class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
          <span class="small">Sincronizando...</span>
        </div>
      `;
    }

    // Pending state
    if (pendingCount > 0) {
      return html`
        <div class="d-flex align-items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="text-warning">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="small">${String(pendingCount)} pendência${pendingCount > 1 ? 's' : ''}</span>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary ms-auto"
            @click=${this.handleRetry}
            ?disabled=${this.isRetrying}
          >
            ${this.isRetrying ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      `;
    }

    // Idle state - show last sync
    return html`
      <div class="d-flex align-items-center gap-2 text-secondary">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span class="small">Sincronizado ${this.formatLastSync()}</span>
      </div>
    `;
  }

  override render() {
    // Don't render if no user is logged in (handled by parent)
    return html`
      <div class="wf-sync-status-bar py-2 px-3 border-bottom bg-body">
        ${this.renderStatusContent()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sync-status-bar': SyncStatusBar;
  }
}
