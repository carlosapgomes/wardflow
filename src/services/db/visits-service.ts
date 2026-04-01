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
 * Cria uma nova visita privada
 * O nome é gerado automaticamente se não fornecido
 */
export async function createPrivateVisit(namePrefix?: string): Promise<Visit> {
  const userId = requireUserId();
  const name = generatePrivateVisitName(namePrefix);
  const date = getCurrentDate();

  const visit = createVisit({
    userId,
    name,
    date,
    mode: 'private',
  });

  // Cria membership do owner em transação atômica
  const ownerMember = createOwnerVisitMember(visit.id, userId);

  await db.transaction('rw', [db.visits, db.visitMembers], async () => {
    await db.visits.add(visit);
    await db.visitMembers.add(ownerMember);
  });

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

  // Criar notas duplicadas
  const duplicatedNotes: Note[] = sourceNotes.map((note) =>
    createNote({
      userId,
      visitId: newVisit.id,
      date: newDate,
      ward: note.ward,
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

      // Criar notas duplicadas e enfileirar sync
      for (const note of duplicatedNotes) {
        await db.notes.add(note);
        await queueNoteForSyncInTransaction('create', note);
      }
    }
  );

  return newVisit;
}
