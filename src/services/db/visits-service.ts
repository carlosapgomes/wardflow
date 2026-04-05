/**
 * VisitaMed Visits Service
 * Serviço de persistência de visitas
 */

import { db } from './dexie-db';
import { createVisit, generatePrivateVisitName, getCurrentDate, type Visit } from '@/models/visit';
import { createNote, type Note } from '@/models/note';
import { createSyncQueueItem, type SyncQueueItem } from '@/models/sync-queue';
import { normalizeTagList } from '@/models/tag';
import { getAuthState } from '@/services/auth/auth-service';
import { createOwnerVisitMember, getVisitMember } from './visit-members-service';
import type { VisitMember } from '@/models/visit-member';
import { canDuplicateVisit } from '@/services/auth/visit-permissions';

/**
 * Obtém o ID do usuário atual ou lança erro se não autenticado
 */
function requireUserId(): string {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado. Faça login para criar visitas.');
  }

  return user.uid;
}

/**
 * Valida que a visita pertence ao usuário atual
 */
function validateOwnership(visit: Visit, userId: string): void {
  if (visit.userId !== userId) {
    throw new Error('Acesso negado: visita não pertence ao usuário atual');
  }
}

/**
 * Gera nome único para visita privada no mesmo dia
 * Se baseName já existir, adiciona sufixo incremental: (2), (3), ...
 */
async function getUniqueVisitName(baseName: string, userId: string, date: string): Promise<string> {
  const existingVisits = await db.visits
    .where('userId')
    .equals(userId)
    .toArray();

  const visitsOnDate = existingVisits.filter((v) => v.date === date);
  const usedNames = new Set(visitsOnDate.map((v) => v.name));

  if (!usedNames.has(baseName)) {
    return baseName;
  }

  // Encontrar próximo sufixo disponível
  let counter = 2;
  let uniqueName = `${baseName} (${String(counter)})`;

  while (usedNames.has(uniqueName)) {
    counter++;
    uniqueName = `${baseName} (${String(counter)})`;
  }

  return uniqueName;
}

/**
 * Enfileira operação de sync para visita dentro de transação local
 */
async function queueVisitForSyncInTransaction(
  operation: 'create' | 'update' | 'delete',
  visit: Visit
): Promise<void> {
  const item = createSyncQueueItem(visit.userId, operation, 'visit', visit.id, visit);
  await db.syncQueue.add(item);
}

/**
 * Enfileira operação de sync para membership de visita dentro de transação local
 */
async function queueVisitMemberForSyncInTransaction(
  operation: 'create' | 'update' | 'delete',
  member: VisitMember
): Promise<void> {
  const item = createSyncQueueItem(member.userId, operation, 'visit-member', member.id, member);
  await db.syncQueue.add(item);
}

/**
 * Dispara sync imediato em fire-and-forget se online + autenticado
 * Não bloqueia o fluxo de UI, não lança erro para o usuário
 */
function triggerImmediateSync(): void {
  const { user } = getAuthState();

  if (!user) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  // Fire-and-forget: sem await para não bloquear fluxo local
  void import('@/services/sync/sync-service')
    .then(({ syncNow }) => syncNow())
    .catch((error: unknown) => {
      console.warn('[Visitas] Sync imediato falhou (best-effort):', error);
    });
}

function getVisitIdFromSyncQueueItem(item: SyncQueueItem): string | null {
  if (item.entityType === 'visit') {
    return item.entityId;
  }

  if (item.entityType === 'visit-member') {
    const [visitId] = item.entityId.split(':');
    return visitId || null;
  }

  if (item.entityType !== 'note') {
    return null;
  }

  try {
    const payload = JSON.parse(item.payload) as { visitId?: unknown };
    return typeof payload.visitId === 'string' && payload.visitId.trim() !== ''
      ? payload.visitId
      : null;
  } catch {
    return null;
  }
}

async function removePendingSyncItemsForVisitInTransaction(userId: string, visitId: string): Promise<void> {
  const pendingItems = await db.syncQueue.where('userId').equals(userId).toArray();

  for (const item of pendingItems) {
    if (getVisitIdFromSyncQueueItem(item) === visitId) {
      await db.syncQueue.delete(item.id);
    }
  }
}

/**
 * Cria uma nova visita privada
 * O nome é gerado automaticamente se não fornecido
 * Garante nome único por usuário + data (dedupe automático)
 */
export async function createPrivateVisit(namePrefix?: string): Promise<Visit> {
  const userId = requireUserId();
  const baseName = generatePrivateVisitName(namePrefix);
  const date = getCurrentDate();

  // Garante nome único no mesmo dia
  const name = await getUniqueVisitName(baseName, userId, date);

  const visit = createVisit({
    userId,
    name,
    date,
    mode: 'private',
  });

  // Cria membership do owner em transação atômica
  const ownerMember = createOwnerVisitMember(visit.id, userId);

  await db.transaction('rw', [db.visits, db.visitMembers, db.syncQueue], async () => {
    await db.visits.add(visit);
    await db.visitMembers.add(ownerMember);

    // Enfileirar sync de visit e owner membership
    await queueVisitForSyncInTransaction('create', visit);
    await queueVisitMemberForSyncInTransaction('create', ownerMember);
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();

  return visit;
}

/**
 * Busca todas as visitas do usuário atual
 * Ordenadas por data descendente (mais recentes primeiro)
 */
export async function getAllVisits(): Promise<Visit[]> {
  const { user } = getAuthState();

  if (!user) {
    return [];
  }

  const visits = await db.visits
    .where('userId')
    .equals(user.uid)
    .reverse()
    .sortBy('date');

  return visits;
}

/**
 * Busca uma visita pelo ID
 * Valida que a visita pertence ao usuário atual
 */
export async function getVisitById(visitId: string): Promise<Visit | undefined> {
  const userId = requireUserId();

  const visit = await db.visits.get(visitId);

  if (!visit) {
    return undefined;
  }

  validateOwnership(visit, userId);

  return visit;
}

/**
 * Exclui uma visita privada completa (visita + membership owner + notas)
 */
export async function deletePrivateVisit(visitId: string): Promise<void> {
  const userId = requireUserId();

  const visit = await db.visits.get(visitId);

  if (!visit) {
    throw new Error('Visita não encontrada');
  }

  if (visit.mode !== 'private') {
    throw new Error('Apenas visitas privadas podem ser excluídas neste fluxo');
  }

  validateOwnership(visit, userId);

  const ownerMember = await getVisitMember(visitId, userId);

  if (!ownerMember || ownerMember.role !== 'owner') {
    throw new Error('Acesso negado: somente owner pode excluir visita privada');
  }

  await db.transaction('rw', [db.visits, db.visitMembers, db.notes, db.syncQueue], async () => {
    const notesToDelete = await db.notes.where('visitId').equals(visitId).toArray();

    await removePendingSyncItemsForVisitInTransaction(userId, visitId);

    if (notesToDelete.length > 0) {
      await db.notes.bulkDelete(notesToDelete.map((note) => note.id));

      for (const note of notesToDelete) {
        await queueNoteForSyncInTransaction('delete', note);
      }
    }

    await db.visitMembers.delete(ownerMember.id);
    await queueVisitMemberForSyncInTransaction('delete', ownerMember);

    await db.visits.delete(visitId);
    await queueVisitForSyncInTransaction('delete', visit);
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();
}

/**
 * Garante que uma visita esteja em modo colaborativo (group).
 * Se ainda for private, promove para group localmente e enfileira visit:update.
 */
export async function ensureVisitIsGroup(visitId: string): Promise<Visit> {
  const userId = requireUserId();
  const visit = await db.visits.get(visitId);

  if (!visit) {
    throw new Error('Visita não encontrada');
  }

  validateOwnership(visit, userId);

  const ownerMember = await getVisitMember(visitId, userId);
  if (!ownerMember || ownerMember.role !== 'owner' || ownerMember.status !== 'active') {
    throw new Error('Acesso negado: somente owner ativo pode convidar pessoas');
  }

  if (visit.mode === 'group') {
    return visit;
  }

  const now = new Date();
  const updatedVisit: Visit = {
    ...visit,
    mode: 'group',
    updatedAt: now,
  };

  await db.transaction('rw', [db.visits, db.syncQueue], async () => {
    await db.visits.put(updatedVisit);
    await queueVisitForSyncInTransaction('update', updatedVisit);
  });

  triggerImmediateSync();

  return updatedVisit;
}

/**
 * Usuário não-owner sai de uma visita em grupo via endpoint remoto autorizado.
 */
export async function leaveVisit(visitId: string): Promise<void> {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado.');
  }

  const member = await getVisitMember(visitId, user.uid);

  if (!member || member.status !== 'active') {
    throw new Error('Membership ativo não encontrado');
  }

  if (member.role === 'owner') {
    throw new Error('Owner não pode sair da visita neste fluxo');
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/visits/leave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ visitId }),
  });

  if (response.status === 401) {
    throw new Error('Usuário não autenticado.');
  }

  if (response.status === 400) {
    throw new Error('Requisição inválida.');
  }

  if (response.status === 403) {
    throw new Error('Acesso negado.');
  }

  if (response.status === 404) {
    throw new Error('Membership não encontrado.');
  }

  if (response.status >= 500) {
    throw new Error('Erro no servidor.');
  }

  const result = await response.json() as unknown;

  if (!result || typeof result !== 'object') {
    throw new Error('Resposta inválida do servidor.');
  }

  const resultObj = result as Partial<LeaveVisitEndpointResponse>;
  if (resultObj.status !== 'left' || resultObj.visitId !== visitId) {
    throw new Error('Resposta inválida do servidor.');
  }

  await db.transaction('rw', [db.visits, db.visitMembers, db.notes, db.visitInvites, db.syncQueue], async () => {
    await removePendingSyncItemsForVisitInTransaction(user.uid, visitId);
    await db.notes.where('visitId').equals(visitId).delete();
    await db.visitMembers.where('visitId').equals(visitId).delete();
    await db.visitInvites.where('visitId').equals(visitId).delete();
    await db.visits.delete(visitId);
  });

  triggerImmediateSync();
}

interface LeaveVisitEndpointResponse {
  status: 'left';
  visitId: string;
}

interface DeleteVisitEndpointResponse {
  status: 'deleted';
  visitId: string;
}

/**
 * Owner exclui visita colaborativa para todos via endpoint autenticado.
 */
export async function deleteGroupVisitAsOwner(visitId: string): Promise<void> {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado.');
  }

  const visit = await db.visits.get(visitId);
  if (!visit) {
    throw new Error('Visita não encontrada');
  }

  if (visit.mode !== 'group') {
    throw new Error('Apenas visitas colaborativas podem ser excluídas neste fluxo');
  }

  validateOwnership(visit, user.uid);

  const member = await getVisitMember(visitId, user.uid);
  if (!member || member.role !== 'owner' || member.status !== 'active') {
    throw new Error('Acesso negado: somente owner ativo pode excluir visita colaborativa');
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/visits/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ visitId }),
  });

  if (response.status === 401) {
    throw new Error('Usuário não autenticado.');
  }

  if (response.status === 400) {
    throw new Error('Requisição inválida.');
  }

  if (response.status === 403) {
    throw new Error('Acesso negado.');
  }

  if (response.status >= 500) {
    throw new Error('Erro no servidor.');
  }

  const result = await response.json() as unknown;

  if (!result || typeof result !== 'object') {
    throw new Error('Resposta inválida do servidor.');
  }

  const resultObj = result as Partial<DeleteVisitEndpointResponse>;
  if (resultObj.status !== 'deleted' || resultObj.visitId !== visitId) {
    throw new Error('Resposta inválida do servidor.');
  }

  await db.transaction('rw', [db.visits, db.visitMembers, db.notes, db.visitInvites, db.syncQueue], async () => {
    await removePendingSyncItemsForVisitInTransaction(user.uid, visitId);
    await db.notes.where('visitId').equals(visitId).delete();
    await db.visitMembers.where('visitId').equals(visitId).delete();
    await db.visitInvites.where('visitId').equals(visitId).delete();
    await db.visits.delete(visitId);
  });
}

/**
 * Enfileira operação de sync para nota dentro de transação local
 */
async function queueNoteForSyncInTransaction(
  operation: 'create' | 'update' | 'delete',
  note: Note
): Promise<void> {
  const item = createSyncQueueItem(note.userId, operation, 'note', note.id, note);
  await db.syncQueue.add(item);
}

/**
 * Duplica uma visita como visita privada do usuário atual
 * Copia todas as notas da visita origem para a nova visita
 * @param sourceVisitId - ID da visita a ser duplicada
 * @returns Nova visita privada criada
 * @throws Error se usuário não autenticado ou sem permissão
 */
export async function duplicateVisitAsPrivate(sourceVisitId: string): Promise<Visit> {
  const userId = requireUserId();

  // Buscar visita origem
  const sourceVisit = await db.visits.get(sourceVisitId);
  if (!sourceVisit) {
    throw new Error('Visita não encontrada');
  }

  // Verificar membership do usuário na visita origem
  const membership = await getVisitMember(sourceVisitId, userId);
  if (!membership || !canDuplicateVisit(membership)) {
    throw new Error('Sem permissão para duplicar esta visita');
  }

  // Criar nova visita privada
  const newDate = getCurrentDate();
  const newVisitName = `${sourceVisit.name} (cópia)`;

  const newVisit = createVisit({
    userId,
    name: newVisitName,
    date: newDate,
    mode: 'private',
  });

  // Criar membership owner da nova visita
  const newOwnerMember = createOwnerVisitMember(newVisit.id, userId);

  // Buscar notas da visita origem
  const sourceNotes = await db.notes.where('visitId').equals(sourceVisitId).toArray();

  // Criar notas duplicadas (tags-first)
  const duplicatedNotes: Note[] = sourceNotes.map((note) =>
    createNote({
      userId,
      visitId: newVisit.id,
      date: newDate,
      bed: note.bed,
      note: note.note,
      reference: note.reference,
      tags: normalizeTagList(note.tags ?? []),
      syncStatus: 'pending',
    })
  );

  // Transação atômica: visita + membership + notas + sync queue
  await db.transaction(
    'rw',
    [db.visits, db.visitMembers, db.notes, db.syncQueue],
    async () => {
      // Criar nova visita
      await db.visits.add(newVisit);

      // Criar membership owner
      await db.visitMembers.add(newOwnerMember);

      // Enfileirar sync de visita e membership owner
      await queueVisitForSyncInTransaction('create', newVisit);
      await queueVisitMemberForSyncInTransaction('create', newOwnerMember);

      // Criar notas duplicadas e enfileirar sync
      for (const note of duplicatedNotes) {
        await db.notes.add(note);
        await queueNoteForSyncInTransaction('create', note);
      }
    }
  );

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();

  return newVisit;
}
