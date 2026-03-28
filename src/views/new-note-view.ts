/**
 * WardFlow New/Edit Note View
 * Tela para criar ou editar uma nota
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate, getCurrentRoute } from '@/router/router';
import { saveNote, updateNote, getNoteById, validateNoteInput, getUniqueWards, type CreateNoteInput } from '@/services/db/notes-service';
import { NOTE_CONSTANTS } from '@/models/note';
import { startRecording, stopRecording, initRecorder } from '@/services/asr/audio-recorder';
import type { RecordingState } from '@/services/asr/asr-types';

@customElement('new-note-view')
export class NewNoteView extends LitElement {
  @state() private noteId: string | null = null;
  @state() private ward = '';
  @state() private bed = '';
  @state() private reference = '';
  @state() private note = '';
  @state() private saving = false;
  @state() private wardSuggestions: string[] = [];
  @state() private loading = false;
  @state() private error = '';
  @state() private recordingState: RecordingState = 'idle';
  @state() private micError = '';

  private get isEditMode(): boolean {
    return this.noteId !== null;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();

    // Inicializa recorder
    initRecorder();

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
    this.bed = (e.target as HTMLInputElement).value;
  };

  private handleReferenceInput = (e: Event) => {
    this.reference = (e.target as HTMLInputElement).value;
  };

  private handleNoteInput = (e: Event) => {
    this.note = (e.target as HTMLTextAreaElement).value;
  };

  private handleRecordToggle = async () => {
    // Limpa erro anterior
    this.micError = '';

    if (this.recordingState === 'recording') {
      // Parar gravação
      await this.stopRecording();
    } else if (this.recordingState === 'idle') {
      // Iniciar gravação
      await this.startRecording();
    }
  };

  private async startRecording(): Promise<void> {
    try {
      this.recordingState = 'recording';
      await startRecording();
    } catch (err) {
      this.recordingState = 'error';
      this.micError = err instanceof Error ? err.message : 'Erro ao iniciar gravação';
      // Volta para idle após erro
      setTimeout(() => {
        this.recordingState = 'idle';
      }, 2000);
    }
  }

  private async stopRecording(): Promise<void> {
    try {
      this.recordingState = 'processing';
      await stopRecording();

      // Stub temporário: simulação de transcrição
      const transcriptionStub = ' [transcrição simulada]';

      // Anexa ao final do texto atual
      if (this.note) {
        this.note = this.note + transcriptionStub;
      } else {
        this.note = transcriptionStub;
      }

      this.recordingState = 'idle';
    } catch (err) {
      this.recordingState = 'error';
      this.micError = err instanceof Error ? err.message : 'Erro ao processar gravação';
      setTimeout(() => {
        this.recordingState = 'idle';
      }, 2000);
    }
  }

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

  override render() {
    const canSave = !this.saving && this.ward && this.bed && this.note;
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
              />
            </div>

            <div class="mb-2">
              <label for="note" class="form-label d-flex align-items-center gap-2">
                Nota *
                <button
                  type="button"
                  class="btn btn-sm ${this.recordingState === 'recording' ? 'btn-danger' : 'btn-outline-secondary'}"
                  @click=${this.handleRecordToggle}
                  ?disabled=${this.recordingState === 'processing'}
                  aria-label=${this.recordingState === 'recording' ? 'Parar gravação' : 'Iniciar gravação'}
                  title=${this.recordingState === 'recording' ? 'Parar gravação' : 'Gravar nota'}
                >
                  <i class="bi ${this.recordingState === 'recording' ? 'bi-stop-fill' : 'bi-mic'}"></i>
                </button>
              </label>
              ${this.recordingState === 'processing' ? html`<div class="text-muted small mb-2">Processando...</div>` : null}
              <textarea
                id="note"
                class="form-control"
                .value=${this.note}
                @input=${this.handleNoteInput}
                placeholder="Digite a nota clínica..."
                maxlength=${NOTE_CONSTANTS.MAX_NOTE_LENGTH}
                rows="6"
              ></textarea>
              <div class="form-text text-end">${this.note.length}/${NOTE_CONSTANTS.MAX_NOTE_LENGTH}</div>
            </div>

            ${this.error ? html`<div class="alert alert-danger py-2 px-3 mb-0 mt-3" role="alert">${this.error}</div>` : null}
            ${this.micError ? html`<div class="alert alert-warning py-2 px-3 mb-0 mt-3" role="alert">${this.micError}</div>` : null}
          </div>
        </div>
      </main>

      <div class="wf-action-bar">
        <div class="container-fluid wf-page-container d-grid gap-2 d-sm-flex justify-content-end">
          <button type="button" class="btn btn-outline-secondary" @click=${this.handleCancel} ?disabled=${this.saving}>
            Cancelar
          </button>
          <button type="button" class="btn btn-primary" @click=${this.handleSave} ?disabled=${!canSave}>
            ${saveLabel}
          </button>
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
