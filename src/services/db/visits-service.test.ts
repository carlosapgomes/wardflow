/**
 * Testes para visits-service - validação de criação de visitas e membership
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOwnerVisitMember } from './visit-members-service';
import { duplicateVisitAsPrivate, deletePrivateVisit, leaveVisit, deleteGroupVisitAsOwner } from './visits-service';
import type { Visit } from '@/models/visit';
import type { Note } from '@/models/note';
import type { VisitMember } from '@/models/visit-member';

// Mocks para dependências externas
vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(),
}));

vi.mock('./dexie-db', () => ({
  db: {
    visits: {
      get: vi.fn(),
      add: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
          reverse: vi.fn().mockReturnThis(),
          sortBy: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
    visitMembers: {
      get: vi.fn(),
      add: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          delete: vi.fn().mockResolvedValue(0),
        })),
      })),
    },
    notes: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(0),
        })),
      })),
      add: vi.fn(),
      bulkDelete: vi.fn(),
    },
    visitInvites: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          delete: vi.fn().mockResolvedValue(0),
        })),
      })),
    },
    syncQueue: {
      add: vi.fn(),
      delete: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
    transaction: vi.fn(async (_mode: string, _stores: string[], fn: () => Promise<void>) => {
      return fn();
    }),
  },
}));

// Importar db após os mocks para ter acesso aos métodos mockados
const { db } = await import('./dexie-db');
const { getAuthState } = await import('@/services/auth/auth-service');

describe('visit-members-service - createOwnerVisitMember', () => {
  it('deve criar membership com role owner', () => {
    const visitId = 'visit-123';
    const userId = 'user-456';

    const member = createOwnerVisitMember(visitId, userId);

    expect(member.visitId).toBe(visitId);
    expect(member.userId).toBe(userId);
    expect(member.role).toBe('owner');
    expect(member.status).toBe('active');
    expect(member.id).toBe(`${visitId}:${userId}`);
  });

  it('deve criar membership com datas definidas', () => {
    const member = createOwnerVisitMember('visit-1', 'user-1');

    expect(member.createdAt).toBeInstanceOf(Date);
    expect(member.updatedAt).toBeInstanceOf(Date);
    expect(member.createdAt.getTime()).toBe(member.updatedAt.getTime());
  });
});

describe('visits-service - createPrivateVisit integration', () => {
  it('deve gerar ID de membership correto para owner', () => {
    const visitId = 'visit-abc123';
    const userId = 'user-xyz789';

    const ownerMember = createOwnerVisitMember(visitId, userId);

    expect(ownerMember.id).toBe('visit-abc123:user-xyz789');
  });
});

describe('duplicateVisitAsPrivate', () => {
  const mockUserId = 'user-current';
  const mockSourceVisitId = 'visit-source';
  const mockSourceVisit: Visit = {
    id: mockSourceVisitId,
    userId: 'user-owner',
    name: 'Visita origem',
    date: '2026-01-15',
    mode: 'group',
    createdAt: new Date(),
  };
  const mockSourceMember: VisitMember = {
    id: `${mockSourceVisitId}:${mockUserId}`,
    visitId: mockSourceVisitId,
    userId: mockUserId,
    role: 'editor',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockSourceNote: Note = {
    id: 'note-1',
    userId: 'user-owner',
    visitId: mockSourceVisitId,
    date: '2026-01-15',
    bed: '01',
    note: 'Paciente estável',
    tags: ['UTI'],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    syncStatus: 'synced',
    syncedAt: new Date(),
  };

  // Helpers para casts de tipo
  const mockDb = db as unknown as {
    visits: { get: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    visitMembers: { get: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; bulkDelete: ReturnType<typeof vi.fn> };
    syncQueue: { add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> };
    transaction: ReturnType<typeof vi.fn>;
  };
  const mockGetAuthStateFn = getAuthState as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve lançar erro se usuário não autenticado', async () => {
    mockGetAuthStateFn.mockReturnValue({ user: null });

    await expect(duplicateVisitAsPrivate(mockSourceVisitId)).rejects.toThrow(
      'Usuário não autenticado'
    );
  });

  it('deve lançar erro se visita não encontrada', async () => {
    mockGetAuthStateFn.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.get.mockResolvedValue(undefined);

    await expect(duplicateVisitAsPrivate(mockSourceVisitId)).rejects.toThrow(
      'Visita não encontrada'
    );
  });

  it('deve lançar erro se sem membership ativo na visita origem', async () => {
    mockGetAuthStateFn.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.get.mockResolvedValue(mockSourceVisit);
    mockDb.visitMembers.get.mockResolvedValue(undefined);

    await expect(duplicateVisitAsPrivate(mockSourceVisitId)).rejects.toThrow(
      'Sem permissão para duplicar esta visita'
    );
  });

  it('deve lançar erro se membership removido', async () => {
    const removedMember: VisitMember = {
      ...mockSourceMember,
      status: 'removed',
      removedAt: new Date(),
    };
    mockGetAuthStateFn.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.get.mockResolvedValue(mockSourceVisit);
    mockDb.visitMembers.get.mockResolvedValue(removedMember);

    await expect(duplicateVisitAsPrivate(mockSourceVisitId)).rejects.toThrow(
      'Sem permissão para duplicar esta visita'
    );
  });

  it('deve criar visita privada com sucesso e duplicar notas', async () => {
    mockGetAuthStateFn.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.get.mockResolvedValue(mockSourceVisit);
    mockDb.visitMembers.get.mockResolvedValue(mockSourceMember);

    // Mock notas da visita origem
    const notesMock = {
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([mockSourceNote]),
      }),
    };
    mockDb.notes.where.mockReturnValue(notesMock as { equals: ReturnType<typeof vi.fn> });

    // Capturar a visita/membro criado
    let createdMember: VisitMember | undefined;
    const addedNotes: Note[] = [];
    const addedSyncItems: unknown[] = [];

    mockDb.visits.add.mockResolvedValue(undefined);
    mockDb.visitMembers.add.mockImplementation((member: VisitMember) => {
      createdMember = member;
    });
    mockDb.notes.add.mockImplementation((note: Note) => {
      addedNotes.push(note);
    });
    mockDb.syncQueue.add.mockImplementation((item: unknown) => {
      addedSyncItems.push(item);
    });

    const result = await duplicateVisitAsPrivate(mockSourceVisitId);

    // Verificar nova visita
    expect(result).toBeDefined();
    expect(result.userId).toBe(mockUserId);
    expect(result.mode).toBe('private');
    expect(result.name).toContain('(cópia)');
    expect(result.date).toBe(new Date().toISOString().split('T')[0]);

    // Verificar membership owner
    expect(createdMember).toBeDefined();
    expect(createdMember?.role).toBe('owner');
    expect(createdMember?.userId).toBe(mockUserId);

    // Verificar notas duplicadas
    expect(addedNotes.length).toBe(1);
    expect(addedNotes[0].userId).toBe(mockUserId);
    expect(addedNotes[0].visitId).toBe(result.id);
    expect(addedNotes[0].tags).toEqual(mockSourceNote.tags);
    expect(addedNotes[0].bed).toBe(mockSourceNote.bed);
    expect(addedNotes[0].note).toBe(mockSourceNote.note);
    expect(addedNotes[0].syncStatus).toBe('pending');

    // Verificar sync queue: 1 note + 1 visit + 1 visit-member
    expect(addedSyncItems.length).toBe(3);

    // Verificar item de nota
    const hasNoteItem = addedSyncItems.some(
      (item) => (item as { entityType: string }).entityType === 'note'
    );
    expect(hasNoteItem).toBe(true);

    // Verificar item de visita
    const hasVisitItem = addedSyncItems.some(
      (item) => (item as { entityType: string }).entityType === 'visit'
    );
    expect(hasVisitItem).toBe(true);

    // Verificar item de membership
    const hasMemberItem = addedSyncItems.some(
      (item) => (item as { entityType: string }).entityType === 'visit-member'
    );
    expect(hasMemberItem).toBe(true);
  });

  it('deve duplicar múltiplas notas com sucesso', async () => {
    const mockNotes = [
      { ...mockSourceNote, id: 'note-1' },
      { ...mockSourceNote, id: 'note-2', bed: '02' },
      { ...mockSourceNote, id: 'note-3', bed: '03' },
    ];

    mockGetAuthStateFn.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.get.mockResolvedValue(mockSourceVisit);
    mockDb.visitMembers.get.mockResolvedValue(mockSourceMember);

    const notesMock = {
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockNotes),
      }),
    };
    mockDb.notes.where.mockReturnValue(notesMock as { equals: ReturnType<typeof vi.fn> });

    const addedNotes: Note[] = [];
    const addedSyncItems: unknown[] = [];

    mockDb.visits.add.mockResolvedValue(undefined);
    mockDb.visitMembers.add.mockResolvedValue(undefined);
    mockDb.notes.add.mockImplementation((note: Note) => {
      addedNotes.push(note);
    });
    mockDb.syncQueue.add.mockImplementation((item: unknown) => {
      addedSyncItems.push(item);
    });

    await duplicateVisitAsPrivate(mockSourceVisitId);

    // 3 notas + 1 visit + 1 visit-member = 5 sync items
    expect(addedNotes.length).toBe(3);
    expect(addedSyncItems.length).toBe(5);
    expect(addedSyncItems.every((item) => (item as { operation: string }).operation === 'create')).toBe(true);
  });
});

describe('deletePrivateVisit', () => {
  const mockUserId = 'user-owner';
  const mockVisitId = 'visit-private-1';

  const mockPrivateVisit: Visit = {
    id: mockVisitId,
    userId: mockUserId,
    name: 'Visita privada',
    date: '2026-04-05',
    mode: 'private',
    createdAt: new Date(),
  };

  const mockOwnerMember: VisitMember = {
    id: `${mockVisitId}:${mockUserId}`,
    visitId: mockVisitId,
    userId: mockUserId,
    role: 'owner',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDb = db as unknown as {
    visits: { get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    visitMembers: { get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn>; bulkDelete: ReturnType<typeof vi.fn> };
    syncQueue: { add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> };
    transaction: ReturnType<typeof vi.fn>;
  };
  const mockGetAuthStateFn = getAuthState as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthStateFn.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.get.mockResolvedValue(mockPrivateVisit);
    mockDb.visitMembers.get.mockResolvedValue(mockOwnerMember);
    mockDb.visits.delete.mockResolvedValue(undefined);
    mockDb.visitMembers.delete.mockResolvedValue(undefined);
    mockDb.notes.bulkDelete.mockResolvedValue(undefined);
  });

  it('deve remover visita privada vazia, limpar fila pendente da visita e enfileirar deletes de visit/member', async () => {
    mockDb.notes.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as { equals: ReturnType<typeof vi.fn> });

    mockDb.syncQueue.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            id: 'pending-note-1',
            userId: mockUserId,
            entityType: 'note',
            entityId: 'note-1',
            payload: JSON.stringify({ visitId: mockVisitId }),
          },
        ]),
      }),
    } as { equals: ReturnType<typeof vi.fn> });

    const queuedItems: unknown[] = [];
    mockDb.syncQueue.add.mockImplementation((item: unknown) => {
      queuedItems.push(item);
    });

    await deletePrivateVisit(mockVisitId);

    expect(mockDb.syncQueue.delete).toHaveBeenCalledWith('pending-note-1');
    expect(mockDb.notes.bulkDelete).not.toHaveBeenCalled();
    expect(mockDb.visitMembers.delete).toHaveBeenCalledWith(`${mockVisitId}:${mockUserId}`);
    expect(mockDb.visits.delete).toHaveBeenCalledWith(mockVisitId);

    expect(queuedItems).toHaveLength(2);
    expect(queuedItems.some((item) => (item as { entityType: string; operation: string }).entityType === 'visit-member' && (item as { operation: string }).operation === 'delete')).toBe(true);
    expect(queuedItems.some((item) => (item as { entityType: string; operation: string }).entityType === 'visit' && (item as { operation: string }).operation === 'delete')).toBe(true);
  });

  it('deve remover visita privada com notas e enfileirar deletes de notas', async () => {
    const visitNotes: Note[] = [
      {
        id: 'note-1',
        userId: mockUserId,
        visitId: mockVisitId,
        date: '2026-04-05',
        bed: '01',
        note: 'Nota 1',
        tags: ['UTI'],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        syncStatus: 'synced',
      },
      {
        id: 'note-2',
        userId: mockUserId,
        visitId: mockVisitId,
        date: '2026-04-05',
        bed: '02',
        note: 'Nota 2',
        tags: ['CLIN'],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        syncStatus: 'synced',
      },
    ];

    mockDb.notes.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(visitNotes),
      }),
    } as { equals: ReturnType<typeof vi.fn> });

    const queuedItems: unknown[] = [];
    mockDb.syncQueue.add.mockImplementation((item: unknown) => {
      queuedItems.push(item);
    });

    await deletePrivateVisit(mockVisitId);

    expect(mockDb.notes.bulkDelete).toHaveBeenCalledWith(['note-1', 'note-2']);
    expect(queuedItems).toHaveLength(4);
    expect(queuedItems.filter((item) => (item as { entityType: string }).entityType === 'note')).toHaveLength(2);
    expect(queuedItems.some((item) => (item as { entityType: string }).entityType === 'visit-member')).toBe(true);
    expect(queuedItems.some((item) => (item as { entityType: string }).entityType === 'visit')).toBe(true);
  });

  it('deve falhar para visita group', async () => {
    mockDb.visits.get.mockResolvedValue({
      ...mockPrivateVisit,
      mode: 'group',
    } as Visit);

    await expect(deletePrivateVisit(mockVisitId)).rejects.toThrow('Apenas visitas privadas podem ser excluídas neste fluxo');
  });
});

describe('leaveVisit', () => {
  const mockUserId = 'user-editor';
  const mockVisitId = 'visit-group-1';

  const mockDb = db as unknown as {
    visitMembers: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
    visits: { delete: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn>; bulkDelete: ReturnType<typeof vi.fn> };
    syncQueue: { add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> };
  };
  const mockGetAuthStateFn = getAuthState as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthStateFn.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visitMembers.put.mockResolvedValue(undefined);
    mockDb.visits.delete.mockResolvedValue(undefined);
    mockDb.notes.bulkDelete.mockResolvedValue(undefined);
  });

  it('falha para owner', async () => {
    mockDb.visitMembers.get.mockResolvedValue({
      id: `${mockVisitId}:${mockUserId}`,
      visitId: mockVisitId,
      userId: mockUserId,
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as VisitMember);

    await expect(leaveVisit(mockVisitId)).rejects.toThrow('Owner não pode sair da visita neste fluxo');
  });

  it('funciona para editor ativo e limpa fila pendente da visita', async () => {
    mockDb.visitMembers.get.mockResolvedValue({
      id: `${mockVisitId}:${mockUserId}`,
      visitId: mockVisitId,
      userId: mockUserId,
      role: 'editor',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as VisitMember);

    mockDb.syncQueue.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            id: 'pending-note-1',
            userId: mockUserId,
            entityType: 'note',
            entityId: 'note-1',
            payload: JSON.stringify({ visitId: mockVisitId }),
          },
        ]),
      }),
    } as { equals: ReturnType<typeof vi.fn> });

    mockDb.notes.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as { equals: ReturnType<typeof vi.fn> });

    await leaveVisit(mockVisitId);

    expect(mockDb.syncQueue.delete).toHaveBeenCalledWith('pending-note-1');
    expect(mockDb.visitMembers.put).toHaveBeenCalledWith(expect.objectContaining({
      status: 'removed',
    }));
    expect(mockDb.visits.delete).toHaveBeenCalledWith(mockVisitId);
  });
});

describe('deleteGroupVisitAsOwner', () => {
  const mockUserId = 'user-owner';
  const mockVisitId = 'visit-group-1';

  const mockDb = db as unknown as {
    visits: { get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    visitMembers: { get: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn> };
    visitInvites: { where: ReturnType<typeof vi.fn> };
    syncQueue: { delete: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> };
  };
  const mockGetAuthStateFn = getAuthState as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ status: 'deleted', visitId: mockVisitId }),
    }));

    mockGetAuthStateFn.mockReturnValue({
      user: {
        uid: mockUserId,
        getIdToken: vi.fn().mockResolvedValue('id-token'),
      },
    });

    mockDb.visits.get.mockResolvedValue({
      id: mockVisitId,
      userId: mockUserId,
      name: 'Visita grupo',
      date: '2026-04-05',
      mode: 'group',
      createdAt: new Date(),
    } as Visit);

    mockDb.visitMembers.get.mockResolvedValue({
      id: `${mockVisitId}:${mockUserId}`,
      visitId: mockVisitId,
      userId: mockUserId,
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as VisitMember);
  });

  it('valida visita group + owner antes de chamar endpoint', async () => {
    mockDb.visits.get.mockResolvedValue({
      id: mockVisitId,
      userId: mockUserId,
      name: 'Visita privada',
      date: '2026-04-05',
      mode: 'private',
      createdAt: new Date(),
    } as Visit);

    await expect(deleteGroupVisitAsOwner(mockVisitId)).rejects.toThrow('Apenas visitas colaborativas podem ser excluídas neste fluxo');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('chama endpoint e limpa dados locais e fila pendente quando sucesso', async () => {
    const deleteByWhere = vi.fn().mockResolvedValue(1);
    mockDb.syncQueue.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            id: 'pending-note-1',
            userId: mockUserId,
            entityType: 'note',
            entityId: 'note-1',
            payload: JSON.stringify({ visitId: mockVisitId }),
          },
        ]),
      }),
    } as { equals: ReturnType<typeof vi.fn> });
    mockDb.notes.where.mockReturnValue({ equals: vi.fn().mockReturnValue({ delete: deleteByWhere }) } as { equals: ReturnType<typeof vi.fn> });
    mockDb.visitMembers.where.mockReturnValue({ equals: vi.fn().mockReturnValue({ delete: deleteByWhere }) } as { equals: ReturnType<typeof vi.fn> });
    mockDb.visitInvites.where.mockReturnValue({ equals: vi.fn().mockReturnValue({ delete: deleteByWhere }) } as { equals: ReturnType<typeof vi.fn> });
    mockDb.visits.delete.mockResolvedValue(undefined);

    await deleteGroupVisitAsOwner(mockVisitId);

    expect(fetch).toHaveBeenCalledWith('/api/visits/delete', expect.objectContaining({ method: 'POST' }));
    expect(mockDb.syncQueue.delete).toHaveBeenCalledWith('pending-note-1');
    expect(mockDb.visits.delete).toHaveBeenCalledWith(mockVisitId);
  });
});

// Testes para createPrivateVisit com dedupe
const { createPrivateVisit } = await import('./visits-service');

describe('createPrivateVisit - nome opcional e dedupe', () => {
  const mockUserId = 'user-test';
  const currentDate = new Date().toISOString().split('T')[0];
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const currentDateLabel = `${day}-${month}-${String(year)}`;

  const mockDbVisitsWhere = {
    equals: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  };

  const mockDb = db as unknown as {
    visits: {
      get: ReturnType<typeof vi.fn>;
      add: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
    };
    visitMembers: { get: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; bulkDelete: ReturnType<typeof vi.fn> };
    syncQueue: { add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> };
    transaction: ReturnType<typeof vi.fn>;
  };
  const mockGetAuthState = getAuthState as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.visits.where.mockReturnValue(mockDbVisitsWhere);
  });

  it('deve criar visita sem prefixo (comportamento atual)', async () => {
    mockGetAuthState.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as typeof mockDbVisitsWhere);

    mockDb.visits.add.mockResolvedValue(undefined);
    mockDb.visitMembers.add.mockResolvedValue(undefined);

    const addedSyncItems: unknown[] = [];
    mockDb.syncQueue.add.mockImplementation((item: unknown) => {
      addedSyncItems.push(item);
    });

    const result = await createPrivateVisit();

    expect(result).toBeDefined();
    expect(result.userId).toBe(mockUserId);
    expect(result.date).toBe(currentDate);
    expect(result.mode).toBe('private');
    expect(result.name).toContain('privada');

    // Verificar sync queue: visit + visit-member
    expect(addedSyncItems.length).toBe(2);

    const hasVisitItem = addedSyncItems.some(
      (item) => (item as { entityType: string }).entityType === 'visit'
    );
    expect(hasVisitItem).toBe(true);

    const hasMemberItem = addedSyncItems.some(
      (item) => (item as { entityType: string }).entityType === 'visit-member'
    );
    expect(hasMemberItem).toBe(true);
  });

  it('deve criar visita com prefixo personalizado', async () => {
    mockGetAuthState.mockReturnValue({ user: { uid: mockUserId } });
    mockDb.visits.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as typeof mockDbVisitsWhere);

    mockDb.visits.add.mockResolvedValue(undefined);
    mockDb.visitMembers.add.mockResolvedValue(undefined);

    const result = await createPrivateVisit('Plantão manhã');

    expect(result).toBeDefined();
    expect(result.name).toContain('Plantão manhã');
    expect(result.name).toContain('privada');
  });

  it('deve adicionar sufixo (2) quando nome já existe no mesmo dia', async () => {
    mockGetAuthState.mockReturnValue({ user: { uid: mockUserId } });

    const existingVisit: Visit = {
      id: 'existing-visit',
      userId: mockUserId,
      name: `Plantão manhã ${currentDateLabel} privada`,
      date: currentDate,
      mode: 'private',
      createdAt: new Date(),
    };

    mockDb.visits.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([existingVisit]),
      }),
    } as typeof mockDbVisitsWhere);

    mockDb.visits.add.mockResolvedValue(undefined);
    mockDb.visitMembers.add.mockResolvedValue(undefined);

    const result = await createPrivateVisit('Plantão manhã');

    expect(result.name).toContain('(2)');
    expect(result.name).not.toBe(`Plantão manhã ${currentDateLabel} privada`);
  });

  it('deve adicionar sufixo (3) quando nomes (2) também existem', async () => {
    mockGetAuthState.mockReturnValue({ user: { uid: mockUserId } });

    const existingVisits: Visit[] = [
      {
        id: 'visit-1',
        userId: mockUserId,
        name: `Plantão manhã ${currentDateLabel} privada`,
        date: currentDate,
        mode: 'private',
        createdAt: new Date(),
      },
      {
        id: 'visit-2',
        userId: mockUserId,
        name: `Plantão manhã ${currentDateLabel} privada (2)`,
        date: currentDate,
        mode: 'private',
        createdAt: new Date(),
      },
    ];

    mockDb.visits.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(existingVisits),
      }),
    } as typeof mockDbVisitsWhere);

    mockDb.visits.add.mockResolvedValue(undefined);
    mockDb.visitMembers.add.mockResolvedValue(undefined);

    const result = await createPrivateVisit('Plantão manhã');

    expect(result.name).toContain('(3)');
  });
});
