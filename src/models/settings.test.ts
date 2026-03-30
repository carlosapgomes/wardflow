import { describe, expect, it } from 'vitest';
import {
  createSettings,
  normalizeSettings,
  SETTINGS_ID,
  DEFAULT_INPUT_PREFERENCES,
} from './settings';

describe('settings - createSettings', () => {
  it('cria configurações com defaults esperados', () => {
    const settings = createSettings('user-123');

    expect(settings.id).toBe(SETTINGS_ID);
    expect(settings.userId).toBe('user-123');
    expect(settings.inputPreferences).toEqual(DEFAULT_INPUT_PREFERENCES);
    expect(settings.wardPreferences.hiddenWardKeys).toEqual([]);
    expect(settings.wardPreferences.labelOverrides).toEqual({});
    expect(settings.updatedAt).toBeInstanceOf(Date);
  });
});

describe('settings - normalizeSettings', () => {
  it('aplica defaults quando payload é inválido', () => {
    const settings = normalizeSettings(null, 'user-123');

    expect(settings.id).toBe(SETTINGS_ID);
    expect(settings.userId).toBe('user-123');
    expect(settings.inputPreferences.uppercaseWard).toBe(false);
    expect(settings.inputPreferences.uppercaseBed).toBe(true);
    expect(settings.wardPreferences.hiddenWardKeys).toEqual([]);
    expect(settings.wardPreferences.labelOverrides).toEqual({});
  });

  it('normaliza hiddenWardKeys e labelOverrides', () => {
    const settings = normalizeSettings(
      {
        inputPreferences: {
          uppercaseWard: false,
        },
        wardPreferences: {
          hiddenWardKeys: [' uti ', 'UTI', ' Enfermaria A '],
          labelOverrides: {
            ' uti ': ' UTI Adulto ',
            '': 'Inválido',
            'enfermaria a': ' Enfermaria Adulto ',
            qualquer: 123,
          },
        },
        updatedAt: '2026-03-28T10:00:00.000Z',
      },
      'user-123'
    );

    expect(settings.inputPreferences.uppercaseWard).toBe(false);
    expect(settings.inputPreferences.uppercaseBed).toBe(true);
    expect(settings.wardPreferences.hiddenWardKeys).toEqual(['UTI', 'ENFERMARIA A']);
    expect(settings.wardPreferences.labelOverrides).toEqual({
      UTI: 'UTI Adulto',
      'ENFERMARIA A': 'Enfermaria Adulto',
    });
    expect(settings.updatedAt.toISOString()).toBe('2026-03-28T10:00:00.000Z');
  });
});
