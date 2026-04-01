/**
 * VisitInvites Service
 * Serviço de persistência de convites de visitas
 */

import { db } from './dexie-db';
import { createVisitInvite, isInviteActive, revokeInvite, type VisitInvite, type InviteRole, type CreateVisitInviteInput } from '@/models/visit-invite';
import { createVisitMember, type VisitMember } from '@/models/visit-member';
import { getAuthState } from '@/services/auth/auth-service';
import { getVisitMember } from './visit-members-service';

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
 * Input para criação de convite via serviço
 */
export interface CreateVisitInviteInputService {
  visitId: string;
  role: InviteRole;
  expiresInHours?: number;
}

/**
 * Cria um novo convite para uma visita
 */
export async function createVisitInviteForVisit(input: CreateVisitInviteInputService): Promise<VisitInvite> {
  const createdByUserId = requireUserId();

  const createInput: CreateVisitInviteInput = {
    visitId: input.visitId,
    createdByUserId,
    role: input.role,
    expiresInHours: input.expiresInHours,
  };

  const invite = createVisitInvite(createInput);

  await db.visitInvites.put(invite);

  return invite;
}

/**
 * Lista convites ativos de uma visita (não expirados e não revogados)
 */
export async function listActiveVisitInvites(visitId: string): Promise<VisitInvite[]> {
  const now = new Date();

  const invites = await db.visitInvites.where('visitId').equals(visitId).toArray();

  return invites.filter((invite) => isInviteActive(invite, now));
}

/**
 * Busca um convite pelo token
 */
export async function findInviteByToken(token: string): Promise<VisitInvite | undefined> {
  return db.visitInvites.where('token').equals(token).first();
}

/**
 * Revoga um convite pelo ID
 */
export async function revokeVisitInvite(inviteId: string): Promise<VisitInvite | undefined> {
  const invite = await db.visitInvites.get(inviteId);

  if (!invite) {
    return undefined;
  }

  const revokedInvite = revokeInvite(invite);

  await db.visitInvites.put(revokedInvite);

  return revokedInvite;
}

/**
 * Status possíveis ao aceitar um convite
 */
export type AcceptInviteStatus =
  | 'accepted'
  | 'already-member'
  | 'invite-not-found'
  | 'invite-expired'
  | 'invite-revoked'
  | 'access-revoked';

/**
 * Resultado de aceite de convite
 */
export interface AcceptInviteResult {
  status: AcceptInviteStatus;
  visitId?: string;
}

/**
 * Aceita um convite por token
 * Cria membership ativo quando válido
 * Convite é de uso múltiplo (não é deletado após aceite)
 */
export async function acceptVisitInviteByToken(token: string): Promise<AcceptInviteResult> {
  const userId = requireUserId();
  const now = new Date();

  // 1. Busca convite por token
  const invite = await findInviteByToken(token);

  // 2. Valida convite
  if (!invite) {
    return { status: 'invite-not-found' };
  }

  if (invite.revokedAt) {
    return { status: 'invite-revoked', visitId: invite.visitId };
  }

  if (isInviteActive(invite, now)) {
    // ainda ativo, mas precisa verificar expiração
    const expiresAt = new Date(invite.expiresAt);
    if (now > expiresAt) {
      return { status: 'invite-expired', visitId: invite.visitId };
    }
  } else {
    return { status: 'invite-expired', visitId: invite.visitId };
  }

  // 3. Verifica membership atual
  const existingMember = await getVisitMember(invite.visitId, userId);

  if (existingMember) {
    if (existingMember.status === 'active') {
      return { status: 'already-member', visitId: invite.visitId };
    }
    // status === 'removed'
    return { status: 'access-revoked', visitId: invite.visitId };
  }

  // 4. Cria membership ativo com role do convite
  const newMember: VisitMember = createVisitMember(invite.visitId, userId, invite.role);
  await db.visitMembers.put(newMember);

  return { status: 'accepted', visitId: invite.visitId };
}
