/**
 * WardFlow Dashboard View
 * Tela principal do aplicativo
 */

import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import { getAllNotes } from '@/services/db/notes-service';
import { groupNotesByDateAndWard } from '@/utils/group-notes-by-date-and-ward';
import { generateMessage, copyToClipboard, type ExportScope } from '@/services/export/message-export';
import type { Note } from '@/models/note';
import type { WardGroupData } from '@/components/groups/date-group';
import '../components/base/fab-button';
import '../components/groups/date-group';
import '../components/feedback/action-sheet';

/** Ações disponíveis no action sheet */
const ACTIONS = [
  { id: 'preview', label: 'Pré-visualizar' },
  { id: 'copy', label: 'Copiar mensagem' },
  { id: 'share', label: 'Compartilhar' },
];

/** Tipo de escopo selecionado */
type SelectedScope =
  | { type: 'date'; date: string; wards: WardGroupData[] }
  | { type: 'ward'; ward: string; notes: Note[] }
  | null;

@customElement('dashboard-view')
export class DashboardView extends LitElement {
  @state() private notes: Note[] = [];
  @state() private isLoading = true;
  @state() private isActionSheetOpen = false;
  @state() private selectedScope: SelectedScope = null;
  @state() private selectedTitle = '';
  @state() private showToast = false;
  @state() private toastMessage = '';
  @state() private isPreviewOpen = false;
  @state() private previewMessage = '';

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .dashboard-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .notes-list {
      display: flex;
      flex-direction: column;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-6);
      text-align: center;
    }

    .empty-title {
      font-size: var(--font-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      margin-bottom: var(--space-2);
    }

    .empty-subtitle {
      font-size: var(--font-md);
      color: var(--color-muted);
    }

    .loading {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-muted);
      font-size: var(--font-md);
    }

    /* Preview styles */
    .preview-container {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .preview-header {
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border);
    }

    .preview-title {
      font-size: var(--font-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .preview-content {
      flex: 1;
      padding: var(--space-4);
      overflow-y: auto;
    }

    .preview-message {
      white-space: pre-wrap;
      font-family: var(--font-family);
      font-size: var(--font-md);
      line-height: var(--line-height-relaxed);
      color: var(--color-text);
    }

    .preview-actions {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-4);
      padding-bottom: calc(var(--space-4) + var(--safe-area-inset-bottom));
      border-top: 1px solid var(--color-border);
    }

    .btn {
      flex: 1;
      padding: var(--space-4);
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      border-radius: var(--radius-md);
      border: none;
      cursor: pointer;
      transition: background-color var(--transition-fast);
    }

    .btn-secondary {
      background-color: var(--color-surface);
      color: var(--color-text);
    }

    .btn-secondary:hover {
      background-color: var(--color-border);
    }

    .btn-primary {
      background-color: var(--color-primary);
      color: white;
    }

    .btn-primary:hover {
      background-color: var(--color-primary-pressed);
    }

    /* Toast styles */
    .toast {
      position: fixed;
      bottom: calc(80px + var(--safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--color-text);
      color: var(--color-bg);
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-full);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-medium);
      z-index: var(--z-toast);
      opacity: 0;
      transition: opacity var(--transition-normal);
    }

    .toast.visible {
      opacity: 1;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadNotes();
  }

  private async loadNotes(): Promise<void> {
    try {
      this.isLoading = true;
      this.notes = await getAllNotes();
    } catch (error) {
      console.error('Erro ao carregar notas:', error);
      this.notes = [];
    } finally {
      this.isLoading = false;
    }
  }

  private handleFabClick = () => {
    navigate('/nova-nota');
  };

  private handleDateAction = (e: CustomEvent<{
    date: string;
    wards: WardGroupData[];
    scopeType: 'date';
  }>) => {
    this.selectedScope = { type: 'date', date: e.detail.date, wards: e.detail.wards };
    this.selectedTitle = e.detail.date;
    this.isActionSheetOpen = true;
  };

  private handleWardAction = (e: CustomEvent<{
    ward: string;
    notes: Note[];
    scopeType: 'ward';
  }>) => {
    this.selectedScope = { type: 'ward', ward: e.detail.ward, notes: e.detail.notes };
    this.selectedTitle = e.detail.ward;
    this.isActionSheetOpen = true;
  };

  private handleActionSelected = async (e: CustomEvent<{ actionId: string }>) => {
    const { actionId } = e.detail;

    if (actionId === 'copy' && this.selectedScope) {
      await this.handleCopyMessage();
    } else if (actionId === 'preview' && this.selectedScope) {
      this.handlePreviewMessage();
    } else {
      // Placeholder para outras ações
      console.log('Ação selecionada:', actionId, 'Escopo:', this.selectedScope);
    }

    this.isActionSheetOpen = false;
  };

  private buildExportScope(): ExportScope | null {
    if (!this.selectedScope) return null;

    return this.selectedScope.type === 'date'
      ? { type: 'date', date: this.selectedScope.date, wards: this.selectedScope.wards }
      : { type: 'ward', ward: this.selectedScope.ward, notes: this.selectedScope.notes };
  }

  private async handleCopyMessage(): Promise<void> {
    const scope = this.buildExportScope();
    if (!scope) return;

    const message = generateMessage(scope);
    const success = await copyToClipboard(message);

    if (success) {
      this.showTemporaryToast('Mensagem copiada');
    }
  }

  private handlePreviewMessage(): void {
    const scope = this.buildExportScope();
    if (!scope) return;

    this.previewMessage = generateMessage(scope);
    this.isPreviewOpen = true;
  }

  private handlePreviewCopy = async (): Promise<void> => {
    const success = await copyToClipboard(this.previewMessage);

    if (success) {
      this.showTemporaryToast('Mensagem copiada');
    }
  };

  private handlePreviewClose = (): void => {
    this.isPreviewOpen = false;
    this.previewMessage = '';
  };

  private showTemporaryToast(message: string): void {
    this.toastMessage = message;
    this.showToast = true;

    setTimeout(() => {
      this.showToast = false;
    }, 2000);
  }

  private handleSheetClosed = () => {
    this.isActionSheetOpen = false;
  };

  private renderEmptyState() {
    return html`
      <div class="empty-state">
        <p class="empty-title">Nenhuma nota ainda</p>
        <p class="empty-subtitle">Comece criando uma nova nota</p>
      </div>
    `;
  }

  private renderNotesList() {
    const groupedNotes = groupNotesByDateAndWard(this.notes);

    return html`
      <div class="notes-list">
        ${groupedNotes.map(
          (group) => html`
            <date-group
              .date=${group.date}
              .wards=${group.wards}
              @date-action=${this.handleDateAction}
              @ward-action=${this.handleWardAction}
            ></date-group>
          `
        )}
      </div>
    `;
  }

  private renderDashboardContent() {
    return html`
      <app-header title="WardFlow"></app-header>

      <div class="dashboard-content">
        ${this.isLoading
          ? html`<div class="loading">Carregando...</div>`
          : this.notes.length > 0
            ? this.renderNotesList()
            : this.renderEmptyState()}
      </div>

      <fab-button icon="plus" label="Nova nota" @fab-click=${this.handleFabClick}></fab-button>
    `;
  }

  private renderPreview() {
    return html`
      <app-header title="WardFlow"></app-header>

      <div class="preview-container">
        <div class="preview-header">
          <h2 class="preview-title">Pré-visualizar mensagem</h2>
        </div>

        <div class="preview-content">
          <pre class="preview-message">${this.previewMessage}</pre>
        </div>

        <div class="preview-actions">
          <button class="btn btn-secondary" @click=${this.handlePreviewClose}>
            Fechar
          </button>
          <button class="btn btn-primary" @click=${this.handlePreviewCopy}>
            Copiar
          </button>
        </div>
      </div>
    `;
  }

  private renderToast() {
    return html`
      <div class="toast ${this.showToast ? 'visible' : ''}">
        ${this.toastMessage}
      </div>
    `;
  }

  override render() {
    return html`
      ${this.isPreviewOpen ? this.renderPreview() : this.renderDashboardContent()}

      <action-sheet
        .visible=${this.isActionSheetOpen}
        .title=${this.selectedTitle}
        .actions=${ACTIONS}
        @action-selected=${this.handleActionSelected}
        @sheet-closed=${this.handleSheetClosed}
      ></action-sheet>

      ${this.renderToast()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dashboard-view': DashboardView;
  }
}
