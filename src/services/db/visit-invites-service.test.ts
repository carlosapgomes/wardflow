/**
 * Testes para visit-invites-service (S11B - Firestore remoto)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock do Firebase Firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'mock-doc-ref'),
  collection: vi.fn(() => 'mock-collection-ref'),
  setDoc: vi.fn(() => Promise.resolve()),
  getDoc: vi.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({
        id: 'invite-1',
        visitId: 'visit-1',
        createdByUserId: 'user-123',
        token: 'invite-1',
        role: 'editor',
        expiresAt: { toDate: () => new Date(Date.now() + 86400000) },
        createdAt: { toDate: () => new Date() },
        updatedAt: { toDate: () => new Date() },
        revokedAt: null,
      }),
    })
  ),
  getDocs: vi.fn(() =>
    Promise.resolve({
      forEach: (callback: (doc: { data: () => Record<string, unknown> }) => void) => {
        callback({
          data: () => ({
            id: 'invite-1',
            visitId: 'visit-1',
            createdByUserId: 'user-123',
            token: 'token-1',
            role: 'editor',
            expiresAt: { toDate: () => new Date(Date.now() + 86400000) },
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() },
            revokedAt: null,
          }),
        });
      },
    })
  ),
  updateDoc: vi.fn(() => Promise.resolve()),
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date }),
  },
}));

vi.mock('@/services/auth/firebase', () => ({
  getFirebaseFirestore: vi.fn(() => ({})),
}));

interface MockUserType {
  uid: string;
  getIdToken: ReturnType<typeof vi.fn>;
}

const mockAuthState: { user: MockUserType | null; loading: boolean; error: string | null } = {
  user: { uid: 'user-123', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
  loading: false,
  error: null,
};

vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => mockAuthState),
}));

vi.mock('./visit-members-service', () => ({
  getVisitMember: vi.fn(),
  getCurrentUserVisitMember: vi.fn(() =>
    Promise.resolve({
      id: 'visit-1:user-123',
      visitId: 'visit-1',
      userId: 'user-123',
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ),
}));

vi.mock('./dexie-db', () => ({
  db: {
    visitInvites: {
      put: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
          first: vi.fn().mockResolvedValue(undefined),
        })),
      })),
      get: vi.fn(),
    },
    visitMembers: {
      put: vi.fn(),
      get: vi.fn(),
    },
  },
}));

import {
  createVisitInviteForVisit,
  listActiveVisitInvites,
  revokeVisitInvite,
  acceptVisitInviteByToken,
  buildVisitInviteLink,
} from './visit-invites-service';
import { getFirebaseFirestore } from '@/services/auth/firebase';
import { db } from './dexie-db';

describe('visit-invites-service - createVisitInviteForVisit (Firestore remoto)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria convite com createdByUserId do usuário logado', async () => {
    const invite = await createVisitInviteForVisit({
      visitId: 'visit-1',
      role: 'editor',
    });

    expect(invite.createdByUserId).toBe('user-123');
    expect(invite.visitId).toBe('visit-1');
    expect(invite.role).toBe('editor');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(db.visitInvites.put).not.toHaveBeenCalled();
  });

  it('cria convite com expiração customizada', async () => {
    const invite = await createVisitInviteForVisit({
      visitId: 'visit-1',
      role: 'viewer',
      expiresInHours: 12,
    });

    const diffHours = (invite.expiresAt.getTime() - invite.createdAt.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(12, 0);
  });

  it('lança erro quando usuário não é owner', async () => {
    const { getCurrentUserVisitMember } = await import('./visit-members-service');
    vi.mocked(getCurrentUserVisitMember).mockResolvedValueOnce({
      id: 'visit-1:user-123',
      visitId: 'visit-1',
      userId: 'user-123',
      role: 'editor',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createVisitInviteForVisit({ visitId: 'visit-1', role: 'editor' })
    ).rejects.toThrow('Apenas o owner pode criar ou revogar convites.');
  });

  it('lança erro quando Firestore não configurado', async () => {
    vi.mocked(getFirebaseFirestore).mockReturnValueOnce(undefined as never);

    await expect(
      createVisitInviteForVisit({ visitId: 'visit-1', role: 'editor' })
    ).rejects.toThrow('Firestore não configurado');
  });
});

describe('visit-invites-service - listActiveVisitInvites (Firestore remoto)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista só convites ativos (não expirados e não revogados)', async () => {
    const result = await listActiveVisitInvites('visit-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('invite-1');
  });

  it('retorna array vazio quando não há convites', async () => {
    const { getDocs } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValueOnce({
      forEach: (_callback: (doc: unknown) => void) => {
        // vazio
      },
    } as never);

    const result = await listActiveVisitInvites('visit-1');

    expect(result).toHaveLength(0);
  });

  it('lança erro quando Firestore não configurado', async () => {
    vi.mocked(getFirebaseFirestore).mockReturnValueOnce(undefined as never);

    await expect(listActiveVisitInvites('visit-1')).rejects.toThrow('Firestore não configurado');
  });
});

describe('visit-invites-service - revokeVisitInvite (Firestore remoto)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revoga convite e persiste quando convite existe', async () => {
    const result = await revokeVisitInvite('invite-1', 'visit-1');

    expect(result).toBeDefined();
    expect(result?.revokedAt).toBeDefined();
  });

  it('retorna undefined quando convite não existe', async () => {
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
    } as never);

    const result = await revokeVisitInvite('non-existent', 'visit-1');

    expect(result).toBeUndefined();
  });

  it('lança erro quando usuário não é owner', async () => {
    const { getCurrentUserVisitMember } = await import('./visit-members-service');
    vi.mocked(getCurrentUserVisitMember).mockResolvedValueOnce({
      id: 'visit-1:user-123',
      visitId: 'visit-1',
      userId: 'user-123',
      role: 'editor',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(revokeVisitInvite('invite-1', 'visit-1')).rejects.toThrow(
      'Apenas o owner pode criar ou revogar convites.'
    );
  });

  it('lança erro quando Firestore não configurado', async () => {
    vi.mocked(getFirebaseFirestore).mockReturnValueOnce(undefined as never);

    await expect(revokeVisitInvite('invite-1', 'visit-1')).rejects.toThrow('Firestore não configurado');
  });
});

describe('visit-invites-service - buildVisitInviteLink', () => {
  it('retorna URL absoluta esperada com origin explícito', () => {
    const link = buildVisitInviteLink('token-123', 'https://wardflow.app');
    expect(link).toBe('https://wardflow.app/convite/token-123');
  });

  it('normaliza origin com barra final', () => {
    const link = buildVisitInviteLink('abc', 'https://wardflow.app/');
    expect(link).toBe('https://wardflow.app/convite/abc');
  });
});

// Testes de acceptVisitInviteByToken usando mock de fetch (endpoint remoto)
describe('visit-invites-service - acceptVisitInviteByToken (endpoint remoto)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    // Reset mockAuthState to have user
    mockAuthState.user = { uid: 'user-123', getIdToken: vi.fn().mockResolvedValue('mock-id-token') };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna invite-not-found quando token não existe', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'invite-not-found' }),
    } as never);

    const result = await acceptVisitInviteByToken('non-existent-token');

    expect(result.status).toBe('invite-not-found');
    expect(result.visitId).toBeUndefined();
  });

  it('retorna invite-revoked quando convite foi revogado', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'invite-revoked', visitId: 'visit-1' }),
    } as never);

    const result = await acceptVisitInviteByToken('some-token');

    expect(result.status).toBe('invite-revoked');
    expect(result.visitId).toBe('visit-1');
  });

  it('retorna invite-expired quando convite expirou', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'invite-expired', visitId: 'visit-1' }),
    } as never);

    const result = await acceptVisitInviteByToken('expired-token');

    expect(result.status).toBe('invite-expired');
    expect(result.visitId).toBe('visit-1');
  });

  it('retorna already-member quando membership já está ativo', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'already-member', visitId: 'visit-1' }),
    } as never);

    const result = await acceptVisitInviteByToken('some-token');

    expect(result.status).toBe('already-member');
    expect(result.visitId).toBe('visit-1');
  });

  it('retorna access-revoked quando membership existente foi removido', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'access-revoked', visitId: 'visit-1' }),
    } as never);

    const result = await acceptVisitInviteByToken('some-token');

    expect(result.status).toBe('access-revoked');
    expect(result.visitId).toBe('visit-1');
  });

  it('retorna accepted quando convite é válido', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'accepted', visitId: 'visit-1' }),
    } as never);

    const result = await acceptVisitInviteByToken('valid-token');

    expect(result.status).toBe('accepted');
    expect(result.visitId).toBe('visit-1');
  });

  it('lança erro quando usuário não autenticado localmente', async () => {
    mockAuthState.user = null;

    await expect(acceptVisitInviteByToken('token')).rejects.toThrow('Usuário não autenticado.');
  });

  it('lança erro quando endpoint retorna 401', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 401,
    } as never);

    await expect(acceptVisitInviteByToken('token')).rejects.toThrow('Usuário não autenticado.');
  });

  it('lança erro quando resposta HTTP é 500', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 500,
    } as never);

    await expect(acceptVisitInviteByToken('token')).rejects.toThrow('Erro no servidor. Tente novamente mais tarde.');
  });

  it('lança erro quando endpoint retorna 429 (rate-limited)', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 429,
      json: () => Promise.resolve({ error: 'rate-limited' }),
    } as never);

    await expect(acceptVisitInviteByToken('token')).rejects.toThrow('Muitas tentativas. Aguarde alguns segundos e tente novamente.');
  });

  it('lança erro quando payload de resposta é inválido', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'invalid-status' }),
    } as never);

    await expect(acceptVisitInviteByToken('token')).rejects.toThrow('Status de convite inválido.');
  });

  it('envia token no body e Authorization header corretamente', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ status: 'accepted', visitId: 'visit-1' }),
    } as never);

    await acceptVisitInviteByToken('test-token-123');

    expect(fetchMock).toHaveBeenCalledWith('/api/invites/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      },
      body: JSON.stringify({ token: 'test-token-123' }),
    });
  });
});
