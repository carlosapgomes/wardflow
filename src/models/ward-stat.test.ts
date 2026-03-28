/**
 * Testes para Ward Stat - funções puras de normalização
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeWardKey,
  normalizeWardLabel,
  createWardStatId,
} from '@/models/ward-stat';

describe('ward-stat - normalizeWardKey', () => {
  it('deve converter para uppercase', () => {
    expect(normalizeWardKey('UTI')).toBe('UTI');
    expect(normalizeWardKey('uti')).toBe('UTI');
    expect(normalizeWardKey('Uti')).toBe('UTI');
  });

  it('deve fazer trim', () => {
    expect(normalizeWardKey('  UTI  ')).toBe('UTI');
    expect(normalizeWardKey('\tEnfermaria\t')).toBe('ENFERMARIA');
  });

  it('deve colapsar espaços internos', () => {
    expect(normalizeWardKey('UTI  Adulto')).toBe('UTI ADULTO');
    expect(normalizeWardKey('Enfermaria    A')).toBe('ENFERMARIA A');
    expect(normalizeWardKey('  UTI   Adulto  ')).toBe('UTI ADULTO');
  });

  it('deve normalizar caso complexo', () => {
    expect(normalizeWardKey(' uti  adulto ')).toBe('UTI ADULTO');
    expect(normalizeWardKey('ENFERMARIA   B')).toBe('ENFERMARIA B');
  });

  it('deve lidar com string vazia', () => {
    expect(normalizeWardKey('')).toBe('');
    expect(normalizeWardKey('   ')).toBe('');
  });
});

describe('ward-stat - normalizeWardLabel', () => {
  it('deve fazer trim', () => {
    expect(normalizeWardLabel('  UTI  ')).toBe('UTI');
    expect(normalizeWardLabel('\tEnfermaria\t')).toBe('Enfermaria');
  });

  it('deve colapsar espaços internos', () => {
    expect(normalizeWardLabel('UTI  Adulto')).toBe('UTI Adulto');
    expect(normalizeWardLabel('Enfermaria    A')).toBe('Enfermaria A');
  });

  it('deve preservar case original', () => {
    expect(normalizeWardLabel('Uti Adulto')).toBe('Uti Adulto');
    expect(normalizeWardLabel('UTI adulto')).toBe('UTI adulto');
  });

  it('deve normalizar sem uppercase', () => {
    expect(normalizeWardLabel(' uti  adulto ')).toBe('uti adulto');
  });
});

describe('ward-stat - createWardStatId', () => {
  it('deve criar ID no formato userId:wardKey', () => {
    expect(createWardStatId('user123', 'UTI')).toBe('user123:UTI');
    expect(createWardStatId('abc', 'ENFERMARIA A')).toBe('abc:ENFERMARIA A');
  });
});
