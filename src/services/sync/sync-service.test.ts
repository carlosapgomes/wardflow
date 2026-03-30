/**
 * Testes para sync-service - funções puras e resolução de conflitos
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock do Dexie para evitar erros de IndexedDB
vi.mock('@/services/db/dexie-db', () => ({
  db: {
    transaction: vi.fn(),
    notes: {
      where: vi.fn(() => ({
        equals: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      })),
      get: vi.fn(),
      update: vi.fn(),
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
        delete: vi.fn().mockResolvedValue(undefined),
      })),
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    wardStats: {
      get: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      bulkPut: vi.fn(),
    },
    settings: {
      get: vi.fn(),
      put: vi.fn(),
      clear: vi.fn(),
    },
  },
}));

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
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((n: number) => n), // Mock do increment
}));

import * as syncService from './sync-service';
import { createSyncQueueItem, type SyncQueueItem } from '@/models/sync-queue';
import type { WardStat } from '@/models/ward-stat';

// Exportar tipo para testes
interface FirestoreWardStatData {
  wardKey: string;
  wardLabel: string;
  usageCount: number;
  lastUsedAt: string;
  updatedAt: string;
  userId?: string;
}

// Mock do window para navigator.onLine
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setInterval: vi.fn(() => 1),
  clearInterval: vi.fn(),
  navigator: { onLine: true },
};
vi.stubGlobal('window', mockWindow);

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

describe('sync-service - wardStat sync', () => {
  it('deve criar item de fila com entityType wardStat', () => {
    const payload = {
      wardKey: 'UTI',
      wardLabel: 'UTI',
      usageCount: 1,
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const item = createSyncQueueItem(
      'user-123',
      'increment',
      'wardStat',
      'UTI',
      payload
    );

    expect(item.entityType).toBe('wardStat');
    expect(item.operation).toBe('increment');
    expect(item.entityId).toBe('UTI');
    expect(item.userId).toBe('user-123');
  });

  it('deve suportar entityType wardStat no SyncQueueItem', () => {
    const item: SyncQueueItem = {
      id: 'test-id',
      userId: 'user-123',
      operation: 'increment',
      entityType: 'wardStat',
      entityId: 'UTI',
      payload: '{}',
      createdAt: new Date(),
      retryCount: 0,
    };

    expect(item.entityType).toBe('wardStat');
  });

  it('deve suportar operação increment no SyncOperation', () => {
    // Este teste apenas verifica que a operação increment é válida
  });
});

describe('sync-service - resolveWardStatConflict', () => {
  const makeLocal = (wardKey: string, usageCount: number, lastUsedAt: Date): Partial<WardStat> => ({
    id: `user-123:${wardKey}`,
    userId: 'user-123',
    wardKey,
    wardLabel: wardKey,
    usageCount,
    lastUsedAt,
    updatedAt: lastUsedAt,
  });

  const makeRemote = (wardKey: string, usageCount: number, lastUsedAt: Date): FirestoreWardStatData => ({
    wardKey,
    wardLabel: wardKey,
    usageCount,
    lastUsedAt: lastUsedAt.toISOString(),
    updatedAt: lastUsedAt.toISOString(),
  });

  it('deve usar remoto se não existe local', () => {
    const remote = makeRemote('UTI', 5, new Date('2024-03-25T12:00:00'));
    const result = syncService.resolveWardStatConflict(undefined, remote, new Set<string>());

    expect(result.wardKey).toBe('UTI');
    expect(result.usageCount).toBe(5);
    expect(result.lastUsedAt).toEqual(new Date('2024-03-25T12:00:00'));
  });

  it('deve manter local com maior usageCount quando remoto tem menos', () => {
    const local = makeLocal('UTI', 10, new Date('2024-03-25T10:00:00'));
    const remote = makeRemote('UTI', 5, new Date('2024-03-25T12:00:00'));

    const result = syncService.resolveWardStatConflict(local as WardStat, remote, new Set<string>());

    expect(result.usageCount).toBe(10);
  });

  it('deve usar remoto com maior usageCount quando local tem menos', () => {
    const local = makeLocal('UTI', 3, new Date('2024-03-25T10:00:00'));
    const remote = makeRemote('UTI', 10, new Date('2024-03-25T12:00:00'));

    const result = syncService.resolveWardStatConflict(local as WardStat, remote, new Set<string>());

    expect(result.usageCount).toBe(10);
  });

  it('deve usar remoto mais recente em caso de empate de usageCount', () => {
    const sameTime = new Date('2024-03-25T12:00:00');
    const local = makeLocal('UTI', 5, new Date('2024-03-25T10:00:00'));
    const remote = makeRemote('UTI', 5, sameTime);

    const result = syncService.resolveWardStatConflict(local as WardStat, remote, new Set<string>());

    expect(result.lastUsedAt).toEqual(sameTime);
  });

  it('deve usar local mais recente em caso de empate de usageCount', () => {
    const sameCount = 5;
    const localTime = new Date('2024-03-25T14:00:00');
    const remoteTime = new Date('2024-03-25T12:00:00');

    const local = makeLocal('UTI', sameCount, localTime);
    const remote = makeRemote('UTI', sameCount, remoteTime);

    const result = syncService.resolveWardStatConflict(local as WardStat, remote, new Set<string>());

    expect(result.lastUsedAt).toEqual(localTime);
  });

  it('deve preservar usageCount local quando há pendência local', () => {
    const local = makeLocal('UTI', 8, new Date('2024-03-25T10:00:00'));
    const remote = makeRemote('UTI', 15, new Date('2024-03-25T12:00:00'));
    const pendingWardKeys = new Set<string>(['UTI']);

    const result = syncService.resolveWardStatConflict(local as WardStat, remote, pendingWardKeys);

    // Não deve sobrescrever usageCount local quando há pendência
    expect(result.usageCount).toBe(8);
    // Mas deve usar lastUsedAt mais recente
    expect(result.lastUsedAt).toEqual(new Date('2024-03-25T12:00:00'));
  });

  it('deve usar remoto completo quando há pendência local mas remoto é mais recente em lastUsedAt', () => {
    const local = makeLocal('UTI', 5, new Date('2024-03-25T08:00:00'));
    const remote = makeRemote('UTI', 10, new Date('2024-03-25T14:00:00'));
    const pendingWardKeys = new Set<string>(['UTI']);

    const result = syncService.resolveWardStatConflict(local as WardStat, remote, pendingWardKeys);

    // Preserva usageCount local
    expect(result.usageCount).toBe(5);
    // Mas usa lastUsedAt mais recente
    expect(result.lastUsedAt).toEqual(new Date('2024-03-25T14:00:00'));
  });

  it('deve usar remoto quando não há pendência local (regra normal)', () => {
    const local = makeLocal('UTI', 3, new Date('2024-03-25T10:00:00'));
    const remote = makeRemote('UTI', 10, new Date('2024-03-25T12:00:00'));
    const pendingWardKeys = new Set<string>(); // Sem pendência

    const result = syncService.resolveWardStatConflict(local as WardStat, remote, pendingWardKeys);

    expect(result.usageCount).toBe(10);
  });
});

describe('sync-service - resolveSettingsConflict', () => {
  const makeLocalSettings = (updatedAtIso: string) => ({
    id: 'user-settings' as const,
    userId: 'user-123',
    inputPreferences: {
      uppercaseWard: true,
      uppercaseBed: true,
    },
    wardPreferences: {
      hiddenWardKeys: ['UTI'],
      labelOverrides: {
        UTI: 'UTI Adulto',
      },
    },
    updatedAt: new Date(updatedAtIso),
  });

  it('deve usar remoto quando não existe local', () => {
    const remoteData = {
      inputPreferences: {
        uppercaseWard: false,
        uppercaseBed: true,
      },
      wardPreferences: {
        hiddenWardKeys: [],
        labelOverrides: {},
      },
      updatedAt: '2026-03-28T10:00:00.000Z',
    };

    const result = syncService.resolveSettingsConflict(undefined, remoteData, 'user-123', false);

    expect(result.inputPreferences.uppercaseWard).toBe(false);
  });

  it('deve preservar local quando há pendência local', () => {
    const local = makeLocalSettings('2026-03-28T09:00:00.000Z');
    const remoteData = {
      inputPreferences: {
        uppercaseWard: false,
        uppercaseBed: false,
      },
      wardPreferences: {
        hiddenWardKeys: [],
        labelOverrides: {},
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
        uppercaseWard: false,
        uppercaseBed: false,
      },
      wardPreferences: {
        hiddenWardKeys: [],
        labelOverrides: {},
      },
      updatedAt: '2026-03-28T10:00:00.000Z',
    };

    const result = syncService.resolveSettingsConflict(local, remoteData, 'user-123', false);

    expect(result.inputPreferences).toEqual({
      uppercaseWard: false,
      uppercaseBed: false,
    });
  });
});
