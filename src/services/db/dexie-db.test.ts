import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  cleanupResult: {
    expiredNotesRemoved: 0,
    expiredVisitsRemoved: 0,
    relatedNotesRemoved: 0,
    visitMembersRemoved: 0,
    visitInvitesRemoved: 0,
    syncQueueItemsRemoved: 0,
  },
}));

vi.mock('dexie', () => {
  class DexieMock {
    version(_version: number) {
      return {
        stores: (_schema: Record<string, string>) => ({
          upgrade: (_callback: unknown) => undefined,
        }),
      };
    }
  }

  return {
    default: DexieMock,
  };
});

vi.mock('./local-expiration-cleanup', () => ({
  cleanExpiredLocalDataFromDb: vi.fn(() => Promise.resolve(state.cleanupResult)),
}));

vi.mock('./user-tag-stats-service', () => ({
  triggerCurrentUserTagStatsRebuild: vi.fn(),
}));

import { cleanExpiredLocalData } from './dexie-db';
import { triggerCurrentUserTagStatsRebuild } from './user-tag-stats-service';

describe('dexie-db - cleanExpiredLocalData', () => {
  const mockedTriggerRebuild = triggerCurrentUserTagStatsRebuild as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    state.cleanupResult = {
      expiredNotesRemoved: 0,
      expiredVisitsRemoved: 0,
      relatedNotesRemoved: 0,
      visitMembersRemoved: 0,
      visitInvitesRemoved: 0,
      syncQueueItemsRemoved: 0,
    };
  });

  it('dispara rebuild quando limpeza remove dados relevantes', async () => {
    state.cleanupResult = {
      ...state.cleanupResult,
      expiredNotesRemoved: 2,
    };

    await cleanExpiredLocalData();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(mockedTriggerRebuild).toHaveBeenCalledTimes(1);
  });

  it('não dispara rebuild quando cleanup não remove notas/visitas relevantes', async () => {
    await cleanExpiredLocalData();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(mockedTriggerRebuild).not.toHaveBeenCalled();
  });
});
