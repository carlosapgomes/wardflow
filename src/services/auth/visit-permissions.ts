/**
 * Visit Permissions Service
 * Funções puras de autorização para visitas colaborativas
 */

import type { VisitMember } from '@/models/visit-member';
import { isActiveMember } from '@/models/visit-member';

/**
 * Verifica se o membro pode visualizar a visita
 */
export function canViewVisit(member: VisitMember): boolean {
  return isActiveMember(member);
}

/**
 * Verifica se o membro pode editar notas da visita
 */
export function canEditNote(member: VisitMember): boolean {
  if (!isActiveMember(member)) return false;
  return member.role === 'owner' || member.role === 'editor';
}

/**
 * Verifica se o membro pode deletar notas da visita
 */
export function canDeleteNote(member: VisitMember): boolean {
  if (!isActiveMember(member)) return false;
  return member.role === 'owner' || member.role === 'editor';
}

/**
 * Verifica se o membro pode gerenciar membros da visita
 * (adicionar, remover membros)
 */
export function canManageMembers(member: VisitMember): boolean {
  if (!isActiveMember(member)) return false;
  return member.role === 'owner';
}

/**
 * Verifica se o membro pode gerenciar convites da visita
 * (criar, revogar convites)
 */
export function canManageInvites(member: VisitMember): boolean {
  if (!isActiveMember(member)) return false;
  return member.role === 'owner';
}

/**
 * Verifica se o membro pode duplicar a visita
 */
export function canDuplicateVisit(member: VisitMember): boolean {
  return isActiveMember(member);
}
