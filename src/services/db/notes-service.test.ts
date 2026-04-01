/**
 * Testes para notes-service - validação de input e funções puras
 */

import { describe, it, expect } from 'vitest';
import * as notesService from './notes-service';

describe('notes-service - validateNoteInput', () => {
  it('deve retornar true para input válido com tags', () => {
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: 'Nota válida',
      tags: ['UTI'],
    };

    expect(notesService.validateNoteInput(input)).toBe(true);
  });

  it('deve retornar false se ward vazio', () => {
    const input = {
      visitId: 'visit-123',
      ward: '',
      bed: '01',
      note: 'Nota válida',
      tags: ['UTI'],
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar false se bed vazio', () => {
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '',
      note: 'Nota válida',
      tags: ['UTI'],
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar false se note vazio', () => {
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: '',
      tags: ['UTI'],
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar false se note exceder limite de 2000 caracteres', () => {
    const longNote = 'a'.repeat(2001);
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: longNote,
      tags: ['UTI'],
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar true se note tem exatamente 2000 caracteres', () => {
    const exactNote = 'a'.repeat(2000);
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: exactNote,
      tags: ['UTI'],
    };

    expect(notesService.validateNoteInput(input)).toBe(true);
  });

  it('deve retornar false para input com ward em branco após trim', () => {
    const input = {
      visitId: 'visit-123',
      ward: '   ',
      bed: '01',
      note: 'Nota',
      tags: ['UTI'],
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });
});

describe('notes-service - CreateNoteInput com tags', () => {
  it('deve aceitar tags no input', () => {
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: 'Nota válida',
      tags: ['UTI', 'emergência'],
    };

    expect(notesService.validateNoteInput(input)).toBe(true);
  });

  it('deve rejeitar tags vazio', () => {
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: 'Nota válida',
      tags: [],
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve rejeitar tags undefined', () => {
    const input = {
      visitId: 'visit-123',
      ward: 'UTI',
      bed: '01',
      note: 'Nota válida',
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });
});
