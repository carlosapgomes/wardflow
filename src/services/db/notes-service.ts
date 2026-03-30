/**
 * VisitaMed Notes Service
 * Serviço de persistência de notas
 */

import { db } from './dexie-db';
import { createNote, NOTE_CONSTANTS, type Note } from '@/models/note';
import { createSyncQueueItem } from '@/models/sync-queue';
import { isNoteActive } from '@/utils/note-expiration';
import { getAuthState } from '@/services/auth/auth-service';
import { getWardSuggestions } from './ward-stats-service';
import { createWardStatId, normalizeWardKey, normalizeWardLabel, type WardStat } from '@/models/ward-stat';
import { applyWardPreferencesToLabels, getUserSettings } from '@/services/settings/settings-service';

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
 * Cria payload para sync de wardStat (incremental)
 */
interface WardStatSyncPayload {
  wardKey: string;
  wardLabel: string;
  usageCount: number;
  lastUsedAt: string;
  updatedAt: string;
}

/**
 * Enfileira operação de sync para wardStat dentro de transação local
 * Usa operação 'increment' para modelo de incremento no Firestore
 */
async function queueWardStatForSyncInTransaction(
  wardStat: WardStat
): Promise<void> {
  const payload: WardStatSyncPayload = {
    wardKey: wardStat.wardKey,
    wardLabel: wardStat.wardLabel,
    usageCount: 1, // Siempre 1 para incremento
    lastUsedAt: wardStat.lastUsedAt.toISOString(),
    updatedAt: wardStat.updatedAt.toISOString(),
  };
  const item = createSyncQueueItem(
    wardStat.userId,
    'increment',
    'wardStat',
    wardStat.wardKey,
    payload
  );
  await db.syncQueue.add(item);
}

/**
 * Registra uso de ala e enfileira sync na mesma transação da nota
 * Criado/atualizado + registro de uso + sync wardStat são atômicos
 */
async function recordWardUsageAndQueueSync(
  userId: string,
  ward: string
): Promise<WardStat | null> {
  const wardKey = normalizeWardKey(ward);
  const wardLabel = normalizeWardLabel(ward);

  if (!wardKey) {
    return null;
  }

  const id = createWardStatId(userId, wardKey);
  const now = new Date();

  const existing = await db.wardStats.get(id);

  if (existing) {
    // Incrementa contador
    const updated: WardStat = {
      ...existing,
      usageCount: existing.usageCount + 1,
      lastUsedAt: now,
      updatedAt: now,
    };
    await db.wardStats.update(id, updated);
    await queueWardStatForSyncInTransaction(updated);
    return updated;
  } else {
    // Cria novo registro
    const newStat: WardStat = {
      id,
      userId,
      wardKey,
      wardLabel,
      usageCount: 1,
      lastUsedAt: now,
      updatedAt: now,
    };
    await db.wardStats.add(newStat);
    await queueWardStatForSyncInTransaction(newStat);
    return newStat;
  }
}

/**
 * Cria e salva uma nova nota no banco local
 * Inclui registro de uso de ala + sync na mesma transação
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

  // Transação atômica: nota + wardStat + sync queue
  await db.transaction('rw', db.notes, db.syncQueue, db.wardStats, async () => {
    await db.notes.add(note);
    await queueNoteForSyncInTransaction('create', note);

    // Registra uso da ala e enfileira sync na mesma transação
    await recordWardUsageAndQueueSync(userId, input.ward);
  });

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
  const fallbackSuggestions = suggestions.length > 0 ? suggestions : await getUniqueWards();

  try {
    const settings = await getUserSettings();
    return applyWardPreferencesToLabels(fallbackSuggestions, settings.wardPreferences);
  } catch {
    // Fallback seguro para contexto sem usuário autenticado
    return fallbackSuggestions;
  }
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
 * Registra uso da ala + sync se houver mudança (mesma transação)
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

  // Transação atômica: nota + wardStat (se mudou) + sync queue
  await db.transaction('rw', db.notes, db.syncQueue, db.wardStats, async () => {
    await db.notes.update(noteId, {
      ...updates,
      updatedAt,
      syncStatus: 'pending',
    });

    const updatedNote = await db.notes.get(noteId);

    if (updatedNote) {
      await queueNoteForSyncInTransaction('update', updatedNote);
    }

    // Registra uso da ala e enfileira sync se ala mudou
    if (wardChanged && newWardValue) {
      await recordWardUsageAndQueueSync(userId, newWardValue);
    }
  });
}
