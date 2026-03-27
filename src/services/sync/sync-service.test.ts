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
      })),
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
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
  getDocs: vi.fn(),
}));

import * as syncService from './sync-service';

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
