/**
 * Testes para notes-service - removeTagFromNote
 * Regras: remove-tag-ou-nota
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do Dexie antes de importar o módulo
const mockNotesGet = vi.fn();
const mockNotesUpdate = vi.fn();
const mockNotesDelete = vi.fn();
const mockSyncQueueAdd = vi.fn();

vi.mock('./dexie-db', () => ({
  db: {
    notes: {
      get: mockNotesGet,
      update: mockNotesUpdate,
      delete: mockNotesDelete,
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
    mockSyncQueueAdd.mockResolvedValueOnce(undefined);
    mockNotesGet.mockResolvedValueOnce({ ...mockNote, tags: ['UTI'] });

    const result = await removeTagFromNote('note-123', 'enfermaria');

    expect(result).toBe('updated');
    expect(mockNotesUpdate).toHaveBeenCalledWith('note-123', expect.objectContaining({
      tags: ['UTI'],
    }));
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
    mockSyncQueueAdd.mockResolvedValueOnce(undefined);

    const result = await removeTagFromNote('note-123', 'uti');

    expect(result).toBe('deleted');
    expect(mockNotesDelete).toHaveBeenCalledWith('note-123');
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
    mockSyncQueueAdd.mockResolvedValueOnce(undefined);
    mockNotesGet.mockResolvedValueOnce({ ...mockNote, tags: ['ENFERMARIA'] });

    // Passa 'uti' minúsculo - deve encontrar 'UTI' por normalização
    const result = await removeTagFromNote('note-123', 'uti');

    expect(result).toBe('updated');
    expect(mockNotesUpdate).toHaveBeenCalledWith('note-123', expect.objectContaining({
      tags: ['ENFERMARIA'],
    }));
  });

  it('deve lançar erro se tag inválida (vazia)', async () => {
    const { removeTagFromNote } = await import('./notes-service');
    
    await expect(removeTagFromNote('note-123', ''))
      .rejects.toThrow('Tag inválida');
    
    await expect(removeTagFromNote('note-123', '   '))
      .rejects.toThrow('Tag inválida');
  });
});
