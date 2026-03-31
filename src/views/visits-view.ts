/**
 * VisitaMed Visits View
 * Tela para listar e criar visitas
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { liveQuery, type Subscription } from 'dexie';
import { navigate } from '@/router/router';
import { createPrivateVisit, getAllVisits } from '@/services/db/visits-service';
import type { Visit } from '@/models/visit';
import '../components/base/fab-button';
import '../components/feedback/sync-status-bar';

@customElement('visits-view')
export class VisitsView extends LitElement {
  @state() private visits: Visit[] = [];
  @state() private isLoading = true;
  @state() private isCreating = false;
  @state() private error = '';

  private visitsSubscription: Subscription | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.startVisitsSubscription();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.visitsSubscription?.unsubscribe();
    this.visitsSubscription = null;
  }

  private startVisitsSubscription(): void {
    this.isLoading = true;

    this.visitsSubscription?.unsubscribe();
    this.visitsSubscription = liveQuery(() => getAllVisits()).subscribe({
      next: (visits) => {
        this.visits = visits;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erro ao carregar visitas:', error);
        this.visits = [];
        this.isLoading = false;
      },
    });
  }

  private handleFabClick = async () => {
    if (this.isCreating) return;

    this.isCreating = true;
    this.error = '';

    try {
      const visit = await createPrivateVisit();
      navigate(`/visita/${visit.id}`);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao criar visita';
      this.isCreating = false;
    }
  };

  private handleVisitClick = (visit: Visit) => {
    navigate(`/visita/${visit.id}`);
  };

  private formatDateForDisplay(date: string): string {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return date;

    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
  }

  private renderEmptyState() {
    return html`
      <div class="d-flex align-items-center justify-content-center" style="min-height: 55vh;">
        <div class="card border-0 shadow-sm text-center w-100" style="max-width: 420px;">
          <div class="card-body p-4">
            <svg class="mx-auto text-secondary opacity-75 mb-3" width="56" height="56" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p class="h6 mb-2">Nenhuma visita ainda</p>
            <p class="text-secondary mb-3">Crie uma visita para começar a registrar suas notas clínicas.</p>
            <div class="small text-secondary border-top pt-3">Toque no botão abaixo para adicionar</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderVisitsList() {
    return html`
      <div class="d-flex flex-column gap-2">
        ${this.visits.map((visit) => {
          return html`
            <div
              class="card border-0 shadow-sm"
              @click=${() => {
                this.handleVisitClick(visit);
              }}
              style="cursor: pointer;"
            >
              <div class="card-body py-3">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <div class="fw-semibold">${visit.name}</div>
                    <div class="text-secondary small">${this.formatDateForDisplay(visit.date)}</div>
                  </div>
                  <svg class="text-secondary" width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  override render() {
    return html`
      <app-header title="VisitaMed"></app-header>
      <sync-status-bar></sync-status-bar>

      <main class="container-fluid wf-page-container wf-with-header-sync wf-sheet-safe pb-4">
        ${this.isLoading
          ? html`<div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">Carregando...</div>`
          : this.visits.length > 0
            ? this.renderVisitsList()
            : this.renderEmptyState()}

        ${this.error
          ? html`<div class="alert alert-danger py-2 px-3 mt-3" role="alert">${this.error}</div>`
          : null}
      </main>

      <fab-button
        icon="plus"
        label="Nova visita"
        ?disabled=${this.isCreating}
        @fab-click=${this.handleFabClick}
      ></fab-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'visits-view': VisitsView;
  }
}
