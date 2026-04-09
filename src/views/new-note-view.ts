/**
 * VisitaMed New/Edit Note View
 * Tela para criar ou editar uma nota
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate, getCurrentRoute } from '@/router/router';
import {
  saveNote,
  updateNote,
  deleteNote,
  getNoteById,
  validateNoteInput,
  removeTagFromNote,
  type CreateNoteInput,
} from '@/services/db/notes-service';
import { normalizeTagList } from '@/models/tag';
import { getCurrentUserVisitMember } from '@/services/db/visit-members-service';
import { getVisitById, isVisitExpiredLocally } from '@/services/db/visits-service';
import { canEditNote, getVisitAccessState, type VisitAccessState } from '@/services/auth/visit-permissions';
import { getAuthState } from '@/services/auth/auth-service';
import {
  getTopUserTagSuggestions,
  rebuildUserTagStats,
  searchUserTagSuggestions,
} from '@/services/db/user-tag-stats-service';
import { NOTE_CONSTANTS } from '@/models/note';
import { applyInputCase, getInputPreferences } from '@/services/settings/settings-service';
import {
  applyTagSuggestion,
  filterSelectedSuggestions,
  getActiveTagQuery,
} from './new-note-tag-suggestions';

@customElement('new-note-view')
export class NewNoteView extends LitElement {
  @state() private visitId: string | null = null;
  @state() private noteId: string | null = null;
  // S12A: ward removido da UI - pré-preenchido com primeira tag no save
  @state() private bed = '';
  @state() private reference = '';
  @state() private note = '';
  @state() private saving = false;
  @state() private deleting = false;
  @state() private isDeleteConfirmOpen = false;
  @state() private uppercaseBed = true;
  @state() private loading = false;
  @state() private error = '';
  @state() private canEdit = false;
  @state() private permissionChecked = false;
  @state() private accessState: VisitAccessState = 'no-membership';
  @state() private isVisitExpired = false;
  @state() private tagsInput = '';
  @state() private tags: string[] = [];
  @state() private tagSuggestions: string[] = [];
  @state() private loadingTagSuggestions = false;
  @state() private noteDate = '';

  private tagSuggestionsUserId: string | null = null;
  private tagSuggestionsRequestId = 0;

  // S13C: Estado inicial para detectar dirty
  private initialState = { bed: '', reference: '', note: '', tags: [] as string[], tagsInput: '' };
  @state() private isDiscardConfirmOpen = false;

  // S13D: Handler para beforeunload
  private handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    const isDirty = this.checkDirty();
    const isBusy = this.saving || this.deleting;

    if (isDirty && !isBusy) {
      event.preventDefault();
      event.returnValue = '';
    }
  };

  private get isEditMode(): boolean {
    return this.noteId !== null;
  }

  private formatDateForDisplay(date: string): string {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return date;

    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();

    // S13D: registrar listener de beforeunload
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // S12A: não carrega mais sugestões de alas (UI sem campo de ala)
    try {
      const inputPreferences = await getInputPreferences();
      this.uppercaseBed = inputPreferences.uppercaseBed;
    } catch {
      // mantém defaults seguros
    }

    // Lê visitId e noteId da rota
    const route = getCurrentRoute();
    if (route?.params['visitId']) {
      this.visitId = route.params['visitId'];
      await this.checkPermissions();
      await this.checkVisitAvailability();
    }
    if (route?.params['id'] && !this.isVisitExpired) {
      this.noteId = route.params['id'];
      await this.loadNote();
    }

    void this.initializeTagSuggestions();
  }

  private async checkPermissions(): Promise<void> {
    if (!this.visitId) return;

    try {
      const member = await getCurrentUserVisitMember(this.visitId);
      this.accessState = getVisitAccessState(member);
      this.canEdit = member ? canEditNote(member) : false;
    } catch {
      this.accessState = 'no-membership';
      this.canEdit = false;
    } finally {
      this.permissionChecked = true;
    }
  }

  private isUserRemoved(): boolean {
    return this.accessState === 'removed';
  }

  private async checkVisitAvailability(): Promise<void> {
    if (!this.visitId) {
      this.isVisitExpired = false;
      return;
    }

    try {
      const visit = await getVisitById(this.visitId);

      if (visit) {
        this.isVisitExpired = false;
        return;
      }

      this.isVisitExpired = await isVisitExpiredLocally(this.visitId);
    } catch {
      this.isVisitExpired = false;
    }
  }

  private async loadNote(): Promise<void> {
    if (!this.noteId) return;

    try {
      this.loading = true;
      const existingNote = await getNoteById(this.noteId);

      if (existingNote) {
        // S12A: ward não exposto na UI
        this.bed = existingNote.bed;
        this.reference = existingNote.reference ?? '';
        this.note = existingNote.note;
        this.tags = existingNote.tags ?? [];
        this.noteDate = existingNote.date;

        // S13C: guardar estado inicial para detectar dirty
        this.initialState = {
          bed: existingNote.bed,
          reference: existingNote.reference ?? '',
          note: existingNote.note,
          tags: existingNote.tags ?? [],
          tagsInput: '',
        };
      } else {
        this.noteDate = '';
        this.error = 'Nota não encontrada';
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao carregar nota';
    } finally {
      this.loading = false;
    }
  }

  // S12A: handleWardInput removido (campo de ala removido da UI)
  private handleBedInput = (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    this.bed = applyInputCase(value, this.uppercaseBed);
  };

  private handleReferenceInput = (e: Event) => {
    this.reference = (e.target as HTMLInputElement).value.toUpperCase();
  };

  private handleNoteInput = (e: Event) => {
    this.note = (e.target as HTMLTextAreaElement).value;
  };

  private handleTagsInput = (e: Event) => {
    this.tagsInput = (e.target as HTMLInputElement).value;
    void this.refreshTagSuggestions();
  };

  private parseTagsFromInput(input: string): string[] {
    return normalizeTagList(
      input
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    );
  }

  private async initializeTagSuggestions(): Promise<void> {
    const { user } = getAuthState();

    if (!user) {
      this.tagSuggestionsUserId = null;
      this.tagSuggestions = [];
      this.loadingTagSuggestions = false;
      return;
    }

    this.tagSuggestionsUserId = user.uid;

    this.loadingTagSuggestions = true;
    try {
      await rebuildUserTagStats(user.uid);
    } catch (error) {
      console.warn('[Nova Nota] Falha ao reconstruir sugestões de tags (best-effort):', error);
    }

    await this.refreshTagSuggestions();
  }

  private async refreshTagSuggestions(): Promise<void> {
    if (!this.tagSuggestionsUserId) {
      this.tagSuggestions = [];
      this.loadingTagSuggestions = false;
      return;
    }

    if (this.tags.length >= NOTE_CONSTANTS.MAX_TAGS_PER_NOTE) {
      this.tagSuggestions = [];
      this.loadingTagSuggestions = false;
      return;
    }

    const requestId = ++this.tagSuggestionsRequestId;
    this.loadingTagSuggestions = true;

    try {
      const activeQuery = getActiveTagQuery(this.tagsInput);
      const stats = activeQuery
        ? await searchUserTagSuggestions(this.tagSuggestionsUserId, activeQuery, 8)
        : await getTopUserTagSuggestions(this.tagSuggestionsUserId, 8);

      if (requestId !== this.tagSuggestionsRequestId) {
        return;
      }

      const suggestedTags = stats.map((stat) => stat.tag);
      this.tagSuggestions = filterSelectedSuggestions(suggestedTags, this.tags);
    } catch (error) {
      if (requestId === this.tagSuggestionsRequestId) {
        this.tagSuggestions = [];
      }
      console.warn('[Nova Nota] Falha ao carregar sugestões de tags (best-effort):', error);
    } finally {
      if (requestId === this.tagSuggestionsRequestId) {
        this.loadingTagSuggestions = false;
      }
    }
  }

  private handleAddTag = () => {
    const newTags = this.parseTagsFromInput(this.tagsInput);
    const combined = [...new Set([...this.tags, ...newTags])];
    this.tags = combined.slice(0, NOTE_CONSTANTS.MAX_TAGS_PER_NOTE);
    this.tagsInput = '';
    void this.refreshTagSuggestions();
  };

  private handleApplyTagSuggestion = (suggestedTag: string) => {
    if (this.tags.length >= NOTE_CONSTANTS.MAX_TAGS_PER_NOTE) {
      return;
    }

    const nextState = applyTagSuggestion(
      this.tags,
      this.tagsInput,
      suggestedTag,
      NOTE_CONSTANTS.MAX_TAGS_PER_NOTE
    );

    this.tags = nextState.tags;
    this.tagsInput = nextState.tagsInput;
    void this.refreshTagSuggestions();
  };

  private handleRemoveTag = async (tagToRemove: string) => {
    if (!this.isEditMode || !this.noteId) {
      // Modo criação: remove do draft local
      this.tags = this.tags.filter((tag) => tag !== tagToRemove);
      void this.refreshTagSuggestions();
      return;
    }

    // Modo edição: usa removeTagFromNote
    try {
      const result = await removeTagFromNote(this.noteId, tagToRemove);
      if (result === 'deleted' && this.visitId) {
        navigate(`/visita/${this.visitId}`);
        return;
      }
      // Recarrega as tags atualizadas
      const updatedNote = await getNoteById(this.noteId);
      if (updatedNote) {
        this.tags = updatedNote.tags ?? [];
      }
      void this.refreshTagSuggestions();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao remover tag';
    }
  };

  private handleSave = async () => {
    if (!this.canEdit) {
      this.error = 'Sem permissão para editar esta visita';
      return;
    }

    if (!this.visitId) {
      this.error = 'Visita não encontrada';
      return;
    }

    const input: CreateNoteInput = {
      visitId: this.visitId,
      bed: this.bed,
      reference: this.reference || undefined,
      note: this.note,
      tags: this.tags,
    };

    // S12A: validação sem mention de ala
    if (!validateNoteInput(input)) {
      this.error = 'Preencha os campos obrigatórios: Leito, Nota e ao menos 1 Tag';
      return;
    }

    this.saving = true;
    this.error = '';

    try {
      if (this.isEditMode && this.noteId) {
        await updateNote(this.noteId, input);
      } else {
        await saveNote(input);
      }
      navigate(`/visita/${this.visitId}`);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao salvar nota';
    } finally {
      this.saving = false;
    }
  };

  private areTagsEqual = (left: string[], right: string[]): boolean => {
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return JSON.stringify(leftSorted) === JSON.stringify(rightSorted);
  };

  private checkDirty = (): boolean => {
    return (
      this.bed !== this.initialState.bed ||
      this.reference !== this.initialState.reference ||
      this.note !== this.initialState.note ||
      this.tagsInput !== this.initialState.tagsInput ||
      !this.areTagsEqual(this.tags, this.initialState.tags)
    );
  };

  private handleCancel = () => {
    // S13C: confirmar descarte se dirty
    if (this.checkDirty()) {
      this.isDiscardConfirmOpen = true;
      return;
    }

    if (this.visitId) {
      navigate(`/visita/${this.visitId}`);
    } else {
      navigate('/dashboard');
    }
  };

  private handleDeleteRequest = () => {
    this.isDeleteConfirmOpen = true;
  };

  private handleDeleteCancel = () => {
    this.isDeleteConfirmOpen = false;
  };

  private handleDeleteConfirm = async () => {
    if (!this.canEdit) {
      this.error = 'Sem permissão para excluir esta nota';
      this.isDeleteConfirmOpen = false;
      return;
    }

    if (!this.noteId) {
      this.isDeleteConfirmOpen = false;
      return;
    }

    this.deleting = true;
    this.error = '';

    try {
      await deleteNote(this.noteId);
      if (this.visitId) {
        navigate(`/visita/${this.visitId}`);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao excluir nota';
    } finally {
      this.deleting = false;
      this.isDeleteConfirmOpen = false;
    }
  };

  private handleBackClick = (): void => {
    // S13C: confirmar descarte se dirty
    if (this.checkDirty()) {
      this.isDiscardConfirmOpen = true;
      return;
    }

    if (this.visitId) {
      navigate(`/visita/${this.visitId}`);
    } else {
      navigate('/dashboard');
    }
  };

  // S13D: remover listener ao desmontar
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  };

  // S13C: Handlers para o modal de descarte
  private handleDiscardCancel = () => {
    this.isDiscardConfirmOpen = false;
  };

  private handleDiscardConfirm = () => {
    this.isDiscardConfirmOpen = false;
    if (this.visitId) {
      navigate(`/visita/${this.visitId}`);
    } else {
      navigate('/dashboard');
    }
  };



  override render() {
    // S12A: validação sem ward (tags-first)
    const isBusy = this.saving || this.deleting;
    const canSave = !isBusy && this.bed && this.note && this.tags.length > 0;
    const title = this.isEditMode ? 'Editar Nota' : 'Nova Nota';
    const saveLabel = this.saving ? 'Salvando...' : 'Salvar';

    if (!this.permissionChecked) {
      return html`
        <app-header title=${title} ?showBack=${true} @back-click=${this.handleBackClick}></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">
            Verificando permissões...
          </div>
        </main>
      `;
    }

    if (this.isVisitExpired) {
      return html`
        <app-header title="Visita expirada" ?showBack=${true} @back-click=${this.handleBackClick}></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex flex-column align-items-center justify-content-center text-center" style="min-height: 50vh;">
            <div class="mb-4">
              <svg class="mx-auto text-secondary opacity-75" width="48" height="48" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m2 9H7a2 2 0 01-2-2V7a2 2 0 012-2h2m8 0h-2m2 0v2m0-2a2 2 0 012 2v2" />
              </svg>
            </div>
            <h5 class="text-dark mb-2">Visita expirada</h5>
            <p class="text-secondary mb-4">Esta visita expirou localmente e não aceita novas alterações.</p>
            <button type="button" class="btn btn-primary" @click=${() => { navigate('/dashboard'); }}>
              Ir para minhas visitas
            </button>
          </div>
        </main>
      `;
    }

    if (this.isUserRemoved()) {
      return html`
        <app-header title="Acesso removido" ?showBack=${true} @back-click=${this.handleBackClick}></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex flex-column align-items-center justify-content-center text-center" style="min-height: 50vh;">
            <div class="mb-4">
              <svg class="mx-auto text-secondary opacity-75" width="48" height="48" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h5 class="text-dark mb-2">Acesso removido</h5>
            <p class="text-secondary mb-4">Seu acesso a esta visita foi removido.</p>
            <button type="button" class="btn btn-primary" @click=${() => { navigate('/dashboard'); }}>
              Ir para minhas visitas
            </button>
          </div>
        </main>
      `;
    }

    if (!this.canEdit) {
      return html`
        <app-header title=${title} ?showBack=${true} @back-click=${this.handleBackClick}></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex flex-column align-items-center justify-content-center text-center" style="min-height: 50vh;">
            <div class="mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" viewBox="0 0 16 16" class="text-secondary">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
              </svg>
            </div>
            <h5 class="text-dark mb-2">Sem permissão para editar</h5>
            <p class="text-secondary mb-4">Você não tem permissão para editar ou criar notas nesta visita.</p>
            <button type="button" class="btn btn-outline-secondary" @click=${() => { navigate(`/visita/${this.visitId ?? ''}`); }}>
              Voltar para a visita
            </button>
          </div>
        </main>
      `;
    }

    if (this.loading) {
      return html`
        <app-header title=${title} ?showBack=${true} @back-click=${this.handleBackClick}></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">
            Carregando...
          </div>
        </main>
      `;
    }

    // S12A: tags no topo do formulário (antes dos demais campos)
    return html`
      <app-header title=${title} ?showBack=${true} @back-click=${this.handleBackClick}></app-header>

      <main class="container-fluid wf-page-container wf-with-header pb-4">
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-body">
            ${this.isEditMode && this.noteDate
              ? html`
                  <div class="small text-secondary mb-3">
                    Data da nota: ${this.formatDateForDisplay(this.noteDate)}
                  </div>
                `
              : null}

            <!-- Tags primeiro (tags-first) -->
            <div class="mb-3">
              <label for="tags" class="form-label">Tags *</label>
              <div class="input-group">
                <input
                  id="tags"
                  class="form-control"
                  type="text"
                  .value=${this.tagsInput}
                  @input=${this.handleTagsInput}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); this.handleAddTag(); } }}
                  placeholder="Ex: UTI, Emergência"
                  autocomplete="off"
                />
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleAddTag}>
                  Adicionar
                </button>
              </div>
              <div class="form-text">Separe por vírgula. Máximo 10 tags.</div>

              ${(this.loadingTagSuggestions || this.tagSuggestions.length > 0) && this.tags.length < NOTE_CONSTANTS.MAX_TAGS_PER_NOTE
                ? html`
                    <div class="mt-2">
                      <div class="small text-secondary mb-2">Sugestões</div>
                      ${this.loadingTagSuggestions && this.tagSuggestions.length === 0
                        ? html`<div class="small text-secondary">Carregando sugestões...</div>`
                        : html`
                            <div class="d-flex flex-wrap gap-2">
                              ${this.tagSuggestions.map((tag) => html`
                                <button
                                  type="button"
                                  class="btn btn-sm btn-outline-primary rounded-pill py-2 px-3"
                                  @click=${() => {
                                    this.handleApplyTagSuggestion(tag);
                                  }}
                                >
                                  ${tag}
                                </button>
                              `)}
                            </div>
                          `}
                    </div>
                  `
                : null}
            </div>

            ${this.tags.length > 0 ? html`
              <div class="mb-3">
                <div class="d-flex flex-wrap gap-2">
                  ${this.tags.map((tag) => html`
                    <span class="badge bg-primary d-flex align-items-center gap-1 py-2 px-3">
                      ${tag}
                      <button
                        type="button"
                        class="btn-close btn-close-white"
                        style="font-size: 0.5rem;"
                        @click=${() => this.handleRemoveTag(tag)}
                        aria-label="Remover tag"
                      ></button>
                    </span>
                  `)}
                </div>
              </div>
            ` : null}

            <!-- Leito após tags -->
            <div class="mb-3">
              <label for="bed" class="form-label">Leito *</label>
              <input
                id="bed"
                class="form-control"
                type="text"
                .value=${this.bed}
                @input=${this.handleBedInput}
                placeholder="Ex: 01, 02A"
                autocomplete="off"
                autocapitalize=${this.uppercaseBed ? 'characters' : 'words'}
                style=${this.uppercaseBed ? 'text-transform: uppercase' : ''}
              />
            </div>

            <div class="mb-3">
              <label for="reference" class="form-label">Referência (opcional)</label>
              <input
                id="reference"
                class="form-control"
                type="text"
                .value=${this.reference}
                @input=${this.handleReferenceInput}
                placeholder="Ex: AB"
                maxlength=${NOTE_CONSTANTS.MAX_REFERENCE_LENGTH}
                autocapitalize="characters"
                style="text-transform: uppercase"
              />
            </div>

            <div class="mb-2">
              <label for="note" class="form-label">Nota *</label>
              <textarea
                id="note"
                class="form-control"
                .value=${this.note}
                @input=${this.handleNoteInput}
                placeholder="Digite ou use o microfone do teclado"
                maxlength=${NOTE_CONSTANTS.MAX_NOTE_LENGTH}
                rows="6"
                autocorrect="on"
                spellcheck
              ></textarea>
              <div class="form-text text-end">${this.note.length}/${NOTE_CONSTANTS.MAX_NOTE_LENGTH}</div>
            </div>

            ${this.error ? html`<div class="alert alert-danger py-2 px-3 mb-0 mt-3" role="alert">${this.error}</div>` : null}
          </div>
        </div>

        ${this.isEditMode
          ? html`
              <div class="card border-0 shadow-sm mb-4">
                <div class="card-body py-3">
                  <button
                    type="button"
                    class="btn btn-outline-danger w-100"
                    @click=${this.handleDeleteRequest}
                    ?disabled=${isBusy}
                  >
                    Excluir nota
                  </button>
                </div>
              </div>
            `
          : null}
      </main>

      <div class="wf-action-bar">
        <div class="container-fluid wf-page-container d-grid gap-2 d-sm-flex justify-content-end">
          <button type="button" class="btn btn-outline-secondary" @click=${this.handleCancel} ?disabled=${isBusy}>
            Cancelar
          </button>
          <button type="button" class="btn btn-primary" @click=${this.handleSave} ?disabled=${!canSave}>
            ${saveLabel}
          </button>
        </div>
      </div>

      ${this.renderDeleteConfirm()}
      ${this.renderDiscardConfirm()}
    `;
  }

  private renderDeleteConfirm() {
    if (!this.isDeleteConfirmOpen) return null;

    return html`
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleDeleteCancel}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h3 class="h6 mb-2">Excluir nota?</h3>
              <p class="text-secondary mb-3">Esta ação é permanente e não pode ser desfeita.</p>
              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleDeleteCancel} ?disabled=${this.deleting}>
                  Cancelar
                </button>
                <button type="button" class="btn btn-danger" @click=${this.handleDeleteConfirm} ?disabled=${this.deleting}>
                  ${this.deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // S13C: Modal de confirmação de descarte
  private renderDiscardConfirm() {
    if (!this.isDiscardConfirmOpen) return null;

    return html`
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" @click=${this.handleDiscardCancel}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h3 class="h6 mb-2">Descartar alterações?</h3>
              <p class="text-secondary mb-3">As mudanças não salvas serão perdidas.</p>
              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button type="button" class="btn btn-outline-secondary" @click=${this.handleDiscardCancel}>
                  Continuar editando
                </button>
                <button type="button" class="btn btn-danger" @click=${this.handleDiscardConfirm}>
                  Descartar e sair
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
    'new-note-view': NewNoteView;
  }
}
