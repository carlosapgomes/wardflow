/**
 * Testes para isNoteActive e filterActiveNotes
 */

import { describe, it, expect } from 'vitest';
import { isNoteActive, filterActiveNotes } from './note-expiration';
import type { Note } from '@/models/note';

/**
 * Helper para criar nota de teste com expiresAt customizado
 */
function createTestNote(expiresAt: Date): Note {
  return {
    id: 'test-id',
    userId: 'test-user',
    date: '2024-03-25',
    ward: 'UTI',
    bed: '01',
      visitId: 'visit-1',
    note: 'Test note',
    createdAt: new Date(),
    expiresAt,
    syncStatus: 'pending',
  };
}

describe('isNoteActive', () => {
  it('retorna true para nota com expiresAt no futuro', () => {
    const now = new Date('2024-03-25T12:00:00');
    const futureDate = new Date('2024-03-26T12:00:00');
    const note = createTestNote(futureDate);

    expect(isNoteActive(note, now)).toBe(true);
  });

  it('retorna false para nota com expiresAt no passado', () => {
    const now = new Date('2024-03-25T12:00:00');
    const pastDate = new Date('2024-03-24T12:00:00');
    const note = createTestNote(pastDate);

    expect(isNoteActive(note, now)).toBe(false);
  });

  it('retorna false para nota com expiresAt exatamente igual a now (limite)', () => {
    const now = new Date('2024-03-25T12:00:00');
    const note = createTestNote(now);

    expect(isNoteActive(note, now)).toBe(false);
  });

  it('retorna true para nota com expiresAt 1ms no futuro', () => {
    const now = new Date('2024-03-25T12:00:00');
    const futureDate = new Date('2024-03-25T12:00:00.001');
    const note = createTestNote(futureDate);

    expect(isNoteActive(note, now)).toBe(true);
  });

  it('retorna false para nota com expiresAt 1ms no passado', () => {
    const now = new Date('2024-03-25T12:00:00');
    const pastDate = new Date('2024-03-25T11:59:59.999');
    const note = createTestNote(pastDate);

    expect(isNoteActive(note, now)).toBe(false);
  });
});

describe('filterActiveNotes', () => {
  it('retorna array vazio para lista vazia', () => {
    const now = new Date();
    expect(filterActiveNotes([], now)).toEqual([]);
  });

  it('filtra apenas notas ativas', () => {
    const now = new Date('2024-03-25T12:00:00');
    const notes: Note[] = [
      createTestNote(new Date('2024-03-26T12:00:00')), // futura - ativa
      createTestNote(new Date('2024-03-24T12:00:00')), // passada - expirada
      createTestNote(new Date('2024-03-27T12:00:00')), // futura - ativa
    ];

    const result = filterActiveNotes(notes, now);

    expect(result).toHaveLength(2);
    expect(result[0].expiresAt.getTime()).toBe(new Date('2024-03-26T12:00:00').getTime());
    expect(result[1].expiresAt.getTime()).toBe(new Date('2024-03-27T12:00:00').getTime());
  });

  it('retorna todas as notas se todas estiverem ativas', () => {
    const now = new Date('2024-03-25T12:00:00');
    const notes: Note[] = [
      createTestNote(new Date('2024-03-26T12:00:00')),
      createTestNote(new Date('2024-03-27T12:00:00')),
    ];

    const result = filterActiveNotes(notes, now);

    expect(result).toHaveLength(2);
  });

  it('retorna array vazio se todas estiverem expiradas', () => {
    const now = new Date('2024-03-25T12:00:00');
    const notes: Note[] = [
      createTestNote(new Date('2024-03-24T12:00:00')),
      createTestNote(new Date('2024-03-23T12:00:00')),
    ];

    const result = filterActiveNotes(notes, now);

    expect(result).toHaveLength(0);
  });

  it('não muta o array original', () => {
    const now = new Date('2024-03-25T12:00:00');
    const notes: Note[] = [createTestNote(new Date('2024-03-26T12:00:00'))];
    const originalLength = notes.length;

    filterActiveNotes(notes, now);

    expect(notes.length).toBe(originalLength);
  });
});
