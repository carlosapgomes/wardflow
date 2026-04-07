/**
 * Testes para isVisitActive e filterActiveVisits
 */

import { describe, it, expect } from 'vitest';
import { isVisitActive, filterActiveVisits } from './visit-expiration';
import type { Visit } from '@/models/visit';

function createTestVisit(expiresAt: Date): Visit {
  return {
    id: 'visit-1',
    userId: 'user-1',
    name: 'Visita teste',
    date: '2026-04-07',
    mode: 'private',
    createdAt: new Date('2026-04-07T10:00:00.000Z'),
    expiresAt,
  };
}

describe('isVisitActive', () => {
  it('retorna true para visita com expiresAt no futuro', () => {
    const now = new Date('2026-04-07T10:00:00.000Z');
    const visit = createTestVisit(new Date('2026-04-08T10:00:00.000Z'));

    expect(isVisitActive(visit, now)).toBe(true);
  });

  it('retorna false para visita com expiresAt no passado', () => {
    const now = new Date('2026-04-07T10:00:00.000Z');
    const visit = createTestVisit(new Date('2026-04-06T10:00:00.000Z'));

    expect(isVisitActive(visit, now)).toBe(false);
  });

  it('retorna false para visita com expiresAt igual a now (limite)', () => {
    const now = new Date('2026-04-07T10:00:00.000Z');
    const visit = createTestVisit(new Date('2026-04-07T10:00:00.000Z'));

    expect(isVisitActive(visit, now)).toBe(false);
  });
});

describe('filterActiveVisits', () => {
  it('filtra apenas visitas ativas', () => {
    const now = new Date('2026-04-07T10:00:00.000Z');
    const visits: Visit[] = [
      createTestVisit(new Date('2026-04-08T10:00:00.000Z')),
      createTestVisit(new Date('2026-04-06T10:00:00.000Z')),
      createTestVisit(new Date('2026-04-09T10:00:00.000Z')),
    ];

    const result = filterActiveVisits(visits, now);

    expect(result).toHaveLength(2);
  });
});
