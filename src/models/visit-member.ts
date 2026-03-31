/**
 * VisitMember Model
 * Modelo para membros de visitas colaborativas
 */

/**
 * Papéis possíveis para um membro de visita
 */
export type VisitRole = 'owner' | 'editor' | 'viewer';

/**
 * Status do membership
 */
export type MemberStatus = 'active' | 'removed';

/**
 * Representa um membro de uma visita colaborativa
 */
export interface VisitMember {
  /** ID único do membership (sugestão: visitId:userId) */
  id: string;

  /** ID da visita */
  visitId: string;

  /** ID do usuário */
  userId: string;

  /** Papel do membro na visita */
  role: VisitRole;

  /** Status do membership */
  status: MemberStatus;

  /** Data de criação */
  createdAt: Date;

  /** Data de última atualização */
  updatedAt: Date;

  /** Data de remoção (se aplicável) */
  removedAt?: Date;
}

/**
 * Cria um novo VisitMember com valores padrão
 */
export function createVisitMember(
  visitId: string,
  userId: string,
  role: VisitRole
): VisitMember {
  const now = new Date();

  return {
    id: `${visitId}:${userId}`,
    visitId,
    userId,
    role,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Verifica se um membro está ativo
 */
export function isActiveMember(member: VisitMember): boolean {
  return member.status === 'active';
}
