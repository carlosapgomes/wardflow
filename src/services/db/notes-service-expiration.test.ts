/**
 * Testes de expiração para notes-service (slice 1)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNotesAdd = vi.fn();
const mockNotesGet = vi.fn();
const mockNotesUpdate = vi.fn();
const mockSyncQueueAdd = vi.fn();
const mockVisitsGet = vi.fn();
const mockVisitsPut = vi.fn();

vi.mock('./dexie-db', () => ({
  db: {
    notes: {
      add: mockNotesAdd,
      get: mockNotesGet,
      update: mockNotesUpdate,
    },
    visits: {
      get: mockVisitsGet,
      put: mockVisitsPut,
    },
    syncQueue: {
      add: mockSyncQueueAdd,
    },
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<void>;
      await callback();
    }),
  },
}));

vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => ({
    user: { uid: 'user-123' },
  })),
}));

vi.mock('@/services/sync/sync-service', () => ({
  syncNow: vi.fn(),
}));

describe('notes-service expiration + visit propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'));
    vi.stubGlobal('navigator', { onLine: false });
  });

  it('saveNote cria note com expiresAt e atualiza visit.expiresAt', async () => {
    const { saveNote } = await import('./notes-service');

    mockVisitsGet.mockResolvedValue({
      id: 'visit-1',
      userId: 'user-123',
      name: 'Visita',
      date: '2026-04-07',
      mode: 'private',
      createdAt: new Date('2026-04-07T10:00:00.000Z'),
      expiresAt: new Date('2026-04-21T10:00:00.000Z'),
    });

    await saveNote({
      visitId: 'visit-1',
      bed: '01',
      note: 'Teste',
      tags: ['UTI'],
    });

    const savedNote = mockNotesAdd.mock.calls[0][0] as { expiresAt: Date };
    expect(savedNote.expiresAt.toISOString()).toBe('2026-04-21T10:00:00.000Z');

    const updatedVisit = mockVisitsPut.mock.calls[0][0] as { expiresAt: Date };
    expect(updatedVisit.expiresAt.toISOString()).toBe('2026-04-21T10:00:00.000Z');
  });

  it('updateNote renova note.expiresAt e atualiza visit.expiresAt', async () => {
    const { updateNote } = await import('./notes-service');

    const expectedExpiresAt = new Date('2026-04-21T10:00:00.000Z');

    mockNotesGet
      .mockResolvedValueOnce({
        id: 'note-1',
        userId: 'user-123',
        visitId: 'visit-1',
        date: '2026-04-07',
        bed: '01',
        note: 'Antes',
        tags: ['UTI'],
        createdAt: new Date('2026-04-07T10:00:00.000Z'),
        expiresAt: new Date('2026-04-21T10:00:00.000Z'),
        syncStatus: 'synced',
      })
      .mockResolvedValueOnce({
        id: 'note-1',
        userId: 'user-123',
        visitId: 'visit-1',
        date: '2026-04-07',
        bed: '01',
        note: 'Depois',
        tags: ['UTI'],
        createdAt: new Date('2026-04-07T10:00:00.000Z'),
        updatedAt: new Date('2026-04-07T10:00:00.000Z'),
        expiresAt: expectedExpiresAt,
        syncStatus: 'pending',
      });

    mockVisitsGet.mockResolvedValue({
      id: 'visit-1',
      userId: 'user-123',
      name: 'Visita',
      date: '2026-04-07',
      mode: 'private',
      createdAt: new Date('2026-04-07T10:00:00.000Z'),
      expiresAt: new Date('2026-04-21T10:00:00.000Z'),
    });

    await updateNote('note-1', { note: 'Depois' });

    expect(mockNotesUpdate).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        expiresAt: expectedExpiresAt,
      })
    );

    expect(mockVisitsPut).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'visit-1',
        expiresAt: expectedExpiresAt,
      })
    );
  });
});
