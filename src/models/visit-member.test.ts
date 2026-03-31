/**
 * Testes para visit-member model
 */

import { describe, it, expect } from 'vitest';
import { createVisitMember, isActiveMember, type VisitMember } from '@/models/visit-member';

describe('visit-member - createVisitMember', () => {
  it('deve criar membro com valores padrão', () => {
    const member = createVisitMember('visit-1', 'user-1', 'owner');

    expect(member.id).toBe('visit-1:user-1');
    expect(member.visitId).toBe('visit-1');
    expect(member.userId).toBe('user-1');
    expect(member.role).toBe('owner');
    expect(member.status).toBe('active');
    expect(member.createdAt).toBeInstanceOf(Date);
    expect(member.updatedAt).toBeInstanceOf(Date);
    expect(member.removedAt).toBeUndefined();
  });

  it('deve criar membro com role editor', () => {
    const member = createVisitMember('visit-2', 'user-2', 'editor');

    expect(member.role).toBe('editor');
    expect(member.id).toBe('visit-2:user-2');
  });

  it('deve criar membro com role viewer', () => {
    const member = createVisitMember('visit-3', 'user-3', 'viewer');

    expect(member.role).toBe('viewer');
    expect(member.id).toBe('visit-3:user-3');
  });
});

describe('visit-member - isActiveMember', () => {
  it('deve retornar true para membro ativo', () => {
    const member: VisitMember = {
      id: 'v1:u1',
      visitId: 'v1',
      userId: 'u1',
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(isActiveMember(member)).toBe(true);
  });

  it('deve retornar false para membro removido', () => {
    const member: VisitMember = {
      id: 'v1:u1',
      visitId: 'v1',
      userId: 'u1',
      role: 'owner',
      status: 'removed',
      createdAt: new Date(),
      updatedAt: new Date(),
      removedAt: new Date(),
    };

    expect(isActiveMember(member)).toBe(false);
  });
});
