import type { SyncQueueItem } from '@/models/sync-queue';

export interface LocalExpirationCleanupResult {
  expiredNotesRemoved: number;
  expiredVisitsRemoved: number;
  relatedNotesRemoved: number;
  visitMembersRemoved: number;
  visitInvitesRemoved: number;
  syncQueueItemsRemoved: number;
}

interface DeleteWhereClause {
  delete(): Promise<number>;
}

interface ExpirationWhereClause<TVisit extends { id: string }> {
  belowOrEqual?(value: Date): {
    delete?(): Promise<number>;
    toArray?(): Promise<TVisit[]>;
  };
  equals?(value: string): DeleteWhereClause;
}

export interface ExpirationCleanupDb<TVisit extends { id: string } = { id: string }> {
  notes: {
    where(index: string): ExpirationWhereClause<TVisit>;
  };
  visits: {
    where(index: string): ExpirationWhereClause<TVisit>;
    delete(id: string): Promise<void>;
  };
  visitMembers: {
    where(index: string): ExpirationWhereClause<TVisit>;
  };
  visitInvites: {
    where(index: string): ExpirationWhereClause<TVisit>;
  };
  syncQueue: {
    toArray(): Promise<SyncQueueItem[]>;
    delete(id: string): Promise<void>;
  };
  transaction(...args: unknown[]): Promise<unknown>;
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

    if (typeof payload.visitId !== 'string') {
      return null;
    }

    const trimmedVisitId = payload.visitId.trim();
    return trimmedVisitId.length > 0 ? trimmedVisitId : null;
  } catch {
    return null;
  }
}

async function removePendingSyncItemsForVisitInTransaction(
  db: ExpirationCleanupDb,
  visitId: string
): Promise<number> {
  const pendingItems = await db.syncQueue.toArray();
  let deletedCount = 0;

  for (const item of pendingItems) {
    if (getVisitIdFromSyncQueueItem(item) === visitId) {
      await db.syncQueue.delete(item.id);
      deletedCount += 1;
    }
  }

  return deletedCount;
}

export async function cleanExpiredLocalDataFromDb(
  db: ExpirationCleanupDb,
  now: Date = new Date()
): Promise<LocalExpirationCleanupResult> {
  let expiredNotesRemoved = 0;
  let expiredVisitsRemoved = 0;
  let relatedNotesRemoved = 0;
  let visitMembersRemoved = 0;
  let visitInvitesRemoved = 0;
  let syncQueueItemsRemoved = 0;

  await db.transaction('rw', [db.notes, db.visits, db.visitMembers, db.visitInvites, db.syncQueue], async () => {
    const expiredNotesWhere = db.notes.where('expiresAt').belowOrEqual?.(now);
    if (expiredNotesWhere?.delete) {
      expiredNotesRemoved = await expiredNotesWhere.delete();
    }

    const expiredVisitsWhere = db.visits.where('expiresAt').belowOrEqual?.(now);
    const expiredVisits = await (expiredVisitsWhere?.toArray?.() ?? Promise.resolve([]));
    expiredVisitsRemoved = expiredVisits.length;

    for (const visit of expiredVisits) {
      const visitId = visit.id;

      const relatedNotesDelete = db.notes.where('visitId').equals?.(visitId);
      if (relatedNotesDelete) {
        relatedNotesRemoved += await relatedNotesDelete.delete();
      }

      const membersDelete = db.visitMembers.where('visitId').equals?.(visitId);
      if (membersDelete) {
        visitMembersRemoved += await membersDelete.delete();
      }

      const invitesDelete = db.visitInvites.where('visitId').equals?.(visitId);
      if (invitesDelete) {
        visitInvitesRemoved += await invitesDelete.delete();
      }

      syncQueueItemsRemoved += await removePendingSyncItemsForVisitInTransaction(db, visitId);
      await db.visits.delete(visitId);
    }
  });

  return {
    expiredNotesRemoved,
    expiredVisitsRemoved,
    relatedNotesRemoved,
    visitMembersRemoved,
    visitInvitesRemoved,
    syncQueueItemsRemoved,
  };
}
