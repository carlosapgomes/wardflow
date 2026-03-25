/**
 * WardFlow App Header
 * Cabeçalho da aplicação com menu e usuário
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('app-header')
export class AppHeader extends LitElement {
  @property({ type: String }) override title = 'WardFlow';

  static override styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: var(--z-sticky);
      background-color: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--header-height);
      padding: 0 var(--space-4);
      padding-top: var(--safe-area-inset-top);
    }

    .header-left,
    .header-right {
      display: flex;
      align-items: center;
      min-width: 48px;
    }

    .header-title {
      font-size: var(--font-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      text-align: center;
      flex: 1;
    }

    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full);
      color: var(--color-text);
      transition: background-color var(--transition-fast);
    }

    .icon-btn:hover {
      background-color: var(--color-surface);
    }

    .icon-btn:active {
      background-color: var(--color-border);
    }

    svg {
      width: 24px;
      height: 24px;
    }
  `;

  private handleMenu() {
    this.dispatchEvent(new CustomEvent('menu-click', { bubbles: true, composed: true }));
  }

  private handleUser() {
    this.dispatchEvent(new CustomEvent('user-click', { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <header class="header">
        <div class="header-left">
          <button class="icon-btn" @click=${this.handleMenu} aria-label="Menu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <h1 class="header-title">${this.title}</h1>

        <div class="header-right">
          <button class="icon-btn" @click=${this.handleUser} aria-label="Usuário">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>
        </div>
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
