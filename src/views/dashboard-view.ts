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
import {
  getVisitById,
  isVisitExpiredLocally,
  deletePrivateVisit,
  leaveVisit,
  deleteGroupVisitAsOwner,
  ensureVisitIsGroup,
} from '@/services/db/visits-service';
import { createVisitInviteForVisit, buildVisitInviteLink } from '@/services/db/visit-invites-service';
import { canEditNote, canDeleteNote, getVisitAccessState, type VisitAccessState } from '@/services/auth/visit-permissions';
import { getDashboardGroupActions } from '@/services/auth/dashboard-actions-policy';
import { groupNotesByTag } from '@/utils/group-notes-by-tag';
import { getSyncStatus, subscribeToSync, type SyncStatus } from '@/services/sync/sync-service';
import { generateMessage, copyToClipboard, type ExportScope } from '@/services/export/message-export';
import type { Note } from '@/models/note';
import type { Visit } from '@/models/visit';
import type { VisitMember } from '@/models/visit-member';
import type { InviteRole } from '@/models/visit-invite';
import type { DashboardAction } from '@/services/auth/dashboard-actions-policy';
import '../components/base/fab-button';
import '../components/groups/tag-group';
import '../components/feedback/action-sheet';
import '../components/feedback/sync-status-bar';



/** Tipo de escopo selecionado */
type SelectedScope =
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
  @state() private isVisitExpired = false;
  @state() private accessState: VisitAccessState = 'no-membership';
  @state() private actions: DashboardAction[] = [];
  @state() private isDeleteConfirmOpen = false;
  @state() private isVisitDeleteConfirmOpen = false;
  @state() private isLeaveVisitConfirmOpen = false;
  @state() private isDeletingVisit = false;
  @state() private isLeavingVisit = false;
  @state() private visitDeleteError = '';
  @state() private leaveVisitError = '';
  @state() private isInviteModalOpen = false;
  @state() private inviteRole: InviteRole = 'editor';
  @state() private inviteLink = '';
  @state() private isGeneratingInvite = false;
  @state() private syncStatus: SyncStatus = getSyncStatus();
  @state() private lastSyncErrorAt: Date | null = null;

  private notesSubscription: Subscription | null = null;
  private syncStatusUnsubscribe: (() => void) | null = null;

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
    this.startSyncStatusSubscription();
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
      const visit = await getVisitById(this.visitId);
      this.currentVisit = visit ?? null;
      this.isVisitExpired = !visit && await isVisitExpiredLocally(this.visitId);
    } catch {
      this.currentVisit = null;
      this.isVisitExpired = false;
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.notesSubscription?.unsubscribe();
    this.notesSubscription = null;
    this.syncStatusUnsubscribe?.();
    this.syncStatusUnsubscribe = null;
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

  private startSyncStatusSubscription(): void {
    this.syncStatusUnsubscribe?.();
    this.syncStatusUnsubscribe = subscribeToSync((status) => {
      this.syncStatus = status;
      if (status.error) {
        this.lastSyncErrorAt = new Date();
      }
    });
  }

  private isSyncUnstableForEmptyState(): boolean {
    if (this.syncStatus.isSyncing || Boolean(this.syncStatus.error)) {
      return true;
    }

    if (!this.lastSyncErrorAt) {
      return false;
    }

    return Date.now() - this.lastSyncErrorAt.getTime() <= 30000;
  }

  private handleFabClick = () => {
    if (!this.visitId) return;
    navigate(`/visita/${this.visitId}/nova-nota`);
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

    return { type: 'tag', tag: this.selectedScope.tag, notes: this.selectedScope.notes };
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
    return this.selectedScope.notes.map((note) => note.id);
  }

  private handleDeleteConfirm = async (): Promise<void> => {
    const noteIds = this.getNoteIdsToDelete();

    if (noteIds.length === 0) {
      this.isDeleteConfirmOpen = false;
      return;
    }

    try {
      await deleteNotes(noteIds);
      await this.loadVisit();

      if (this.isVisitExpired) {
        this.showTemporaryToast('Visita expirada localmente');
      } else {
        this.showTemporaryToast(`${String(noteIds.length)} nota(s) excluída(s)`);
      }
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

  private canDeleteGroupVisitForAll(): boolean {
    return this.currentVisit?.mode === 'group' && this.member?.role === 'owner' && this.accessState === 'active';
  }

  private canLeaveGroupVisit(): boolean {
    return this.currentVisit?.mode === 'group'
      && (this.member?.role === 'editor' || this.member?.role === 'viewer')
      && this.accessState === 'active';
  }

  private canInvitePeople(): boolean {
    return Boolean(this.currentVisit && this.member?.role === 'owner' && this.accessState === 'active');
  }

  private handleInvitePeopleClick = (): void => {
    this.inviteRole = 'editor';
    this.inviteLink = '';
    this.isGeneratingInvite = false;
    this.isInviteModalOpen = true;
  };

  private handleInviteModalClose = (): void => {
    this.isInviteModalOpen = false;
  };

  private handleInviteRoleChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    if (select.value === 'editor' || select.value === 'viewer') {
      this.inviteRole = select.value;
    }
  };

  private handleGenerateInviteLink = async (): Promise<void> => {
    if (!this.visitId || this.isGeneratingInvite) {
      return;
    }

    this.isGeneratingInvite = true;

    try {
      this.currentVisit = await ensureVisitIsGroup(this.visitId);
      const invite = await createVisitInviteForVisit({
        visitId: this.visitId,
        role: this.inviteRole,
      });

      this.inviteLink = buildVisitInviteLink(invite.token);
      this.showTemporaryToast('Link de convite gerado');
    } catch (error) {
      console.error('Erro ao gerar link de convite:', error);
      this.showTemporaryToast('Erro ao gerar link de convite');
    } finally {
      this.isGeneratingInvite = false;
    }
  };

  private handleCopyInviteLink = async (): Promise<void> => {
    if (!this.inviteLink) {
      return;
    }

    const success = await copyToClipboard(this.inviteLink);
    if (success) {
      this.showTemporaryToast('Link copiado');
    }
  };

  private handleShareInviteLink = async (): Promise<void> => {
    if (!this.inviteLink) {
      return;
    }

    const canShare = 'share' in navigator && typeof navigator.share === 'function';

    if (canShare) {
      try {
        await navigator.share({
          title: 'Convite para visita',
          text: this.inviteLink,
          url: this.inviteLink,
        });
        return;
      } catch {
        // Fallback para clipboard
      }
    }

    const success = await copyToClipboard(this.inviteLink);
    if (success) {
      this.showTemporaryToast('Link copiado');
    }
  };

  private handleVisitDeleteClick = (): void => {
    this.visitDeleteError = '';
    this.isVisitDeleteConfirmOpen = true;
  };

  private handleVisitDeleteCancel = (): void => {
    if (this.isDeletingVisit) {
      return;
    }

    this.visitDeleteError = '';
    this.isVisitDeleteConfirmOpen = false;
  };

  private handleVisitDeleteConfirm = async (): Promise<void> => {
    if (this.isDeletingVisit) {
      return;
    }

    if (!this.visitId) {
      this.isVisitDeleteConfirmOpen = false;
      return;
    }

    this.isDeletingVisit = true;
    this.visitDeleteError = '';

    try {
      if (this.canDeletePrivateVisit()) {
        await deletePrivateVisit(this.visitId);
      } else if (this.canDeleteGroupVisitForAll()) {
        await deleteGroupVisitAsOwner(this.visitId);
      }
      this.isVisitDeleteConfirmOpen = false;
      this.showTemporaryToast('Visita excluída');
      navigate('/dashboard');
    } catch (error) {
      console.error('Erro ao excluir visita:', error);
      this.visitDeleteError = 'Não foi possível concluir a ação. Tente novamente em alguns instantes.';
    } finally {
      this.isDeletingVisit = false;
    }
  };

  private handleLeaveVisitClick = (): void => {
    this.leaveVisitError = '';
    this.isLeaveVisitConfirmOpen = true;
  };

  private handleLeaveVisitCancel = (): void => {
    if (this.isLeavingVisit) {
      return;
    }

    this.leaveVisitError = '';
    this.isLeaveVisitConfirmOpen = false;
  };

  private handleLeaveVisitConfirm = async (): Promise<void> => {
    if (this.isLeavingVisit) {
      return;
    }

    if (!this.visitId) {
      this.isLeaveVisitConfirmOpen = false;
      return;
    }

    this.isLeavingVisit = true;
    this.leaveVisitError = '';

    try {
      await leaveVisit(this.visitId);
      this.isLeaveVisitConfirmOpen = false;
      this.showTemporaryToast('Você saiu da visita');
      navigate('/dashboard');
    } catch (error) {
      console.error('Erro ao sair da visita:', error);
      this.leaveVisitError = 'Não foi possível concluir a ação. Tente novamente em alguns instantes.';
    } finally {
      this.isLeavingVisit = false;
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
      <app-header title="Visita indisponível"></app-header>
      <main class="container-fluid wf-page-container wf-with-header wf-sheet-safe pb-4">
        <div class="d-flex align-items-center justify-content-center" style="min-height: 55vh;">
          <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
            <div class="card-body p-4">
              <svg class="mx-auto text-secondary opacity-75 mb-3" width="56" height="56" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p class="h6 mb-2">Visita indisponível</p>
              <p class="text-secondary mb-3">Esta visita pode ter expirado ou você não tem mais acesso.</p>
              <button type="button" class="btn btn-outline-secondary" @click=${this.handleBackClick}>
                Voltar
              </button>
            </div>
          </div>
        </div>
      </main>
    `;
  }

  private renderVisitExpired() {
    return html`
      <app-header title="Visita expirada"></app-header>
      <main class="container-fluid wf-page-container wf-with-header wf-sheet-safe pb-4">
        <div class="d-flex align-items-center justify-content-center" style="min-height: 55vh;">
          <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
            <div class="card-body p-4">
              <svg class="mx-auto text-secondary opacity-75 mb-3" width="56" height="56" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m2 9H7a2 2 0 01-2-2V7a2 2 0 012-2h2m8 0h-2m2 0v2m0-2a2 2 0 012 2v2" />
              </svg>
              <p class="h6 mb-2">Visita expirada</p>
              <p class="text-secondary mb-3">Esta visita expirou localmente e não está mais disponível.</p>
              <button type="button" class="btn btn-primary" @click=${this.handleBackClick}>
                Ir para minhas visitas
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

  private renderSyncUnstableEmptyState() {
    return html`
      <div class="d-flex align-items-center justify-content-center" style="min-height: 55vh;">
        <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
          <div class="card-body p-4">
            <svg class="mx-auto text-warning opacity-75 mb-3" width="56" height="56" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z" />
            </svg>
            <p class="h6 mb-2">Sincronização incompleta</p>
            <p class="text-secondary mb-3">Conexão instável. Mantendo dados locais enquanto sincronizamos.</p>
            <div class="small text-secondary border-top pt-3">Tentando reconectar e atualizar esta visita</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderNotesList() {
    const groupedNotes = groupNotesByTag(this.notes);

    return html`
      <div class="d-flex flex-column gap-3" @note-click=${this.handleNoteClick}>
        ${groupedNotes.map(
          (group) => html`
            <div class="card border-0 shadow-sm">
              <tag-group .tag=${group.tag} .notes=${group.notes} @tag-action=${this.handleTagAction}></tag-group>
            </div>
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

      <main class="container-fluid wf-page-container wf-with-header-sync wf-sheet-safe pb-4">
        ${this.canInvitePeople() || this.canDeletePrivateVisit() || this.canDeleteGroupVisitForAll() || this.canLeaveGroupVisit()
          ? html`
              <div class="mb-3 d-flex justify-content-end gap-2 flex-wrap">
                ${this.canInvitePeople()
                  ? html`
                      <button type="button" class="btn btn-outline-primary" @click=${this.handleInvitePeopleClick}>
                        Convidar pessoas
                      </button>
                    `
                  : ''}
                ${this.canDeletePrivateVisit()
                  ? html`
                      <button type="button" class="btn btn-outline-danger" @click=${this.handleVisitDeleteClick}>
                        Excluir visita
                      </button>
                    `
                  : ''}
                ${this.canDeleteGroupVisitForAll()
                  ? html`
                      <button type="button" class="btn btn-outline-danger" @click=${this.handleVisitDeleteClick}>
                        Excluir visita para todos
                      </button>
                    `
                  : ''}
                ${this.canLeaveGroupVisit()
                  ? html`
                      <button type="button" class="btn btn-outline-secondary" @click=${this.handleLeaveVisitClick}>
                        Sair da visita
                      </button>
                    `
                  : ''}
              </div>
            `
          : ''}

        ${this.isLoading
          ? html`<div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">Carregando...</div>`
          : this.notes.length > 0
            ? this.renderNotesList()
            : this.isSyncUnstableForEmptyState()
              ? this.renderSyncUnstableEmptyState()
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
    if (this.isVisitExpired) {
      return this.renderVisitExpired();
    }

    // Usuário removido da visita - mensagem específica
    if (this.isUserRemoved()) {
      return this.renderAccessRemoved();
    }

    // Sem membership - visita indisponível
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

      ${this.renderToast()}
      ${this.renderDeleteConfirm()}
      ${this.renderVisitDeleteConfirm()}
      ${this.renderLeaveVisitConfirm()}
      ${this.renderInviteModal()}
    `;
  }

  private renderDeleteConfirm() {
    if (!this.isDeleteConfirmOpen) return null;

    const count = this.getNoteIdsToDelete().length;
    const scopeLabel = this.selectedScope?.type === 'tag' ? 'desta tag' : '';

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

    const isGroupDelete = this.canDeleteGroupVisitForAll();
    const isProcessing = this.isDeletingVisit;
    const title = isGroupDelete ? 'Excluir visita para todos?' : 'Excluir visita?';
    const body = isGroupDelete
      ? 'Esta visita colaborativa será removida para todos os membros.'
      : 'Esta visita privada e todas as suas notas serão excluídas.';
    const actionLabel = isGroupDelete ? 'Excluir visita para todos' : 'Excluir visita';

    return html`
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleVisitDeleteCancel}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h3 class="h6 mb-2">${title}</h3>
              <p class="text-secondary mb-3">${body}</p>
              ${this.visitDeleteError
                ? html`<div class="alert alert-danger py-2 px-3 small" role="alert">${this.visitDeleteError}</div>`
                : ''}
              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  ?disabled=${isProcessing}
                  @click=${this.handleVisitDeleteCancel}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  ?disabled=${isProcessing}
                  @click=${this.handleVisitDeleteConfirm}
                >
                  ${isProcessing
                    ? html`<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Excluindo...`
                    : actionLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderLeaveVisitConfirm() {
    if (!this.isLeaveVisitConfirmOpen) return null;

    const isProcessing = this.isLeavingVisit;

    return html`
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleLeaveVisitCancel}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h3 class="h6 mb-2">Sair da visita?</h3>
              <p class="text-secondary mb-3">Você perderá acesso a esta visita.</p>
              ${this.leaveVisitError
                ? html`<div class="alert alert-danger py-2 px-3 small" role="alert">${this.leaveVisitError}</div>`
                : ''}
              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  ?disabled=${isProcessing}
                  @click=${this.handleLeaveVisitCancel}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  ?disabled=${isProcessing}
                  @click=${this.handleLeaveVisitConfirm}
                >
                  ${isProcessing
                    ? html`<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Saindo...`
                    : 'Sair da visita'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderInviteModal() {
    if (!this.isInviteModalOpen) return null;

    return html`
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleInviteModalClose}>
        <div class="modal-dialog modal-dialog-centered" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4 d-flex flex-column gap-3">
              <div>
                <h3 class="h5 mb-1">Convidar pessoas</h3>
                <p class="text-secondary mb-0">Escolha o nível de acesso para o convite.</p>
              </div>

              <div>
                <label for="invite-role-select" class="form-label">Nível de acesso</label>
                <select
                  id="invite-role-select"
                  class="form-select"
                  .value=${this.inviteRole}
                  @change=${this.handleInviteRoleChange}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Leitor</option>
                </select>
                <div class="small text-secondary mt-2">Editor: pode criar, editar e excluir notas.</div>
                <div class="small text-secondary">Leitor: pode apenas visualizar e exportar.</div>
              </div>

              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleInviteModalClose}>
                  Fechar
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  ?disabled=${this.isGeneratingInvite}
                  @click=${this.handleGenerateInviteLink}
                >
                  ${this.isGeneratingInvite ? 'Gerando...' : 'Gerar link'}
                </button>
              </div>

              ${this.inviteLink
                ? html`
                    <div class="border-top pt-3 d-flex flex-column gap-2">
                      <label class="form-label mb-0" for="invite-link-input">Link de convite</label>
                      <input id="invite-link-input" class="form-control" .value=${this.inviteLink} readonly />
                      <div class="d-grid gap-2 d-sm-flex justify-content-end">
                        <button type="button" class="btn btn-outline-secondary" @click=${this.handleCopyInviteLink}>
                          Copiar link
                        </button>
                        <button type="button" class="btn btn-primary" @click=${this.handleShareInviteLink}>
                          Compartilhar link
                        </button>
                      </div>
                    </div>
                  `
                : ''}
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
