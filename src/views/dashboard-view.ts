/**
 * WardFlow Dashboard View
 * Tela principal do aplicativo
 */

import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import '../components/base/fab-button';

@customElement('dashboard-view')
export class DashboardView extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .dashboard-content {
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

  private handleFabClick() {
    navigate('/nova-nota');
  }

  override render() {
    return html`
      <app-header title="WardFlow"></app-header>

      <div class="dashboard-content">
        <h2 class="title">Dashboard</h2>
        <p class="subtitle">Suas notas aparecerão aqui</p>
      </div>

      <fab-button icon="plus" label="Nova nota" @fab-click=${this.handleFabClick}></fab-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dashboard-view': DashboardView;
  }
}
