/**
 * Testes para visit-members-service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Factory function para vi.mock
vi.mock('@/services/db/dexie-db', () => {
  return {
    db: {
      visitMembers: {
        put: vi.fn(),
        where: vi.fn(() => ({
          equals: vi.fn(() => ({
            toArray: vi.fn().mockResolvedValue([]),
            first: vi.fn().mockResolvedValue(undefined),
          })),
        })),
        get: vi.fn(),
      },
    },
  };
});

// Mock do auth-service
vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => ({
    user: { uid: 'owner-user-id' },
    loading: false,
    error: null,
  })),
}));

// Mock do visit-permissions
vi.mock('@/services/auth/visit-permissions', () => ({
  canManageMembers: vi.fn(),
}));

import { removeVisitMemberAsOwner } from './visit-members-service';
import { createVisitMember, type VisitMember } from '@/models/visit-member';
import { db } from './dexie-db';
import { canManageMembers } from '@/services/auth/visit-permissions';

// Cast para os mocks para evitar erros de tipo
const mockDb = db as unknown as {
  visitMembers: {
    put: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
};

const mockCanManageMembers = canManageMembers as unknown as ReturnType<typeof vi.fn>;

describe('visit-members-service - removeVisitMemberAsOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock implementations
    (mockDb.visitMembers.get).mockReset();
    mockCanManageMembers.mockReset();
  });

  it('retorna forbidden quando usuário atual não tem membership', async () => {
    (mockDb.visitMembers.get).mockResolvedValue(undefined);

    const result = await removeVisitMemberAsOwner('visit-1', 'target-user-id');

    expect(result.status).toBe('forbidden');
    expect(result.visitId).toBe('visit-1');
    expect(result.targetUserId).toBe('target-user-id');
  });

  it('retorna forbidden quando usuário atual não pode gerenciar membros', async () => {
    const editorMember = createVisitMember('visit-1', 'owner-user-id', 'editor');
    (mockDb.visitMembers.get).mockResolvedValue(editorMember);
    mockCanManageMembers.mockReturnValue(false);

    const result = await removeVisitMemberAsOwner('visit-1', 'target-user-id');

    expect(result.status).toBe('forbidden');
  });

  it('retorna target-not-found quando membro alvo não existe', async () => {
    const ownerMember = createVisitMember('visit-1', 'owner-user-id', 'owner');
    (mockDb.visitMembers.get).mockResolvedValueOnce(ownerMember).mockResolvedValueOnce(undefined);
    mockCanManageMembers.mockReturnValue(true);

    const result = await removeVisitMemberAsOwner('visit-1', 'non-existent-user');

    expect(result.status).toBe('target-not-found');
  });

  it('retorna cannot-remove-self quando owner tenta se remover', async () => {
    const ownerMember = createVisitMember('visit-1', 'owner-user-id', 'owner');
    
    (mockDb.visitMembers.get)
      .mockResolvedValueOnce(ownerMember)  // currentMember lookup
      .mockResolvedValueOnce(ownerMember); // targetMember lookup
    mockCanManageMembers.mockReturnValue(true);

    const result = await removeVisitMemberAsOwner('visit-1', 'owner-user-id');

    expect(result.status).toBe('cannot-remove-self');
  });

  it('retorna cannot-remove-owner quando owner tenta remover outro owner', async () => {
    const ownerMember = createVisitMember('visit-1', 'owner-user-id', 'owner');
    const targetOwnerMember = createVisitMember('visit-1', 'target-owner-id', 'owner');
    
    (mockDb.visitMembers.get)
      .mockResolvedValueOnce(ownerMember)  // currentMember lookup
      .mockResolvedValueOnce(targetOwnerMember); // targetMember lookup
    mockCanManageMembers.mockReturnValue(true);

    const result = await removeVisitMemberAsOwner('visit-1', 'target-owner-id');

    expect(result.status).toBe('cannot-remove-owner');
  });

  it('retorna removed e persiste membro com status removed quando cenário válido', async () => {
    const ownerMember = createVisitMember('visit-1', 'owner-user-id', 'owner');
    const targetMember = createVisitMember('visit-1', 'target-user-id', 'editor');
    
    (mockDb.visitMembers.get).mockResolvedValueOnce(ownerMember).mockResolvedValueOnce(targetMember);
    mockCanManageMembers.mockReturnValue(true);

    const result = await removeVisitMemberAsOwner('visit-1', 'target-user-id');

    expect(result.status).toBe('removed');
    expect(result.visitId).toBe('visit-1');
    expect(result.targetUserId).toBe('target-user-id');

    // Verifica que put foi chamado
    expect(mockDb.visitMembers.put).toHaveBeenCalled();

    const putArg = (mockDb.visitMembers.put).mock.calls[0][0] as VisitMember;
    expect(putArg.status).toBe('removed');
    expect(putArg.removedAt).toBeInstanceOf(Date);
    expect(putArg.updatedAt).toBeInstanceOf(Date);
  });

  it('remove membro com role viewer corretamente', async () => {
    const ownerMember = createVisitMember('visit-1', 'owner-user-id', 'owner');
    const targetMember = createVisitMember('visit-1', 'viewer-user-id', 'viewer');
    
    (mockDb.visitMembers.get).mockResolvedValueOnce(ownerMember).mockResolvedValueOnce(targetMember);
    mockCanManageMembers.mockReturnValue(true);

    const result = await removeVisitMemberAsOwner('visit-1', 'viewer-user-id');

    expect(result.status).toBe('removed');

    const putArg = (mockDb.visitMembers.put).mock.calls[0][0] as VisitMember;
    expect(putArg.status).toBe('removed');
  });
});