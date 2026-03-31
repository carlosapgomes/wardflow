/**
 * Testes para visit model - geração de nome de visita privada
 */

import { describe, it, expect, vi } from 'vitest';
import { generatePrivateVisitName, getCurrentDate, createVisit } from '@/models/visit';

describe('visit - generatePrivateVisitName', () => {
  it('deve gerar nome padrão sem prefixo', () => {
    // Mock da data para teste determinístico
    const mockDate = new Date('2024-03-15T10:30:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const name = generatePrivateVisitName();

    expect(name).toBe('Visita 15-03-2024 privada');

    vi.useRealTimers();
  });

  it('deve gerar nome com prefixo personalizado', () => {
    const mockDate = new Date('2024-03-15T10:30:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const name = generatePrivateVisitName('UTI');

    expect(name).toBe('UTI 15-03-2024 privada');

    vi.useRealTimers();
  });

  it('deve gerar nome com prefixo contendo espaços', () => {
    const mockDate = new Date('2024-01-05T08:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const name = generatePrivateVisitName('Ala A');

    expect(name).toBe('Ala A 05-01-2024 privada');

    vi.useRealTimers();
  });

  it('deve ignorar prefixo vazio', () => {
    const mockDate = new Date('2024-12-25T00:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const name = generatePrivateVisitName('');

    expect(name).toBe('Visita 25-12-2024 privada');

    vi.useRealTimers();
  });

  it('deve ignorar prefixo com apenas espaços', () => {
    const mockDate = new Date('2024-07-01T12:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const name = generatePrivateVisitName('   ');

    expect(name).toBe('Visita 01-07-2024 privada');

    vi.useRealTimers();
  });

  it('deve fazer trim no prefixo', () => {
    const mockDate = new Date('2024-06-10T14:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const name = generatePrivateVisitName('  UTI  ');

    expect(name).toBe('UTI 10-06-2024 privada');

    vi.useRealTimers();
  });
});

describe('visit - getCurrentDate', () => {
  it('deve retornar data no formato YYYY-MM-DD', () => {
    const mockDate = new Date('2024-03-15T10:30:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const date = getCurrentDate();

    expect(date).toBe('2024-03-15');

    vi.useRealTimers();
  });
});

describe('visit - createVisit', () => {
  it('deve criar visita com valores padrão', () => {
    const mockDate = new Date('2024-03-15T10:30:00');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const visit = createVisit({ userId: 'user-123', name: 'Teste' });

    expect(visit.id).toBeDefined();
    expect(visit.userId).toBe('user-123');
    expect(visit.name).toBe('Teste');
    expect(visit.date).toBe('2024-03-15');
    expect(visit.mode).toBe('private');
    expect(visit.createdAt).toBeInstanceOf(Date);

    vi.useRealTimers();
  });

  it('deve permitir sobrescrever mode', () => {
    const visit = createVisit({ userId: 'user-123', mode: 'group' });

    expect(visit.mode).toBe('group');
  });
});
