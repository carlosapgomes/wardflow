/**
 * Testes para expiração imediata da visita ao remover a última nota
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNotesGet = vi.fn();
const mockNotesDelete = vi.fn();
const mockNotesBulkDelete = vi.fn();
const mockNotesWhere = vi.fn();
const mockSyncQueueAdd = vi.fn();
const mockVisitsGet = vi.fn();
const mockVisitsPut = vi.fn();

vi.mock('./dexie-db', () => ({
  db: {
    notes: {
      get: mockNotesGet,
      delete: mockNotesDelete,
      bulkDelete: mockNotesBulkDelete,
      where: mockNotesWhere,
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

describe('notes-service - expiração da visita em deleções', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { onLine: false });
  });

  it('deleteNote expira visita quando remove a última nota', async () => {
    const notesService = await import('./notes-service');

    mockNotesGet.mockResolvedValue({
      id: 'note-1',
      userId: 'user-123',
      visitId: 'visit-1',
      date: '2026-04-07',
      bed: '01',
      note: 'Nota',
      tags: ['UTI'],
      createdAt: new Date('2026-04-07T10:00:00.000Z'),
      expiresAt: new Date('2026-04-21T10:00:00.000Z'),
      syncStatus: 'synced',
    });

    mockNotesWhere.mockImplementation((index: string) => {
      if (index === 'visitId') {
        return {
          equals: vi.fn().mockReturnValue({
            count: vi.fn().mockResolvedValue(0),
          }),
        };
      }

      return {
        equals: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(0),
        }),
      };
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

    await notesService.deleteNote('note-1');

    const updatedVisit = mockVisitsPut.mock.calls[0]?.[0] as { id: string; expiresAt: Date };
    expect(updatedVisit.id).toBe('visit-1');
    expect(updatedVisit.expiresAt).toBeInstanceOf(Date);
  });

  it('deleteNotes expira visita quando remove todas as notas restantes', async () => {
    const notesService = await import('./notes-service');

    mockNotesWhere.mockImplementation((index: string) => {
      if (index === 'id') {
        return {
          anyOf: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                id: 'note-1',
                userId: 'user-123',
                visitId: 'visit-1',
                date: '2026-04-07',
                bed: '01',
                note: 'Nota 1',
                tags: ['UTI'],
                createdAt: new Date('2026-04-07T10:00:00.000Z'),
                expiresAt: new Date('2026-04-21T10:00:00.000Z'),
                syncStatus: 'synced',
              },
              {
                id: 'note-2',
                userId: 'user-123',
                visitId: 'visit-1',
                date: '2026-04-07',
                bed: '02',
                note: 'Nota 2',
                tags: ['UTI'],
                createdAt: new Date('2026-04-07T10:00:00.000Z'),
                expiresAt: new Date('2026-04-21T10:00:00.000Z'),
                syncStatus: 'synced',
              },
            ]),
          }),
        };
      }

      if (index === 'visitId') {
        return {
          equals: vi.fn().mockReturnValue({
            count: vi.fn().mockResolvedValue(0),
          }),
        };
      }

      return {
        equals: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(0),
        }),
      };
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

    await notesService.deleteNotes(['note-1', 'note-2']);

    expect(mockNotesBulkDelete).toHaveBeenCalledWith(['note-1', 'note-2']);
    const updatedVisit = mockVisitsPut.mock.calls[0]?.[0] as { id: string; expiresAt: Date };
    expect(updatedVisit.id).toBe('visit-1');
    expect(updatedVisit.expiresAt).toBeInstanceOf(Date);
  });
});
