/**
 * Testes para visit-permissions service
 */

import { describe, it, expect } from 'vitest';
import type { VisitMember } from '@/models/visit-member';
import {
  canViewVisit,
  canEditNote,
  canDeleteNote,
  canManageMembers,
  canManageInvites,
  canDuplicateVisit,
  getVisitAccessState,
} from '@/services/auth/visit-permissions';

function createMember(role: 'owner' | 'editor' | 'viewer', status: 'active' | 'removed' = 'active'): VisitMember {
  return {
    id: `v1:u1`,
    visitId: 'v1',
    userId: 'u1',
    role,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(status === 'removed' ? { removedAt: new Date() } : {}),
  };
}

describe('visit-permissions - canViewVisit', () => {
  it('owner ativo pode visualizar', () => {
    expect(canViewVisit(createMember('owner'))).toBe(true);
  });

  it('editor ativo pode visualizar', () => {
    expect(canViewVisit(createMember('editor'))).toBe(true);
  });

  it('viewer ativo pode visualizar', () => {
    expect(canViewVisit(createMember('viewer'))).toBe(true);
  });

  it('membro removido não pode visualizar', () => {
    expect(canViewVisit(createMember('owner', 'removed'))).toBe(false);
    expect(canViewVisit(createMember('editor', 'removed'))).toBe(false);
    expect(canViewVisit(createMember('viewer', 'removed'))).toBe(false);
  });
});

describe('visit-permissions - canEditNote', () => {
  it('owner pode editar nota', () => {
    expect(canEditNote(createMember('owner'))).toBe(true);
  });

  it('editor pode editar nota', () => {
    expect(canEditNote(createMember('editor'))).toBe(true);
  });

  it('viewer não pode editar nota', () => {
    expect(canEditNote(createMember('viewer'))).toBe(false);
  });

  it('membro removido não pode editar nota', () => {
    expect(canEditNote(createMember('owner', 'removed'))).toBe(false);
    expect(canEditNote(createMember('editor', 'removed'))).toBe(false);
    expect(canEditNote(createMember('viewer', 'removed'))).toBe(false);
  });
});

describe('visit-permissions - canDeleteNote', () => {
  it('owner pode deletar nota', () => {
    expect(canDeleteNote(createMember('owner'))).toBe(true);
  });

  it('editor pode deletar nota', () => {
    expect(canDeleteNote(createMember('editor'))).toBe(true);
  });

  it('viewer não pode deletar nota', () => {
    expect(canDeleteNote(createMember('viewer'))).toBe(false);
  });

  it('membro removido não pode deletar nota', () => {
    expect(canDeleteNote(createMember('owner', 'removed'))).toBe(false);
    expect(canDeleteNote(createMember('editor', 'removed'))).toBe(false);
    expect(canDeleteNote(createMember('viewer', 'removed'))).toBe(false);
  });
});

describe('visit-permissions - canManageMembers', () => {
  it('owner pode gerenciar membros', () => {
    expect(canManageMembers(createMember('owner'))).toBe(true);
  });

  it('editor não pode gerenciar membros', () => {
    expect(canManageMembers(createMember('editor'))).toBe(false);
  });

  it('viewer não pode gerenciar membros', () => {
    expect(canManageMembers(createMember('viewer'))).toBe(false);
  });

  it('membro removido não pode gerenciar membros', () => {
    expect(canManageMembers(createMember('owner', 'removed'))).toBe(false);
  });
});

describe('visit-permissions - canManageInvites', () => {
  it('owner pode gerenciar convites', () => {
    expect(canManageInvites(createMember('owner'))).toBe(true);
  });

  it('editor não pode gerenciar convites', () => {
    expect(canManageInvites(createMember('editor'))).toBe(false);
  });

  it('viewer não pode gerenciar convites', () => {
    expect(canManageInvites(createMember('viewer'))).toBe(false);
  });

  it('membro removido não pode gerenciar convites', () => {
    expect(canManageInvites(createMember('owner', 'removed'))).toBe(false);
  });
});

describe('visit-permissions - canDuplicateVisit', () => {
  it('owner pode duplicar visita', () => {
    expect(canDuplicateVisit(createMember('owner'))).toBe(true);
  });

  it('editor pode duplicar visita', () => {
    expect(canDuplicateVisit(createMember('editor'))).toBe(true);
  });

  it('viewer pode duplicar visita', () => {
    expect(canDuplicateVisit(createMember('viewer'))).toBe(true);
  });

  it('membro removido não pode duplicar visita', () => {
    expect(canDuplicateVisit(createMember('owner', 'removed'))).toBe(false);
    expect(canDuplicateVisit(createMember('editor', 'removed'))).toBe(false);
    expect(canDuplicateVisit(createMember('viewer', 'removed'))).toBe(false);
  });
});

describe('visit-permissions - getVisitAccessState', () => {
  it('retorna no-membership quando member é undefined', () => {
    expect(getVisitAccessState(undefined)).toBe('no-membership');
  });

  it('retorna no-membership quando member é null', () => {
    expect(getVisitAccessState(null)).toBe('no-membership');
  });

  it('retorna removed quando member tem status removed', () => {
    expect(getVisitAccessState(createMember('owner', 'removed'))).toBe('removed');
    expect(getVisitAccessState(createMember('editor', 'removed'))).toBe('removed');
    expect(getVisitAccessState(createMember('viewer', 'removed'))).toBe('removed');
  });

  it('retorna active para membros ativos', () => {
    expect(getVisitAccessState(createMember('owner'))).toBe('active');
    expect(getVisitAccessState(createMember('editor'))).toBe('active');
    expect(getVisitAccessState(createMember('viewer'))).toBe('active');
  });
});
