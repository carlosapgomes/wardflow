/**
 * WardFlow Date Group
 * Componente para agrupar notas por data
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '../groups/ward-group';

/** Estrutura de wards agrupadas (mesma do utils/group-notes-by-date-and-ward) */
export interface WardGroupData {
  ward: string;
  notes: {
    id: string;
    ward: string;
    bed: string;
    note: string;
    reference?: string;
    createdAt: Date;
  }[];
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
      padding: var(--space-3) var(--space-4);
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .wards-container {
      display: flex;
      flex-direction: column;
    }
  `;

  override render() {
    return html`
      <div class="date-header">${this.date}</div>
      <div class="wards-container">
        ${this.wards.map((wardGroup) => html`<ward-group .ward=${wardGroup.ward} .notes=${wardGroup.notes}></ward-group>`)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'date-group': DateGroup;
  }
}
