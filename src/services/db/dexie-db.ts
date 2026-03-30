/**
 * VisitaMed Dexie Database
 * Configuração do IndexedDB com Dexie
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Note } from '@/models/note';
import type { Settings } from '@/models/settings';
import type { SyncQueueItem } from '@/models/sync-queue';
import type { WardStat } from '@/models/ward-stat';

/**
 * Classe principal do banco de dados
 */
class VisitaMedDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  wardStats!: EntityTable<WardStat, 'id'>;

  constructor() {
    super('VisitaMedDB');

    this.version(1).stores({
      // Índices: userId, date, ward, syncStatus, expiresAt
      notes: 'id, userId, date, ward, syncStatus, expiresAt',

      // Índices: userId (único por usuário)
      settings: 'id, userId',

      // Índices: entityType, entityId, createdAt
      syncQueue: 'id, entityType, entityId, createdAt',
    });

    this.version(2)
      .stores({
        notes: 'id, userId, date, ward, syncStatus, expiresAt',
        settings: 'id, userId',
        // Adiciona índice userId para isolamento por usuário
        syncQueue: 'id, userId, entityType, entityId, createdAt',
      })
      .upgrade(async (tx) => {
        // Limpa fila existente (greenfield, sem risco de dados críticos)
        await tx.table('syncQueue').clear();
      });

    this.version(3)
      .stores({
        notes: 'id, userId, date, ward, syncStatus, expiresAt',
        settings: 'id, userId',
        syncQueue: 'id, userId, entityType, entityId, createdAt',
        // Ward stats: userId para listar, wardKey para busca
        wardStats: 'id, userId, wardKey, lastUsedAt',
      })
      .upgrade(async (_tx) => {
        // Greenfield - sem dados para migrar
      });
  }
}

export const db = new VisitaMedDB();

/**
 * Limpa dados locais do usuário (notes + settings + syncQueue + wardStats)
 * Usado no logout para evitar dados órfãos em dispositivo compartilhado
 */
export async function clearLocalUserData(): Promise<void> {
  await db.transaction('rw', [db.notes, db.settings, db.syncQueue, db.wardStats], async () => {
    await db.notes.clear();
    await db.settings.clear();
    await db.syncQueue.clear();
    await db.wardStats.clear();
  });
}

/**
 * Limpa notas expiradas do banco local
 */
export async function cleanExpiredNotes(): Promise<number> {
  const now = new Date();
  const expiredCount = await db.notes.where('expiresAt').below(now).delete();
  return expiredCount;
}

/**
 * Obtém notas do usuário agrupadas por data
 */
export async function getNotesByDate(userId: string): Promise<Map<string, Note[]>> {
  const notes = await db.notes.where('userId').equals(userId).reverse().sortBy('date');

  const grouped = new Map<string, Note[]>();
  for (const note of notes) {
    const existing = grouped.get(note.date) ?? [];
    existing.push(note);
    grouped.set(note.date, existing);
  }

  return grouped;
}

/**
 * Obtém notas do usuário agrupadas por ala
 */
export async function getNotesByWard(userId: string, date?: string): Promise<Map<string, Note[]>> {
  let notes: Note[];

  if (date) {
    notes = await db.notes.where({ userId, date }).toArray();
  } else {
    notes = await db.notes.where('userId').equals(userId).toArray();
  }

  const grouped = new Map<string, Note[]>();
  for (const note of notes) {
    const existing = grouped.get(note.ward) ?? [];
    existing.push(note);
    grouped.set(note.ward, existing);
  }

  return grouped;
}
