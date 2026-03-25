/**
 * WardFlow New Note View
 * Tela para criar nova nota (placeholder)
 */

import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('new-note-view')
export class NewNoteView extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }

    .title {
      font-size: var(--font-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      margin-bottom: var(--space-2);
    }

    .subtitle {
      font-size: var(--font-md);
      color: var(--color-muted);
    }
  `;

  override render() {
    return html`
      <app-header title="Nova Nota"></app-header>

      <div class="content">
        <h2 class="title">Nova Nota</h2>
        <p class="subtitle">Formulário de criação de nota</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'new-note-view': NewNoteView;
  }
}
