/**
 * VisitaMed Visits Service
 * Serviço de persistência de visitas
 */

import { db } from './dexie-db';
import { createVisit, generatePrivateVisitName, getCurrentDate, type Visit } from '@/models/visit';
import { createNote, type Note } from '@/models/note';
import { createSyncQueueItem } from '@/models/sync-queue';
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
