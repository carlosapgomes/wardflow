/**
 * WardFlow FAB Button
 * Floating Action Button para ações principais
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('fab-button')
export class FabButton extends LitElement {
  @property({ type: String }) icon = 'plus';
  @property({ type: String }) label = 'Adicionar';

  static override styles = css`
    :host {
      display: block;
    }

    .fab {
      position: fixed;
      bottom: calc(var(--space-4) + var(--safe-area-inset-bottom));
      right: var(--space-4);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background-color: var(--color-primary);
      border-radius: var(--radius-full);
      box-shadow: var(--shadow-lg);
      color: white;
      transition: background-color var(--transition-fast), transform var(--transition-fast);
      z-index: var(--z-sticky);
    }

    .fab:hover {
      background-color: var(--color-primary-pressed);
    }

    .fab:active {
      transform: scale(0.95);
    }

    .fab svg {
      width: 24px;
      height: 24px;
    }
  `;

  private handleClick() {
    this.dispatchEvent(new CustomEvent('fab-click', { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <button class="fab" @click=${this.handleClick} aria-label=${this.label}>
        ${this.icon === 'plus'
          ? html`
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            `
          : null}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fab-button': FabButton;
  }
}
