/**
 * WardFlow Notes Service
 * Serviço de persistência de notas
 */

import { db } from './dexie-db';
import { createNote, NOTE_CONSTANTS, type Note } from '@/models/note';

/** ID de usuário placeholder antes de implementar autenticação */
const LOCAL_USER_ID = 'local-user';

export interface CreateNoteInput {
  ward: string;
  bed: string;
  note: string;
  reference?: string;
}

/**
 * Cria e salva uma nova nota no banco local
 */
export async function saveNote(input: CreateNoteInput): Promise<Note> {
  const note = createNote({
    userId: LOCAL_USER_ID,
    ward: input.ward.trim(),
    bed: input.bed.trim(),
    note: input.note.trim(),
    reference: input.reference?.trim() || undefined,
  });

  await db.notes.add(note);
  return note;
}

/**
 * Busca todas as notas do usuário local, não expiradas
 * Ordenadas por createdAt descendente (mais recentes primeiro)
 */
export async function getAllNotes(): Promise<Note[]> {
  const now = new Date();
  const notes = await db.notes
    .where('userId')
    .equals(LOCAL_USER_ID)
    .filter((note) => note.expiresAt > now)
    .reverse()
    .sortBy('createdAt');

  return notes;
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
