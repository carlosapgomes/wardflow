import type { Note } from '@/models/note';
import { normalizeTagList, normalizeTagValue } from '@/models/tag';
import type { UserTagStat } from '@/models/user-tag-stat';
import type { Visit } from '@/models/visit';
import type { VisitMember } from '@/models/visit-member';
import { isNoteActive } from '@/utils/note-expiration';
import { isVisitActive } from '@/utils/visit-expiration';
import { getAuthState } from '@/services/auth/auth-service';
import { db } from './dexie-db';

const DEFAULT_SUGGESTION_LIMIT = 10;

function resolveLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_SUGGESTION_LIMIT;
  }

  return Math.floor(limit);
}

function resolveNoteLastUsedAt(note: Note): Date {
  const createdAt = note.createdAt instanceof Date ? note.createdAt : new Date(note.createdAt);
  const updatedAt = note.updatedAt
    ? (note.updatedAt instanceof Date ? note.updatedAt : new Date(note.updatedAt))
    : null;

  if (updatedAt && updatedAt > createdAt) {
    return updatedAt;
  }

  return createdAt;
}

function sortUserTagStats(stats: UserTagStat[]): UserTagStat[] {
  return [...stats].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    const lastUsedDelta = b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
    if (lastUsedDelta !== 0) {
      return lastUsedDelta;
    }

    return a.tag.localeCompare(b.tag);
  });
}

function buildAccessibleActiveVisitIds(
  userId: string,
  visits: Visit[],
  memberships: VisitMember[],
  now: Date
): string[] {
  const activeVisitIds = new Set(
    visits
      .filter((visit) => isVisitActive(visit, now))
      .map((visit) => visit.id)
  );

  const membershipVisitIds = new Set(
    memberships
      .filter((member) => member.userId === userId && member.status === 'active')
      .map((member) => member.visitId)
  );

  return visits
    .filter((visit) => activeVisitIds.has(visit.id))
    .filter((visit) => visit.userId === userId || membershipVisitIds.has(visit.id))
    .map((visit) => visit.id);
}

export async function rebuildUserTagStats(userId: string): Promise<void> {
  const now = new Date();

  await db.transaction('rw', [db.visits, db.visitMembers, db.notes, db.userTagStats], async () => {
    const visits = await db.visits.toArray();
    const memberships = await db.visitMembers.where({ userId, status: 'active' }).toArray();
    const accessibleVisitIds = buildAccessibleActiveVisitIds(userId, visits, memberships, now);

    const notes = accessibleVisitIds.length > 0
      ? await db.notes.where('visitId').anyOf(accessibleVisitIds).toArray()
      : [];

    const aggregation = new Map<string, { count: number; lastUsedAt: Date }>();

    for (const note of notes) {
      if (!isNoteActive(note, now)) {
        continue;
      }

      const normalizedTags = normalizeTagList(note.tags ?? []);
      if (normalizedTags.length === 0) {
        continue;
      }

      const lastUsedAt = resolveNoteLastUsedAt(note);

      for (const tag of normalizedTags) {
        const current = aggregation.get(tag);

        if (!current) {
          aggregation.set(tag, { count: 1, lastUsedAt });
          continue;
        }

        current.count += 1;
        if (lastUsedAt > current.lastUsedAt) {
          current.lastUsedAt = lastUsedAt;
        }
      }
    }

    const nextStats: UserTagStat[] = Array.from(aggregation.entries()).map(([tag, values]) => ({
      id: `${userId}:${tag}`,
      userId,
      tag,
      count: values.count,
      lastUsedAt: values.lastUsedAt,
      updatedAt: now,
    }));

    await db.userTagStats.where('userId').equals(userId).delete();

    if (nextStats.length > 0) {
      await db.userTagStats.bulkPut(nextStats);
    }
  });
}

export function triggerCurrentUserTagStatsRebuild(): void {
  try {
    const { user } = getAuthState();

    if (!user) {
      return;
    }

    void rebuildUserTagStats(user.uid).catch((error: unknown) => {
      console.warn('[Tags] Falha ao reconstruir sugestões por usuário (best-effort):', error);
    });
  } catch (error) {
    console.warn('[Tags] Falha ao disparar rebuild de sugestões (best-effort):', error);
  }
}

export async function getTopUserTagSuggestions(userId: string, limit?: number): Promise<UserTagStat[]> {
  const stats = await db.userTagStats.where('userId').equals(userId).toArray();
  return sortUserTagStats(stats).slice(0, resolveLimit(limit));
}

export async function searchUserTagSuggestions(
  userId: string,
  query: string,
  limit?: number
): Promise<UserTagStat[]> {
  const normalizedQuery = normalizeTagValue(query);

  // Query vazia após normalização reaproveita a regra do top.
  if (!normalizedQuery) {
    return getTopUserTagSuggestions(userId, limit);
  }

  const stats = await db.userTagStats.where('userId').equals(userId).toArray();
  const filtered = stats.filter((stat) => stat.tag.startsWith(normalizedQuery));

  return sortUserTagStats(filtered).slice(0, resolveLimit(limit));
}
