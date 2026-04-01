/**
 * Visit Members Service
 * Serviço de persistência de membros de visitas
 */

import { db } from './dexie-db';
import { canManageMembers } from '@/services/auth/visit-permissions';

/**
 * Status retornado pela operação de remoção de membro
 */
export type RemoveVisitMemberStatus =
  | 'removed'
  | 'forbidden'
  | 'target-not-found'
  | 'cannot-remove-owner'
  | 'cannot-remove-self';

/**
 * Resultado da operação de remoção de membro
 */
export interface RemoveVisitMemberResult {
  status: RemoveVisitMemberStatus;
  visitId: string;
  targetUserId: string;
}
import { createVisitMember, type VisitMember } from '@/models/visit-member';
import { getAuthState } from '@/services/auth/auth-service';

/**
 * Obtém o ID do usuário atual ou lança erro se não autenticado
 */
function requireUserId(): string {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado.');
  }

  return user.uid;
}

/**
 * Salva ou atualiza um membro de visita
 */
export async function upsertVisitMember(member: VisitMember): Promise<void> {
  await db.visitMembers.put(member);
}

/**
 * Busca um membro específico de uma visita
 */
export async function getVisitMember(visitId: string, userId: string): Promise<VisitMember | undefined> {
  const memberId = `${visitId}:${userId}`;
  return db.visitMembers.get(memberId);
}

/**
 * Busca o membro atual (usuário logado) de uma visita
 */
export async function getCurrentUserVisitMember(visitId: string): Promise<VisitMember | undefined> {
  const userId = requireUserId();
  return getVisitMember(visitId, userId);
}

/**
 * Lista todos os membros de uma visita (ativos e removidos)
 */
export async function listVisitMembers(visitId: string): Promise<VisitMember[]> {
  return db.visitMembers.where('visitId').equals(visitId).toArray();
}

/**
 * Cria o membership do owner ao criar uma visita privada
 * Usado em transação atômica com a criação da visita
 */
export function createOwnerVisitMember(visitId: string, userId: string): VisitMember {
  return createVisitMember(visitId, userId, 'owner');
}

/**
 * Remove um membro de visita (apenas owner pode fazer isso)
 * @param visitId - ID da visita
 * @param targetUserId - ID do usuário a ser removido
 * @returns Resultado da operação
 */
export async function removeVisitMemberAsOwner(
  visitId: string,
  targetUserId: string
): Promise<RemoveVisitMemberResult> {
  // 1. Usuário atual deve estar autenticado
  const currentUserId = requireUserId();

  // 2. Verificar se o usuário atual tem permissão de gerenciar membros
  const currentMember = await getVisitMember(visitId, currentUserId);

  if (!currentMember || !canManageMembers(currentMember)) {
    return { status: 'forbidden', visitId, targetUserId };
  }

  // 3. Buscar membership do alvo
  const targetMember = await getVisitMember(visitId, targetUserId);

  if (!targetMember) {
    return { status: 'target-not-found', visitId, targetUserId };
  }

  // 4. Não permitir auto-remoção
  if (targetUserId === currentUserId) {
    return { status: 'cannot-remove-self', visitId, targetUserId };
  }

  // 5. Não permitir remover owner
  if (targetMember.role === 'owner') {
    return { status: 'cannot-remove-owner', visitId, targetUserId };
  }

  // 6. Remover membro: marcar como removido com timestamps
  const now = new Date();
  const updatedMember: VisitMember = {
    ...targetMember,
    status: 'removed',
    removedAt: now,
    updatedAt: now,
  };

  await db.visitMembers.put(updatedMember);

  return { status: 'removed', visitId, targetUserId };
}
