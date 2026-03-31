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
  getWardSuggestionsWithFallback,
  type CreateNoteInput,
} from '@/services/db/notes-service';
import { getCurrentUserVisitMember } from '@/services/db/visit-members-service';
import { canEditNote } from '@/services/auth/visit-permissions';
import { NOTE_CONSTANTS } from '@/models/note';
import { applyInputCase, getInputPreferences } from '@/services/settings/settings-service';

@customElement('new-note-view')
export class NewNoteView extends LitElement {
  @state() private visitId: string | null = null;
  @state() private noteId: string | null = null;
  @state() private ward = '';
  @state() private bed = '';
  @state() private reference = '';
  @state() private note = '';
  @state() private saving = false;
  @state() private deleting = false;
  @state() private isDeleteConfirmOpen = false;
  @state() private wardSuggestions: string[] = [];
  @state() private uppercaseWard = false;
  @state() private uppercaseBed = true;
  @state() private loading = false;
  @state() private error = '';
  @state() private canEdit = false;
  @state() private permissionChecked = false;

  private get isEditMode(): boolean {
    return this.noteId !== null;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();

    // Carrega sugestões de alas e preferências de input
    this.wardSuggestions = await getWardSuggestionsWithFallback();

    try {
      const inputPreferences = await getInputPreferences();
      this.uppercaseWard = inputPreferences.uppercaseWard;
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
      this.canEdit = member ? canEditNote(member) : false;
    } catch {
      this.canEdit = false;
    } finally {
      this.permissionChecked = true;
    }
  }

  private async loadNote(): Promise<void> {
    if (!this.noteId) return;

    try {
      this.loading = true;
      const existingNote = await getNoteById(this.noteId);

      if (existingNote) {
        this.ward = existingNote.ward;
        this.bed = existingNote.bed;
        this.reference = existingNote.reference ?? '';
        this.note = existingNote.note;
      } else {
        this.error = 'Nota não encontrada';
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao carregar nota';
    } finally {
      this.loading = false;
    }
  }

  private handleWardInput = (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    this.ward = applyInputCase(value, this.uppercaseWard);
  };

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
      ward: this.ward,
      bed: this.bed,
      reference: this.reference || undefined,
      note: this.note,
    };

    if (!validateNoteInput(input)) {
      this.error = 'Preencha os campos obrigatórios: Ala, Leito e Nota';
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
    const isBusy = this.saving || this.deleting;
    const canSave = !isBusy && this.ward && this.bed && this.note;
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

    return html`
      <app-header title=${title}></app-header>

      <main class="container-fluid wf-page-container wf-with-header pb-4">
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-body">
            <div class="mb-3">
              <label for="ward" class="form-label">Ala / Setor *</label>
              <input
                id="ward"
                class="form-control"
                type="text"
                list="ward-suggestions"
                .value=${this.ward}
                @input=${this.handleWardInput}
                placeholder="Ex: UTI, Enfermaria A"
                autocomplete="off"
                autocapitalize=${this.uppercaseWard ? 'characters' : 'words'}
                style=${this.uppercaseWard ? 'text-transform: uppercase' : ''}
              />

              <datalist id="ward-suggestions">
                ${this.wardSuggestions.map((ward) => html`<option value=${ward}>`)}
              </datalist>
            </div>

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
