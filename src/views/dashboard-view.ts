/**
 * WardFlow Dashboard View
 * Tela principal do aplicativo
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import { getAllNotes, deleteNotes } from '@/services/db/notes-service';
import { groupNotesByDateAndWard } from '@/utils/group-notes-by-date-and-ward';
import { generateMessage, copyToClipboard, type ExportScope } from '@/services/export/message-export';
import type { Note } from '@/models/note';
import type { WardGroupData } from '@/components/groups/date-group';
import '../components/base/fab-button';
import '../components/groups/date-group';
import '../components/feedback/action-sheet';
import '../components/feedback/sync-status-bar';

/** Ações disponíveis no action sheet de grupo */
const ACTIONS = [
  { id: 'preview', label: 'Pré-visualizar' },
  { id: 'copy', label: 'Copiar mensagem' },
  { id: 'share', label: 'Compartilhar' },
  { id: 'delete', label: 'Excluir' },
];

/** Ações disponíveis no action sheet de nota individual */
const NOTE_ACTIONS = [
  { id: 'edit', label: 'Editar' },
  { id: 'delete', label: 'Excluir' },
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
  @state() private isDeleteConfirmOpen = false;
  @state() private isNoteActionSheetOpen = false;
  @state() private selectedNote: Note | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

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

  private formatDateForDisplay(date: string): string {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return date;

    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
  }

  private handleDateAction = (e: CustomEvent<{
    date: string;
    wards: WardGroupData[];
    scopeType: 'date';
  }>) => {
    this.selectedScope = { type: 'date', date: e.detail.date, wards: e.detail.wards };
    this.selectedTitle = this.formatDateForDisplay(e.detail.date);
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

  private handleNoteAction = (e: CustomEvent<{ note: Note }>) => {
    this.selectedNote = e.detail.note;
    this.selectedTitle = `${e.detail.note.bed}${e.detail.note.reference ? ` (${e.detail.note.reference})` : ''}`;
    this.isNoteActionSheetOpen = true;
  };

  private handleNoteActionSelected = (e: CustomEvent<{ actionId: string }>) => {
    const { actionId } = e.detail;

    if (actionId === 'edit' && this.selectedNote) {
      navigate(`/editar-nota/${this.selectedNote.id}`);
      this.isNoteActionSheetOpen = false;
    } else if (actionId === 'delete' && this.selectedNote) {
      this.isNoteActionSheetOpen = false;
      this.isDeleteConfirmOpen = true;
    }
  };

  private handleNoteActionSheetClosed = () => {
    this.isNoteActionSheetOpen = false;
    this.selectedNote = null;
  };

  private handleActionSelected = async (e: CustomEvent<{ actionId: string }>) => {
    const { actionId } = e.detail;

    if (actionId === 'copy' && this.selectedScope) {
      await this.handleCopyMessage();
      this.isActionSheetOpen = false;
    } else if (actionId === 'preview' && this.selectedScope) {
      this.handlePreviewMessage();
      this.isActionSheetOpen = false;
    } else if (actionId === 'share' && this.selectedScope) {
      await this.handleShareMessage();
      this.isActionSheetOpen = false;
    } else if (actionId === 'delete' && this.selectedScope) {
      this.isActionSheetOpen = false;
      this.isDeleteConfirmOpen = true;
    }
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

  private handleShareMessage = async (): Promise<void> => {
    const scope = this.buildExportScope();
    if (!scope) return;

    const message = generateMessage(scope);

    // Feature detection: verificar se navigator.share está disponível
    const canShare = 'share' in navigator && typeof navigator.share === 'function';

    if (canShare) {
      try {
        await navigator.share({ text: message });
        return; // Sucesso - sem toast
      } catch {
        // Usuário cancelou ou erro - fallback para copiar
      }
    }

    // Fallback: copiar para clipboard
    const success = await copyToClipboard(message);
    if (success) {
      this.showTemporaryToast('Mensagem copiada');
    }
  };

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

  private getNoteIdsToDelete(): string[] {
    // Se há uma nota individual selecionada
    if (this.selectedNote) {
      return [this.selectedNote.id];
    }

    if (!this.selectedScope) return [];

    if (this.selectedScope.type === 'ward') {
      return this.selectedScope.notes.map(n => n.id);
    }

    // Para date, coleta todos os IDs de todas as wards
    return this.selectedScope.wards.flatMap(w => w.notes.map(n => n.id));
  }

  private handleDeleteConfirm = async (): Promise<void> => {
    const noteIds = this.getNoteIdsToDelete();

    if (noteIds.length === 0) {
      this.isDeleteConfirmOpen = false;
      return;
    }

    try {
      await deleteNotes(noteIds);
      this.showTemporaryToast(`${String(noteIds.length)} nota(s) excluída(s)`);
      await this.loadNotes();
    } catch (error) {
      console.error('Erro ao excluir notas:', error);
      this.showTemporaryToast('Erro ao excluir notas');
    } finally {
      this.isDeleteConfirmOpen = false;
      this.selectedScope = null;
      this.selectedNote = null;
    }
  };

  private handleDeleteCancel = (): void => {
    this.isDeleteConfirmOpen = false;
    this.selectedScope = null;
    this.selectedNote = null;
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
      <div class="d-flex align-items-center justify-content-center" style="min-height: 55vh;">
        <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
          <div class="card-body p-4">
            <svg class="mx-auto text-secondary opacity-75 mb-3" width="56" height="56" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="h6 mb-2">Nenhuma nota ainda</p>
            <p class="text-secondary mb-3">Comece criando uma nova nota para registrar suas observações clínicas.</p>
            <div class="small text-secondary border-top pt-3">Toque no botão abaixo para adicionar</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderNotesList() {
    const groupedNotes = groupNotesByDateAndWard(this.notes);

    return html`
      <div class="d-flex flex-column gap-3" @note-action=${this.handleNoteAction}>
        ${groupedNotes.map(
          group => html`
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
      <sync-status-bar></sync-status-bar>

      <main class="container-fluid wf-page-container wf-with-header-sync wf-sheet-safe pb-4">
        ${this.isLoading
          ? html`<div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">Carregando...</div>`
          : this.notes.length > 0
            ? this.renderNotesList()
            : this.renderEmptyState()}
      </main>

      <fab-button icon="plus" label="Nova nota" @fab-click=${this.handleFabClick}></fab-button>
    `;
  }

  private renderPreview() {
    return html`
      <app-header title="WardFlow"></app-header>

      <main class="container-fluid wf-page-container wf-with-header-sync pb-4">
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-header bg-body fw-semibold">Pré-visualizar mensagem</div>
          <div class="card-body">
            <pre class="wf-preview-message">${this.previewMessage}</pre>
          </div>
        </div>

        <div class="d-grid gap-2 d-sm-flex justify-content-end">
          <button type="button" class="btn btn-outline-secondary" @click=${this.handlePreviewClose}>
            Fechar
          </button>
          <button type="button" class="btn btn-primary" @click=${this.handlePreviewCopy}>
            Copiar
          </button>
        </div>
      </main>
    `;
  }

  private renderToast() {
    return html`
      <div
        class="position-fixed start-50 translate-middle-x text-bg-dark rounded-pill px-3 py-2 small shadow ${
          this.showToast ? '' : 'd-none'
        }"
        style="bottom: calc(80px + var(--safe-area-inset-bottom)); z-index: var(--z-toast);"
      >
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

      <action-sheet
        .visible=${this.isNoteActionSheetOpen}
        .title=${this.selectedTitle}
        .actions=${NOTE_ACTIONS}
        @action-selected=${this.handleNoteActionSelected}
        @sheet-closed=${this.handleNoteActionSheetClosed}
      ></action-sheet>

      ${this.renderToast()} ${this.renderDeleteConfirm()}
    `;
  }

  private renderDeleteConfirm() {
    if (!this.isDeleteConfirmOpen) return null;

    const count = this.getNoteIdsToDelete().length;
    let scopeLabel = '';
    if (this.selectedNote) {
      scopeLabel = 'desta nota';
    } else if (this.selectedScope?.type === 'date') {
      scopeLabel = 'desta data';
    } else if (this.selectedScope?.type === 'ward') {
      scopeLabel = 'desta ala';
    }

    return html`
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleDeleteCancel}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h3 class="h6 mb-2">Excluir notas?</h3>
              <p class="text-secondary mb-3">${count} nota(s) ${scopeLabel} serão excluídas permanentemente.</p>
              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleDeleteCancel}>
                  Cancelar
                </button>
                <button type="button" class="btn btn-danger" @click=${this.handleDeleteConfirm}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dashboard-view': DashboardView;
  }
}
