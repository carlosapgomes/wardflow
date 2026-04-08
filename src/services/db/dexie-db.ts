/**
 * VisitaMed Dexie Database
 * Configuração do IndexedDB com Dexie
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Note } from '@/models/note';
import type { Settings } from '@/models/settings';
import type { SyncQueueItem } from '@/models/sync-queue';
import type { Visit } from '@/models/visit';
import type { VisitMember } from '@/models/visit-member';
import type { VisitInvite } from '@/models/visit-invite';
import type { UserTagStat } from '@/models/user-tag-stat';
import {
  cleanExpiredLocalDataFromDb,
  type LocalExpirationCleanupResult,
} from './local-expiration-cleanup';

/**
 * Classe principal do banco de dados
 */
class VisitaMedDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  visits!: EntityTable<Visit, 'id'>;
  visitMembers!: EntityTable<VisitMember, 'id'>;
  visitInvites!: EntityTable<VisitInvite, 'id'>;
  userTagStats!: EntityTable<UserTagStat, 'id'>;

  constructor() {
    super('VisitaMedDB');

    // v8: adiciona expiresAt em visits
    this.version(8)
      .stores({
        // Tags-first: remove índice ward
        notes: 'id, userId, visitId, date, syncStatus, expiresAt',
        settings: 'id, userId',
        syncQueue: 'id, userId, entityType, entityId, createdAt',
        visits: 'id, userId, date, expiresAt',
        visitMembers: 'id, visitId, userId, role, status, updatedAt',
        visitInvites: 'id, visitId, createdByUserId, token, role, expiresAt, createdAt, revokedAt',
      })
      .upgrade(async (tx) => {
        // Remover tabela wardStats legada se existir
        try {
          await tx.table('wardStats').clear();
        } catch {
          // Tabela não existe, ignorado
        }
        // Limpa syncQueue para iniciar limpo
        await tx.table('syncQueue').clear();
      });

    // v9: base local de sugestões de tags por usuário
    this.version(9).stores({
      notes: 'id, userId, visitId, date, syncStatus, expiresAt',
      settings: 'id, userId',
      syncQueue: 'id, userId, entityType, entityId, createdAt',
      visits: 'id, userId, date, expiresAt',
      visitMembers: 'id, visitId, userId, role, status, updatedAt',
      visitInvites: 'id, visitId, createdByUserId, token, role, expiresAt, createdAt, revokedAt',
      userTagStats: 'id, userId, tag, count, lastUsedAt, updatedAt',
    });
  }
}

export const db = new VisitaMedDB();

export interface ClearLocalUserDataDb {
  notes: { clear(): Promise<void> };
  settings: { clear(): Promise<void> };
  syncQueue: { clear(): Promise<void> };
  visits: { clear(): Promise<void> };
  visitMembers: { clear(): Promise<void> };
  visitInvites: { clear(): Promise<void> };
  userTagStats: { clear(): Promise<void> };
  transaction(...args: unknown[]): Promise<unknown>;
}

export async function clearLocalUserDataFromDb(database: ClearLocalUserDataDb): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.notes,
      database.settings,
      database.syncQueue,
      database.visits,
      database.visitMembers,
      database.visitInvites,
      database.userTagStats,
    ],
    async () => {
      await database.notes.clear();
      await database.settings.clear();
      await database.syncQueue.clear();
      await database.visits.clear();
      await database.visitMembers.clear();
      await database.visitInvites.clear();
      await database.userTagStats.clear();
    }
  );
}

/**
 * Limpa dados locais do usuário
 * Usado no logout para evitar dados órfãos em dispositivo compartilhado
 */
export async function clearLocalUserData(): Promise<void> {
  await clearLocalUserDataFromDb(db);
}

/**
 * Limpa dados locais expirados (notas + visitas e dados relacionados)
 */
export async function cleanExpiredLocalData(): Promise<LocalExpirationCleanupResult> {
  const result = await cleanExpiredLocalDataFromDb(db);

  const shouldRebuildTagStats =
    result.expiredNotesRemoved > 0 ||
    result.expiredVisitsRemoved > 0 ||
    result.relatedNotesRemoved > 0;

  if (shouldRebuildTagStats) {
    void import('./user-tag-stats-service')
      .then(({ triggerCurrentUserTagStatsRebuild }) => {
        triggerCurrentUserTagStatsRebuild();
      })
      .catch((error: unknown) => {
        console.warn('[Dexie] Falha ao disparar rebuild de sugestões após limpeza local:', error);
      });
  }

  return result;
}

/**
 * Compatibilidade com slice anterior: retorna apenas a contagem de notas expiradas removidas
 */
export async function cleanExpiredNotes(): Promise<number> {
  const result = await cleanExpiredLocalData();
  return result.expiredNotesRemoved;
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

// removido: getNotesByWard (tags-first agora)
