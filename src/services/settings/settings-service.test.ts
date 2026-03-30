import { describe, expect, it } from 'vitest';
import {
  applyInputCase,
  applyWardPreferencesToLabels,
  buildWardSuggestionItems,
} from './settings-service';
import type { WardPreferences } from '@/models/settings';
import type { WardStat } from '@/models/ward-stat';

function makeWardPreferences(partial?: Partial<WardPreferences>): WardPreferences {
  return {
    hiddenWardKeys: partial?.hiddenWardKeys ?? [],
    labelOverrides: partial?.labelOverrides ?? {},
  };
}

describe('settings-service - applyInputCase', () => {
  it('converte para maiúsculas quando habilitado', () => {
    expect(applyInputCase('uti a', true)).toBe('UTI A');
  });

  it('preserva texto digitado quando desabilitado', () => {
    expect(applyInputCase('UtI a', false)).toBe('UtI a');
  });
});

describe('settings-service - applyWardPreferencesToLabels', () => {
  it('remove ocultos, aplica override e deduplica por wardKey', () => {
    const labels = ['UTI', ' uti ', 'Enfermaria a', 'Pediatria'];
    const prefs = makeWardPreferences({
      hiddenWardKeys: ['PEDIATRIA'],
      labelOverrides: {
        UTI: 'UTI Adulto',
      },
    });

    const result = applyWardPreferencesToLabels(labels, prefs);

    expect(result).toEqual(['UTI Adulto', 'Enfermaria a']);
  });
});

describe('settings-service - buildWardSuggestionItems', () => {
  it('marca hidden e aplica labels customizadas', () => {
    const stats: WardStat[] = [
      {
        id: 'u:UTI',
        userId: 'u',
        wardKey: 'UTI',
        wardLabel: 'UTI',
        usageCount: 10,
        lastUsedAt: new Date('2026-03-28T10:00:00.000Z'),
        updatedAt: new Date('2026-03-28T10:00:00.000Z'),
      },
      {
        id: 'u:PEDIATRIA',
        userId: 'u',
        wardKey: 'PEDIATRIA',
        wardLabel: 'Pediatria',
        usageCount: 3,
        lastUsedAt: new Date('2026-03-28T09:00:00.000Z'),
        updatedAt: new Date('2026-03-28T09:00:00.000Z'),
      },
    ];

    const prefs = makeWardPreferences({
      hiddenWardKeys: ['PEDIATRIA'],
      labelOverrides: {
        UTI: 'UTI Adulto',
      },
    });

    const visibleOnly = buildWardSuggestionItems(stats, prefs, false);
    expect(visibleOnly).toHaveLength(1);
    expect(visibleOnly[0]).toMatchObject({
      wardKey: 'UTI',
      wardLabel: 'UTI Adulto',
      hidden: false,
    });

    const all = buildWardSuggestionItems(stats, prefs, true);
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({
      wardKey: 'PEDIATRIA',
      hidden: true,
    });
  });
});
