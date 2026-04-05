/**
 * VisitInvites Service
 * Serviço de persistência de convites de visitas
 * S11E: token hash SHA-256 em repouso, sem token bruto
 */

import { doc, collection, setDoc, getDoc, getDocs, updateDoc, Timestamp, type Firestore } from 'firebase/firestore';

/**
 * Gera hash SHA-256 hex de uma string (Web Crypto API)
 */
export async function sha256Hash(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

import { getFirebaseFirestore } from '@/services/auth/firebase';
import { createVisitInvite, isInviteActive, revokeInvite, type VisitInvite, type InviteRole, type CreateVisitInviteInput } from '@/models/visit-invite';
import { getAuthState } from '@/services/auth/auth-service';
import { getCurrentUserVisitMember } from './visit-members-service';
import { canManageInvites } from '@/services/auth/visit-permissions';

/**
 * Erros do protocolo HTTP
 */
export class InviteAcceptError extends Error {
  constructor(
    message: string,
    public code: 'unauthenticated' | 'invalid-request' | 'method-not-allowed' | 'internal-error' | 'rate-limited'
  ) {
    super(message);
    this.name = 'InviteAcceptError';
  }
}

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
 * Obtém instância do Firestore ou lança erro se não configurado
 */
function requireFirestore(): Firestore {
  const firestore = getFirebaseFirestore();
  if (!firestore) {
    throw new Error('Firestore não configurado. Configure as credenciais do Firebase em src/config/env.ts');
  }
  return firestore;
}

/**
 * Converte Date para Timestamp Firestore
 */
function dateToFirestoreTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

/**
 * Converte Timestamp Firestore para Date
 */
function firestoreTimestampToDate(timestamp: Timestamp | null | undefined): Date {
  if (!timestamp) {
    return new Date();
  }
  return timestamp.toDate();
}

/**
 * Serializa VisitInvite para persistência no Firestore
 * Converte campos Date para Timestamp
 * S11E: persiste tokenHash (SHA-256), não token bruto
 */
function serializeVisitInviteForFirestore(invite: VisitInvite, tokenHash: string): Record<string, unknown> {
  return {
    id: invite.id,
    visitId: invite.visitId,
    createdByUserId: invite.createdByUserId,
    tokenHash, // S11E: token hash em repouso
    role: invite.role,
    expiresAt: dateToFirestoreTimestamp(invite.expiresAt),
    createdAt: dateToFirestoreTimestamp(invite.createdAt),
    updatedAt: dateToFirestoreTimestamp(invite.updatedAt),
    revokedAt: invite.revokedAt ? dateToFirestoreTimestamp(invite.revokedAt) : null,
  };
}

/**
 * Deserializa convite do Firestore para modelo VisitInvite
 * Converte Timestamp para Date
 * S11E: não tem token bruto no Firestore (apenas tokenHash)
 */
function deserializeVisitInviteFromFirestore(data: Record<string, unknown>): VisitInvite {
  return {
    id: data['id'] as string,
    visitId: data['visitId'] as string,
    createdByUserId: data['createdByUserId'] as string,
    // Token não vem do Firestore (apenas hash), mantém compatibilidade com modelo
    token: '',
    role: data['role'] as InviteRole,
    expiresAt: firestoreTimestampToDate(data['expiresAt'] as Timestamp | null | undefined),
    createdAt: firestoreTimestampToDate(data['createdAt'] as Timestamp | null | undefined),
    updatedAt: firestoreTimestampToDate(data['updatedAt'] as Timestamp | null | undefined),
    revokedAt: data['revokedAt'] ? firestoreTimestampToDate(data['revokedAt'] as Timestamp | null | undefined) : undefined,
  };
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
 * Monta link absoluto de convite para rota /convite/:token.
 * Usa window.location.origin no app real e permite origin explícito para testes.
 */
export function buildVisitInviteLink(token: string, origin?: string): string {
  const resolvedOrigin = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).trim();
  const normalizedOrigin = resolvedOrigin.replace(/\/+$/, '');

  if (!normalizedOrigin) {
    return `/convite/${token}`;
  }

  return `${normalizedOrigin}/convite/${token}`;
}

/**
 * Valida permissão de gerenciar convites (fail-fast)
 * Verifica membership local + canManageInvites
 */
async function validateCanManageInvites(visitId: string): Promise<void> {
  requireUserId();
  const currentMember = await getCurrentUserVisitMember(visitId);

  if (!currentMember) {
    throw new Error('Você não é membro desta visita.');
  }

  if (!canManageInvites(currentMember)) {
    throw new Error('Apenas o owner pode criar ou revogar convites.');
  }
}

/**
 * Cria um novo convite para uma visita (Firestore remoto)
 */
export async function createVisitInviteForVisit(input: CreateVisitInviteInputService): Promise<VisitInvite> {
  const createdByUserId = requireUserId();
  const firestore = requireFirestore();

  // Guard fail-fast: verificar permissão de owner
  await validateCanManageInvites(input.visitId);

  const createInput: CreateVisitInviteInput = {
    visitId: input.visitId,
    createdByUserId,
    role: input.role,
    expiresInHours: input.expiresInHours,
  };

  const invite = createVisitInvite(createInput);
  const tokenHash = await sha256Hash(invite.token);

  // Persiste no Firestore: /visits/{visitId}/invites/{inviteId}
  const inviteRef = doc(firestore, 'visits', input.visitId, 'invites', invite.id);
  await setDoc(inviteRef, serializeVisitInviteForFirestore(invite, tokenHash));

  return invite;
}

/**
 * Lista convites ativos de uma visita (não expirados e não revogados)
 * Busca no Firestore remoto: /visits/{visitId}/invites
 */
export async function listActiveVisitInvites(visitId: string): Promise<VisitInvite[]> {
  const firestore = requireFirestore();
  const now = new Date();

  // Busca todos os convites da visita no Firestore
  const invitesCollection = collection(firestore, 'visits', visitId, 'invites');
  const snapshot = await getDocs(invitesCollection);

  const invites: VisitInvite[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const invite = deserializeVisitInviteFromFirestore(data);
    // Filtra apenas convites ativos
    if (isInviteActive(invite, now)) {
      invites.push(invite);
    }
  });

  return invites;
}

/**
 * Input para revogação de convite via serviço
 */
export interface RevokeVisitInviteInput {
  inviteId: string;
  visitId: string;
}

/**
 * Revoga um convite pelo ID (Firestore remoto)
 * Requer visitId para localizar o documento no Firestore
 */
export async function revokeVisitInvite(inviteId: string, visitId: string): Promise<VisitInvite | undefined> {
  const firestore = requireFirestore();

  // Guard fail-fast: verificar permissão de owner
  await validateCanManageInvites(visitId);

  // Busca o convite no Firestore
  const inviteRef = doc(firestore, 'visits', visitId, 'invites', inviteId);
  const snap = await getDoc(inviteRef);

  if (!snap.exists()) {
    return undefined;
  }

  const data = snap.data();
  const invite = deserializeVisitInviteFromFirestore(data);

  const revokedInvite = revokeInvite(invite);
  // O revokedInvite sempre terá revokedAt após revokeInvite()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const revokedAtDate = revokedInvite.revokedAt!;

  // Atualiza no Firestore
  await updateDoc(inviteRef, {
    revokedAt: dateToFirestoreTimestamp(revokedAtDate),
    updatedAt: dateToFirestoreTimestamp(revokedInvite.updatedAt),
  });

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
 * Aceita um convite por token via endpoint remoto
 * Usa POST /api/invites/accept com Bearer Firebase ID token
 */
export async function acceptVisitInviteByToken(token: string): Promise<AcceptInviteResult> {
  const { user } = getAuthState();

  // S11E: erro de rate-limit
  if (!user) {
    throw new InviteAcceptError('Usuário não autenticado.', 'unauthenticated');
  }

  // Obtém Firebase ID token para autenticação
  const idToken = await user.getIdToken();

  const response = await fetch('/api/invites/accept', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });

  // Tratamento de erros de protocolo HTTP
  if (response.status === 401) {
    throw new InviteAcceptError('Usuário não autenticado.', 'unauthenticated');
  }

  if (response.status === 400) {
    throw new InviteAcceptError('Requisição inválida.', 'invalid-request');
  }

  if (response.status === 405) {
    throw new InviteAcceptError('Método não permitido.', 'method-not-allowed');
  }

  if (response.status === 429) {
    throw new InviteAcceptError('Muitas tentativas. Aguarde alguns segundos e tente novamente.', 'rate-limited');
  }

  if (response.status >= 500) {
    throw new InviteAcceptError('Erro no servidor. Tente novamente mais tarde.', 'internal-error');
  }

  // Parseia resposta do backend
  const result: unknown = await response.json();

  // Valida formato da resposta
  if (!result || typeof result !== 'object') {
    throw new InviteAcceptError('Resposta inválida do servidor.', 'internal-error');
  }

  const resultObj = result as Record<string, unknown>;
  if (typeof resultObj['status'] !== 'string') {
    throw new InviteAcceptError('Resposta inválida do servidor.', 'internal-error');
  }

  // Valida status retornado é um dos esperados
  const validStatuses: AcceptInviteStatus[] = [
    'accepted',
    'already-member',
    'invite-not-found',
    'invite-expired',
    'invite-revoked',
    'access-revoked',
  ];

  if (!validStatuses.includes(resultObj['status'] as AcceptInviteStatus)) {
    throw new InviteAcceptError('Status de convite inválido.', 'internal-error');
  }

  // Retorna resultado mapeado
  return {
    status: resultObj['status'] as AcceptInviteStatus,
    visitId: resultObj['visitId'] as string | undefined,
  };
}
