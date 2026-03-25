/**
 * WardFlow New Note View
 * Tela para criar nova nota
 */

import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import { saveNote, validateNoteInput, type CreateNoteInput } from '@/services/db/notes-service';
import { NOTE_CONSTANTS } from '@/models/note';

@customElement('new-note-view')
export class NewNoteView extends LitElement {
  @state() private ward = '';
  @state() private bed = '';
  @state() private reference = '';
  @state() private note = '';
  @state() private saving = false;
  @state() private error = '';

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .form-container {
      flex: 1;
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      overflow-y: auto;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .form-row {
      display: flex;
      gap: var(--space-3);
    }

    .form-row .form-group {
      flex: 1;
    }

    label {
      font-size: var(--font-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    input,
    textarea {
      padding: var(--space-3) var(--space-4);
      font-size: var(--font-md);
      background-color: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      transition: border-color var(--transition-fast);
    }

    input:focus,
    textarea:focus {
      outline: none;
      border-color: var(--color-primary);
    }

    textarea {
      min-height: 150px;
      resize: vertical;
      line-height: var(--line-height-relaxed);
    }

    .char-count {
      font-size: var(--font-xs);
      color: var(--color-muted);
      text-align: right;
    }

    .actions {
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

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .error-message {
      padding: var(--space-3);
      font-size: var(--font-sm);
      color: var(--color-danger);
      background-color: var(--color-danger-light);
      border-radius: var(--radius-md);
    }
  `;

  private handleWardInput(e: Event) {
    this.ward = (e.target as HTMLInputElement).value;
  }

  private handleBedInput(e: Event) {
    this.bed = (e.target as HTMLInputElement).value;
  }

  private handleReferenceInput(e: Event) {
    this.reference = (e.target as HTMLInputElement).value;
  }

  private handleNoteInput(e: Event) {
    this.note = (e.target as HTMLTextAreaElement).value;
  }

  private async handleSave() {
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
      await saveNote(input);
      navigate('/dashboard');
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao salvar nota';
    } finally {
      this.saving = false;
    }
  }

  private handleCancel() {
    navigate('/dashboard');
  }

  override render() {
    const canSave = !this.saving && this.ward && this.bed && this.note;

    return html`
      <app-header title="Nova Nota"></app-header>

      <div class="form-container">
        <div class="form-row">
          <div class="form-group">
            <label for="ward">Ala / Setor *</label>
            <input
              id="ward"
              type="text"
              .value=${this.ward}
              @input=${this.handleWardInput}
              placeholder="Ex: UTI, Enfermaria A"
              autocomplete="off"
            />
          </div>

          <div class="form-group">
            <label for="bed">Leito *</label>
            <input
              id="bed"
              type="text"
              .value=${this.bed}
              @input=${this.handleBedInput}
              placeholder="Ex: 01, 02A"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="reference">Referência (opcional)</label>
          <input
            id="reference"
            type="text"
            .value=${this.reference}
            @input=${this.handleReferenceInput}
            placeholder="Nome do paciente, registro..."
            maxlength=${NOTE_CONSTANTS.MAX_REFERENCE_LENGTH}
          />
        </div>

        <div class="form-group">
          <label for="note">Nota *</label>
          <textarea
            id="note"
            .value=${this.note}
            @input=${this.handleNoteInput}
            placeholder="Digite a nota clínica..."
            maxlength=${NOTE_CONSTANTS.MAX_NOTE_LENGTH}
          ></textarea>
          <span class="char-count">${this.note.length}/${NOTE_CONSTANTS.MAX_NOTE_LENGTH}</span>
        </div>

        ${this.error ? html`<div class="error-message">${this.error}</div>` : null}
      </div>

      <div class="actions">
        <button class="btn btn-secondary" @click=${this.handleCancel} ?disabled=${this.saving}>
          Cancelar
        </button>
        <button class="btn btn-primary" @click=${this.handleSave} ?disabled=${!canSave}>
          ${this.saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'new-note-view': NewNoteView;
  }
}
