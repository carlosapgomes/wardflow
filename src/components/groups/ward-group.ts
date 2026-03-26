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
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .notes-list {
      display: flex;
      flex-direction: column;
    }
  `;

  override render() {
    return html`
      <div class="ward-header">${this.ward}</div>
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
