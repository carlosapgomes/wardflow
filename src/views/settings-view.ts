/**
 * VisitaMed Settings View
 * Tela de configurações do usuário
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate } from '@/router/router';
import { getWardStatsSuggestions } from '@/services/db/ward-stats-service';
import {
  buildWardSuggestionItems,
  getUserSettings,
  hideWardSuggestion,
  restoreWardSuggestion,
  setWardLabelOverride,
  updateInputPreferences,
  type WardSuggestionItem,
} from '@/services/settings/settings-service';

@customElement('settings-view')
export class SettingsView extends LitElement {
  @state() private loading = true;
  @state() private saving = false;
  @state() private error = '';

  @state() private uppercaseWard = false;
  @state() private uppercaseBed = true;

  @state() private wardItems: WardSuggestionItem[] = [];
  @state() private hiddenWardItems: WardSuggestionItem[] = [];

  @state() private editingWardKey: string | null = null;
  @state() private editingWardLabel = '';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      this.loading = true;
      this.error = '';

      const [settings, stats] = await Promise.all([
        getUserSettings(),
        getWardStatsSuggestions(),
      ]);

      this.uppercaseWard = settings.inputPreferences.uppercaseWard;
      this.uppercaseBed = settings.inputPreferences.uppercaseBed;

      const allItems = buildWardSuggestionItems(stats, settings.wardPreferences, true);
      this.wardItems = allItems.filter((item) => !item.hidden);
      this.hiddenWardItems = allItems.filter((item) => item.hidden);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao carregar configurações';
    } finally {
      this.loading = false;
    }
  }

  private handleUppercaseWardChange = async (e: Event): Promise<void> => {
    const checked = (e.target as HTMLInputElement).checked;
    const previous = this.uppercaseWard;
    this.uppercaseWard = checked;

    try {
      await updateInputPreferences({ uppercaseWard: checked });
    } catch (err) {
      this.uppercaseWard = previous;
      this.error = err instanceof Error ? err.message : 'Erro ao salvar configuração';
    }
  };

  private handleUppercaseBedChange = async (e: Event): Promise<void> => {
    const checked = (e.target as HTMLInputElement).checked;
    const previous = this.uppercaseBed;
    this.uppercaseBed = checked;

    try {
      await updateInputPreferences({ uppercaseBed: checked });
    } catch (err) {
      this.uppercaseBed = previous;
      this.error = err instanceof Error ? err.message : 'Erro ao salvar configuração';
    }
  };

  private openEditWardModal(item: WardSuggestionItem): void {
    this.editingWardKey = item.wardKey;
    this.editingWardLabel = item.wardLabel;
  }

  private closeEditWardModal = (): void => {
    this.editingWardKey = null;
    this.editingWardLabel = '';
  };

  private handleEditLabelInput = (e: Event): void => {
    this.editingWardLabel = (e.target as HTMLInputElement).value;
  };

  private handleEditSave = async (): Promise<void> => {
    if (!this.editingWardKey) {
      return;
    }

    try {
      this.saving = true;
      this.error = '';

      await setWardLabelOverride(this.editingWardKey, this.editingWardLabel);
      await this.loadData();
      this.closeEditWardModal();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao editar ala';
    } finally {
      this.saving = false;
    }
  };

  private async handleHideWard(item: WardSuggestionItem): Promise<void> {
    try {
      this.saving = true;
      this.error = '';

      await hideWardSuggestion(item.wardKey);
      await this.loadData();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao ocultar ala';
    } finally {
      this.saving = false;
    }
  }

  private async handleRestoreWard(item: WardSuggestionItem): Promise<void> {
    try {
      this.saving = true;
      this.error = '';

      await restoreWardSuggestion(item.wardKey);
      await this.loadData();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Erro ao restaurar ala';
    } finally {
      this.saving = false;
    }
  }

  private renderWardList(items: WardSuggestionItem[], hidden = false) {
    if (items.length === 0) {
      return html`
        <p class="text-secondary small mb-0">
          ${hidden
            ? 'Nenhuma ala ocultada no momento.'
            : 'Nenhuma ala frequente encontrada ainda.'}
        </p>
      `;
    }

    return html`
      <div class="list-group list-group-flush">
        ${items.map(
          (item) => html`
            <div class="list-group-item px-0">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${item.wardLabel}</div>
                  <small class="text-secondary">${item.usageCount} uso(s)</small>
                </div>
                <div class="d-flex gap-2">
                  ${hidden
                    ? html`
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-secondary"
                          @click=${() => {
                            void this.handleRestoreWard(item);
                          }}
                          ?disabled=${this.saving}
                        >
                          Restaurar
                        </button>
                      `
                    : html`
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-secondary"
                          @click=${() => {
                            this.openEditWardModal(item);
                          }}
                          ?disabled=${this.saving}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-danger"
                          @click=${() => {
                            void this.handleHideWard(item);
                          }}
                          ?disabled=${this.saving}
                        >
                          Ocultar
                        </button>
                      `}
                </div>
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  private renderEditWardModal() {
    if (!this.editingWardKey) {
      return null;
    }

    return html`
      <div class="modal-backdrop fade show" @click=${this.closeEditWardModal}></div>
      <div class="modal d-block" tabindex="-1" @click=${this.closeEditWardModal}>
        <div class="modal-dialog modal-dialog-centered modal-sm" @click=${(e: Event) => { e.stopPropagation(); }}>
          <div class="modal-content border-0 shadow">
            <div class="modal-body p-4">
              <h2 class="h6 mb-3">Editar ala</h2>

              <label for="ward-label" class="form-label">Nome exibido</label>
              <input
                id="ward-label"
                class="form-control"
                type="text"
                .value=${this.editingWardLabel}
                @input=${this.handleEditLabelInput}
                maxlength="60"
              />

              <p class="text-secondary small mt-2 mb-3">
                Deixe vazio para remover nome customizado e usar o original.
              </p>

              <div class="d-grid gap-2 d-sm-flex justify-content-end">
                <button type="button" class="btn btn-outline-secondary" @click=${this.closeEditWardModal} ?disabled=${this.saving}>
                  Cancelar
                </button>
                <button type="button" class="btn btn-primary" @click=${this.handleEditSave} ?disabled=${this.saving}>
                  ${this.saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private handleBackToDashboard = (): void => {
    navigate('/dashboard');
  };

  override render() {
    if (this.loading) {
      return html`
        <app-header title="Configurações"></app-header>
        <main class="container-fluid wf-page-container wf-with-header pb-4">
          <div class="d-flex align-items-center justify-content-center text-secondary" style="min-height: 50vh;">
            Carregando...
          </div>
        </main>
      `;
    }

    return html`
      <app-header title="Configurações"></app-header>

      <main class="container-fluid wf-page-container wf-with-header pb-4">
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-body">
            <h2 class="h6 mb-3">Entrada de texto</h2>

            <div class="form-check form-switch mb-3">
              <input
                class="form-check-input"
                type="checkbox"
                id="uppercase-ward"
                .checked=${this.uppercaseWard}
                @change=${this.handleUppercaseWardChange}
                ?disabled=${this.saving}
              />
              <label class="form-check-label" for="uppercase-ward">
                Ala/Setor em maiúsculas automaticamente
              </label>
              <div class="text-secondary small mt-1">
                Quando ativo, o campo Ala/Setor é convertido para maiúsculas ao digitar.
              </div>
            </div>

            <div class="form-check form-switch">
              <input
                class="form-check-input"
                type="checkbox"
                id="uppercase-bed"
                .checked=${this.uppercaseBed}
                @change=${this.handleUppercaseBedChange}
                ?disabled=${this.saving}
              />
              <label class="form-check-label" for="uppercase-bed">
                Leito em maiúsculas automaticamente
              </label>
              <div class="text-secondary small mt-1">
                Quando ativo, o campo Leito é convertido para maiúsculas ao digitar.
              </div>
            </div>
          </div>
        </div>

        <div class="card border-0 shadow-sm mb-3">
          <div class="card-body">
            <h2 class="h6 mb-3">Alas frequentes</h2>
            ${this.renderWardList(this.wardItems)}
          </div>
        </div>

        <div class="card border-0 shadow-sm mb-3">
          <div class="card-body">
            <h2 class="h6 mb-3">Alas ocultas</h2>
            ${this.renderWardList(this.hiddenWardItems, true)}
          </div>
        </div>

        ${this.error ? html`<div class="alert alert-danger py-2 px-3" role="alert">${this.error}</div>` : null}
      </main>

      <div class="wf-action-bar">
        <div class="container-fluid wf-page-container d-grid d-sm-flex justify-content-end">
          <button type="button" class="btn btn-outline-secondary" @click=${this.handleBackToDashboard} ?disabled=${this.saving}>
            Voltar ao Dashboard
          </button>
        </div>
      </div>

      ${this.renderEditWardModal()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-view': SettingsView;
  }
}
