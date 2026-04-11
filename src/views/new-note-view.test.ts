import { describe, expect, it, vi } from 'vitest';

vi.mock('lit', () => {
  class MockLitElement {
    updateComplete = Promise.resolve(true);

    connectedCallback(): void {
      // no-op
    }
  }

  return {
    LitElement: MockLitElement,
    html: vi.fn(),
  };
});

vi.mock('lit/decorators.js', () => ({
  customElement: () => (target: unknown) => target,
  state: () => () => undefined,
}));

vi.mock('@/router/router', () => ({
  navigate: vi.fn(),
  getCurrentRoute: vi.fn(() => null),
}));

vi.mock('@/services/db/notes-service', () => ({
  saveNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  getNoteById: vi.fn(),
  validateNoteInput: vi.fn(() => true),
  removeTagFromNote: vi.fn(),
}));

vi.mock('@/services/db/visit-members-service', () => ({
  getCurrentUserVisitMember: vi.fn(),
}));

vi.mock('@/services/db/visits-service', () => ({
  getVisitById: vi.fn(),
  isVisitExpiredLocally: vi.fn(() => false),
}));

vi.mock('@/services/auth/visit-permissions', () => ({
  canEditNote: vi.fn(() => true),
  getVisitAccessState: vi.fn(() => 'active'),
}));

vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => ({ user: null })),
}));

vi.mock('@/services/db/user-tag-stats-service', () => ({
  getTopUserTagSuggestions: vi.fn(),
  rebuildUserTagStats: vi.fn(),
  searchUserTagSuggestions: vi.fn(),
}));

vi.mock('@/services/settings/settings-service', () => ({
  applyInputCase: vi.fn((value: string) => value),
  getInputPreferences: vi.fn(() => Promise.resolve({ uppercaseBed: true })),
}));

import { NewNoteView } from './new-note-view';

describe('new-note-view', () => {
  it('devolve o foco ao input de tags após aplicar uma sugestão', async () => {
    const focusMock = vi.fn();

    const view = new NewNoteView() as unknown as {
      tags: string[];
      tagsInput: string;
      updateComplete: Promise<boolean>;
      querySelector: (selector: string) => { focus: () => void } | null;
      handleApplyTagSuggestion: (suggestedTag: string) => void;
    };

    view.tags = [];
    view.tagsInput = 'UTI, pn';
    view.updateComplete = Promise.resolve(true);
    view.querySelector = vi.fn((selector: string) => {
      if (selector === '#tags') {
        return { focus: focusMock };
      }

      return null;
    });

    view.handleApplyTagSuggestion('PNEUMONIA');
    await Promise.resolve();
    await Promise.resolve();

    expect(view.tags).toEqual(['UTI', 'PNEUMONIA']);
    expect(view.tagsInput).toBe('');
    expect(focusMock).toHaveBeenCalledTimes(1);
  });
});
