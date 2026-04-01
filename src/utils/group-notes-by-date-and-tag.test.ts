/**
 * Testes para groupNotesByDateAndTag
 * TDD: testes primeiro, implementação depois
 */

import { describe, it, expect } from 'vitest';
import { groupNotesByDateAndTag } from './group-notes-by-date-and-tag';
import type { Note } from '@/models/note';

/**
 * Helper para criar nota de teste
 */
function createTestNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    userId: 'test-user',
    date: '2024-03-25',
    ward: 'UTI',
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

describe('groupNotesByDateAndTag', () => {
  it('retorna array vazio para lista vazia', () => {
    const result = groupNotesByDateAndTag([]);
    expect(result).toEqual([]);
  });

  it('nota sem tags válidas não entra em grupo', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', ward: 'UTI', tags: [] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result).toHaveLength(0);
  });

  it('nota com tags usa as tags como grupo', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', ward: 'UTI', tags: ['Pediatria', 'UTI'] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result).toHaveLength(1);
    expect(result[0].tags).toHaveLength(2);
    expect(result[0].tags.map(t => t.tag)).toContain('PEDIATRIA');
    expect(result[0].tags.map(t => t.tag)).toContain('UTI');
  });

  it('nota com múltiplas tags aparece em múltiplos grupos (fan-out)', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI', 'Pediatria'] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result).toHaveLength(1);
    const tagsGroup = result[0].tags;

    // A nota deve aparecer em ambos os grupos
    const utiGroup = tagsGroup.find(t => t.tag === 'UTI');
    const pedGroup = tagsGroup.find(t => t.tag === 'PEDIATRIA');

    expect(utiGroup?.notes).toHaveLength(1);
    expect(utiGroup?.notes[0].id).toBe('1');
    expect(pedGroup?.notes).toHaveLength(1);
    expect(pedGroup?.notes[0].id).toBe('1');
  });

  it('notas de datas diferentes criam grupos separados', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI'] }),
      createTestNote({ id: '2', date: '2024-03-24', tags: ['UTI'] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result).toHaveLength(2);
    expect(result.map(g => g.date)).toContain('2024-03-25');
    expect(result.map(g => g.date)).toContain('2024-03-24');
  });

  it('datas ficam ordenadas da mais recente para a mais antiga', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-24', tags: ['UTI'] }),
      createTestNote({ id: '2', date: '2024-03-26', tags: ['UTI'] }),
      createTestNote({ id: '3', date: '2024-03-25', tags: ['UTI'] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result[0].date).toBe('2024-03-26');
    expect(result[1].date).toBe('2024-03-25');
    expect(result[2].date).toBe('2024-03-24');
  });

  it('tags ficam em ordem alfabética crescente', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI', 'Enfermaria', 'Pediatria'] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result[0].tags[0].tag).toBe('ENFERMARIA');
    expect(result[0].tags[1].tag).toBe('PEDIATRIA');
    expect(result[0].tags[2].tag).toBe('UTI');
  });

  it('notas dentro da tag ficam em ordem decrescente de createdAt', () => {
    const now = Date.now();
    const notes: Note[] = [
      createTestNote({
        id: '1',
        date: '2024-03-25',
        tags: ['UTI'],
        createdAt: new Date(now - 2000),
      }),
      createTestNote({
        id: '2',
        date: '2024-03-25',
        tags: ['UTI'],
        createdAt: new Date(now),
      }),
      createTestNote({
        id: '3',
        date: '2024-03-25',
        tags: ['UTI'],
        createdAt: new Date(now - 1000),
      }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result[0].tags[0].notes[0].id).toBe('2'); // mais recente
    expect(result[0].tags[0].notes[1].id).toBe('3');
    expect(result[0].tags[0].notes[2].id).toBe('1'); // mais antiga
  });

  it('evita duplicar nota no mesmo grupo de tag', () => {
    const notes: Note[] = [
      // Nota com tags repetidas (dedupe internamente)
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI', 'UTI', 'PEDIATRIA'] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    // Tag UTI deve ter apenas 1 nota
    const utiGroup = result[0].tags.find(t => t.tag === 'UTI');
    expect(utiGroup?.notes).toHaveLength(1);
  });

  it('não muta o array original', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI'] }),
    ];
    const originalLength = notes.length;

    groupNotesByDateAndTag(notes);

    expect(notes.length).toBe(originalLength);
  });

  it('múltiplas notas na mesma tag e data', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI'] }),
      createTestNote({ id: '2', date: '2024-03-25', tags: ['UTI'] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result).toHaveLength(1);
    expect(result[0].tags).toHaveLength(1);
    expect(result[0].tags[0].tag).toBe('UTI');
    expect(result[0].tags[0].notes).toHaveLength(2);
  });

  it('ignora notas sem tags em lote misto', () => {
    const notes: Note[] = [
      createTestNote({ id: '1', date: '2024-03-25', tags: ['UTI'] }),
      createTestNote({ id: '2', date: '2024-03-25', ward: 'Enfermaria', tags: [] }),
    ];

    const result = groupNotesByDateAndTag(notes);

    expect(result).toHaveLength(1);
    expect(result[0].tags).toHaveLength(1);
    expect(result[0].tags[0].tag).toBe('UTI');
    expect(result[0].tags[0].notes).toHaveLength(1);
    expect(result[0].tags[0].notes[0].id).toBe('1');
  });
});
