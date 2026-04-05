/**
 * VisitaMed Dashboard View
 * Tela principal do aplicativo
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { liveQuery, type Subscription } from 'dexie';
import { navigate, getCurrentRoute } from '@/router/router';
import { getAllNotes, deleteNotes } from '@/services/db/notes-service';
import { getCurrentUserVisitMember } from '@/services/db/visit-members-service';
import { getVisitById, deletePrivateVisit } from '@/services/db/visits-service';
import { canEditNote, canDeleteNote, getVisitAccessState, type VisitAccessState } from '@/services/auth/visit-permissions';
import { getDashboardGroupActions } from '@/services/auth/dashboard-actions-policy';
import { groupNotesByDateAndTag } from '@/utils/group-notes-by-date-and-tag';
import { generateMessage, copyToClipboard, type ExportScope } from '@/services/export/message-export';
import type { Note } from '@/models/note';
import type { Visit } from '@/models/visit';
import type { VisitMember } from '@/models/visit-member';
import type { TagGroupData } from '@/components/groups/date-group';
import type { DashboardAction } from '@/services/auth/dashboard-actions-policy';
import '../components/base/fab-button';
import '../components/groups/date-group';
import '../components/feedback/action-sheet';
import '../components/feedback/sync-status-bar';



/** Tipo de escopo selecionado */
type SelectedScope =
  | { type: 'date'; date: string; tags: TagGroupData[] }
  | { type: 'tag'; tag: string; notes: Note[] }
  | null;

@customElement('dashboard-view')
export class DashboardView extends LitElement {
  @state() private visitId: string | null = null;
  // S12A: visitName não usado - título fixo do app
  @state() private notes: Note[] = [];
  @state() private isLoading = true;
  @state() private isActionSheetOpen = false;
  @state() private selectedScope: SelectedScope = null;
  @state() private selectedTitle = '';
  @state() private showToast = false;
  @state() private toastMessage = '';
  @state() private isPreviewOpen = false;
  @state() private previewMessage = '';
  @state() private member: VisitMember | null = null;
  @state() private currentVisit: Visit | null = null;
  @state() private accessState: VisitAccessState = 'no-membership';
  @state() private actions: DashboardAction[] = [];
  @state() private isDeleteConfirmOpen = false;
  @state() private isVisitDeleteConfirmOpen = false;

  private notesSubscription: Subscription | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();

    // Lê visitId da rota
    const route = getCurrentRoute();
    if (route?.params['visitId']) {
      this.visitId = route.params['visitId'];
      await Promise.all([this.loadMember(), this.loadVisit()]);
    }

    this.startNotesSubscription();
  }

  // S12A: loadVisitName removido - título fixo do app
  private async loadMember(): Promise<void> {
    if (!this.visitId) return;

    try {
      this.member = (await getCurrentUserVisitMember(this.visitId)) ?? null;
      this.accessState = getVisitAccessState(this.member);
      // Atualiza ações do action sheet baseada na permissão
      const canDelete = this.member ? canDeleteNote(this.member) : false;
      this.actions = getDashboardGroupActions(canDelete);
    } catch {
      // Usuário não autenticado ou erro - sem membership
      this.member = null;
      this.accessState = 'no-membership';
      this.actions = getDashboardGroupActions(false);
    }
  }

  private async loadVisit(): Promise<void> {
    if (!this.visitId) return;

    try {
      this.currentVisit = (await getVisitById(this.visitId)) ?? null;
    } catch {
      this.currentVisit = null;
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.notesSubscription?.unsubscribe();
    this.notesSubscription = null;
  }

  private startNotesSubscription(): void {
    this.isLoading = true;

    this.notesSubscription?.unsubscribe();

    if (!this.visitId) {
      this.notes = [];
      this.isLoading = false;
      return;
    }

    const visitId = this.visitId;
    this.notesSubscription = liveQuery(() => getAllNotes(visitId)).subscribe({
      next: (notes) => {
        this.notes = notes;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erro ao carregar notas:', error);
        this.notes = [];
        this.isLoading = false;
      },
    });
  }

  private handleFabClick = () => {
    if (!this.visitId) return;
    navigate(`/visita/${this.visitId}/nova-nota`);
  };

  private formatDateForDisplay(date: string): string {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return date;

    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
  }

  private handleDateAction = (e: CustomEvent<{
    date: string;
    tags: TagGroupData[];
    scopeType: 'date';
  }>) => {
    this.selectedScope = { type: 'date', date: e.detail.date, tags: e.detail.tags };
    this.selectedTitle = this.formatDateForDisplay(e.detail.date);
    this.isActionSheetOpen = true;
  };

  private handleTagAction = (e: CustomEvent<{
    tag: string;
    notes: Note[];
    scopeType: 'tag';
  }>) => {
    this.selectedScope = { type: 'tag', tag: e.detail.tag, notes: e.detail.notes };
    this.selectedTitle = e.detail.tag;
    this.isActionSheetOpen = true;
  };

  private handleNoteClick = (e: CustomEvent<{ note: Note }>) => {
    if (!this.visitId) return;
    navigate(`/visita/${this.visitId}/editar-nota/${e.detail.note.id}`);
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

    // Native export scope by tags (S9A)
    switch (this.selectedScope.type) {
      case 'tag':
        return { type: 'tag', tag: this.selectedScope.tag, notes: this.selectedScope.notes };
      case 'date':
        return {
          type: 'date',
          date: this.selectedScope.date,
          tags: this.selectedScope.tags.map(t => ({ tag: t.tag, notes: t.notes })),
        };
    }

    // Should never reach here
    return null;
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
    if (!this.selectedScope) return [];

    if (this.selectedScope.type === 'tag') {
      return this.selectedScope.notes.map(n => n.id);
    }

    // Para date, coleta todos os IDs de todas as tags
    return this.selectedScope.tags.flatMap(t => t.notes.map(n => n.id));
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
    } catch (error) {
      console.error('Erro ao excluir notas:', error);
      this.showTemporaryToast('Erro ao excluir notas');
    } finally {
      this.isDeleteConfirmOpen = false;
      this.selectedScope = null;
    }
  };

  private handleDeleteCancel = (): void => {
    this.isDeleteConfirmOpen = false;
    this.selectedScope = null;
  };

  private canDeletePrivateVisit(): boolean {
    return this.currentVisit?.mode === 'private' && this.member?.role === 'owner' && this.accessState === 'active';
  }

  private handleVisitDeleteClick = (): void => {
    this.isVisitDeleteConfirmOpen = true;
  };

  private handleVisitDeleteCancel = (): void => {
    this.isVisitDeleteConfirmOpen = false;
  };

  private handleVisitDeleteConfirm = async (): Promise<void> => {
    if (!this.visitId) {
      this.isVisitDeleteConfirmOpen = false;
      return;
    }

    try {
      await deletePrivateVisit(this.visitId);
      this.showTemporaryToast('Visita excluída');
      navigate('/dashboard');
    } catch (error) {
      console.error('Erro ao excluir visita privada:', error);
      this.showTemporaryToast('Erro ao excluir visita');
    } finally {
      this.isVisitDeleteConfirmOpen = false;
    }
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

  private isUserRemoved(): boolean {
    return this.accessState === 'removed';
  }

  private isUserNoMembership(): boolean {
    return this.accessState === 'no-membership';
  }

  private canUserEditNote(): boolean {
    if (!this.member) return false;
    return canEditNote(this.member);
  }

  private renderAccessRemoved() {
    return html`
      <app-header title="Acesso removido"></app-header>
      <main class="container-fluid wf-page-container wf-with-header wf-sheet-safe pb-4">
        <div class="d-flex align-items-center justify-content-center" style="min-height: 55vh;">
          <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
            <div class="card-body p-4">
              <svg class="mx-auto text-secondary opacity-75 mb-3" width="56" height="56" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p class="h6 mb-2">Acesso removido</p>
              <p class="text-secondary mb-3">Seu acesso a esta visita foi removido.</p>
              <button type="button" class="btn btn-primary" @click=${this.handleBackClick}>
                Ir para minhas visitas
              </button>
            </div>
          </div>
        </div>
      </main>
    `;
  }

  private renderAccessDenied() {
    return html`
      <app-header title="Acesso negado"></app-header>
      <main class="container-fluid wf-page-container wf-with-header wf-sheet-safe pb-4">
        <div class="d-flex align-items-center justify-content-center" style="min-height: 55vh;">
          <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
            <div class="card-body p-4">
              <svg class="mx-auto text-secondary opacity-75 mb-3" width="56" height="56" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p class="h6 mb-2">Acesso negado</p>
              <p class="text-secondary mb-3">Você não tem permissão para visualizar esta visita.</p>
              <button type="button" class="btn btn-outline-secondary" @click=${this.handleBackClick}>
                Voltar
              </button>
            </div>
          </div>
        </div>
      </main>
    `;
  }

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
    // Agrupar por data e tag (nova lógica S8A)
    const groupedNotes = groupNotesByDateAndTag(this.notes);

    return html`
      <div class="d-flex flex-column gap-3" @note-click=${this.handleNoteClick}>
        ${groupedNotes.map(
          group => html`
            <date-group
              .date=${group.date}
              .tags=${group.tags}
              @date-action=${this.handleDateAction}
              @tag-action=${this.handleTagAction}
            ></date-group>
          `
        )}
      </div>
    `;
  }

  private renderDashboardContent() {
    // S12A: título fixo do app na navbar
    const title = 'VisitaMed';

    return html`
      <app-header title=${title} ?showBack=${true} @back-click=${this.handleBackClick}></app-header>
      <sync-status-bar></sync-status-bar>

      <main class="container-fluid wf-page-container wf-with-header wf-sheet-safe pb-4">
        ${this.canDeletePrivateVisit()
          ? html`
              <div class="mb-3 d-flex justify-content-end">
                <button type="button" class="btn btn-outline-danger" @click=${this.handleVisitDeleteClick}>
                  Excluir visita
                </button>
              </div>
            `
          : ''}

        ${this.isLoading
          ? html`<div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">Carregando...</div>`
          : this.notes.length > 0
            ? this.renderNotesList()
            : this.renderEmptyState()}
      </main>

      ${this.canUserEditNote()
        ? html`<fab-button icon="plus" label="Nova nota" @fab-click=${this.handleFabClick}></fab-button>`
        : ''}
    `;
  }

  private handleBackClick = () => {
    navigate('/dashboard');
  };

  private renderPreview() {
    return html`
      <app-header title="VisitaMed"></app-header>

      <main class="container-fluid wf-page-container wf-with-header pb-4">
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
    // Usuário removido da visita - mensagem específica
    if (this.isUserRemoved()) {
      return this.renderAccessRemoved();
    }

    // Sem membership - acesso negado genérico
    if (this.isUserNoMembership()) {
      return this.renderAccessDenied();
    }

    return html`
      ${this.isPreviewOpen ? this.renderPreview() : this.renderDashboardContent()}

      <action-sheet
        .visible=${this.isActionSheetOpen}
        .title=${this.selectedTitle}
        .actions=${this.actions}
        @action-selected=${this.handleActionSelected}
        @sheet-closed=${this.handleSheetClosed}
      ></action-sheet>

      ${this.renderToast()} ${this.renderDeleteConfirm()} ${this.renderVisitDeleteConfirm()}
    `;
  }

  private renderDeleteConfirm() {
    if (!this.isDeleteConfirmOpen) return null;

    const count = this.getNoteIdsToDelete().length;
    let scopeLabel = '';
    if (this.selectedScope?.type === 'date') {
      scopeLabel = 'desta data';
    } else if (this.selectedScope?.type === 'tag') {
      scopeLabel = 'desta tag';
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
                  Excluir notas
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderVisitDeleteConfirm() {
    if (!this.isVisitDeleteConfirmOpen) return null;

    return html`
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleVisitDeleteCancel}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h3 class="h6 mb-2">Excluir visita?</h3>
              <p class="text-secondary mb-3">Esta visita privada e todas as suas notas serão excluídas.</p>
              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleVisitDeleteCancel}>
                  Cancelar
                </button>
                <button type="button" class="btn btn-danger" @click=${this.handleVisitDeleteConfirm}>
                  Excluir visita
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
