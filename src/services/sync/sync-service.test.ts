/**
 * Testes para sync-service - funções puras e resolução de conflitos
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock do auth-service
vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => ({ user: null, loading: false, error: null })),
}));

// Mock do firebase
vi.mock('@/services/auth/firebase', () => ({
  getFirebaseFirestore: vi.fn(() => ({})),
}));

// Mock das funções do Firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  increment: vi.fn((n: number) => n), // Mock do increment
}));

vi.mock('@/services/db/user-tag-stats-service', () => ({
  triggerCurrentUserTagStatsRebuild: vi.fn(),
}));

// Mock do Dexie para visitMembers e visits
vi.mock('@/services/db/dexie-db', () => ({
  db: {
    transaction: vi.fn(async (_mode: unknown, _tables: unknown[], callback: () => Promise<void>) => {
      await callback();
    }),
    notes: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(0),
        })),
      })),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      bulkPut: vi.fn(),
      bulkDelete: vi.fn(),
    },
    syncQueue: {
      where: vi.fn(() => ({
        equals: vi.fn().mockReturnThis(),
        sortBy: vi.fn().mockResolvedValue([]),
        and: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      })),
      add: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    settings: {
      get: vi.fn(),
      put: vi.fn(),
      clear: vi.fn(),
    },
    visits: {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    visitMembers: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          and: vi.fn().mockReturnThis(),
          toArray: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(0),
        })),
      })),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    visitInvites: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          delete: vi.fn().mockResolvedValue(0),
        })),
      })),
    },
  },
}));

import * as syncService from './sync-service';
import { type Note } from '@/models/note';
import { type SyncQueueItem } from '@/models/sync-queue';
import { getAuthState } from '@/services/auth/auth-service';
import { getFirebaseFirestore } from '@/services/auth/firebase';
import { db } from '@/services/db/dexie-db';
import { collectionGroup, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { triggerCurrentUserTagStatsRebuild } from '@/services/db/user-tag-stats-service';

// Removido: FirestoreWardStatData (tags-first)

// Mock do window para navigator.onLine
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setInterval: vi.fn(() => 1),
  clearInterval: vi.fn(),
  navigator: { onLine: true },
};
vi.stubGlobal('window', mockWindow);
vi.stubGlobal('navigator', { onLine: true });

describe('sync-service - getSyncStatus', () => {
  it('deve retornar status inicial com pendingCount 0', () => {
    const status = syncService.getSyncStatus();

    expect(status).toEqual({
      isSyncing: false,
      pendingCount: 0,
      lastSyncAt: null,
      error: null,
    });
  });
});

describe('sync-service - subscribeToSync', () => {
  it('deve notificar subscriber imediatamente com status atual', () => {
    const callback = vi.fn();
    syncService.subscribeToSync(callback);

    expect(callback).toHaveBeenCalledWith({
      isSyncing: false,
      pendingCount: 0,
      lastSyncAt: null,
      error: null,
    });
  });

  it('deve retornar função de unsubscribe', () => {
    const callback = vi.fn();
    const unsubscribe = syncService.subscribeToSync(callback);

    // O unsubscribe deve remover o callback
    unsubscribe();
    // Após unsubscribe, o callback não deve ser adicionado novamente
  });
});

describe('sync-service - resolveNoteConflict', () => {
  it('deve usar remote se não existe local', () => {
    const remote = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota remota',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: new Date('2024-03-25T11:00:00'),
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const result = syncService.resolveNoteConflict(undefined, remote);
    expect(result).toEqual(remote);
  });

  it('deve manter local se syncStatus é pending', () => {
    const local = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota local pendente',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: new Date('2024-03-25T11:00:00'),
      expiresAt: new Date(),
      syncStatus: 'pending' as const,
    };

    const remote = {
      ...local,
      note: 'Nota remota',
      updatedAt: new Date('2024-03-25T12:00:00'),
    };

    const result = syncService.resolveNoteConflict(local, remote);
    expect(result.note).toBe('Nota local pendente');
    expect(result.syncStatus).toBe('pending');
  });

  it('deve manter local se syncStatus é failed', () => {
    const local = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota local falhou',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: new Date('2024-03-25T11:00:00'),
      expiresAt: new Date(),
      syncStatus: 'failed' as const,
    };

    const remote = {
      ...local,
      note: 'Nota remota',
      updatedAt: new Date('2024-03-25T12:00:00'),
    };

    const result = syncService.resolveNoteConflict(local, remote);
    expect(result.note).toBe('Nota local falhou');
    expect(result.syncStatus).toBe('failed');
  });

  it('deve usar remote se remote é mais recente (LWW)', () => {
    const local = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota local',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: new Date('2024-03-25T11:00:00'),
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const remote = {
      ...local,
      note: 'Nota remota mais recente',
      updatedAt: new Date('2024-03-25T12:00:00'),
    };

    const result = syncService.resolveNoteConflict(local, remote);
    expect(result.note).toBe('Nota remota mais recente');
  });

  it('deve manter local se local é mais recente (LWW)', () => {
    const local = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota local mais recente',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: new Date('2024-03-25T12:00:00'),
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const remote = {
      ...local,
      note: 'Nota remota',
      updatedAt: new Date('2024-03-25T11:00:00'),
    };

    const result = syncService.resolveNoteConflict(local, remote);
    expect(result.note).toBe('Nota local mais recente');
  });

  it('deve manter local em caso de empate (updatedAt igual)', () => {
    const sameTime = new Date('2024-03-25T12:00:00');
    const local = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota local',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: sameTime,
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const remote = {
      ...local,
      note: 'Nota remota',
      updatedAt: sameTime,
    };

    const result = syncService.resolveNoteConflict(local, remote);
    expect(result.note).toBe('Nota local');
  });

  it('deve usar remote.createdAt como fallback se updatedAt undefined', () => {
    const local = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota local',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: undefined,
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const remote = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota remota',
      createdAt: new Date('2024-03-25T11:00:00'),
      updatedAt: undefined,
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const result = syncService.resolveNoteConflict(local, remote);
    expect(result.note).toBe('Nota remota');
  });
});

describe('sync-service - getNoteTimestamp', () => {
  it('deve retornar updatedAt quando existe', () => {
    const note = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: new Date('2024-03-25T12:00:00'),
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const result = syncService.getNoteTimestamp(note);
    expect(result).toEqual(new Date('2024-03-25T12:00:00'));
  });

  it('deve retornar createdAt quando updatedAt é undefined', () => {
    const note = {
      id: 'note-1',
      userId: 'user-123',
      date: '2024-03-25',
      ward: 'UTI',
      bed: '01',
      visitId: 'visit-1',
      note: 'Nota',
      createdAt: new Date('2024-03-25T10:00:00'),
      updatedAt: undefined,
      expiresAt: new Date(),
      syncStatus: 'synced' as const,
    };

    const result = syncService.getNoteTimestamp(note);
    expect(result).toEqual(new Date('2024-03-25T10:00:00'));
  });
});

describe('sync-service - deduplicateNotes', () => {
  const makeNote = (id: string, createdAt: Date, updatedAt?: Date) => ({
    id,
    userId: 'user-123',
    date: '2024-03-25',
    ward: 'UTI',
    bed: '01',
    visitId: 'visit-1',
    note: `Nota ${id}`,
    createdAt,
    updatedAt,
    expiresAt: new Date(),
    syncStatus: 'synced' as const,
  });

  it('deve retornar todas as notas se não há duplicatas', () => {
    const notes = [
      makeNote('note-1', new Date('2024-03-25T10:00:00')),
      makeNote('note-2', new Date('2024-03-25T11:00:00')),
      makeNote('note-3', new Date('2024-03-25T12:00:00')),
    ];

    const result = syncService.deduplicateNotes(notes);
    expect(result).toHaveLength(3);
  });

  it('deve remover duplicatas mantendo a versão mais recente por updatedAt', () => {
    const notes = [
      makeNote('note-1', new Date('2024-03-25T10:00:00'), new Date('2024-03-25T10:00:00')),
      makeNote('note-1', new Date('2024-03-25T10:00:00'), new Date('2024-03-25T12:00:00')),
      makeNote('note-2', new Date('2024-03-25T11:00:00')),
    ];

    const result = syncService.deduplicateNotes(notes);
    expect(result).toHaveLength(2);
    expect(result.find((n) => n.id === 'note-1')?.note).toBe('Nota note-1');
    expect(result.find((n) => n.id === 'note-1')?.updatedAt).toEqual(new Date('2024-03-25T12:00:00'));
  });

  it('deve usar createdAt como fallback quando updatedAt undefined', () => {
    const notes = [
      makeNote('note-1', new Date('2024-03-25T10:00:00'), undefined),
      makeNote('note-1', new Date('2024-03-25T12:00:00'), undefined),
    ];

    const result = syncService.deduplicateNotes(notes);
    expect(result).toHaveLength(1);
    expect(result[0].createdAt).toEqual(new Date('2024-03-25T12:00:00'));
  });

  it('deve manter local quando timestamps são iguais', () => {
    const sameTime = new Date('2024-03-25T12:00:00');
    const notes = [
      makeNote('note-1', sameTime, sameTime),
      makeNote('note-1', sameTime, sameTime),
    ];

    const result = syncService.deduplicateNotes(notes);
    expect(result).toHaveLength(1);
    // Mantém a primeira ocorrência
  });

  it('deve lidar com array vazio', () => {
    const result = syncService.deduplicateNotes([]);
    expect(result).toHaveLength(0);
  });
});

describe('sync-service - initializeSync / cleanupSync', () => {
  afterEach(() => {
    syncService.cleanupSync();
  });

  it('deve configurar event listeners e intervalo', () => {
    syncService.initializeSync();

    expect(mockWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(mockWindow.setInterval).toHaveBeenCalled();
  });

  it('deve remover event listeners no cleanup', () => {
    syncService.initializeSync();

    syncService.cleanupSync();

    expect(mockWindow.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(mockWindow.clearInterval).toHaveBeenCalled();
  });

  it('deve ser idempotente (inicializar apenas uma vez)', () => {
    // Cleanup primeiro para garantir estado limpo
    syncService.cleanupSync();
    mockWindow.addEventListener.mockClear();
    mockWindow.setInterval.mockClear();

    syncService.initializeSync();
    syncService.initializeSync();

    expect(mockWindow.addEventListener).toHaveBeenCalledTimes(1);
    expect(mockWindow.setInterval).toHaveBeenCalledTimes(1);
  });
});

// Removido: testes de wardStat sync (tags-first)

describe('sync-service - shouldSkipNoteQueueItemDueToLaterDelete', () => {
  const makeItem = (
    id: string,
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    entityType: 'note' | 'settings' = 'note'
  ): SyncQueueItem => ({
    id,
    userId: 'user-123',
    operation,
    entityType,
    entityId,
    payload: '{}',
    createdAt: new Date(),
    retryCount: 0,
  });

  it('deve retornar false para entityType settings', () => {
    const item = makeItem('item-1', 'settings-1', 'update', 'settings');
    const allPending = [item];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(false);
  });

  it('deve retornar false para operação delete', () => {
    const item = makeItem('item-1', 'note-1', 'delete');
    const allPending = [item];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(false);
  });

  it('deve retornar false quando não há delete posterior', () => {
    const item = makeItem('item-1', 'note-1', 'update');
    const allPending = [
      item,
      makeItem('item-2', 'note-2', 'create'),
      makeItem('item-3', 'note-2', 'update'),
    ];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(false);
  });

  it('deve retornar true quando há delete posterior da mesma nota', () => {
    const item = makeItem('item-1', 'note-1', 'update');
    const allPending = [
      item,
      makeItem('item-2', 'note-2', 'create'),
      makeItem('item-3', 'note-1', 'delete'), // delete posterior da mesma nota
    ];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(true);
  });

  it('deve retornar false para delete posterior de outra nota', () => {
    const item = makeItem('item-1', 'note-1', 'create');
    const allPending = [
      item,
      makeItem('item-2', 'note-2', 'delete'), // delete de outra nota
    ];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(false);
  });

  it('deve retornar true quando há delete posterior imediato', () => {
    const item = makeItem('item-1', 'note-1', 'update');
    const allPending = [
      item,
      makeItem('item-2', 'note-1', 'delete'),
    ];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(true);
  });

  it('deve retornar false quando o item é o último na fila', () => {
    const item = makeItem('item-2', 'note-1', 'update');
    const allPending = [
      makeItem('item-1', 'note-2', 'delete'),
      item,
    ];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(false);
  });

  it('deve retornar false quando item não existe no array allPending', () => {
    const item = makeItem('item-x', 'note-1', 'update');
    const allPending = [
      makeItem('item-1', 'note-1', 'update'),
      makeItem('item-2', 'note-1', 'delete'),
    ];

    const result = syncService.shouldSkipNoteQueueItemDueToLaterDelete(item, allPending);
    expect(result).toBe(false);
  });
});

describe('sync-service - isPermissionDeniedError', () => {
  it('deve retornar true para erro com permission-denied', () => {
    const error = new Error('FirebaseError: permission-denied');
    const result = syncService.isPermissionDeniedError(error);
    expect(result).toBe(true);
  });

  it('deve retornar true para erro com permission denied (sem hífen)', () => {
    const error = new Error('permission denied: insufficient permissions');
    const result = syncService.isPermissionDeniedError(error);
    expect(result).toBe(true);
  });

  it('deve retornar true para erro com firestore.permission_denied', () => {
    const error = new Error('FIRESTORE.PERMISSION_DENIED: cross-user not allowed');
    const result = syncService.isPermissionDeniedError(error);
    expect(result).toBe(true);
  });

  it('deve retornar true para code com permission-denied', () => {
    const result = syncService.isPermissionDeniedError({ code: 'firestore/permission-denied' });
    expect(result).toBe(true);
  });

  it('deve retornar false para erro sem permission denied', () => {
    const error = new Error('Document not found');
    const result = syncService.isPermissionDeniedError(error);
    expect(result).toBe(false);
  });

  it('deve retornar false para erro não-Error', () => {
    const result = syncService.isPermissionDeniedError('string error');
    expect(result).toBe(false);
  });

  it('deve retornar false para null/undefined', () => {
    expect(syncService.isPermissionDeniedError(null)).toBe(false);
    expect(syncService.isPermissionDeniedError(undefined)).toBe(false);
  });
});

describe('sync-service - isNotFoundError / isVisitMissingOrInaccessibleError', () => {
  it('detecta not-found em message', () => {
    expect(syncService.isNotFoundError(new Error('Document not-found'))).toBe(true);
  });

  it('detecta not-found em code', () => {
    expect(syncService.isNotFoundError({ code: 'firestore/not-found' })).toBe(true);
  });

  it('detecta erro compatível com visita removida remotamente', () => {
    expect(syncService.isVisitMissingOrInaccessibleError(new Error('permission-denied'))).toBe(true);
    expect(syncService.isVisitMissingOrInaccessibleError(new Error('not-found'))).toBe(true);
    expect(syncService.isVisitMissingOrInaccessibleError(new Error('invalid-argument'))).toBe(false);
  });
});

describe('sync-service - resolveSettingsConflict', () => {
  const makeLocalSettings = (updatedAtIso: string) => ({
    id: 'user-settings' as const,
    userId: 'user-123',
    inputPreferences: {
      uppercaseBed: true,
    },
    updatedAt: new Date(updatedAtIso),
  });

  it('deve usar remoto quando não existe local', () => {
    const remoteData = {
      inputPreferences: {
        uppercaseBed: true,
      },
      updatedAt: '2026-03-28T10:00:00.000Z',
    };

    const result = syncService.resolveSettingsConflict(undefined, remoteData, 'user-123', false);

    expect(result.inputPreferences.uppercaseBed).toBe(true);
  });

  it('deve preservar local quando há pendência local', () => {
    const local = makeLocalSettings('2026-03-28T09:00:00.000Z');
    const remoteData = {
      inputPreferences: {
        uppercaseBed: false,
      },
      updatedAt: '2026-03-28T10:00:00.000Z',
    };

    const result = syncService.resolveSettingsConflict(local, remoteData, 'user-123', true);

    expect(result).toEqual(local);
  });

  it('deve usar o payload mais recente quando não há pendência', () => {
    const local = makeLocalSettings('2026-03-28T09:00:00.000Z');
    const remoteData = {
      inputPreferences: {
        uppercaseBed: false,
      },
      updatedAt: '2026-03-28T10:00:00.000Z',
    };

    const result = syncService.resolveSettingsConflict(local, remoteData, 'user-123', false);

    expect(result.inputPreferences).toEqual({
      uppercaseBed: false,
    });
  });
});

describe('sync-service - reconcileMembershipVisitIds', () => {
  it('separa visitIds ativos, removidos e órfãos', () => {
    const result = syncService.reconcileMembershipVisitIds({
      localMembershipVisitIds: ['visit-1', 'visit-2', 'visit-3'],
      remoteMemberships: [
        {
          id: 'visit-1:user-123',
          visitId: 'visit-1',
          userId: 'user-123',
          role: 'owner',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'visit-2:user-123',
          visitId: 'visit-2',
          userId: 'user-123',
          role: 'viewer',
          status: 'removed',
          createdAt: new Date(),
          updatedAt: new Date(),
          removedAt: new Date(),
        },
      ],
    });

    expect(result.activeVisitIds).toEqual(['visit-1']);
    expect(result.removedVisitIds).toEqual(['visit-2']);
    expect(result.orphanedVisitIds).toEqual(['visit-3']);
  });
});

describe('sync-service - pullRemoteVisitMembershipsAndVisits', () => {
  const mockedGetAuthState = vi.mocked(getAuthState);
  const mockedGetFirebaseFirestore = vi.mocked(getFirebaseFirestore);
  const mockedTriggerCurrentUserTagStatsRebuild = vi.mocked(triggerCurrentUserTagStatsRebuild);
  const mockedCollectionGroup = vi.mocked(collectionGroup);
  const mockedQuery = vi.mocked(query);
  const mockedWhere = vi.mocked(where);
  const mockedGetDocs = vi.mocked(getDocs);
  const mockedDoc = vi.mocked(doc);
  const mockedGetDoc = vi.mocked(getDoc);

  const mockedDb = db as unknown as {
    transaction: ReturnType<typeof vi.fn>;
    visitMembers: { bulkPut: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> };
    visits: { put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    notes: { where: ReturnType<typeof vi.fn> };
    visitInvites: { where: ReturnType<typeof vi.fn> };
    syncQueue: { where: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  };

  const setupDefaults = () => {
    vi.clearAllMocks();
    mockedGetAuthState.mockReturnValue({
      user: { uid: 'user-123' } as ReturnType<typeof getAuthState>['user'],
      loading: false,
      error: null,
    });
    mockedGetFirebaseFirestore.mockReturnValue({} as ReturnType<typeof getFirebaseFirestore>);
    mockedCollectionGroup.mockReturnValue({} as ReturnType<typeof collectionGroup>);
    mockedWhere.mockReturnValue({} as ReturnType<typeof where>);
    mockedQuery.mockReturnValue({} as ReturnType<typeof query>);
    mockedDoc.mockReturnValue({} as ReturnType<typeof doc>);
  };

  it('retorna sem erro quando usuário não está autenticado', async () => {
    setupDefaults();
    mockedGetAuthState.mockReturnValue({ user: null, loading: false, error: null });

    await expect(syncService.pullRemoteVisitMembershipsAndVisits()).resolves.toBeUndefined();
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('hidrata membership ativo e visita correspondente', async () => {
    setupDefaults();

    mockedGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'user-123',
          data: () => ({
            id: 'visit-1:user-123',
            visitId: 'visit-1',
            userId: 'user-123',
            role: 'owner',
            status: 'active',
            createdAt: '2026-04-01T10:00:00.000Z',
            updatedAt: '2026-04-01T10:00:00.000Z',
          }),
        },
      ],
    } as Awaited<ReturnType<typeof getDocs>>);

    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: 'visit-1',
        userId: 'user-123',
        name: 'Visita 01-04-2026 privada',
        date: '2026-04-01',
        mode: 'private',
        createdAt: '2026-04-01T10:00:00.000Z',
        expiresAt: '2026-04-15T10:00:00.000Z',
      }),
    } as Awaited<ReturnType<typeof getDoc>>);

    await syncService.pullRemoteVisitMembershipsAndVisits();

    expect(mockedDb.visitMembers.bulkPut).toHaveBeenCalledTimes(1);
    const members = mockedDb.visitMembers.bulkPut.mock.calls[0][0] as { id: string }[];
    expect(members[0]?.id).toBe('visit-1:user-123');
    expect(mockedDb.visits.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'visit-1',
        expiresAt: new Date('2026-04-15T10:00:00.000Z'),
      })
    );
    expect(mockedTriggerCurrentUserTagStatsRebuild).toHaveBeenCalledTimes(1);
  });

  it('aplica fallback de expiresAt quando remoto não possui o campo', async () => {
    setupDefaults();

    mockedGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'user-123',
          data: () => ({
            id: 'visit-1:user-123',
            visitId: 'visit-1',
            userId: 'user-123',
            role: 'owner',
            status: 'active',
            createdAt: '2026-04-01T10:00:00.000Z',
          }),
        },
      ],
    } as Awaited<ReturnType<typeof getDocs>>);

    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: 'visit-1',
        userId: 'user-123',
        name: 'Visita 01-04-2026 privada',
        date: '2026-04-01',
        mode: 'private',
        createdAt: '2026-04-01T10:00:00.000Z',
      }),
    } as Awaited<ReturnType<typeof getDoc>>);

    await syncService.pullRemoteVisitMembershipsAndVisits();

    expect(mockedDb.visits.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'visit-1',
        expiresAt: new Date('2026-04-15T10:00:00.000Z'),
      })
    );
  });

  it('reconcilia memberships removidos limpando visita local', async () => {
    setupDefaults();

    mockedGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'user-123',
          data: () => ({
            id: 'visit-1:user-123',
            visitId: 'visit-1',
            userId: 'user-123',
            role: 'viewer',
            status: 'removed',
            createdAt: '2026-04-01T10:00:00.000Z',
            updatedAt: '2026-04-01T10:00:00.000Z',
          }),
        },
      ],
    } as Awaited<ReturnType<typeof getDocs>>);

    await syncService.pullRemoteVisitMembershipsAndVisits();

    expect(mockedDb.visitMembers.bulkPut).toHaveBeenCalledTimes(1);
    expect(mockedGetDoc).not.toHaveBeenCalled();
    expect(mockedDb.visits.put).not.toHaveBeenCalled();
  });

  it('continua em modo best-effort quando uma visita falha', async () => {
    setupDefaults();

    mockedGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'user-123',
          data: () => ({
            id: 'visit-1:user-123',
            visitId: 'visit-1',
            userId: 'user-123',
            role: 'owner',
            status: 'active',
            createdAt: '2026-04-01T10:00:00.000Z',
          }),
        },
        {
          id: 'user-123',
          data: () => ({
            id: 'visit-2:user-123',
            visitId: 'visit-2',
            userId: 'user-123',
            role: 'owner',
            status: 'active',
            createdAt: '2026-04-01T10:00:00.000Z',
          }),
        },
      ],
    } as Awaited<ReturnType<typeof getDocs>>);

    mockedGetDoc
      .mockRejectedValueOnce(new Error('firestore unavailable for visit-1'))
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'visit-2',
          userId: 'user-123',
          name: 'Visita 02-04-2026 privada',
          date: '2026-04-02',
          mode: 'private',
          createdAt: '2026-04-02T10:00:00.000Z',
        }),
      } as Awaited<ReturnType<typeof getDoc>>);

    await syncService.pullRemoteVisitMembershipsAndVisits();

    expect(mockedDb.visitMembers.bulkPut).toHaveBeenCalledTimes(1);
    expect(mockedDb.visits.put).toHaveBeenCalledTimes(1);
    expect(mockedDb.visits.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'visit-2' }));
  });

  it('remove dados locais completos quando membership remoto está removed', async () => {
    setupDefaults();

    const notesDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-removed' ? 1 : 0));
    const membersDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-removed' ? 1 : 0));
    const invitesDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-removed' ? 1 : 0));

    mockedDb.notes.where.mockImplementationOnce((index: string) => {
      if (index !== 'visitId') {
        return { equals: vi.fn() };
      }

      return {
        equals: vi.fn((visitId: string) => ({
          delete: () => notesDeleteByVisitId(visitId),
        })),
      };
    });

    mockedDb.visitMembers.where.mockImplementation((index: string) => {
      if (index === 'userId') {
        return {
          equals: vi.fn(() => ({
            toArray: vi.fn().mockResolvedValue([
              {
                id: 'visit-removed:user-123',
                visitId: 'visit-removed',
                userId: 'user-123',
                role: 'viewer',
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
          })),
        };
      }

      if (index === 'visitId') {
        return {
          equals: vi.fn((visitId: string) => ({
            delete: () => membersDeleteByVisitId(visitId),
          })),
        };
      }

      return {
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(0),
        })),
      };
    });

    mockedDb.visitInvites.where.mockImplementationOnce((index: string) => {
      if (index !== 'visitId') {
        return { equals: vi.fn() };
      }

      return {
        equals: vi.fn((visitId: string) => ({
          delete: () => invitesDeleteByVisitId(visitId),
        })),
      };
    });

    mockedDb.syncQueue.where.mockImplementationOnce(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    }));

    mockedGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'user-123',
          data: () => ({
            id: 'visit-removed:user-123',
            visitId: 'visit-removed',
            userId: 'user-123',
            role: 'viewer',
            status: 'removed',
            createdAt: '2026-04-01T10:00:00.000Z',
          }),
        },
      ],
    } as Awaited<ReturnType<typeof getDocs>>);

    await syncService.pullRemoteVisitMembershipsAndVisits();

    expect(notesDeleteByVisitId).toHaveBeenCalledWith('visit-removed');
    expect(membersDeleteByVisitId).toHaveBeenCalledWith('visit-removed');
    expect(invitesDeleteByVisitId).toHaveBeenCalledWith('visit-removed');
    expect(mockedDb.visits.delete).toHaveBeenCalledWith('visit-removed');
  });
});

describe('sync-service - pullRemoteNotes', () => {
  const mockedGetAuthState = vi.mocked(getAuthState);
  const mockedGetFirebaseFirestore = vi.mocked(getFirebaseFirestore);
  const mockedGetDocs = vi.mocked(getDocs);
  const mockedTriggerCurrentUserTagStatsRebuild = vi.mocked(triggerCurrentUserTagStatsRebuild);

  it('dispara rebuild best-effort após hidratar notas remotas', async () => {
    vi.clearAllMocks();

    const mockedDb = db as unknown as {
      notes: {
        get: ReturnType<typeof vi.fn>;
        bulkPut: ReturnType<typeof vi.fn>;
        where: ReturnType<typeof vi.fn>;
        bulkDelete: ReturnType<typeof vi.fn>;
      };
      visitMembers: {
        where: ReturnType<typeof vi.fn>;
      };
    };

    mockedGetAuthState.mockReturnValue({
      user: { uid: 'user-123' } as ReturnType<typeof getAuthState>['user'],
      loading: false,
      error: null,
    });
    mockedGetFirebaseFirestore.mockReturnValue({} as ReturnType<typeof getFirebaseFirestore>);

    mockedDb.visitMembers.where.mockImplementationOnce(() => ({
      toArray: vi.fn().mockResolvedValue([]),
    }));

    mockedDb.notes.where.mockImplementationOnce(() => ({
      toArray: vi.fn().mockResolvedValue([]),
    }));

    mockedGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'note-remote-1',
          data: () => ({
            visitId: 'visit-1',
            date: '2026-04-08',
            bed: '01',
            note: 'Nota remota',
            tags: ['UTI'],
            createdAt: '2026-04-08T10:00:00.000Z',
            expiresAt: '2026-04-22T10:00:00.000Z',
          }),
        },
      ],
    } as Awaited<ReturnType<typeof getDocs>>);

    await syncService.pullRemoteNotes();

    expect(mockedDb.notes.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'note-remote-1',
          tags: ['UTI'],
        }),
      ])
    );
    expect(mockedTriggerCurrentUserTagStatsRebuild).toHaveBeenCalledTimes(1);
  });
});

describe('sync-service - removeVisitDataLocallyByVisitId', () => {
  it('limpa visita, notas, members, invites e itens da fila ligados ao visitId', async () => {
    const mockedDb = db as unknown as {
      transaction: ReturnType<typeof vi.fn>;
      notes: { where: ReturnType<typeof vi.fn> };
      visitMembers: { where: ReturnType<typeof vi.fn> };
      visitInvites: { where: ReturnType<typeof vi.fn> };
      visits: { delete: ReturnType<typeof vi.fn> };
      syncQueue: { where: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    };

    const notesDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-clean' ? 2 : 0));
    const membersDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-clean' ? 1 : 0));
    const invitesDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-clean' ? 1 : 0));

    mockedDb.notes.where.mockImplementationOnce(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => notesDeleteByVisitId(visitId),
      })),
    }));

    mockedDb.visitMembers.where.mockImplementationOnce(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => membersDeleteByVisitId(visitId),
      })),
    }));

    mockedDb.visitInvites.where.mockImplementationOnce(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => invitesDeleteByVisitId(visitId),
      })),
    }));

    mockedDb.syncQueue.where.mockImplementationOnce(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            id: 'queue-visit',
            userId: 'user-123',
            operation: 'update',
            entityType: 'visit',
            entityId: 'visit-clean',
            payload: '{}',
            createdAt: new Date(),
            retryCount: 0,
          },
          {
            id: 'queue-member',
            userId: 'user-123',
            operation: 'update',
            entityType: 'visit-member',
            entityId: 'visit-clean:user-123',
            payload: '{}',
            createdAt: new Date(),
            retryCount: 0,
          },
          {
            id: 'queue-other',
            userId: 'user-123',
            operation: 'update',
            entityType: 'visit',
            entityId: 'visit-other',
            payload: '{}',
            createdAt: new Date(),
            retryCount: 0,
          },
        ]),
      })),
    }));

    await syncService.removeVisitDataLocallyByVisitId('visit-clean', 'user-123');

    expect(notesDeleteByVisitId).toHaveBeenCalledWith('visit-clean');
    expect(membersDeleteByVisitId).toHaveBeenCalledWith('visit-clean');
    expect(invitesDeleteByVisitId).toHaveBeenCalledWith('visit-clean');
    expect(mockedDb.syncQueue.delete).toHaveBeenCalledWith('queue-visit');
    expect(mockedDb.syncQueue.delete).toHaveBeenCalledWith('queue-member');
    expect(mockedDb.syncQueue.delete).not.toHaveBeenCalledWith('queue-other');
    expect(mockedDb.visits.delete).toHaveBeenCalledWith('visit-clean');
  });
});

describe('sync-service - syncNow hardening para visita removida remotamente', () => {
  const mockedGetAuthState = vi.mocked(getAuthState);
  const mockedGetFirebaseFirestore = vi.mocked(getFirebaseFirestore);
  const mockedSetDoc = vi.mocked(setDoc);

  it('descarta apenas item visit:update com permission-denied sem purge local', async () => {
    vi.clearAllMocks();

    const mockedDb = db as unknown as {
      transaction: ReturnType<typeof vi.fn>;
      notes: { where: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      visits: { delete: ReturnType<typeof vi.fn> };
      visitMembers: { where: ReturnType<typeof vi.fn> };
      visitInvites: { where: ReturnType<typeof vi.fn> };
      syncQueue: {
        where: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
    };

    mockedGetAuthState.mockReturnValue({
      user: { uid: 'user-123' } as ReturnType<typeof getAuthState>['user'],
      loading: false,
      error: null,
    });
    mockedGetFirebaseFirestore.mockReturnValue({} as ReturnType<typeof getFirebaseFirestore>);

    const visitQueueItem: SyncQueueItem = {
      id: 'queue-visit-editor',
      userId: 'user-123',
      operation: 'update',
      entityType: 'visit',
      entityId: 'visit-shared',
      payload: JSON.stringify({
        id: 'visit-shared',
        userId: 'user-123',
        name: 'Visita compartilhada',
        date: '2026-04-07',
        mode: 'group',
        createdAt: '2026-04-07T10:00:00.000Z',
        expiresAt: '2026-04-15T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:00.000Z',
      }),
      createdAt: new Date('2026-04-07T10:00:00.000Z'),
      retryCount: 0,
    };

    const queueItems = [visitQueueItem];
    const existingQueueIds = new Set(queueItems.map((item) => item.id));

    mockedDb.syncQueue.where.mockImplementation(() => ({
      equals: vi.fn(() => ({
        sortBy: vi.fn().mockResolvedValue(queueItems),
        toArray: vi.fn().mockResolvedValue(
          queueItems.filter((item) => existingQueueIds.has(item.id))
        ),
      })),
    }));

    mockedDb.syncQueue.get.mockImplementation(((itemId: string) => (
      queueItems.find((item) => item.id === itemId && existingQueueIds.has(item.id))
    )) as never);

    mockedDb.syncQueue.delete.mockImplementation((itemId: string) => {
      existingQueueIds.delete(itemId);
    });

    mockedDb.syncQueue.count.mockResolvedValue(0);

    const notesDeleteByVisitId = vi.fn((_visitId: string) => Promise.resolve(0));
    const membersDeleteByVisitId = vi.fn((_visitId: string) => Promise.resolve(0));
    const invitesDeleteByVisitId = vi.fn((_visitId: string) => Promise.resolve(0));

    mockedDb.notes.where.mockImplementation(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => notesDeleteByVisitId(visitId),
      })),
    }));

    mockedDb.visitMembers.where.mockImplementation(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => membersDeleteByVisitId(visitId),
      })),
    }));

    mockedDb.visitInvites.where.mockImplementation(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => invitesDeleteByVisitId(visitId),
      })),
    }));

    mockedSetDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await syncService.syncNow();

    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
    expect(notesDeleteByVisitId).not.toHaveBeenCalled();
    expect(membersDeleteByVisitId).not.toHaveBeenCalled();
    expect(invitesDeleteByVisitId).not.toHaveBeenCalled();
    expect(mockedDb.visits.delete).not.toHaveBeenCalled();
    expect(mockedDb.syncQueue.delete).toHaveBeenCalledWith('queue-visit-editor');
    expect(mockedDb.syncQueue.update).not.toHaveBeenCalled();
    expect(existingQueueIds.size).toBe(0);
  });

  it('descarta dados locais e fila da visita sem retry inútil quando recebe not-found', async () => {
    vi.clearAllMocks();

    const mockedDb = db as unknown as {
      transaction: ReturnType<typeof vi.fn>;
      notes: { where: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      visits: { delete: ReturnType<typeof vi.fn> };
      visitMembers: { where: ReturnType<typeof vi.fn> };
      visitInvites: { where: ReturnType<typeof vi.fn> };
      syncQueue: {
        where: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
    };

    mockedGetAuthState.mockReturnValue({
      user: { uid: 'user-123' } as ReturnType<typeof getAuthState>['user'],
      loading: false,
      error: null,
    });
    mockedGetFirebaseFirestore.mockReturnValue({} as ReturnType<typeof getFirebaseFirestore>);

    const visitQueueItemA: SyncQueueItem = {
      id: 'queue-visit-a',
      userId: 'user-123',
      operation: 'update',
      entityType: 'visit',
      entityId: 'visit-removed',
      payload: JSON.stringify({
        id: 'visit-removed',
        userId: 'user-123',
        name: 'Visita removida',
        date: '2026-04-07',
        mode: 'group',
        createdAt: '2026-04-07T10:00:00.000Z',
        expiresAt: '2026-04-15T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:00.000Z',
      }),
      createdAt: new Date('2026-04-07T10:00:00.000Z'),
      retryCount: 0,
    };

    const visitQueueItemB: SyncQueueItem = {
      id: 'queue-member-b',
      userId: 'user-123',
      operation: 'update',
      entityType: 'visit-member',
      entityId: 'visit-removed:user-123',
      payload: JSON.stringify({
        id: 'visit-removed:user-123',
        visitId: 'visit-removed',
        userId: 'user-123',
        role: 'editor',
        status: 'active',
        createdAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:00.000Z',
      }),
      createdAt: new Date('2026-04-07T10:01:00.000Z'),
      retryCount: 0,
    };

    const queueItems = [visitQueueItemA, visitQueueItemB];
    const existingQueueIds = new Set(queueItems.map((item) => item.id));

    mockedDb.syncQueue.where.mockImplementation(() => ({
      equals: vi.fn(() => ({
        sortBy: vi.fn().mockResolvedValue(queueItems),
        toArray: vi.fn().mockResolvedValue(
          queueItems.filter((item) => existingQueueIds.has(item.id))
        ),
      })),
    }));

    mockedDb.syncQueue.get.mockImplementation(((itemId: string) => (
      queueItems.find((item) => item.id === itemId && existingQueueIds.has(item.id))
    )) as never);

    mockedDb.syncQueue.delete.mockImplementation((itemId: string) => {
      existingQueueIds.delete(itemId);
    });

    mockedDb.syncQueue.count.mockResolvedValue(0);

    const notesDeleteByVisitId = vi.fn((_visitId: string) => Promise.resolve(0));
    const membersDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-removed' ? 1 : 0));
    const invitesDeleteByVisitId = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-removed' ? 1 : 0));

    mockedDb.notes.where.mockImplementation(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => notesDeleteByVisitId(visitId),
      })),
    }));

    mockedDb.visitMembers.where.mockImplementation(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => membersDeleteByVisitId(visitId),
      })),
    }));

    mockedDb.visitInvites.where.mockImplementation(() => ({
      equals: vi.fn((visitId: string) => ({
        delete: () => invitesDeleteByVisitId(visitId),
      })),
    }));

    mockedSetDoc.mockRejectedValueOnce(new Error('not-found'));

    await syncService.syncNow();

    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
    expect(notesDeleteByVisitId).toHaveBeenCalledWith('visit-removed');
    expect(membersDeleteByVisitId).toHaveBeenCalledWith('visit-removed');
    expect(invitesDeleteByVisitId).toHaveBeenCalledWith('visit-removed');
    expect(mockedDb.visits.delete).toHaveBeenCalledWith('visit-removed');
    expect(mockedDb.syncQueue.delete).toHaveBeenCalledWith('queue-visit-a');
    expect(mockedDb.syncQueue.delete).toHaveBeenCalledWith('queue-member-b');
    expect(mockedDb.syncQueue.update).not.toHaveBeenCalled();
    expect(existingQueueIds.size).toBe(0);
  });
});

describe('sync-service - serializeVisitForFirestore', () => {
  it('serializa visit.expiresAt para Firestore', () => {
    const visit = {
      id: 'visit-1',
      userId: 'user-123',
      name: 'Visita A',
      date: '2026-04-01',
      mode: 'private' as const,
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
      expiresAt: new Date('2026-04-15T10:00:00.000Z'),
      updatedAt: new Date('2026-04-01T11:00:00.000Z'),
    };

    const serialized = syncService.serializeVisitForFirestore(visit);

    expect(serialized.createdAt).toBe('2026-04-01T10:00:00.000Z');
    expect(serialized.expiresAt).toBe('2026-04-15T10:00:00.000Z');
    expect(serialized.updatedAt).toBe('2026-04-01T11:00:00.000Z');
  });
});

describe('sync-service - serializeNoteForFirestore', () => {
  // Nota válida com campos Date
  const makeNote = (): import('@/models/note').Note => ({
    id: 'note-1',
    userId: 'user-123',
    visitId: 'visit-1',
    date: '2026-04-02',
    bed: '01',
    reference: 'Paciente Teste',
    note: 'Nota de teste',
    tags: ['tag1', 'tag2'],
    syncStatus: 'pending',
    createdAt: new Date('2026-04-02T10:00:00.000Z'),
    updatedAt: new Date('2026-04-02T11:00:00.000Z'),
    expiresAt: new Date('2026-04-16T10:00:00.000Z'),
  });

  it('deve preservar Date válido quando já vem como Date', () => {
    const note = makeNote();
    const result = syncService.serializeNoteForFirestore(note);

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2026-04-02T10:00:00.000Z');
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('deve converter strings ISO para Date corretamente', () => {
    // Nota com strings ISO (como viria do JSON.parse pós-falha)
    const note = {
      id: 'note-1',
      userId: 'user-123',
      visitId: 'visit-1',
      date: '2026-04-02',
      bed: '01',
      reference: 'Paciente Teste',
      note: 'Nota de teste',
      tags: ['tag1', 'tag2'],
      syncStatus: 'pending',
      createdAt: '2026-04-02T10:00:00.000Z',
      updatedAt: '2026-04-02T11:00:00.000Z',
      expiresAt: '2026-04-16T10:00:00.000Z',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = syncService.serializeNoteForFirestore(note as unknown as Note);

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2026-04-02T10:00:00.000Z');
    expect(result.updatedAt).toBeDefined();
    expect(result.updatedAt?.toISOString()).toBe('2026-04-02T11:00:00.000Z');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.toISOString()).toBe('2026-04-16T10:00:00.000Z');
  });

  it('deve aplicar fallback seguro para campos ausentes', () => {
    const note = {
      id: 'note-1',
      userId: 'user-123',
      visitId: 'visit-1',
      date: '2026-04-02',
      bed: '01',
      reference: undefined,
      note: 'Nota de teste',
      tags: undefined,
      syncStatus: 'pending',
      createdAt: undefined as unknown as Date,
      updatedAt: undefined,
      expiresAt: undefined as unknown as Date,
      syncedAt: undefined,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = syncService.serializeNoteForFirestore(note as unknown as Note);

    // Deve usar fallback (data atual) para campos ausentes
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('deve aplicar fallback seguro para campos inválidos', () => {
    const note = {
      id: 'note-1',
      userId: 'user-123',
      visitId: 'visit-1',
      date: '2026-04-02',
      bed: '01',
      reference: 'Paciente Teste',
      note: 'Nota de teste',
      tags: ['tag1', 'tag2'],
      syncStatus: 'pending',
      createdAt: 'invalid-date',
      updatedAt: 'invalid-date',
      expiresAt: 'invalid-date',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = syncService.serializeNoteForFirestore(note as unknown as Note);

    // Deve usar fallback para datas inválidas
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('deve manter campos não-data intactos', () => {
    const note = makeNote();
    const result = syncService.serializeNoteForFirestore(note);

    expect(result.id).toBe('note-1');
    expect(result.userId).toBe('user-123');
    expect(result.visitId).toBe('visit-1');
    expect(result.date).toBe('2026-04-02');
    expect(result.bed).toBe('01');
    expect(result.reference).toBe('Paciente Teste');
    expect(result.note).toBe('Nota de teste');
    expect(result.tags).toEqual(['tag1', 'tag2']);
    expect(result.syncStatus).toBe('pending');
  });

  it('deve serializar syncedAt quando presente', () => {
    const note = {
      ...makeNote(),
      syncedAt: new Date('2026-04-02T12:00:00.000Z'),
    };
    const result = syncService.serializeNoteForFirestore(note);

    expect(result.syncedAt).toBeInstanceOf(Date);
    expect(result.syncedAt?.toISOString()).toBe('2026-04-02T12:00:00.000Z');
  });

  it('deve converter syncedAt de string ISO para Date', () => {
    const note = {
      ...makeNote(),
      syncedAt: '2026-04-02T12:00:00.000Z',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = syncService.serializeNoteForFirestore(note as unknown as Note);

    expect(result.syncedAt).toBeInstanceOf(Date);
    expect(result.syncedAt?.toISOString()).toBe('2026-04-02T12:00:00.000Z');
  });

  it('deve preservar undefined para updatedAt quando não existir', () => {
    const note = {
      ...makeNote(),
      updatedAt: undefined,
    };
    const result = syncService.serializeNoteForFirestore(note);

    expect(result.updatedAt).toBeUndefined();
  });

  it('não deve incluir chaves undefined no payload serializado', () => {
    const note = {
      ...makeNote(),
      reference: undefined,
      tags: undefined,
      updatedAt: undefined,
      syncedAt: undefined,
    };

    const result = syncService.serializeNoteForFirestore(note);

    expect(Object.hasOwn(result, 'reference')).toBe(false);
    expect(Object.hasOwn(result, 'tags')).toBe(false);
    expect(Object.hasOwn(result, 'updatedAt')).toBe(false);
    expect(Object.hasOwn(result, 'syncedAt')).toBe(false);
  });
});
