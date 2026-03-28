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
  getUniqueWards,
  type CreateNoteInput,
} from '@/services/db/notes-service';
import { NOTE_CONSTANTS } from '@/models/note';

@customElement('new-note-view')
export class NewNoteView extends LitElement {
  @state() private noteId: string | null = null;
  @state() private ward = '';
  @state() private bed = '';
  @state() private reference = '';
  @state() private note = '';
  @state() private saving = false;
  @state() private deleting = false;
  @state() private isDeleteConfirmOpen = false;
  @state() private wardSuggestions: string[] = [];
  @state() private loading = false;
  @state() private error = '';

  private get isEditMode(): boolean {
    return this.noteId !== null;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();

    // Carrega sugestões de alas
    this.wardSuggestions = await getUniqueWards();

    // Verifica se há um ID na rota (modo edição)
    const route = getCurrentRoute();
    if (route?.params['id']) {
      this.noteId = route.params['id'];
      await this.loadNote();
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
    this.ward = (e.target as HTMLInputElement).value;
  };

  private handleBedInput = (e: Event) => {
    this.bed = (e.target as HTMLInputElement).value.toUpperCase();
  };

  private handleReferenceInput = (e: Event) => {
    this.reference = (e.target as HTMLInputElement).value.toUpperCase();
  };

  private handleNoteInput = (e: Event) => {
    this.note = (e.target as HTMLTextAreaElement).value;
  };

  private handleSave = async () => {
    const input: CreateNoteInput = {
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
      navigate('/dashboard');
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao salvar nota';
    } finally {
      this.saving = false;
    }
  };

  private handleCancel = () => {
    navigate('/dashboard');
  };

  private handleDeleteRequest = () => {
    this.isDeleteConfirmOpen = true;
  };

  private handleDeleteCancel = () => {
    this.isDeleteConfirmOpen = false;
  };

  private handleDeleteConfirm = async () => {
    if (!this.noteId) {
      this.isDeleteConfirmOpen = false;
      return;
    }

    this.deleting = true;
    this.error = '';

    try {
      await deleteNote(this.noteId);
      navigate('/dashboard');
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
                autocapitalize="characters"
                style="text-transform: uppercase"
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
