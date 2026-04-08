import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '@/models/note';
import type { UserTagStat } from '@/models/user-tag-stat';
import type { Visit } from '@/models/visit';
import type { VisitMember } from '@/models/visit-member';

const state = vi.hoisted(() => ({
  visits: [] as Visit[],
  visitMembers: [] as VisitMember[],
  notes: [] as Note[],
  userTagStats: [] as UserTagStat[],
  authUser: { uid: 'user-1' } as { uid: string } | null,
}));

vi.mock('@/services/auth/auth-service', () => ({
  getAuthState: vi.fn(() => ({ user: state.authUser })),
}));

vi.mock('./dexie-db', () => ({
  db: {
    transaction: vi.fn(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => {
      await callback();
    }),
    visits: {
      toArray: vi.fn(() => Promise.resolve(state.visits)),
    },
    visitMembers: {
      where: vi.fn((query: { userId?: string; status?: string }) => ({
        toArray: vi.fn(() =>
          Promise.resolve(
            state.visitMembers.filter((member) => {
              if (query.userId && member.userId !== query.userId) {
                return false;
              }

              if (query.status && member.status !== query.status) {
                return false;
              }

              return true;
            })
          )
        ),
      })),
    },
    notes: {
      where: vi.fn((index: string) => {
        if (index !== 'visitId') {
          throw new Error(`Índice não suportado no mock: ${index}`);
        }

        return {
          anyOf: vi.fn((visitIds: string[]) => ({
            toArray: vi.fn(() => Promise.resolve(state.notes.filter((note) => visitIds.includes(note.visitId)))),
          })),
        };
      }),
    },
    userTagStats: {
      where: vi.fn((index: string) => {
        if (index !== 'userId') {
          throw new Error(`Índice não suportado no mock: ${index}`);
        }

        return {
          equals: vi.fn((userId: string) => ({
            toArray: vi.fn(() => Promise.resolve(state.userTagStats.filter((stat) => stat.userId === userId))),
            delete: vi.fn(() => {
              const before = state.userTagStats.length;
              state.userTagStats = state.userTagStats.filter((stat) => stat.userId !== userId);
              return Promise.resolve(before - state.userTagStats.length);
            }),
          })),
        };
      }),
      bulkPut: vi.fn((stats: UserTagStat[]) => {
        for (const stat of stats) {
          const index = state.userTagStats.findIndex((existing) => existing.id === stat.id);

          if (index >= 0) {
            state.userTagStats[index] = stat;
          } else {
            state.userTagStats.push(stat);
          }
        }

        return Promise.resolve();
      }),
    },
  },
}));

import {
  getTopUserTagSuggestions,
  rebuildUserTagStats,
  searchUserTagSuggestions,
  triggerCurrentUserTagStatsRebuild,
} from './user-tag-stats-service';

function createVisit(partial: Partial<Visit>): Visit {
  return {
    id: 'visit-id',
    userId: 'user-1',
    name: 'Visita',
    date: '2026-04-07',
    mode: 'group',
    createdAt: new Date('2026-04-01T09:00:00.000Z'),
    expiresAt: new Date('2026-04-21T09:00:00.000Z'),
    ...partial,
  };
}

function createNote(partial: Partial<Note>): Note {
  return {
    id: crypto.randomUUID(),
    userId: 'user-1',
    visitId: 'visit-id',
    date: '2026-04-07',
    bed: '01',
    note: 'Paciente estável',
    tags: ['UTI'],
    createdAt: new Date('2026-04-07T10:00:00.000Z'),
    updatedAt: undefined,
    expiresAt: new Date('2026-04-21T10:00:00.000Z'),
    syncStatus: 'synced',
    syncedAt: undefined,
    ...partial,
  };
}

describe('user-tag-stats-service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
    state.visits = [];
    state.visitMembers = [];
    state.notes = [];
    state.userTagStats = [];
    state.authUser = { uid: 'user-1' };
    vi.clearAllMocks();
  });

  it('agrega tags normalizadas de múltiplas notas', async () => {
    state.visits = [createVisit({ id: 'visit-own', userId: 'user-1', mode: 'private' })];
    state.notes = [
      createNote({ id: 'n-1', visitId: 'visit-own', tags: [' sepse ', 'SÉPSE', ' choque  séptico '] }),
      createNote({ id: 'n-2', visitId: 'visit-own', tags: ['SEPSE'] }),
    ];

    await rebuildUserTagStats('user-1');

    const top = await getTopUserTagSuggestions('user-1', 10);

    expect(top.map((item) => item.tag)).toEqual(['SEPSE', 'CHOQUE SEPTICO']);
    expect(top.find((item) => item.tag === 'SEPSE')?.count).toBe(2);
    expect(top.find((item) => item.tag === 'CHOQUE SEPTICO')?.count).toBe(1);
  });

  it('considera tags de visitas compartilhadas acessíveis ao usuário', async () => {
    state.visits = [
      createVisit({ id: 'visit-shared', userId: 'owner-2', mode: 'group' }),
      createVisit({ id: 'visit-no-access', userId: 'owner-3', mode: 'group' }),
    ];
    state.visitMembers = [
      {
        id: 'visit-shared:user-1',
        visitId: 'visit-shared',
        userId: 'user-1',
        role: 'viewer',
        status: 'active',
        createdAt: new Date('2026-04-01T09:00:00.000Z'),
        updatedAt: new Date('2026-04-01T09:00:00.000Z'),
      },
    ];
    state.notes = [
      createNote({ id: 'n-1', userId: 'owner-2', visitId: 'visit-shared', tags: ['Infecção'] }),
      createNote({ id: 'n-2', userId: 'owner-3', visitId: 'visit-no-access', tags: ['EXCLUIR'] }),
    ];

    await rebuildUserTagStats('user-1');

    const top = await getTopUserTagSuggestions('user-1', 10);

    expect(top.map((item) => item.tag)).toEqual(['INFECCAO']);
  });

  it('ignora visitas expiradas', async () => {
    state.visits = [
      createVisit({ id: 'visit-active', userId: 'user-1', mode: 'private', expiresAt: new Date('2026-04-12T12:00:00.000Z') }),
      createVisit({ id: 'visit-expired', userId: 'user-1', mode: 'private', expiresAt: new Date('2026-04-07T12:00:00.000Z') }),
    ];
    state.notes = [
      createNote({ id: 'n-1', visitId: 'visit-active', tags: ['ATIVA'] }),
      createNote({ id: 'n-2', visitId: 'visit-expired', tags: ['EXPIRADA'] }),
    ];

    await rebuildUserTagStats('user-1');

    const top = await getTopUserTagSuggestions('user-1', 10);

    expect(top.map((item) => item.tag)).toEqual(['ATIVA']);
  });

  it('ignora notas expiradas', async () => {
    state.visits = [createVisit({ id: 'visit-own', userId: 'user-1', mode: 'private' })];
    state.notes = [
      createNote({ id: 'n-1', visitId: 'visit-own', tags: ['ATIVA'], expiresAt: new Date('2026-04-10T12:00:00.000Z') }),
      createNote({ id: 'n-2', visitId: 'visit-own', tags: ['EXPIRADA'], expiresAt: new Date('2026-04-07T12:00:00.000Z') }),
    ];

    await rebuildUserTagStats('user-1');

    const top = await getTopUserTagSuggestions('user-1', 10);

    expect(top.map((item) => item.tag)).toEqual(['ATIVA']);
  });

  it('ordena top por frequência e depois recência', async () => {
    state.visits = [createVisit({ id: 'visit-own', userId: 'user-1', mode: 'private' })];
    state.notes = [
      createNote({ id: 'n-1', visitId: 'visit-own', tags: ['A'], createdAt: new Date('2026-04-01T10:00:00.000Z') }),
      createNote({ id: 'n-2', visitId: 'visit-own', tags: ['A'], createdAt: new Date('2026-04-02T10:00:00.000Z') }),
      createNote({ id: 'n-3', visitId: 'visit-own', tags: ['B'], createdAt: new Date('2026-04-03T10:00:00.000Z') }),
      createNote({ id: 'n-4', visitId: 'visit-own', tags: ['B'], createdAt: new Date('2026-04-02T10:00:00.000Z'), updatedAt: new Date('2026-04-06T10:00:00.000Z') }),
      createNote({ id: 'n-5', visitId: 'visit-own', tags: ['C'], createdAt: new Date('2026-04-05T10:00:00.000Z') }),
    ];

    await rebuildUserTagStats('user-1');

    const top = await getTopUserTagSuggestions('user-1', 10);

    expect(top.map((item) => item.tag)).toEqual(['B', 'A', 'C']);
  });

  it('busca por prefixo normalizado', async () => {
    state.userTagStats = [
      {
        id: 'user-1:SEPSE',
        userId: 'user-1',
        tag: 'SEPSE',
        count: 3,
        lastUsedAt: new Date('2026-04-06T10:00:00.000Z'),
        updatedAt: new Date('2026-04-07T10:00:00.000Z'),
      },
      {
        id: 'user-1:SEPSIS',
        userId: 'user-1',
        tag: 'SEPSIS',
        count: 2,
        lastUsedAt: new Date('2026-04-05T10:00:00.000Z'),
        updatedAt: new Date('2026-04-07T10:00:00.000Z'),
      },
      {
        id: 'user-1:CHOQUE',
        userId: 'user-1',
        tag: 'CHOQUE',
        count: 10,
        lastUsedAt: new Date('2026-04-07T09:00:00.000Z'),
        updatedAt: new Date('2026-04-07T10:00:00.000Z'),
      },
    ];

    const found = await searchUserTagSuggestions('user-1', '  sép  ', 10);
    expect(found.map((item) => item.tag)).toEqual(['SEPSE', 'SEPSIS']);

    const emptyQueryFallback = await searchUserTagSuggestions('user-1', '   ', 2);
    expect(emptyQueryFallback.map((item) => item.tag)).toEqual(['CHOQUE', 'SEPSE']);
  });

  it('triggerCurrentUserTagStatsRebuild é no-op sem usuário autenticado', async () => {
    state.authUser = null;
    triggerCurrentUserTagStatsRebuild();

    await Promise.resolve();

    const { db } = await import('./dexie-db');
    const mockedDb = db as unknown as { transaction: ReturnType<typeof vi.fn> };
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it('triggerCurrentUserTagStatsRebuild captura falha sem lançar erro', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((..._args: unknown[]) => undefined);

    const { db } = await import('./dexie-db');
    const mockedDb = db as unknown as {
      transaction: ReturnType<typeof vi.fn>;
    };

    mockedDb.transaction.mockRejectedValueOnce(new Error('boom-rebuild'));

    expect(() => {
      triggerCurrentUserTagStatsRebuild();
    }).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      '[Tags] Falha ao reconstruir sugestões por usuário (best-effort):',
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });
});
