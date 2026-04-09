/**
 * Testes para groupNotesByTag
 */

import { describe, it, expect } from 'vitest';
import { groupNotesByTag } from './group-notes-by-tag';
import type { Note } from '@/models/note';

function createTestNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    userId: 'test-user',
    date: '2024-03-25',
    bed: '01',
    visitId: 'visit-1',
    note: 'Test note',
    tags: [],
    createdAt: new Date(),
    expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('groupNotesByTag', () => {
  it('retorna array vazio para lista vazia', () => {
    expect(groupNotesByTag([])).toEqual([]);
  });

  it('notas de datas diferentes na mesma visita aparecem no mesmo grupo por tag', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI'], bed: '02' }),
      createTestNote({ id: '2', date: '2024-03-26', tags: ['UTI'], bed: '01' }),
    ];

    const result = groupNotesByTag(notes);

    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('UTI');
    expect(result[0].notes.map((note) => note.id)).toEqual(['2', '1']);
  });

  it('nota com múltiplas tags continua em fan-out', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', tags: ['UTI', 'Pediatria'] }),
    ];

    const result = groupNotesByTag(notes);

    expect(result).toHaveLength(2);
    expect(result.map((group) => group.tag)).toEqual(['PEDIATRIA', 'UTI']);
    expect(result[0].notes[0].id).toBe('1');
    expect(result[1].notes[0].id).toBe('1');
  });

  it('mantém ordenação estável: tags asc e notas por leito asc', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', tags: ['UTI'], bed: 'i04b' }),
      createTestNote({ id: '2', tags: ['ENFERMARIA'], bed: 'i04d' }),
      createTestNote({ id: '3', tags: ['UTI'], bed: 'i04a' }),
    ];

    const result = groupNotesByTag(notes);

    expect(result.map((group) => group.tag)).toEqual(['ENFERMARIA', 'UTI']);
    expect(result[1].notes.map((note) => note.bed)).toEqual(['i04a', 'i04b']);
  });
});
