/**
 * WardFlow Ward Group
 * Componente para agrupar notas por ala/unidade
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Note } from '@/models/note';
import '../items/note-item';

@customElement('ward-group')
export class WardGroup extends LitElement {
  @property({ type: String }) ward = '';
  @property({ type: Array }) notes: Note[] = [];

  static override styles = css`
    :host {
      display: block;
      margin-bottom: var(--space-4);
    }

    .ward-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .action-btn {
      background: none;
      border: none;
      font-size: var(--font-lg);
      color: var(--color-muted);
      cursor: pointer;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      transition: background-color var(--transition-fast), color var(--transition-fast);
    }

    .action-btn:hover {
      background-color: var(--color-surface);
      color: var(--color-text);
    }

    .action-btn:active {
      background-color: var(--color-border);
    }

    .notes-list {
      display: flex;
      flex-direction: column;
    }
  `;

  private handleActionClick = (e: Event) => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('ward-action', {
        detail: {
          ward: this.ward,
          notes: this.notes,
          scopeType: 'ward',
        },
        bubbles: true,
        composed: true,
      })
    );
  };

  override render() {
    return html`
      <div class="ward-header">
        <span>${this.ward}</span>
        <button class="action-btn" @click=${this.handleActionClick} aria-label="Ações da ala">
          ⋯
        </button>
      </div>
      <div class="notes-list">
        ${this.notes.map((note) => html`<note-item .note=${note}></note-item>`)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ward-group': WardGroup;
  }
}
