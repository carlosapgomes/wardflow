/**
 * Testes para groupNotesByDateAndWard
 */

import { describe, it, expect } from 'vitest';
import { groupNotesByDateAndWard } from './group-notes-by-date-and-ward';
import type { Note } from '@/models/note';

/**
 * Helper para criar nota de teste
 */
function createTestNote(overrides: Partial<Note>): Note {
  return {
    id: crypto.randomUUID(),
    userId: 'test-user',
    date: '2024-03-25',
    ward: 'UTI',
    bed: '01',
      visitId: 'visit-1',
    note: 'Test note',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('groupNotesByDateAndWard', () => {
  it('retorna array vazio para lista vazia', () => {
    const result = groupNotesByDateAndWard([]);
    expect(result).toEqual([]);
  });

  it('notas da mesma data e mesma ward ficam no mesmo grupo', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', ward: 'UTI', bed: '01' }),
      createTestNote({ id: '2', date: '2024-03-25', ward: 'UTI', bed: '02' }),
    ];

    const result = groupNotesByDateAndWard(notes);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-03-25');
    expect(result[0].wards).toHaveLength(1);
    expect(result[0].wards[0].ward).toBe('UTI');
    expect(result[0].wards[0].notes).toHaveLength(2);
  });

  it('notas da mesma data e wards diferentes criam grupos separados', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', ward: 'UTI', bed: '01' }),
      createTestNote({ id: '2', date: '2024-03-25', ward: 'Intermediário', bed: '02' }),
    ];

    const result = groupNotesByDateAndWard(notes);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-03-25');
    expect(result[0].wards).toHaveLength(2);
    expect(result[0].wards.map((w) => w.ward)).toContain('UTI');
    expect(result[0].wards.map((w) => w.ward)).toContain('Intermediário');
  });

  it('notas de datas diferentes criam grupos de data separados', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', ward: 'UTI', bed: '01' }),
      createTestNote({ id: '2', date: '2024-03-24', ward: 'UTI', bed: '02' }),
    ];

    const result = groupNotesByDateAndWard(notes);

    expect(result).toHaveLength(2);
    expect(result.map((g) => g.date)).toContain('2024-03-25');
    expect(result.map((g) => g.date)).toContain('2024-03-24');
  });

  it('datas ficam ordenadas da mais recente para a mais antiga', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-24', ward: 'UTI', bed: '01' }),
      createTestNote({ id: '2', date: '2024-03-26', ward: 'UTI', bed: '02' }),
      createTestNote({ id: '3', date: '2024-03-25', ward: 'UTI', bed: '03' }),
    ];

    const result = groupNotesByDateAndWard(notes);

    expect(result[0].date).toBe('2024-03-26');
    expect(result[1].date).toBe('2024-03-25');
    expect(result[2].date).toBe('2024-03-24');
  });

  it('wards ficam em ordem alfabética', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', ward: 'UTI', bed: '01' }),
      createTestNote({ id: '2', date: '2024-03-25', ward: 'Intermediário', bed: '02' }),
      createTestNote({ id: '3', date: '2024-03-25', ward: 'Enfermaria', bed: '03' }),
    ];

    const result = groupNotesByDateAndWard(notes);

    expect(result[0].wards[0].ward).toBe('Enfermaria');
    expect(result[0].wards[1].ward).toBe('Intermediário');
    expect(result[0].wards[2].ward).toBe('UTI');
  });

  it('notas dentro da ward ficam em ordem decrescente de createdAt', () => {
    const now = Date.now();
    const notes: Note[] = [
      createTestNote({
        id: '1',
        date: '2024-03-25',
        ward: 'UTI',
        bed: '01',
      visitId: 'visit-1',
        createdAt: new Date(now - 2000),
      }),
      createTestNote({
        id: '2',
        date: '2024-03-25',
        ward: 'UTI',
        bed: '02',
        createdAt: new Date(now),
      }),
      createTestNote({
        id: '3',
        date: '2024-03-25',
        ward: 'UTI',
        bed: '03',
        createdAt: new Date(now - 1000),
      }),
    ];

    const result = groupNotesByDateAndWard(notes);

    expect(result[0].wards[0].notes[0].id).toBe('2'); // mais recente
    expect(result[0].wards[0].notes[1].id).toBe('3');
    expect(result[0].wards[0].notes[2].id).toBe('1'); // mais antiga
  });

  it('não muta o array original', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', ward: 'UTI', bed: '01' }),
    ];
    const originalLength = notes.length;

    groupNotesByDateAndWard(notes);

    expect(notes.length).toBe(originalLength);
  });
});
