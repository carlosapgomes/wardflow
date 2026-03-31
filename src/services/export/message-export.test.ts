/**
 * Testes para generateMessage
 */

import { describe, it, expect } from 'vitest';
import { generateMessage, type ExportScope } from './message-export';
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

describe('generateMessage', () => {
  describe('escopo ward', () => {
    it('gera mensagem com título da ward', () => {
      const scope: ExportScope = {
        type: 'ward',
        ward: 'Intermediário',
        notes: [createTestNote({ bed: 'I04A', note: 'aguarda RX' })],
      };

      const result = generateMessage(scope);

      expect(result).toContain('*Intermediário*');
    });

    it('formata nota no formato correto', () => {
      const scope: ExportScope = {
        type: 'ward',
        ward: 'UTI',
        notes: [createTestNote({ bed: 'U02', note: 'discutir antibiótico' })],
      };

      const result = generateMessage(scope);

      expect(result).toContain('- U02 | discutir antibiótico');
    });

    it('inclui referência quando presente', () => {
      const scope: ExportScope = {
        type: 'ward',
        ward: 'UTI',
        notes: [createTestNote({ bed: 'I04A', reference: 'AB', note: 'aguarda RX' })],
      };

      const result = generateMessage(scope);

      expect(result).toContain('- I04A (AB) | aguarda RX');
    });

    it('não inclui referência quando ausente', () => {
      const scope: ExportScope = {
        type: 'ward',
        ward: 'UTI',
        notes: [createTestNote({ bed: 'I04A', note: 'aguarda RX' })],
      };

      const result = generateMessage(scope);

      expect(result).toContain('- I04A | aguarda RX');
      expect(result).not.toContain('(');
    });

    it('lista múltiplas notas', () => {
      const scope: ExportScope = {
        type: 'ward',
        ward: 'Intermediário',
        notes: [
          createTestNote({ bed: 'I04A', note: 'aguarda RX' }),
          createTestNote({ bed: 'I04B', note: 'preparar operatório' }),
        ],
      };

      const result = generateMessage(scope);

      expect(result).toContain('- I04A | aguarda RX');
      expect(result).toContain('- I04B | preparar operatório');
    });
  });

  describe('escopo date', () => {
    it('gera mensagem com título *Pendências*', () => {
      const scope: ExportScope = {
        type: 'date',
        date: '2024-03-25',
        wards: [
          {
            ward: 'UTI',
            notes: [createTestNote({ bed: 'U02', note: 'discutir antibiótico' })],
          },
        ],
      };

      const result = generateMessage(scope);

      expect(result).toContain('*Pendências*');
    });

    it('renderiza múltiplas wards', () => {
      const scope: ExportScope = {
        type: 'date',
        date: '2024-03-25',
        wards: [
          {
            ward: 'Intermediário',
            notes: [
              createTestNote({ bed: 'I04A', note: 'aguarda RX' }),
              createTestNote({ bed: 'I04B', note: 'preparar operatório' }),
            ],
          },
          {
            ward: 'UTI',
            notes: [createTestNote({ bed: 'U02', note: 'discutir antibiótico' })],
          },
        ],
      };

      const result = generateMessage(scope);

      expect(result).toContain('*Intermediário*');
      expect(result).toContain('*UTI*');
      expect(result).toContain('- I04A | aguarda RX');
      expect(result).toContain('- I04B | preparar operatório');
      expect(result).toContain('- U02 | discutir antibiótico');
    });

    it('inclui referência nas notas dentro de ward', () => {
      const scope: ExportScope = {
        type: 'date',
        date: '2024-03-25',
        wards: [
          {
            ward: 'Intermediário',
            notes: [createTestNote({ bed: 'I05A', reference: 'AB', note: 'avaliar cirurgia' })],
          },
        ],
      };

      const result = generateMessage(scope);

      expect(result).toContain('- I05A (AB) | avaliar cirurgia');
    });
  });
});
