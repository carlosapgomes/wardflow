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
import { canEditNote, getVisitAccessState, type VisitAccessState } from '@/services/auth/visit-permissions';
import { NOTE_CONSTANTS } from '@/models/note';
import { applyInputCase, getInputPreferences } from '@/services/settings/settings-service';

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
  @state() private tagsInput = '';
  @state() private tags: string[] = [];

  private get isEditMode(): boolean {
    return this.noteId !== null;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();

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
    }
    if (route?.params['id']) {
      this.noteId = route.params['id'];
      await this.loadNote();
    }
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
      } else {
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
  };

  private parseTagsFromInput(input: string): string[] {
    return normalizeTagList(
      input
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    );
  }

  private handleAddTag = () => {
    const newTags = this.parseTagsFromInput(this.tagsInput);
    const combined = [...new Set([...this.tags, ...newTags])];
    this.tags = combined.slice(0, 10);
    this.tagsInput = '';
  };

  private handleRemoveTag = async (tagToRemove: string) => {
    if (!this.isEditMode || !this.noteId) {
      // Modo criação: remove do draft local
      this.tags = this.tags.filter((tag) => tag !== tagToRemove);
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

    // S12A: ponte técnica - preenche ward com primeira tag para manter contrato atual
    const wardValue = this.tags.length > 0 ? this.tags[0] : '';

    const input: CreateNoteInput = {
      visitId: this.visitId,
      ward: wardValue,
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

  private handleCancel = () => {
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

  override render() {
    // S12A: validação sem ward (tags-first)
    const isBusy = this.saving || this.deleting;
    const canSave = !isBusy && this.bed && this.note && this.tags.length > 0;
    const title = this.isEditMode ? 'Editar Nota' : 'Nova Nota';
    const saveLabel = this.saving ? 'Salvando...' : 'Salvar';

    if (!this.permissionChecked) {
      return html`
        <app-header title=${title}></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">
            Verificando permissões...
          </div>
        </main>
      `;
    }

    if (this.isUserRemoved()) {
      return html`
        <app-header title="Acesso removido"></app-header>
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
        <app-header title=${title}></app-header>
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
        <app-header title=${title}></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">
            Carregando...
          </div>
        </main>
      `;
    }

    // S12A: tags no topo do formulário (antes dos demais campos)
    return html`
      <app-header title=${title}></app-header>

      <main class="container-fluid wf-page-container wf-with-header pb-4">
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-body">
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
}

declare global {
  interface HTMLElementTagNameMap {
    'new-note-view': NewNoteView;
  }
}
