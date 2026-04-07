import { describe, it, expect, vi } from 'vitest';
import { cleanExpiredLocalDataFromDb } from './local-expiration-cleanup';
import type { SyncQueueItem } from '@/models/sync-queue';

describe('cleanExpiredLocalDataFromDb', () => {
  it('remove visita expirada e dados locais relacionados', async () => {
    const now = new Date('2026-04-07T10:00:00.000Z');

    const syncQueueItems: SyncQueueItem[] = [
      {
        id: 'queue-note-expired-visit',
        userId: 'user-1',
        operation: 'update',
        entityType: 'note',
        entityId: 'note-1',
        payload: JSON.stringify({ visitId: 'visit-expired-1' }),
        createdAt: now,
        retryCount: 0,
      },
      {
        id: 'queue-member-expired-visit',
        userId: 'user-1',
        operation: 'update',
        entityType: 'visit-member',
        entityId: 'visit-expired-1:user-1',
        payload: JSON.stringify({}),
        createdAt: now,
        retryCount: 0,
      },
      {
        id: 'queue-other-visit',
        userId: 'user-1',
        operation: 'update',
        entityType: 'visit',
        entityId: 'visit-active-1',
        payload: JSON.stringify({}),
        createdAt: now,
        retryCount: 0,
      },
    ];

    const notesByVisitDelete = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-expired-1' ? 1 : 0));
    const visitMembersDelete = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-expired-1' ? 1 : 0));
    const visitInvitesDelete = vi.fn((visitId: string) => Promise.resolve(visitId === 'visit-expired-1' ? 1 : 0));

    const mockDb = {
      notes: {
        where: vi.fn((index: string) => {
          if (index === 'expiresAt') {
            return {
              belowOrEqual: vi.fn().mockReturnValue({
                delete: vi.fn().mockResolvedValue(2),
              }),
            };
          }

          if (index === 'visitId') {
            return {
              equals: vi.fn((visitId: string) => ({
                delete: () => notesByVisitDelete(visitId),
              })),
            };
          }

          return {
            belowOrEqual: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(0) }),
            equals: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(0) }),
          };
        }),
      },
      visits: {
        where: vi.fn(() => ({
          belowOrEqual: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              { id: 'visit-expired-1' },
            ]),
          }),
        })),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      visitMembers: {
        where: vi.fn(() => ({
          equals: vi.fn((visitId: string) => ({
            delete: () => visitMembersDelete(visitId),
          })),
        })),
      },
      visitInvites: {
        where: vi.fn(() => ({
          equals: vi.fn((visitId: string) => ({
            delete: () => visitInvitesDelete(visitId),
          })),
        })),
      },
      syncQueue: {
        toArray: vi.fn().mockResolvedValue(syncQueueItems),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      transaction: vi.fn(async (_mode: 'rw', _tables: unknown[], callback: () => Promise<void>) => {
        await callback();
      }),
    };

    const result = await cleanExpiredLocalDataFromDb(mockDb, now);

    expect(result.expiredNotesRemoved).toBe(2);
    expect(result.expiredVisitsRemoved).toBe(1);
    expect(result.relatedNotesRemoved).toBe(1);
    expect(result.visitMembersRemoved).toBe(1);
    expect(result.visitInvitesRemoved).toBe(1);
    expect(result.syncQueueItemsRemoved).toBe(2);

    expect(mockDb.syncQueue.delete).toHaveBeenCalledWith('queue-note-expired-visit');
    expect(mockDb.syncQueue.delete).toHaveBeenCalledWith('queue-member-expired-visit');
    expect(mockDb.syncQueue.delete).not.toHaveBeenCalledWith('queue-other-visit');
    expect(mockDb.visits.delete).toHaveBeenCalledWith('visit-expired-1');
  });
});
