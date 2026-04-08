import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => ({
    user: {
      uid: 'user-1',
    },
  })),
}));

vi.mock('./user-tag-stats-service', () => ({
  triggerCurrentUserTagStatsRebuild: vi.fn(),
}));

vi.mock('@/services/sync/sync-service', () => ({
  syncNow: vi.fn(),
}));

vi.mock('./dexie-db', () => ({
  db: {
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args.at(-1) as () => Promise<void>;
      await callback();
    }),
    notes: {
      add: vi.fn(),
    },
    visits: {
      get: vi.fn(),
      put: vi.fn(),
    },
    syncQueue: {
      add: vi.fn(),
    },
  },
}));

import { saveNote } from './notes-service';
import { triggerCurrentUserTagStatsRebuild } from './user-tag-stats-service';
import { db } from './dexie-db';

describe('notes-service - rebuild de sugestões após mutação local', () => {
  const mockedDb = db as unknown as {
    visits: {
      get: ReturnType<typeof vi.fn>;
    };
  };

  const mockedTriggerRebuild = triggerCurrentUserTagStatsRebuild as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockedDb.visits.get.mockResolvedValue({
      id: 'visit-1',
      userId: 'user-1',
      name: 'Visita 1',
      date: '2026-04-08',
      mode: 'private',
      createdAt: new Date('2026-04-08T10:00:00.000Z'),
      expiresAt: new Date('2026-04-22T10:00:00.000Z'),
      updatedAt: new Date('2026-04-08T10:00:00.000Z'),
    });
  });

  it('saveNote dispara rebuild best-effort após persistir nota', async () => {
    await saveNote({
      visitId: 'visit-1',
      bed: '01',
      note: 'Paciente estável',
      tags: ['UTI'],
    });

    expect(mockedTriggerRebuild).toHaveBeenCalledTimes(1);
  });
});
