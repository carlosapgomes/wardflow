/**
 * Testes para notes-service - removeTagFromNote
 * Regras: remove-tag-ou-nota
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do Dexie antes de importar o módulo
const mockNotesGet = vi.fn();
const mockNotesUpdate = vi.fn();
const mockNotesDelete = vi.fn();
const mockVisitsGet = vi.fn();
const mockVisitsPut = vi.fn();
const mockSyncQueueAdd = vi.fn();
const mockNotesWhere = vi.fn();

vi.mock('./dexie-db', () => ({
  db: {
    notes: {
      get: mockNotesGet,
      update: mockNotesUpdate,
      delete: mockNotesDelete,
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

// Mock do auth-service
vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => ({
    user: { uid: 'user-123' },
  })),
}));

describe('notes-service - removeTagFromNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar "updated" quando há mais de uma tag', async () => {
    const { removeTagFromNote } = await import('./notes-service');
    
    const mockNote = {
      id: 'note-123',
      userId: 'user-123',
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: 'Teste',
      tags: ['UTI', 'ENFERMARIA'],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
      syncStatus: 'pending' as const,
    };

    mockNotesGet.mockResolvedValueOnce(mockNote);
    mockNotesUpdate.mockResolvedValueOnce(undefined);
    mockVisitsGet.mockResolvedValueOnce({
      id: 'visit-123',
      userId: 'user-123',
      name: 'Visita',
      date: '2026-04-07',
      mode: 'private',
      createdAt: new Date(),
      expiresAt: new Date(),
    });
    mockSyncQueueAdd.mockResolvedValue(undefined);
    mockNotesGet.mockResolvedValueOnce({ ...mockNote, tags: ['UTI'], expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });

    const result = await removeTagFromNote('note-123', 'enfermaria');

    expect(result).toBe('updated');
    expect(mockNotesUpdate).toHaveBeenCalledWith('note-123', expect.objectContaining({
      tags: ['UTI'],
    }));
    const updatedNotePayload = mockNotesUpdate.mock.calls[0]?.[1] as { expiresAt?: Date };
    expect(updatedNotePayload.expiresAt).toBeInstanceOf(Date);

    const updatedVisitPayload = mockVisitsPut.mock.calls[0]?.[0] as { id: string; expiresAt?: Date };
    expect(updatedVisitPayload.id).toBe('visit-123');
    expect(updatedVisitPayload.expiresAt).toBeInstanceOf(Date);
  });

  it('deve retornar "deleted" quando remove última tag', async () => {
    const { removeTagFromNote } = await import('./notes-service');
    
    const mockNote = {
      id: 'note-123',
      userId: 'user-123',
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: 'Teste',
      tags: ['UTI'],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
      syncStatus: 'pending' as const,
    };

    mockNotesGet.mockResolvedValueOnce(mockNote);
    mockNotesDelete.mockResolvedValueOnce(undefined);
    mockSyncQueueAdd.mockResolvedValue(undefined);
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
    mockVisitsGet.mockResolvedValueOnce({
      id: 'visit-123',
      userId: 'user-123',
      name: 'Visita',
      date: '2026-04-07',
      mode: 'private',
      createdAt: new Date(),
      expiresAt: new Date(),
    });

    await expect(removeTagFromNote('note-123', 'uti')).resolves.toBe('deleted');
    expect(mockNotesDelete).toHaveBeenCalledWith('note-123');

    const updatedVisit = mockVisitsPut.mock.calls[0]?.[0] as { id: string; expiresAt: Date };
    expect(updatedVisit.id).toBe('visit-123');
    expect(updatedVisit.expiresAt).toBeInstanceOf(Date);
  });

  it('deve lançar erro se nota não encontrada', async () => {
    const { removeTagFromNote } = await import('./notes-service');
    
    mockNotesGet.mockResolvedValueOnce(undefined);

    await expect(removeTagFromNote('note-inexistente', 'tag'))
      .rejects.toThrow('Nota não encontrada');
  });

  it('deve normalizar tags antes de comparar (ignore case/accent)', async () => {
    const { removeTagFromNote } = await import('./notes-service');
    
    const mockNote = {
      id: 'note-123',
      userId: 'user-123',
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: 'Teste',
      tags: ['UTI', 'ENFERMARIA'],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
      syncStatus: 'pending' as const,
    };

    mockNotesGet.mockResolvedValueOnce(mockNote);
    mockNotesUpdate.mockResolvedValueOnce(undefined);
    mockVisitsGet.mockResolvedValueOnce({
      id: 'visit-123',
      userId: 'user-123',
      name: 'Visita',
      date: '2026-04-07',
      mode: 'private',
      createdAt: new Date(),
      expiresAt: new Date(),
    });
    mockSyncQueueAdd.mockResolvedValue(undefined);
    mockNotesGet.mockResolvedValueOnce({ ...mockNote, tags: ['ENFERMARIA'], expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });

    // Passa 'uti' minúsculo - deve encontrar 'UTI' por normalização
    const result = await removeTagFromNote('note-123', 'uti');

    expect(result).toBe('updated');
    expect(mockNotesUpdate).toHaveBeenCalledWith('note-123', expect.objectContaining({
      tags: ['ENFERMARIA'],
    }));
    const updatedNotePayload = mockNotesUpdate.mock.calls[0]?.[1] as { expiresAt?: Date };
    expect(updatedNotePayload.expiresAt).toBeInstanceOf(Date);

    const updatedVisitPayload = mockVisitsPut.mock.calls[0]?.[0] as { id: string; expiresAt?: Date };
    expect(updatedVisitPayload.id).toBe('visit-123');
    expect(updatedVisitPayload.expiresAt).toBeInstanceOf(Date);
  });

  it('deve lançar erro se tag inválida (vazia)', async () => {
    const { removeTagFromNote } = await import('./notes-service');
    
    await expect(removeTagFromNote('note-123', ''))
      .rejects.toThrow('Tag inválida');
    
    await expect(removeTagFromNote('note-123', '   '))
      .rejects.toThrow('Tag inválida');
  });
});
