/**
 * WardFlow Dashboard View
 * Tela principal do aplicativo
 */

import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import { getAllNotes } from '@/services/db/notes-service';
import type { Note } from '@/models/note';
import '../components/base/fab-button';
import '../components/items/note-item';

@customElement('dashboard-view')
export class DashboardView extends LitElement {
  @state() private notes: Note[] = [];
  @state() private isLoading = true;

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
    this.loadNotes();
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

  private handleFabClick() {
    navigate('/nova-nota');
  }

  private renderEmptyState() {
    return html`
      <div class="empty-state">
        <p class="empty-title">Nenhuma nota ainda</p>
        <p class="empty-subtitle">Comece criando uma nova nota</p>
      </div>
    `;
  }

  private renderNotesList() {
    return html`
      <div class="notes-list">
        ${this.notes.map((note) => html`<note-item .note=${note}></note-item>`)}
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dashboard-view': DashboardView;
  }
}
