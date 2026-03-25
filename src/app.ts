/**
 * WardFlow App
 * Componente principal que gerencia roteamento e views
 */

import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { initializeRouter, subscribeToRoute, type RouteMatch } from '@/router/router';

// Import layout components
import './components/layout/app-shell';
import './components/layout/app-header';

// Import base components
import './components/base/fab-button';

// Import views
import './views/dashboard-view';
import './views/new-note-view';

@customElement('wardflow-app')
export class WardFlowApp extends LitElement {
  @state() private currentComponent = 'dashboard-view';

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      min-height: 100dvh;
    }
  `;

  constructor() {
    super();
    this.initApp();
  }

  private initApp() {
    initializeRouter();
    subscribeToRoute(this.handleRouteChange.bind(this));
  }

  private handleRouteChange(match: RouteMatch) {
    this.currentComponent = match.route.component;
  }

  override render() {
    switch (this.currentComponent) {
      case 'dashboard-view':
        return html`<dashboard-view></dashboard-view>`;
      case 'new-note-view':
        return html`<new-note-view></new-note-view>`;
      default:
        return html`<dashboard-view></dashboard-view>`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wardflow-app': WardFlowApp;
  }
}
