/**
 * WardFlow Dashboard View
 * Tela principal do aplicativo
 */

import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import { getAllNotes } from '@/services/db/notes-service';
import { groupNotesByDateAndWard } from '@/utils/group-notes-by-date-and-ward';
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

  private handleActionSelected = (e: CustomEvent<{ actionId: string }>) => {
    const { actionId } = e.detail;
    // Placeholder: armazena a ação selecionada (sem executar)
    console.log('Ação selecionada:', actionId, 'Escopo:', this.selectedScope);
    this.isActionSheetOpen = false;
  };

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

  override render() {
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

      <action-sheet
        .visible=${this.isActionSheetOpen}
        .title=${this.selectedTitle}
        .actions=${ACTIONS}
        @action-selected=${this.handleActionSelected}
        @sheet-closed=${this.handleSheetClosed}
      ></action-sheet>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dashboard-view': DashboardView;
  }
}
