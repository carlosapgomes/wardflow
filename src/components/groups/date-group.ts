/**
 * WardFlow Date Group
 * Componente para agrupar notas por data
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Note } from '@/models/note';
import '../groups/ward-group';

/** Estrutura de wards agrupadas (mesma do utils/group-notes-by-date-and-ward) */
export interface WardGroupData {
  ward: string;
  notes: Note[];
}

@customElement('date-group')
export class DateGroup extends LitElement {
  @property({ type: String }) date = '';
  @property({ type: Array }) wards: WardGroupData[] = [];

  static override styles = css`
    :host {
      display: block;
      margin-bottom: var(--space-6);
    }

    .date-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
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

    .wards-container {
      display: flex;
      flex-direction: column;
    }
  `;

  private handleActionClick = (e: Event) => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('date-action', {
        detail: {
          date: this.date,
          wards: this.wards,
          scopeType: 'date',
        },
        bubbles: true,
        composed: true,
      })
    );
  };

  override render() {
    return html`
      <div class="date-header">
        <span>${this.date}</span>
        <button class="action-btn" @click=${this.handleActionClick} aria-label="Ações da data">
          ⋯
        </button>
      </div>
      <div class="wards-container">
        ${this.wards.map(
          (wardGroup) =>
            html`<ward-group .ward=${wardGroup.ward} .notes=${wardGroup.notes}></ward-group>`
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'date-group': DateGroup;
  }
}
