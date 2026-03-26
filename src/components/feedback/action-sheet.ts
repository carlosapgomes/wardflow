/**
 * WardFlow Action Sheet
 * Bottom sheet simples para ações contextuais
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ActionItem {
  id: string;
  label: string;
}

@customElement('action-sheet')
export class ActionSheet extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: String }) override title = '';
  @property({ type: Array }) actions: ActionItem[] = [];

  static override styles = css`
    :host {
      display: block;
    }

    .backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: var(--z-modal);
      display: none;
    }

    :host([visible]) .backdrop {
      display: block;
    }

    .sheet {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: var(--color-bg);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding-bottom: var(--safe-area-inset-bottom);
      z-index: var(--z-modal);
      transform: translateY(100%);
      transition: transform var(--transition-normal);
    }

    :host([visible]) .sheet {
      transform: translateY(0);
    }

    .sheet-header {
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border);
      text-align: center;
    }

    .sheet-title {
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .sheet-actions {
      padding: var(--space-2) 0;
    }

    .action-item {
      display: block;
      width: 100%;
      padding: var(--space-4);
      font-size: var(--font-md);
      color: var(--color-text);
      background: none;
      border: none;
      text-align: center;
      cursor: pointer;
      transition: background-color var(--transition-fast);
    }

    .action-item:hover {
      background-color: var(--color-surface);
    }

    .action-item:active {
      background-color: var(--color-border);
    }
  `;

  private handleBackdropClick = () => {
    this.dispatchEvent(new CustomEvent('sheet-closed', { bubbles: true, composed: true }));
  };

  private handleActionClick = (actionId: string): void => {
    this.dispatchEvent(
      new CustomEvent('action-selected', {
        detail: { actionId },
        bubbles: true,
        composed: true,
      })
    );
  };

  override render() {
    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}></div>
      <div class="sheet">
        <div class="sheet-header">
          <span class="sheet-title">${this.title}</span>
        </div>
        <div class="sheet-actions">
          ${this.actions.map(
            (action) => html`
              <button class="action-item" @click=${() => { this.handleActionClick(action.id); }}>
                ${action.label}
              </button>
            `
          )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-sheet': ActionSheet;
  }
}
