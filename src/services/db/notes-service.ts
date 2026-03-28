/**
 * VisitaMed Notes Service
 * Serviço de persistência de notas
 */

import { db } from './dexie-db';
import { createNote, NOTE_CONSTANTS, type Note } from '@/models/note';
import { createSyncQueueItem } from '@/models/sync-queue';
import { isNoteActive } from '@/utils/note-expiration';
import { getAuthState } from '@/services/auth/auth-service';
import { recordWardUsage, getWardSuggestions } from './ward-stats-service';
import { normalizeWardKey } from '@/models/ward-stat';

export interface CreateNoteInput {
  ward: string;
  bed: string;
  note: string;
  reference?: string;
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

  const note = createNote({
    userId,
    ward: input.ward.trim(),
    bed: input.bed.trim(),
    note: input.note.trim(),
    reference: input.reference?.trim() ?? undefined,
    syncStatus: 'pending',
  });

  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    await db.notes.add(note);
    await queueNoteForSyncInTransaction('create', note);
  });

  // Registra uso da ala após salvar
  await recordWardUsage(input.ward);

  return note;
}

/**
 * Busca todas as notas do usuário atual, não expiradas
 * Ordenadas por createdAt descendente (mais recentes primeiro)
 */
export async function getAllNotes(): Promise<Note[]> {
  const { user } = getAuthState();

  // Se não há usuário, retorna lista vazia
  if (!user) {
    return [];
  }

  const now = new Date();
  const notes = await db.notes
    .where('userId')
    .equals(user.uid)
    .filter((note) => isNoteActive(note, now))
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
 * Busca alas/enfermarias únicas já utilizadas pelo usuário
 * Ordenadas alfabeticamente para facilitar a busca
 * Nota: só inclui notas ativas (não expiradas)
 */
export async function getUniqueWards(): Promise<string[]> {
  const { user } = getAuthState();

  if (!user) {
    return [];
  }

  const now = new Date();
  const notes = await db.notes
    .where('userId')
    .equals(user.uid)
    .filter((note) => isNoteActive(note, now))
    .toArray();

  // Extrai wards únicos, removendo valores vazios
  const uniqueWards = [...new Set(notes.map((note) => note.ward).filter((ward) => ward.trim().length > 0))];

  return uniqueWards.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Obtém sugestões de alas com fallback
 * Prioriza stats locais (frequência + recência)
 * Fallback para notas ativas se não há stats
 */
export async function getWardSuggestionsWithFallback(): Promise<string[]> {
  const suggestions = await getWardSuggestions();

  if (suggestions.length > 0) {
    return suggestions;
  }

  // Fallback: notas ativas ordenadas alfabeticamente
  return getUniqueWards();
}

/**
 * Valida se os campos obrigatórios estão preenchidos
 */
export function validateNoteInput(input: CreateNoteInput): boolean {
  return (
    input.ward.trim().length > 0 &&
    input.bed.trim().length > 0 &&
    input.note.trim().length > 0 &&
    input.note.length <= NOTE_CONSTANTS.MAX_NOTE_LENGTH
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
}

/**
 * Atualiza uma nota existente
 * Valida que a nota pertence ao usuário atual
 * Registra uso da ala se houver mudança
 */
export async function updateNote(
  noteId: string,
  updates: Partial<Pick<Note, 'ward' | 'bed' | 'note' | 'reference'>>
): Promise<void> {
  const userId = requireUserId();
  const updatedAt = new Date();

  // Busca nota existente para verificar mudança de ala
  const existingNote = await db.notes.get(noteId);
  if (!existingNote) {
    throw new Error('Nota não encontrada');
  }
  validateOwnership(existingNote, userId);

  // Verifica se ala mudou e captura o novo valor
  const newWardValue = updates.ward;
  const wardChanged =
    newWardValue !== undefined &&
    normalizeWardKey(existingNote.ward) !== normalizeWardKey(newWardValue);

  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    await db.notes.update(noteId, {
      ...updates,
      updatedAt,
      syncStatus: 'pending',
    });

    const updatedNote = await db.notes.get(noteId);

    if (updatedNote) {
      await queueNoteForSyncInTransaction('update', updatedNote);
    }
  });

  // Registra uso se ala mudou
  if (wardChanged) {
    await recordWardUsage(newWardValue);
  }
}
