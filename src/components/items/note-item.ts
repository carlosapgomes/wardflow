/**
 * WardFlow Note Item
 * Componente para exibir uma nota individual em formato compacto
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Note } from '@/models/note';

@customElement('note-item')
export class NoteItem extends LitElement {
  @property({ type: Object }) note!: Note;

  static override styles = css`
    :host {
      display: block;
    }

    .note-row {
      display: flex;
      align-items: center;
      padding: var(--space-3) var(--space-4);
      background-color: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
      font-size: var(--font-md);
      color: var(--color-text);
      cursor: pointer;
      transition: background-color var(--transition-fast);
    }

    .note-row:hover {
      background-color: var(--color-surface);
    }

    .note-row:active {
      background-color: var(--color-border);
    }

    .bed {
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      min-width: 60px;
    }

    .reference {
      font-size: var(--font-sm);
      color: var(--color-muted);
      margin-left: var(--space-1);
    }

    .separator {
      color: var(--color-muted);
      margin: 0 var(--space-2);
    }

    .note-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  private handleClick() {
    this.dispatchEvent(
      new CustomEvent('note-click', {
        detail: { note: this.note },
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    const { bed, reference, note } = this.note;

    return html`
      <div class="note-row" @click=${this.handleClick}>
        <span class="bed">${bed}</span>
        ${reference ? html`<span class="reference">(${reference})</span>` : null}
        <span class="separator">|</span>
        <span class="note-text">${note}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'note-item': NoteItem;
  }
}
