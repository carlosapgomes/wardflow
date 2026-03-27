/**
 * Testes para notes-service - validação de input e funções pura
 */

import { describe, it, expect } from 'vitest';
import * as notesService from './notes-service';

describe('notes-service - validateNoteInput', () => {
  it('deve retornar true para input válido', () => {
    const input = {
      ward: 'UTI',
      bed: '01',
      note: 'Nota válida',
    };

    expect(notesService.validateNoteInput(input)).toBe(true);
  });

  it('deve retornar false se ward vazio', () => {
    const input = {
      ward: '',
      bed: '01',
      note: 'Nota válida',
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar false se bed vazio', () => {
    const input = {
      ward: 'UTI',
      bed: '',
      note: 'Nota válida',
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar false se note vazio', () => {
    const input = {
      ward: 'UTI',
      bed: '01',
      note: '',
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar false se note exceder limite de 2000 caracteres', () => {
    const longNote = 'a'.repeat(2001);
    const input = {
      ward: 'UTI',
      bed: '01',
      note: longNote,
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });

  it('deve retornar true se note tem exatamente 2000 caracteres', () => {
    const exactNote = 'a'.repeat(2000);
    const input = {
      ward: 'UTI',
      bed: '01',
      note: exactNote,
    };

    expect(notesService.validateNoteInput(input)).toBe(true);
  });

  it('deve retornar true para input com espaços em branco que serão trimmed', () => {
    // O validateNoteInput não faz trim, apenas verifica se os campos estão vazios após trim
    const input = {
      ward: '   ',
      bed: '01',
      note: 'Nota',
    };

    expect(notesService.validateNoteInput(input)).toBe(false);
  });
});
