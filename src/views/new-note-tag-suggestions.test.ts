import { describe, expect, it } from 'vitest';
import {
  applyTagSuggestion,
  filterSelectedSuggestions,
  getActiveTagQuery,
} from './new-note-tag-suggestions';

describe('new-note-tag-suggestions', () => {
  it('extrai prefixo ativo do fragmento após última vírgula', () => {
    expect(getActiveTagQuery('')).toBe('');
    expect(getActiveTagQuery('pn')).toBe('pn');
    expect(getActiveTagQuery('UTI, pn')).toBe('pn');
    expect(getActiveTagQuery('UTI, ')).toBe('');
  });

  it('aplica sugestão preservando tags completas antes da última vírgula', () => {
    const result = applyTagSuggestion([], 'UTI, pn', 'PNEUMONIA', 10);

    expect(result.tags).toEqual(['UTI', 'PNEUMONIA']);
    expect(result.tagsInput).toBe('');
  });

  it('não duplica tags já selecionadas', () => {
    const result = applyTagSuggestion(['UTI'], 'UTI, u', 'UTI', 10);

    expect(result.tags).toEqual(['UTI']);

    const suggestions = filterSelectedSuggestions(['UTI', 'SEPSE', 'CHOQUE'], ['uti', 'choque']);
    expect(suggestions).toEqual(['SEPSE']);
  });
});
