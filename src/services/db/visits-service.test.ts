/**
 * Testes para visits-service - validação de criação de visitas e membership
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOwnerVisitMember } from './visit-members-service';
import { duplicateVisitAsPrivate } from './visits-service';
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
    },
    notes: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
      add: vi.fn(),
    },
    syncQueue: {
      add: vi.fn(),
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
    visits: { get: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
    visitMembers: { get: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
    syncQueue: { add: ReturnType<typeof vi.fn> };
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

// Testes para createPrivateVisit com dedupe
const { createPrivateVisit } = await import('./visits-service');

describe('createPrivateVisit - nome opcional e dedupe', () => {
  const mockUserId = 'user-test';
  const currentDate = new Date().toISOString().split('T')[0];

  const mockDbVisitsWhere = {
    equals: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  };

  const mockDb = db as unknown as {
    visits: {
      get: ReturnType<typeof vi.fn>;
      add: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
    };
    visitMembers: { get: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
    syncQueue: { add: ReturnType<typeof vi.fn> };
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
      name: 'Plantão manhã 02-04-2026 privada',
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
    expect(result.name).not.toBe('Plantão manhã 02-04-2026 privada');
  });

  it('deve adicionar sufixo (3) quando nomes (2) também existem', async () => {
    mockGetAuthState.mockReturnValue({ user: { uid: mockUserId } });

    const existingVisits: Visit[] = [
      {
        id: 'visit-1',
        userId: mockUserId,
        name: 'Plantão manhã 02-04-2026 privada',
        date: currentDate,
        mode: 'private',
        createdAt: new Date(),
      },
      {
        id: 'visit-2',
        userId: mockUserId,
        name: 'Plantão manhã 02-04-2026 privada (2)',
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
