/**
 * VisitaMed Notes Service
 * Serviço de persistência de notas
 */

import { db } from './dexie-db';
import { createNote, NOTE_CONSTANTS, type Note } from '@/models/note';
import { normalizeTagList, normalizeTagValue } from '@/models/tag';
import { createSyncQueueItem } from '@/models/sync-queue';
import { isNoteActive } from '@/utils/note-expiration';
import { getAuthState } from '@/services/auth/auth-service';


export interface CreateNoteInput {
  visitId: string;
  bed: string;
  note: string;
  reference?: string;
  tags?: string[];
}

/**
 * Obtém o ID do usuário atual ou lança erro se não autenticado
 */
function requireUserId(): string {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado. Faça login para criar notas.');
  }

  return user.uid;
}

/**
 * Valida que a nota pertence ao usuário atual
 */
function validateOwnership(note: Note, userId: string): void {
  if (note.userId !== userId) {
    throw new Error('Acesso negado: nota não pertence ao usuário atual');
  }
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
      console.warn('[Notas] Sync imediato falhou (best-effort):', error);
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
 * Cria e salva uma nova nota no banco local
 */
export async function saveNote(input: CreateNoteInput): Promise<Note> {
  const userId = requireUserId();

  const tags = normalizeTagList(input.tags ?? [], NOTE_CONSTANTS.MAX_TAGS_PER_NOTE);

  if (tags.length === 0) {
    throw new Error('Informe ao menos 1 tag');
  }

  const note = createNote({
    userId,
    visitId: input.visitId,
    bed: input.bed.trim(),
    note: input.note.trim(),
    reference: input.reference?.trim() ?? undefined,
    tags,
    syncStatus: 'pending',
  });

  // Transação atômica: nota + sync queue
  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    await db.notes.add(note);
    await queueNoteForSyncInTransaction('create', note);
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();

  return note;
}

/**
 * Busca todas as notas do usuário atual para uma visita específica, não expiradas
 * Ordenadas por createdAt descendente (mais recentes primeiro)
 */
export async function getAllNotes(visitId: string): Promise<Note[]> {
  const { user } = getAuthState();

  // Se não há usuário, retorna lista vazia
  if (!user) {
    return [];
  }

  const now = new Date();
  const notes = await db.notes
    .where('visitId')
    .equals(visitId)
    .filter((note) => note.userId === user.uid && isNoteActive(note, now))
    .reverse()
    .sortBy('createdAt');

  return notes;
}

/**
 * Busca uma nota pelo ID
 * Valida que a nota pertence ao usuário atual
 */
export async function getNoteById(noteId: string): Promise<Note | undefined> {
  const { user } = getAuthState();

  if (!user) {
    return undefined;
  }

  const note = await db.notes.get(noteId);

  if (!note) {
    return undefined;
  }

  validateOwnership(note, user.uid);

  return note;
}

/**
 * Valida se os campos obrigatórios estão preenchidos
 */
export function validateNoteInput(input: CreateNoteInput): boolean {
  const normalizedTags = normalizeTagList(input.tags ?? [], NOTE_CONSTANTS.MAX_TAGS_PER_NOTE);

  return (
    input.bed.trim().length > 0 &&
    input.note.trim().length > 0 &&
    input.note.length <= NOTE_CONSTANTS.MAX_NOTE_LENGTH &&
    normalizedTags.length > 0
  );
}

/**
 * Deleta uma nota pelo ID
 * Valida que a nota pertence ao usuário atual
 */
export async function deleteNote(noteId: string): Promise<void> {
  const userId = requireUserId();

  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    const note = await db.notes.get(noteId);

    if (!note) {
      return;
    }

    validateOwnership(note, userId);

    await db.notes.delete(noteId);
    await queueNoteForSyncInTransaction('delete', note);
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();
}

/**
 * Deleta múltiplas notas por IDs
 * Valida que todas as notas pertencem ao usuário atual
 */
export async function deleteNotes(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) {
    return;
  }

  const userId = requireUserId();

  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    const notesToDelete = await db.notes.where('id').anyOf(noteIds).toArray();

    if (notesToDelete.length === 0) {
      return;
    }

    // Valida ownership de todas as notas
    for (const note of notesToDelete) {
      validateOwnership(note, userId);
    }

    await db.notes.bulkDelete(noteIds);

    for (const note of notesToDelete) {
      await queueNoteForSyncInTransaction('delete', note);
    }
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();
}

/**
 * Atualiza uma nota existente
 * Valida que a nota pertence ao usuário atual
 * Aceita tags normalizadas
 */
export async function updateNote(
  noteId: string,
  updates: Partial<Pick<Note, 'bed' | 'note' | 'reference' | 'tags'>>
): Promise<void> {
  const userId = requireUserId();
  const updatedAt = new Date();

  // Busca nota existente
  const existingNote = await db.notes.get(noteId);
  if (!existingNote) {
    throw new Error('Nota não encontrada');
  }
  validateOwnership(existingNote, userId);

  // Tags são fonte de verdade: apenas normalizar quando fornecidas explicitamente
  let tagsUpdate: Partial<Note> = {};

  if (updates.tags !== undefined) {
    const normalizedTags = normalizeTagList(updates.tags, NOTE_CONSTANTS.MAX_TAGS_PER_NOTE);

    if (normalizedTags.length === 0) {
      throw new Error('Nota deve ter ao menos 1 tag');
    }

    tagsUpdate = { tags: normalizedTags };
  }

  // Transação atômica: nota + sync queue
  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    await db.notes.update(noteId, {
      ...updates,
      ...tagsUpdate,
      updatedAt,
      syncStatus: 'pending',
    });

    const updatedNote = await db.notes.get(noteId);

    if (updatedNote) {
      await queueNoteForSyncInTransaction('update', updatedNote);
    }
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();
}

/**
 * Remove uma tag de uma nota
 * Retorna 'updated' se a nota continuar com tags, 'deleted' se a última tag foi removida
 * Regra: se última tag removida, exclui a nota
 */
export async function removeTagFromNote(
  noteId: string,
  tagToRemove: string
): Promise<'updated' | 'deleted'> {
  const userId = requireUserId();
  const normalizedTag = normalizeTagValue(tagToRemove);

  if (!normalizedTag) {
    throw new Error('Tag inválida');
  }

  // Busca nota existente
  const existingNote = await db.notes.get(noteId);
  if (!existingNote) {
    throw new Error('Nota não encontrada');
  }
  validateOwnership(existingNote, userId);

  const currentTags = existingNote.tags ?? [];
  
  // Filtra a tag a remover (por equivalência canônica)
  const remainingTags = currentTags.filter((tag) => normalizeTagValue(tag) !== normalizedTag);

  // Transação atômica: update ou delete + sync queue
  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    if (remainingTags.length === 0) {
      // Última tag removida - exclui a nota
      await db.notes.delete(noteId);
      await queueNoteForSyncInTransaction('delete', existingNote);
    } else {
      // Atualiza com tags restantes
      const updatedAt = new Date();
      await db.notes.update(noteId, {
        tags: remainingTags,
        updatedAt,
        syncStatus: 'pending',
      });

      const updatedNote = await db.notes.get(noteId);
      if (updatedNote) {
        await queueNoteForSyncInTransaction('update', updatedNote);
      }
    }
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();

  return remainingTags.length === 0 ? 'deleted' : 'updated';
}
