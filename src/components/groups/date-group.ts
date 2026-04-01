/**
 * VisitaMed Date Group
 * Componente para agrupar notas por data
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Note } from '@/models/note';
import '../groups/tag-group';

/** Estrutura de tags agrupadas (do utils/group-notes-by-date-and-tag) */
export interface TagGroupData {
  tag: string;
  notes: Note[];
}

/** @deprecated Use TagGroupData */
export type WardGroupData = TagGroupData;

@customElement('date-group')
export class DateGroup extends LitElement {
  @property({ type: String }) date = '';
  @property({ type: Array }) tags: TagGroupData[] = [];

  /** @deprecated Use tags */
  @property({ type: Array }) wards: WardGroupData[] = [];

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private formatDateForDisplay(date: string): string {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return date;

    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
  }

  private getTagsData(): TagGroupData[] {
    // Prioritize tags if provided, fallback to wards for backwards compatibility
    return this.tags.length > 0 ? this.tags : this.wards;
  }

  private handleActionClick = (e: Event) => {
    e.stopPropagation();
    const tagsData = this.getTagsData();
    this.dispatchEvent(
      new CustomEvent('date-action', {
        detail: {
          date: this.date,
          tags: tagsData,
          wards: tagsData, // compatibility for S9A
          scopeType: 'date',
        },
        bubbles: true,
        composed: true,
      })
    );
  };

  override render() {
    return html`
      <section class="card border-0 shadow-sm">
        <div class="card-header wf-date-header d-flex align-items-center justify-content-between py-2">
          <span class="fw-semibold">${this.formatDateForDisplay(this.date)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" @click=${this.handleActionClick} aria-label="Ações da data">
            ⋯
          </button>
        </div>
        <div class="card-body p-0">
          ${this.getTagsData().map(
            tagGroup =>
              html`<tag-group .tag=${tagGroup.tag} .notes=${tagGroup.notes}></tag-group>`
          )}
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'date-group': DateGroup;
  }
}
