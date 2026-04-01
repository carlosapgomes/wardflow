/**
 * Tag Model Tests
 * Testes para normalização de tags
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeTagValue,
  normalizeTagList,
} from './tag';

describe('normalizeTagValue', () => {
  it('deve remover espaços em branco nas extremidades', () => {
    expect(normalizeTagValue('  UTI  ')).toBe('UTI');
    expect(normalizeTagValue('  enfermaria  ')).toBe('ENFERMARIA');
  });

  it('deve converter para uppercase', () => {
    expect(normalizeTagValue('uti')).toBe('UTI');
    expect(normalizeTagValue('Enfermaria')).toBe('ENFERMARIA');
  });

  it('deve remover acentos', () => {
    expect(normalizeTagValue('UTI')).toBe('UTI');
    expect(normalizeTagValue('Enfermaria')).toBe('ENFERMARIA');
    expect(normalizeTagValue('Alaíde')).toBe('ALAIDE');
    expect(normalizeTagValue('Pediátrica')).toBe('PEDIATRICA');
  });

  it('deve colapsar espaços internos', () => {
    expect(normalizeTagValue('UTI   A')).toBe('UTI A');
    expect(normalizeTagValue('Enfermaria  01')).toBe('ENFERMARIA 01');
  });

  it('deve retornar string vazia para entrada vazia', () => {
    expect(normalizeTagValue('')).toBe('');
    expect(normalizeTagValue('   ')).toBe('');
  });

  it('deve tratar entrada não-string', () => {
    expect(normalizeTagValue(null as unknown as string)).toBe('');
    expect(normalizeTagValue(undefined as unknown as string)).toBe('');
  });
});

describe('normalizeTagList', () => {
  it('deve normalizar cada tag da lista', () => {
    const result = normalizeTagList(['  uti  ', 'enfermaria']);
    expect(result).toEqual(['UTI', 'ENFERMARIA']);
  });

  it('deve remover tags vazias', () => {
    const result = normalizeTagList(['UTI', '', '   ', 'Enfermaria']);
    expect(result).toEqual(['UTI', 'ENFERMARIA']);
  });

  it('deve deduplicar por valor canônico', () => {
    const result = normalizeTagList(['UTI', 'uti', '  uti  ']);
    expect(result).toEqual(['UTI']);
  });

  it('deve limitar ao máximo padrão de 10', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const result = normalizeTagList(input);
    expect(result.length).toBe(10);
  });

  it('deve respeitar limite customizado', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const result = normalizeTagList(input, 3);
    expect(result.length).toBe(3);
  });

  it('deve tratar entrada não-array', () => {
    expect(normalizeTagList('not an array')).toEqual([]);
    expect(normalizeTagList(null)).toEqual([]);
    expect(normalizeTagList(undefined)).toEqual([]);
    expect(normalizeTagList(123)).toEqual([]);
  });

  it('deve preservar ordem após dedupe', () => {
    const result = normalizeTagList(['z', 'a', 'z', 'b', 'a']);
    expect(result).toEqual(['Z', 'A', 'B']);
  });
});

