/**
 * Testes para redirect-validator
 */

import { describe, it, expect } from 'vitest';
import { validateRedirectUrl } from './redirect-validator';

describe('validateRedirectUrl', () => {
  it('retorna dashboard quando next é null', () => {
    expect(validateRedirectUrl(null)).toBe('/dashboard');
  });

  it('retorna dashboard quando next é undefined', () => {
    expect(validateRedirectUrl(undefined)).toBe('/dashboard');
  });

  it('retorna dashboard quando next é string vazia', () => {
    expect(validateRedirectUrl('')).toBe('/dashboard');
  });

  it('retorna o caminho quando next é válido', () => {
    expect(validateRedirectUrl('/convite/abc123')).toBe('/convite/abc123');
    expect(validateRedirectUrl('/visita/123')).toBe('/visita/123');
    expect(validateRedirectUrl('/dashboard')).toBe('/dashboard');
  });

  it('retorna dashboard para URL absoluta http', () => {
    expect(validateRedirectUrl('http://evil.com')).toBe('/dashboard');
    expect(validateRedirectUrl('http://localhost:3000/evil')).toBe('/dashboard');
  });

  it('retorna dashboard para URL absoluta https', () => {
    expect(validateRedirectUrl('https://evil.com')).toBe('/dashboard');
    expect(validateRedirectUrl('https://example.com/evil')).toBe('/dashboard');
  });

  it('retorna dashboard para URL com protocolo duplo barras', () => {
    expect(validateRedirectUrl('//evil.com')).toBe('/dashboard');
    expect(validateRedirectUrl('//example.com/phishing')).toBe('/dashboard');
  });

  it('retorna dashboard quando next não começa com /', () => {
    expect(validateRedirectUrl('dashboard')).toBe('/dashboard');
    expect(validateRedirectUrl('convite/abc')).toBe('/dashboard');
  });

  it('retorna dashboard quando next é /login', () => {
    expect(validateRedirectUrl('/login')).toBe('/dashboard');
  });

  it('decodifica URL-encoded corretamente', () => {
    expect(validateRedirectUrl('/convite%2Fabc123')).toBe('/convite/abc123');
    expect(validateRedirectUrl('/visita%3Fid%3D123')).toBe('/visita?id=123');
  });

  it('preserva query string e hash', () => {
    expect(validateRedirectUrl('/dashboard?tab=notes')).toBe('/dashboard?tab=notes');
    expect(validateRedirectUrl('/dashboard#section')).toBe('/dashboard#section');
    expect(validateRedirectUrl('/visita/123?tab=notes#item-456')).toBe('/visita/123?tab=notes#item-456');
  });
});