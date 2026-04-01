/**
 * VisitaMed Tag Group
 * Componente para agrupar notas por tag
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Note } from '@/models/note';
import '../items/note-item';

@customElement('tag-group')
export class TagGroup extends LitElement {
  @property({ type: String }) tag = '';
  @property({ type: Array }) notes: Note[] = [];

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private handleActionClick = (e: Event) => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('tag-action', {
        detail: {
          tag: this.tag,
          notes: this.notes,
          scopeType: 'tag',
        },
        bubbles: true,
        composed: true,
      })
    );
  };

  override render() {
    return html`
      <section class="${this.notes.length ? '' : 'pb-2'}">
        <div class="d-flex align-items-center justify-content-between px-3 pt-3 pb-2 border-top">
          <span class="text-uppercase small fw-semibold text-secondary">${this.tag}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" @click=${this.handleActionClick} aria-label="Ações da tag">
            ⋯
          </button>
        </div>
        <div class="list-group list-group-flush">
          ${this.notes.map(note => html`<note-item .note=${note}></note-item>`)}
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tag-group': TagGroup;
  }
}
